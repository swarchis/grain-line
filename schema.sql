CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";

    CREATE TYPE user_role        AS ENUM ('owner', 'manager', 'staff');
    CREATE TYPE review_platform  AS ENUM ('google', 'yelp', 'opentable');
    CREATE TYPE review_sentiment AS ENUM ('positive', 'neutral', 'negative');
    CREATE TYPE review_status    AS ENUM ('pending', 'generating', 'draft', 'responded', 'dismissed');
    CREATE TYPE loyalty_tier     AS ENUM ('bronze', 'silver', 'gold', 'platinum');
    CREATE TYPE pl_category      AS ENUM ('revenue','cogs_food','cogs_liquor','labor','rent','utilities','marketing','supplies','repairs','insurance','other');
    CREATE TYPE cogs_category    AS ENUM ('food','liquor','supplies');
    CREATE TYPE plan_type        AS ENUM ('starter','growth','enterprise');
    CREATE TYPE count_status     AS ENUM ('in_progress','submitted','approved');
    CREATE TYPE gbp_post_type    AS ENUM ('STANDARD','EVENT','OFFER');
    CREATE TYPE gbp_post_status  AS ENUM ('draft','approved','published','rejected');
    CREATE TYPE loyalty_tx_type  AS ENUM ('earn','redeem','expire','adjust');

    CREATE TABLE tenants (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(200) NOT NULL,
      plan          plan_type NOT NULL DEFAULT 'starter',
      active_agents TEXT[] NOT NULL DEFAULT '{}',
      settings      JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE locations (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name                VARCHAR(200) NOT NULL,
      address             VARCHAR(300) NOT NULL DEFAULT '',
      city                VARCHAR(100) NOT NULL DEFAULT '',
      state               VARCHAR(50)  NOT NULL DEFAULT '',
      zip                 VARCHAR(20)  NOT NULL DEFAULT '',
      phone               VARCHAR(30),
      timezone            VARCHAR(60)  NOT NULL DEFAULT 'America/Los_Angeles',
      google_place_id     VARCHAR(200),
      google_account_id   VARCHAR(200),
      google_location_id  VARCHAR(200),
      opentable_id        VARCHAR(100),
      toast_location_id   VARCHAR(100),
      yelp_business_id    VARCHAR(200),
      active              BOOLEAN NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_locations_tenant ON locations(tenant_id);

    CREATE TABLE users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email         VARCHAR(255) NOT NULL,
      name          VARCHAR(200) NOT NULL,
      password_hash VARCHAR(100) NOT NULL,
      role          user_role NOT NULL DEFAULT 'manager',
      location_ids  UUID[] NOT NULL DEFAULT '{}',
      active        BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, email)
    );
    CREATE INDEX idx_users_tenant ON users(tenant_id);

    CREATE TABLE guests (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name              VARCHAR(200) NOT NULL,
      email             BYTEA,
      phone             BYTEA,
      opentable_id      VARCHAR(100),
      loyalty_member_id UUID,
      marketing_opt_in  BOOLEAN NOT NULL DEFAULT false,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_guests_tenant ON guests(tenant_id);

    CREATE TABLE employees (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id       UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name              VARCHAR(200) NOT NULL,
      role              VARCHAR(100) NOT NULL,
      email             VARCHAR(255),
      phone             VARCHAR(30),
      toast_employee_id VARCHAR(100),
      seven_shifts_id   VARCHAR(100),
      start_date        DATE,
      active            BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_employees_tenant ON employees(tenant_id, location_id);

    CREATE TABLE reviews (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      platform            review_platform NOT NULL,
      external_id         VARCHAR(300) NOT NULL,
      external_name       VARCHAR(500) NOT NULL DEFAULT '',
      reviewer            VARCHAR(200) NOT NULL,
      reviewer_avatar_url TEXT,
      rating              SMALLINT NOT NULL,
      text                TEXT NOT NULL,
      review_date         TIMESTAMPTZ NOT NULL,
      status              review_status NOT NULL DEFAULT 'pending',
      sentiment           review_sentiment NOT NULL DEFAULT 'neutral',
      sentiment_score     INTEGER DEFAULT 50,
      urgent              BOOLEAN NOT NULL DEFAULT false,
      employee_mentions   JSONB NOT NULL DEFAULT '[]',
      response_draft      TEXT,
      response_posted     TEXT,
      response_posted_at  TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (location_id, platform, external_id)
    );
    CREATE INDEX idx_reviews_tenant    ON reviews(tenant_id, location_id);
    CREATE INDEX idx_reviews_status    ON reviews(status);
    CREATE INDEX idx_reviews_rating    ON reviews(rating);
    CREATE INDEX idx_reviews_date      ON reviews(review_date);
    CREATE INDEX idx_reviews_text      ON reviews USING gin(to_tsvector('english', text));

    CREATE TABLE transactions_pos (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      guest_id       UUID REFERENCES guests(id),
      toast_check_id VARCHAR(200),
      total          NUMERIC(10,2) NOT NULL,
      food_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
      liquor_total   NUMERIC(10,2) NOT NULL DEFAULT 0,
      other_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
      tip            NUMERIC(10,2) NOT NULL DEFAULT 0,
      covers         INTEGER DEFAULT 1,
      items          JSONB DEFAULT '[]',
      transaction_at TIMESTAMPTZ NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_transactions_tenant ON transactions_pos(tenant_id, location_id);
    CREATE INDEX idx_transactions_date   ON transactions_pos(transaction_at);

    CREATE TABLE weekly_sales (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      week_start   DATE NOT NULL,
      food_sales   NUMERIC(12,2) NOT NULL DEFAULT 0,
      liquor_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
      other_sales  NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_sales  NUMERIC(12,2) NOT NULL DEFAULT 0,
      labor_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
      labor_hours  NUMERIC(8,2)  NOT NULL DEFAULT 0,
      source       VARCHAR(50)   NOT NULL DEFAULT 'manual',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (location_id, week_start)
    );
    CREATE INDEX idx_weekly_sales ON weekly_sales(tenant_id, location_id, week_start);

    CREATE TABLE cogs_entries (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      week_start  DATE NOT NULL,
      category    cogs_category NOT NULL,
      amount      NUMERIC(12,2) NOT NULL,
      vendor      VARCHAR(200),
      notes       TEXT,
      entered_by  UUID REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_cogs ON cogs_entries(location_id, week_start);

    CREATE TABLE inventory_counts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      period         VARCHAR(7) NOT NULL,
      status         count_status NOT NULL DEFAULT 'in_progress',
      food_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
      liquor_total   NUMERIC(12,2) NOT NULL DEFAULT 0,
      supplies_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      submitted_by   UUID REFERENCES users(id),
      submitted_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (location_id, period)
    );
    CREATE INDEX idx_inventory ON inventory_counts(tenant_id, location_id);

    CREATE TABLE loyalty_members (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      guest_id        UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      tier            loyalty_tier NOT NULL DEFAULT 'bronze',
      points_balance  INTEGER NOT NULL DEFAULT 0,
      points_lifetime INTEGER NOT NULL DEFAULT 0,
      referral_code   VARCHAR(30) NOT NULL UNIQUE,
      referred_by_id  UUID REFERENCES loyalty_members(id),
      streak_weeks    INTEGER NOT NULL DEFAULT 0,
      last_visit_date DATE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, guest_id)
    );
    CREATE INDEX idx_loyalty_tenant ON loyalty_members(tenant_id);
    CREATE INDEX idx_loyalty_guest  ON loyalty_members(guest_id);

    CREATE TABLE loyalty_transactions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id    UUID NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      type         loyalty_tx_type NOT NULL,
      points       INTEGER NOT NULL,
      description  VARCHAR(300) NOT NULL,
      pos_check_id VARCHAR(200),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_loyalty_tx_member ON loyalty_transactions(member_id);
    CREATE INDEX idx_loyalty_tx_date   ON loyalty_transactions(created_at);

    CREATE TABLE training_modules (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title          VARCHAR(300) NOT NULL,
      description    TEXT,
      required_roles TEXT[] NOT NULL DEFAULT '{}',
      validity_days  INTEGER NOT NULL DEFAULT 365,
      pass_score     INTEGER NOT NULL DEFAULT 80,
      content_url    TEXT,
      mandatory      BOOLEAN NOT NULL DEFAULT true,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_training_modules ON training_modules(tenant_id);

    CREATE TABLE training_completions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      module_id    UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
      score        INTEGER NOT NULL,
      passed       BOOLEAN NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      UNIQUE (employee_id, module_id)
    );
    CREATE INDEX idx_training_completions ON training_completions(employee_id, module_id);

    CREATE TABLE ad_campaigns (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      platform     VARCHAR(50) NOT NULL,
      external_id  VARCHAR(200),
      name         VARCHAR(300) NOT NULL,
      status       VARCHAR(50) NOT NULL DEFAULT 'draft',
      spend        NUMERIC(10,2) NOT NULL DEFAULT 0,
      impressions  BIGINT NOT NULL DEFAULT 0,
      clicks       INTEGER NOT NULL DEFAULT 0,
      conversions  INTEGER NOT NULL DEFAULT 0,
      roas         NUMERIC(8,2),
      period_start DATE,
      period_end   DATE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ad_campaigns ON ad_campaigns(tenant_id, location_id);

    CREATE TABLE gbp_posts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      type         gbp_post_type NOT NULL DEFAULT 'STANDARD',
      content      TEXT NOT NULL,
      cta_type     VARCHAR(50),
      status       gbp_post_status NOT NULL DEFAULT 'draft',
      external_id  VARCHAR(300),
      published_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_gbp_posts ON gbp_posts(tenant_id, location_id);

    CREATE TABLE platform_events (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      location_id    UUID REFERENCES locations(id),
      event_type     VARCHAR(100) NOT NULL,
      source_agent   VARCHAR(50)  NOT NULL,
      payload        JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID,
      schema_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_platform_events_tenant ON platform_events(tenant_id, event_type);
    CREATE INDEX idx_platform_events_date   ON platform_events(created_at);

    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants          FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON locations        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON guests           FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON employees        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reviews          FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON weekly_sales     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON loyalty_members  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON ad_campaigns     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON gbp_posts        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();