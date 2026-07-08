/* eslint-disable camelcase */
// ─── Migration 001 — RestaurantOS initial schema ─────────────────────────────
// Creates all 13 core tables with proper indexes, FK constraints,
// and row-level security policies for multi-tenant isolation.

exports.up = (pgm) => {

  // ── Extensions ──────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
  `);

  // ── Enums ────────────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TYPE user_role       AS ENUM ('owner', 'manager', 'staff');
    CREATE TYPE review_platform AS ENUM ('google', 'yelp', 'opentable');
    CREATE TYPE review_sentiment AS ENUM ('positive', 'neutral', 'negative');
    CREATE TYPE review_status   AS ENUM ('pending', 'generating', 'draft', 'responded', 'dismissed');
    CREATE TYPE loyalty_tier    AS ENUM ('bronze', 'silver', 'gold', 'platinum');
    CREATE TYPE pl_category     AS ENUM (
      'revenue','cogs_food','cogs_liquor','labor',
      'rent','utilities','marketing','supplies',
      'repairs','insurance','other'
    );
    CREATE TYPE inventory_category AS ENUM ('food','liquor','supplies');
    CREATE TYPE cogs_category   AS ENUM ('food','liquor','supplies');
    CREATE TYPE plan_type       AS ENUM ('starter','growth','enterprise');
    CREATE TYPE count_status    AS ENUM ('in_progress','submitted','approved');
    CREATE TYPE gbp_post_type   AS ENUM ('STANDARD','EVENT','OFFER');
    CREATE TYPE gbp_post_status AS ENUM ('draft','approved','published','rejected');
    CREATE TYPE loyalty_tx_type AS ENUM ('earn','redeem','expire','adjust');
    CREATE TYPE training_goal   AS ENUM ('visits','spend','cross_venue','review');
    CREATE TYPE event_type      AS ENUM (
      'dining.visit.completed','reservation.completed','review.posted',
      'review.response.approved','inventory.count.submitted',
      'weekly.pos.sync.completed','bank.transactions.imported',
      'loyalty.tier.upgraded','loyalty.points.earned','referral.converted',
      'training.overdue','content.approved','ad.campaign.converted'
    );
  `);

  // ── 1. tenants ───────────────────────────────────────────────────────────────
  pgm.createTable('tenants', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name:          { type: 'varchar(200)', notNull: true },
    plan:          { type: 'plan_type', notNull: true, default: pgm.func("'starter'") },
    active_agents: { type: 'text[]', notNull: true, default: pgm.func("'{}'") },
    settings:      { type: 'jsonb', default: pgm.func("'{}'") },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ── 2. locations ─────────────────────────────────────────────────────────────
  pgm.createTable('locations', {
    id:                  { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:           { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    name:                { type: 'varchar(200)', notNull: true },
    address:             { type: 'varchar(300)', notNull: true },
    city:                { type: 'varchar(100)', notNull: true },
    state:               { type: 'varchar(50)', notNull: true },
    zip:                 { type: 'varchar(20)', notNull: true },
    phone:               { type: 'varchar(30)' },
    timezone:            { type: 'varchar(60)', notNull: true, default: pgm.func("'America/Los_Angeles'") },
    google_place_id:     { type: 'varchar(200)' },
    google_account_id:   { type: 'varchar(200)' },
    google_location_id:  { type: 'varchar(200)' },
    opentable_id:        { type: 'varchar(100)' },
    toast_location_id:   { type: 'varchar(100)' },
    yelp_business_id:    { type: 'varchar(200)' },
    active:              { type: 'boolean', notNull: true, default: true },
    created_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('locations', 'tenant_id');

  // ── 3. users ──────────────────────────────────────────────────────────────────
  pgm.createTable('users', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:     { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    email:         { type: 'varchar(255)', notNull: true },
    name:          { type: 'varchar(200)', notNull: true },
    password_hash: { type: 'varchar(100)', notNull: true },
    role:          { type: 'user_role', notNull: true, default: pgm.func("'manager'") },
    location_ids:  { type: 'uuid[]', notNull: true, default: pgm.func("'{}'") },
    active:        { type: 'boolean', notNull: true, default: true },
    last_login_at: { type: 'timestamptz' },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('users', 'users_tenant_email_unique', 'UNIQUE (tenant_id, email)');
  pgm.createIndex('users', 'tenant_id');

  // ── 4. guests ─────────────────────────────────────────────────────────────────
  pgm.createTable('guests', {
    id:                  { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:           { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    name:                { type: 'varchar(200)', notNull: true },
    email:               { type: 'bytea' },              // encrypted with pgcrypto
    phone:               { type: 'bytea' },              // encrypted with pgcrypto
    opentable_id:        { type: 'varchar(100)' },
    loyalty_member_id:   { type: 'uuid' },
    marketing_opt_in:    { type: 'boolean', notNull: true, default: false },
    created_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('guests', 'tenant_id');

  // ── 5. employees ─────────────────────────────────────────────────────────────
  pgm.createTable('employees', {
    id:               { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:        { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:      { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    name:             { type: 'varchar(200)', notNull: true },
    role:             { type: 'varchar(100)', notNull: true },
    email:            { type: 'varchar(255)' },
    phone:            { type: 'varchar(30)' },
    toast_employee_id:  { type: 'varchar(100)' },
    seven_shifts_id:    { type: 'varchar(100)' },
    start_date:       { type: 'date' },
    active:           { type: 'boolean', notNull: true, default: true },
    created_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('employees', ['tenant_id', 'location_id']);

  // ── 6. reviews ────────────────────────────────────────────────────────────────
  pgm.createTable('reviews', {
    id:                  { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:           { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:         { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    platform:            { type: 'review_platform', notNull: true },
    external_id:         { type: 'varchar(300)', notNull: true },
    external_name:       { type: 'varchar(500)' },
    reviewer:            { type: 'varchar(200)', notNull: true },
    reviewer_avatar_url: { type: 'text' },
    rating:              { type: 'smallint', notNull: true },
    text:                { type: 'text', notNull: true },
    review_date:         { type: 'timestamptz', notNull: true },
    status:              { type: 'review_status', notNull: true, default: pgm.func("'pending'") },
    sentiment:           { type: 'review_sentiment', notNull: true, default: pgm.func("'neutral'") },
    sentiment_score:     { type: 'integer', default: 50 },
    urgent:              { type: 'boolean', notNull: true, default: false },
    employee_mentions:   { type: 'jsonb', notNull: true, default: pgm.func("'[]'") },
    response_draft:      { type: 'text' },
    response_posted:     { type: 'text' },
    response_posted_at:  { type: 'timestamptz' },
    created_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('reviews', 'reviews_platform_external_unique', 'UNIQUE (location_id, platform, external_id)');
  pgm.createIndex('reviews', ['tenant_id', 'location_id']);
  pgm.createIndex('reviews', 'status');
  pgm.createIndex('reviews', 'rating');
  pgm.createIndex('reviews', 'review_date');
  // Full-text search on review text
  pgm.sql(`CREATE INDEX reviews_text_search ON reviews USING gin(to_tsvector('english', text))`);

  // ── 7. transactions_pos ───────────────────────────────────────────────────────
  pgm.createTable('transactions_pos', {
    id:              { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:       { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:     { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    guest_id:        { type: 'uuid', references: 'guests(id)' },
    toast_check_id:  { type: 'varchar(200)' },
    total:           { type: 'numeric(10,2)', notNull: true },
    food_total:      { type: 'numeric(10,2)', notNull: true, default: 0 },
    liquor_total:    { type: 'numeric(10,2)', notNull: true, default: 0 },
    other_total:     { type: 'numeric(10,2)', notNull: true, default: 0 },
    tip:             { type: 'numeric(10,2)', notNull: true, default: 0 },
    covers:          { type: 'integer', default: 1 },
    items:           { type: 'jsonb', default: pgm.func("'[]'") },
    transaction_at:  { type: 'timestamptz', notNull: true },
    created_at:      { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('transactions_pos', ['tenant_id', 'location_id']);
  pgm.createIndex('transactions_pos', 'transaction_at');
  pgm.createIndex('transactions_pos', 'guest_id');

  // ── 8. weekly_sales ───────────────────────────────────────────────────────────
  pgm.createTable('weekly_sales', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:    { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:  { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    week_start:   { type: 'date', notNull: true },
    food_sales:   { type: 'numeric(12,2)', notNull: true, default: 0 },
    liquor_sales: { type: 'numeric(12,2)', notNull: true, default: 0 },
    other_sales:  { type: 'numeric(12,2)', notNull: true, default: 0 },
    total_sales:  { type: 'numeric(12,2)', notNull: true, default: 0 },
    labor_cost:   { type: 'numeric(12,2)', notNull: true, default: 0 },
    labor_hours:  { type: 'numeric(8,2)', notNull: true, default: 0 },
    source:       { type: 'varchar(50)', notNull: true, default: pgm.func("'manual'") },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('weekly_sales', 'weekly_sales_loc_week_unique', 'UNIQUE (location_id, week_start)');
  pgm.createIndex('weekly_sales', ['tenant_id', 'location_id', 'week_start']);

  // ── 9. cogs_entries ───────────────────────────────────────────────────────────
  pgm.createTable('cogs_entries', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:    { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:  { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    week_start:   { type: 'date', notNull: true },
    category:     { type: 'cogs_category', notNull: true },
    amount:       { type: 'numeric(12,2)', notNull: true },
    vendor:       { type: 'varchar(200)' },
    notes:        { type: 'text' },
    entered_by:   { type: 'uuid', references: 'users(id)' },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('cogs_entries', ['location_id', 'week_start']);

  // ── 10. inventory_counts ──────────────────────────────────────────────────────
  pgm.createTable('inventory_counts', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:      { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:    { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    period:         { type: 'varchar(7)', notNull: true }, // YYYY-MM
    status:         { type: 'count_status', notNull: true, default: pgm.func("'in_progress'") },
    food_total:     { type: 'numeric(12,2)', notNull: true, default: 0 },
    liquor_total:   { type: 'numeric(12,2)', notNull: true, default: 0 },
    supplies_total: { type: 'numeric(12,2)', notNull: true, default: 0 },
    submitted_by:   { type: 'uuid', references: 'users(id)' },
    submitted_at:   { type: 'timestamptz' },
    created_at:     { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('inventory_counts', 'inv_counts_loc_period_unique', 'UNIQUE (location_id, period)');
  pgm.createIndex('inventory_counts', ['tenant_id', 'location_id']);

  // ── 11. loyalty_members ───────────────────────────────────────────────────────
  pgm.createTable('loyalty_members', {
    id:              { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:       { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    guest_id:        { type: 'uuid', notNull: true, references: 'guests(id)', onDelete: 'CASCADE' },
    tier:            { type: 'loyalty_tier', notNull: true, default: pgm.func("'bronze'") },
    points_balance:  { type: 'integer', notNull: true, default: 0 },
    points_lifetime: { type: 'integer', notNull: true, default: 0 },
    referral_code:   { type: 'varchar(30)', notNull: true, unique: true },
    referred_by_id:  { type: 'uuid', references: 'loyalty_members(id)' },
    streak_weeks:    { type: 'integer', notNull: true, default: 0 },
    last_visit_date: { type: 'date' },
    created_at:      { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:      { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('loyalty_members', 'loyalty_tenant_guest_unique', 'UNIQUE (tenant_id, guest_id)');
  pgm.createIndex('loyalty_members', 'tenant_id');
  pgm.createIndex('loyalty_members', 'guest_id');

  // ── 12. loyalty_transactions ──────────────────────────────────────────────────
  pgm.createTable('loyalty_transactions', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    member_id:    { type: 'uuid', notNull: true, references: 'loyalty_members(id)', onDelete: 'CASCADE' },
    location_id:  { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    type:         { type: 'loyalty_tx_type', notNull: true },
    points:       { type: 'integer', notNull: true },
    description:  { type: 'varchar(300)', notNull: true },
    pos_check_id: { type: 'varchar(200)' },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('loyalty_transactions', 'member_id');
  pgm.createIndex('loyalty_transactions', 'created_at');

  // ── 13. training_modules & completions ───────────────────────────────────────
  pgm.createTable('training_modules', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:      { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    title:          { type: 'varchar(300)', notNull: true },
    description:    { type: 'text' },
    required_roles: { type: 'text[]', notNull: true, default: pgm.func("'{}'") },
    validity_days:  { type: 'integer', notNull: true, default: 365 },
    pass_score:     { type: 'integer', notNull: true, default: 80 },
    content_url:    { type: 'text' },
    mandatory:      { type: 'boolean', notNull: true, default: true },
    created_at:     { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('training_modules', 'tenant_id');

  pgm.createTable('training_completions', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    employee_id:  { type: 'uuid', notNull: true, references: 'employees(id)', onDelete: 'CASCADE' },
    module_id:    { type: 'uuid', notNull: true, references: 'training_modules(id)', onDelete: 'CASCADE' },
    score:        { type: 'integer', notNull: true },
    passed:       { type: 'boolean', notNull: true },
    completed_at: { type: 'timestamptz', notNull: true },
    expires_at:   { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('training_completions', 'tc_employee_module_unique', 'UNIQUE (employee_id, module_id)');
  pgm.createIndex('training_completions', ['employee_id', 'module_id']);

  // ── 14. ad_campaigns ──────────────────────────────────────────────────────────
  pgm.createTable('ad_campaigns', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:    { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:  { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    platform:     { type: 'varchar(50)', notNull: true }, // 'meta' | 'google'
    external_id:  { type: 'varchar(200)' },
    name:         { type: 'varchar(300)', notNull: true },
    status:       { type: 'varchar(50)', notNull: true, default: pgm.func("'draft'") },
    spend:        { type: 'numeric(10,2)', notNull: true, default: 0 },
    impressions:  { type: 'bigint', notNull: true, default: 0 },
    clicks:       { type: 'integer', notNull: true, default: 0 },
    conversions:  { type: 'integer', notNull: true, default: 0 },
    roas:         { type: 'numeric(8,2)' },
    period_start: { type: 'date' },
    period_end:   { type: 'date' },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('ad_campaigns', ['tenant_id', 'location_id']);

  // ── 15. gbp_posts ─────────────────────────────────────────────────────────────
  pgm.createTable('gbp_posts', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:    { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:  { type: 'uuid', notNull: true, references: 'locations(id)', onDelete: 'CASCADE' },
    type:         { type: 'gbp_post_type', notNull: true, default: pgm.func("'STANDARD'") },
    content:      { type: 'text', notNull: true },
    cta_type:     { type: 'varchar(50)' },
    status:       { type: 'gbp_post_status', notNull: true, default: pgm.func("'draft'") },
    external_id:  { type: 'varchar(300)' },
    published_at: { type: 'timestamptz' },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('gbp_posts', ['tenant_id', 'location_id']);

  // ── 16. platform_events (audit log) ──────────────────────────────────────────
  pgm.createTable('platform_events', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:      { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    location_id:    { type: 'uuid', references: 'locations(id)' },
    event_type:     { type: 'varchar(100)', notNull: true },
    source_agent:   { type: 'varchar(50)', notNull: true },
    payload:        { type: 'jsonb', notNull: true, default: pgm.func("'{}'") },
    correlation_id: { type: 'uuid' },
    schema_version: { type: 'varchar(20)', notNull: true, default: pgm.func("'1.0.0'") },
    created_at:     { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('platform_events', ['tenant_id', 'event_type']);
  pgm.createIndex('platform_events', 'created_at');
  // Partition by month in production for performance — skip for simplicity here

  // ── Row-level security ────────────────────────────────────────────────────────
  // Enable RLS on all tables that contain tenant data
  const tenantTables = [
    'locations','users','guests','employees','reviews',
    'transactions_pos','weekly_sales','cogs_entries',
    'inventory_counts','loyalty_members','loyalty_transactions',
    'training_modules','training_completions','ad_campaigns',
    'gbp_posts','platform_events',
  ];

  tenantTables.forEach(table => {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    pgm.sql(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
      USING (tenant_id = current_setting('app.tenant_id')::uuid)
    `);
  });

  // ── Updated_at trigger ────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  [
    'tenants','locations','users','guests','employees',
    'reviews','weekly_sales','loyalty_members','ad_campaigns','gbp_posts',
  ].forEach(table => {
    pgm.sql(`
      CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    `);
  });
};

exports.down = (pgm) => {
  // Drop in reverse dependency order
  const tables = [
    'platform_events','gbp_posts','ad_campaigns',
    'training_completions','training_modules',
    'loyalty_transactions','loyalty_members',
    'inventory_counts','cogs_entries','weekly_sales',
    'transactions_pos','reviews','employees',
    'guests','users','locations','tenants',
  ];
  tables.forEach(t => pgm.dropTable(t, { ifExists: true, cascade: true }));

  pgm.sql(`
    DROP TYPE IF EXISTS user_role CASCADE;
    DROP TYPE IF EXISTS review_platform CASCADE;
    DROP TYPE IF EXISTS review_sentiment CASCADE;
    DROP TYPE IF EXISTS review_status CASCADE;
    DROP TYPE IF EXISTS loyalty_tier CASCADE;
    DROP TYPE IF EXISTS pl_category CASCADE;
    DROP TYPE IF EXISTS inventory_category CASCADE;
    DROP TYPE IF EXISTS cogs_category CASCADE;
    DROP TYPE IF EXISTS plan_type CASCADE;
    DROP TYPE IF EXISTS count_status CASCADE;
    DROP TYPE IF EXISTS gbp_post_type CASCADE;
    DROP TYPE IF EXISTS gbp_post_status CASCADE;
    DROP TYPE IF EXISTS loyalty_tx_type CASCADE;
    DROP TYPE IF EXISTS training_goal CASCADE;
    DROP TYPE IF EXISTS event_type CASCADE;
    DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;
  `);
};
