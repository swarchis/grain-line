// Agent 8: Loyalty — Multi-tenant white-label loyalty engine
require('dotenv').config();
const { once } = require('../../lib/tableCache');
const { queryForTenant, adminQuery } = require('@restaurantos/db');

const AGENT_ID = 'agent_8_loyalty';

// ── Default config (used when tenant hasn't customised) ───────────────────────
const DEFAULT_CONFIG = {
  program_name:   'Rewards',
  program_tagline:'Earn points every visit',
  accent_color:   '#E8A020',
  tiers: [
    { key:'bronze',   label:'Bronze',   minPts:0,     maxPts:4999,  discount:0,  multiplier:1.0, color:'#CD7F32' },
    { key:'silver',   label:'Silver',   minPts:5000,  maxPts:14999, discount:0,  multiplier:1.25,color:'#A8A9AD' },
    { key:'gold',     label:'Gold',     minPts:15000, maxPts:39999, discount:10, multiplier:1.5, color:'#FFD700' },
    { key:'platinum', label:'Platinum', minPts:40000, maxPts:null,  discount:13, multiplier:2.0, color:'#E8A020' },
  ],
  earn_rate: 10,   // points per $100 spent
  rewards: [
    { id:'r1', pts:500,  label:'Complimentary dessert',              category:'food' },
    { id:'r2', pts:1000, label:'Welcome cocktail or mocktail',        category:'drink' },
    { id:'r3', pts:1500, label:'10% off selected wine bottle',        category:'drink' },
    { id:'r4', pts:2500, label:'Signature dish upgrade',              category:'food' },
    { id:'r5', pts:3500, label:'Private experience for two',          category:'experience' },
    { id:'r6', pts:5000, label:"Chef's tasting menu for two",         category:'experience' },
  ],
};

// ── Get tenant loyalty config (merged with defaults) ──────────────────────────
async function getLoyaltyConfig(tenantId) {
  const r = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [tenantId]);
  const settings = r.rows[0]?.settings || {};
  const custom   = settings.loyalty || {};

  return {
    program_name:   custom.program_name   || DEFAULT_CONFIG.program_name,
    program_tagline:custom.program_tagline || DEFAULT_CONFIG.program_tagline,
    accent_color:   custom.accent_color   || DEFAULT_CONFIG.accent_color,
    earn_rate:      custom.earn_rate       ?? DEFAULT_CONFIG.earn_rate,
    tiers:          custom.tiers           || DEFAULT_CONFIG.tiers,
    rewards:        custom.rewards         || DEFAULT_CONFIG.rewards,
  };
}

async function saveLoyaltyConfig(tenantId, config) {
  const current = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [tenantId]);
  const settings = current.rows[0]?.settings || {};
  settings.loyalty = config;
  await adminQuery('UPDATE tenants SET settings=$1 WHERE id=$2', [JSON.stringify(settings), tenantId]);
  return config;
}

function getTierFromConfig(points, cfg, inviteOnly = false) {
  const tiers = cfg?.tiers || DEFAULT_CONFIG.tiers;
  if (inviteOnly) return tiers[tiers.length - 1];
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (points >= tiers[i].minPts) return tiers[i];
  }
  return tiers[0];
}

// ── Earn points ───────────────────────────────────────────────────────────────
const EARN_RULES = {
  dining:        (amount, mult, rate) => Math.floor((amount / 100) * rate * mult),
  reservation:   () => 50,
  cross_venue:   () => 200,
  birthday:      (amount, mult, rate) => Math.floor((amount / 100) * rate * mult * 2),
  review:        () => 150,
  referral:      () => 500,
  app_signup:    () => 300,
  private_event: (amount) => 1000 + Math.floor(amount * 0.05 * 10),
};

// ── Ensure tables ─────────────────────────────────────────────────────────────
const ensureTables = once('agent8', async function() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS loyalty_members (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      name            VARCHAR(200),
      email           VARCHAR(300),
      phone           VARCHAR(30),
      tier            VARCHAR(20) NOT NULL DEFAULT 'bronze',
      points_balance  INTEGER NOT NULL DEFAULT 0,
      points_lifetime INTEGER NOT NULL DEFAULT 0,
      referral_code   VARCHAR(20),
      referred_by_id  UUID,
      invite_only     BOOLEAN NOT NULL DEFAULT false,
      birthday_month  INTEGER,
      preferences     TEXT,
      notes           TEXT,
      visit_count     INTEGER NOT NULL DEFAULT 0,
      last_visit      DATE,
      active          BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      member_id       UUID REFERENCES loyalty_members(id) ON DELETE CASCADE,
      location_id     UUID,
      type            VARCHAR(20) NOT NULL DEFAULT 'earn',
      points          INTEGER NOT NULL,
      balance_after   INTEGER NOT NULL DEFAULT 0,
      reason          VARCHAR(100),
      rule            VARCHAR(50),
      reference_id    VARCHAR(200),
      amount_spent    NUMERIC(10,2),
      notes           TEXT,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS loyalty_challenges (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      key             VARCHAR(50),
      label           VARCHAR(200),
      description     TEXT,
      target          INTEGER,
      metric          VARCHAR(50),
      points_reward   INTEGER,
      emoji           VARCHAR(10),
      active          BOOLEAN NOT NULL DEFAULT true,
      start_date      DATE,
      end_date        DATE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS loyalty_challenge_progress (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      challenge_id    UUID REFERENCES loyalty_challenges(id) ON DELETE CASCADE,
      member_id       UUID REFERENCES loyalty_members(id) ON DELETE CASCADE,
      progress        INTEGER NOT NULL DEFAULT 0,
      completed       BOOLEAN NOT NULL DEFAULT false,
      completed_at    TIMESTAMPTZ,
      rewarded        BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(challenge_id, member_id)
    )`,
    `CREATE TABLE IF NOT EXISTS loyalty_campaigns (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      type            VARCHAR(30),
      name            VARCHAR(200),
      description     TEXT,
      target_tiers    TEXT[] NOT NULL DEFAULT '{}',
      multiplier      NUMERIC(4,2),
      bonus_points    INTEGER,
      start_date      DATE,
      end_date        DATE,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft',
      ai_copy         JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      member_id       UUID REFERENCES loyalty_members(id),
      reward_id       VARCHAR(20),
      reward_label    VARCHAR(200),
      points_cost     INTEGER,
      location_id     UUID,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes           TEXT
    )`,
  ];

  for (const sql of stmts) await adminQuery(sql).catch(() => {});

  const migrations = [
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS location_id UUID',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS name VARCHAR(200)',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS email VARCHAR(300)',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS phone VARCHAR(30)',
    "ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'bronze'",
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS points_lifetime INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS referred_by_id UUID',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS invite_only BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS birthday_month INTEGER',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS preferences TEXT',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS notes TEXT',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS last_visit DATE',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS member_id UUID',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS location_id UUID',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(20)',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS points INTEGER',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS balance_after INTEGER',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reason VARCHAR(100)',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS rule VARCHAR(50)',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reference_id VARCHAR(200)',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS amount_spent NUMERIC(10,2)',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS notes TEXT',
    'ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS created_by UUID',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS key VARCHAR(50)',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS label VARCHAR(200)',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS description TEXT',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS target INTEGER',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS metric VARCHAR(50)',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS points_reward INTEGER',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS emoji VARCHAR(10)',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS start_date DATE',
    'ALTER TABLE loyalty_challenges ADD COLUMN IF NOT EXISTS end_date DATE',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS challenge_id UUID',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS member_id UUID',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ',
    'ALTER TABLE loyalty_challenge_progress ADD COLUMN IF NOT EXISTS rewarded BOOLEAN DEFAULT false',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS type VARCHAR(30)',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS name VARCHAR(200)',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS description TEXT',
    "ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS target_tiers TEXT[] DEFAULT '{}'",
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS multiplier NUMERIC(4,2)',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS bonus_points INTEGER',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS start_date DATE',
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS end_date DATE',
    "ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'",
    'ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS ai_copy JSONB',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS member_id UUID',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS reward_id VARCHAR(20)',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS reward_label VARCHAR(200)',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS points_cost INTEGER',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS location_id UUID',
    "ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'",
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE loyalty_redemptions ADD COLUMN IF NOT EXISTS notes TEXT',
    // Fix legacy guest_id NOT NULL
    'ALTER TABLE loyalty_members ALTER COLUMN guest_id DROP NOT NULL',
    // Indexes
    'CREATE INDEX IF NOT EXISTS loyalty_members_tenant ON loyalty_members(tenant_id)',
    'CREATE INDEX IF NOT EXISTS loyalty_members_code ON loyalty_members(referral_code)',
    'CREATE INDEX IF NOT EXISTS loyalty_tx_member ON loyalty_transactions(member_id)',
    'CREATE INDEX IF NOT EXISTS loyalty_tx_tenant ON loyalty_transactions(tenant_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS loyalty_challenge_progress_unique ON loyalty_challenge_progress(challenge_id, member_id)',
  ];
  for (const sql of migrations) await adminQuery(sql).catch(() => {});
});

// ── Referral code generator ───────────────────────────────────────────────────
function genCode(name) {
  const base = name.split(' ')[0].toUpperCase().slice(0,4).replace(/[^A-Z]/g,'X');
  return `${base}${Math.floor(1000+Math.random()*9000)}`;
}

// ── PUBLIC: member portal (no auth required) ──────────────────────────────────
async function getMemberPortal(referralCode) {
  await ensureTables();
  // RLS is disabled on loyalty tables — use adminQuery directly
  console.log('[portal] looking up referral code:', referralCode);
  const memberRes = await adminQuery(
    'SELECT * FROM loyalty_members WHERE UPPER(referral_code)=UPPER($1) AND active=true LIMIT 1',
    [referralCode]
  );
  const member = memberRes.rows[0];
  console.log('[portal] member found:', member ? member.name : 'NOT FOUND');
  if (!member) throw Object.assign(new Error('Member not found'), { status: 404 });

  const [txRes, chRes, tenantRes] = await Promise.all([
    adminQuery('SELECT * FROM loyalty_transactions WHERE member_id=$1 ORDER BY created_at DESC LIMIT 20', [member.id]),
    adminQuery(`SELECT cp.*, lc.label, lc.description, lc.target, lc.points_reward, lc.emoji
       FROM loyalty_challenge_progress cp
       JOIN loyalty_challenges lc ON lc.id = cp.challenge_id
       WHERE cp.member_id=$1 AND lc.active=true`, [member.id]),
    adminQuery('SELECT name FROM tenants WHERE id=$1', [member.tenant_id]),
  ]);
  const txRows = txRes.rows;
  const challengeRows = chRes.rows;
  const tenantName = tenantRes.rows[0]?.name || 'Restaurant';

  const cfg  = await getLoyaltyConfig(member.tenant_id);
  const tier = getTierFromConfig(member.points_balance, cfg, member.invite_only);
  const tiers = cfg.tiers;
  const tidx  = tiers.findIndex(t => t.key === tier.key);
  const nextTier   = tiers[tidx + 1] || null;
  const ptsToNext  = nextTier ? Math.max(0, nextTier.minPts - member.points_balance) : 0;
  const progressPct = nextTier
    ? Math.min(100, ((member.points_balance - tier.minPts) / (nextTier.minPts - tier.minPts)) * 100)
    : 100;

  return {
    member: {
      id:              member.id,
      name:            member.name,
      tier:            tier.key,
      tier_label:      tier.label,
      tier_color:      tier.color,
      points_balance:  member.points_balance,
      points_lifetime: member.points_lifetime,
      referral_code:   member.referral_code,
      visit_count:     member.visit_count,
      last_visit:      member.last_visit,
      member_since:    member.created_at,
    },
    program:      cfg,
    tenant_name:  tenantName,
    next_tier:    nextTier,
    pts_to_next:  ptsToNext,
    progress_pct: Math.round(progressPct),
    transactions: txRows,
    challenges:   challengeRows,
    rewards:      cfg.rewards,
  };
}


// PUBLIC: enroll new member
async function enrollMember(tenantId, { name, email, phone, referralCode }) {
  await ensureTables();
  if (!name?.trim()) throw Object.assign(new Error('Name required'), { status: 400 });

  // Check existing by email or phone
  if (email) {
    const exists = await adminQuery(
      'SELECT id FROM loyalty_members WHERE tenant_id=$1 AND email=$2 AND active=true LIMIT 1',
      [tenantId, email.toLowerCase()]
    );
    if (exists.rows.length) throw Object.assign(new Error('Already enrolled with this email'), { status: 409 });
  }

  let referredById = null;
  if (referralCode) {
    const ref = await adminQuery('SELECT id FROM loyalty_members WHERE referral_code=$1 AND tenant_id=$2', [referralCode, tenantId]);
    referredById = ref.rows[0]?.id || null;
  }

  const code = genCode(name);
  const r = await adminQuery(`
    INSERT INTO loyalty_members (tenant_id, name, email, phone, referral_code, referred_by_id)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [tenantId, name.trim(), email?.toLowerCase()||null, phone||null, code, referredById]);

  const member = r.rows[0];

  // Welcome points
  const cfg = await getLoyaltyConfig(tenantId);
  await awardPoints(tenantId, member.id, 300, 'app_signup', `Welcome to ${cfg.program_name}!`, null, null);

  // Referral bonus to referrer
  if (referredById) {
    await awardPoints(tenantId, referredById, 500, 'referral', `Referral: ${name} joined`, null, null);
  }

  return { member, program: cfg };
}

// ── MEMBER CRUD ───────────────────────────────────────────────────────────────
async function createMember(tenantId, { name, email, phone, locationId, birthday_month, preferences, notes, referralCode, userId }) {
  await ensureTables();
  let referredById = null;
  if (referralCode) {
    const ref = await queryForTenant(tenantId, 'SELECT id FROM loyalty_members WHERE referral_code=$1 AND tenant_id=$2', [referralCode, tenantId]);
    referredById = ref.rows[0]?.id || null;
  }
  const code = genCode(name);
  const r = await queryForTenant(tenantId, `
    INSERT INTO loyalty_members (tenant_id, location_id, name, email, phone, referral_code, referred_by_id, birthday_month, preferences, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  `, [tenantId, locationId||null, name, email||null, phone||null, code, referredById, birthday_month||null, preferences||null, notes||null]);
  const member = r.rows[0];
  await awardPoints(tenantId, member.id, 300, 'app_signup', 'Welcome bonus', null, userId);
  if (referredById) await awardPoints(tenantId, referredById, 500, 'referral', `Referral: ${name} joined`, null, userId);
  return member;
}

async function getMembers(tenantId, { locationId, tier, search, limit=100, offset=0 } = {}) {
  await ensureTables();
  const params = [tenantId]; let i = 2;
  let where = 'tenant_id=$1 AND active=true';
  if (locationId) { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (tier)       { where += ` AND tier=$${i++}`; params.push(tier); }
  if (search)     { where += ` AND (LOWER(name) LIKE LOWER($${i++}) OR email LIKE LOWER($${i-1}) OR phone LIKE $${i-1})`; params.push(`%${search}%`); }
  params.push(limit, offset);
  const r = await queryForTenant(tenantId,
    `SELECT *, (SELECT COUNT(*) FROM loyalty_transactions WHERE member_id=lm.id AND type='earn') as total_transactions
     FROM loyalty_members lm WHERE ${where} ORDER BY points_lifetime DESC LIMIT $${i} OFFSET $${i+1}`,
    params
  );
  return r.rows;
}

async function getMember(tenantId, memberId) {
  const member = await queryForTenant(tenantId, 'SELECT * FROM loyalty_members WHERE id=$1 AND tenant_id=$2', [memberId, tenantId]);
  const txns   = await queryForTenant(tenantId, 'SELECT * FROM loyalty_transactions WHERE member_id=$1 ORDER BY created_at DESC LIMIT 50', [memberId]);
  const progress = await queryForTenant(tenantId, `
    SELECT cp.*, lc.label, lc.description, lc.target, lc.points_reward, lc.emoji
    FROM loyalty_challenge_progress cp
    JOIN loyalty_challenges lc ON lc.id = cp.challenge_id
    WHERE cp.member_id=$1 AND cp.tenant_id=$2
  `, [memberId, tenantId]);
  return { member: member.rows[0], transactions: txns.rows, challenges: progress.rows };
}

async function updateMember(tenantId, memberId, data) {
  const allowed = ['name','email','phone','birthday_month','preferences','notes','invite_only','active'];
  const updates=[], values=[]; let i=1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  values.push(memberId, tenantId);
  const r = await queryForTenant(tenantId,
    `UPDATE loyalty_members SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
    values
  );
  if ('invite_only' in data) await recalcTier(tenantId, memberId);
  return r.rows[0];
}

// ── POINTS ────────────────────────────────────────────────────────────────────
async function awardPoints(tenantId, memberId, points, rule, reason, locationId, userId, referenceId, amountSpent) {
  if (!points || points <= 0) return null;
  const memberRes = await adminQuery('SELECT * FROM loyalty_members WHERE id=$1', [memberId]);
  const member = memberRes.rows[0];
  if (!member) throw new Error('Member not found');
  const newBalance  = member.points_balance  + points;
  const newLifetime = member.points_lifetime + points;
  await adminQuery('UPDATE loyalty_members SET points_balance=$1, points_lifetime=$2, updated_at=now() WHERE id=$3', [newBalance, newLifetime, memberId]);
  await adminQuery(`
    INSERT INTO loyalty_transactions (tenant_id, member_id, location_id, type, points, balance_after, reason, rule, reference_id, amount_spent, created_by)
    VALUES ($1,$2,$3,'earn',$4,$5,$6,$7,$8,$9,$10)
  `, [tenantId, memberId, locationId||null, points, newBalance, reason, rule||null, referenceId||null, amountSpent||null, userId||null]);
  await recalcTier(tenantId, memberId);
  await updateChallengeProgress(tenantId, memberId, rule, locationId).catch(() => {});
  return { points_awarded: points, new_balance: newBalance };
}

async function redeemPoints(tenantId, memberId, rewardId, locationId, userId) {
  const cfg    = await getLoyaltyConfig(tenantId);
  const reward = cfg.rewards.find(r => r.id === rewardId);
  if (!reward) throw Object.assign(new Error('Reward not found'), { status: 404 });
  const memberRes = await queryForTenant(tenantId, 'SELECT * FROM loyalty_members WHERE id=$1 AND tenant_id=$2', [memberId, tenantId]);
  const member = memberRes.rows[0];
  if (!member) throw Object.assign(new Error('Member not found'), { status: 404 });
  if (member.points_balance < reward.pts) throw Object.assign(new Error(`Need ${reward.pts} pts, have ${member.points_balance}`), { status: 400 });
  const newBalance = member.points_balance - reward.pts;
  await queryForTenant(tenantId, 'UPDATE loyalty_members SET points_balance=$1, updated_at=now() WHERE id=$2', [newBalance, memberId]);
  await queryForTenant(tenantId, `
    INSERT INTO loyalty_transactions (tenant_id, member_id, location_id, type, points, balance_after, reason, rule, created_by)
    VALUES ($1,$2,$3,'redeem',$4,$5,$6,'redemption',$7)
  `, [tenantId, memberId, locationId||null, -reward.pts, newBalance, `Redeemed: ${reward.label}`, userId||null]);
  await queryForTenant(tenantId, `
    INSERT INTO loyalty_redemptions (tenant_id, member_id, reward_id, reward_label, points_cost, location_id)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [tenantId, memberId, rewardId, reward.label, reward.pts, locationId||null]);
  return { reward, new_balance: newBalance };
}

async function adjustPoints(tenantId, memberId, points, reason, userId) {
  const memberRes = await queryForTenant(tenantId, 'SELECT * FROM loyalty_members WHERE id=$1 AND tenant_id=$2', [memberId, tenantId]);
  const member = memberRes.rows[0];
  if (!member) throw Object.assign(new Error('Member not found'), { status: 404 });
  const newBalance  = Math.max(0, member.points_balance + points);
  const newLifetime = points > 0 ? member.points_lifetime + points : member.points_lifetime;
  await queryForTenant(tenantId, 'UPDATE loyalty_members SET points_balance=$1, points_lifetime=$2, updated_at=now() WHERE id=$3', [newBalance, newLifetime, memberId]);
  await queryForTenant(tenantId, `
    INSERT INTO loyalty_transactions (tenant_id, member_id, type, points, balance_after, reason, rule, created_by)
    VALUES ($1,$2,'adjust',$3,$4,$5,'manual',$6)
  `, [tenantId, memberId, points, newBalance, reason, userId||null]);
  await recalcTier(tenantId, memberId);
  return { new_balance: newBalance };
}

async function recordVisit(tenantId, memberId, { locationId, amountSpent, checkId, isBirthday, isPrivateEvent, userId }) {
  const memberRes = await queryForTenant(tenantId, 'SELECT * FROM loyalty_members WHERE id=$1 AND tenant_id=$2', [memberId, tenantId]);
  const member = memberRes.rows[0];
  if (!member) throw new Error('Member not found');
  const cfg  = await getLoyaltyConfig(tenantId);
  const tier = getTierFromConfig(member.points_lifetime, cfg, member.invite_only);
  let total  = 0;

  if (amountSpent > 0) {
    const rule = isBirthday ? 'birthday' : 'dining';
    const pts  = isBirthday
      ? EARN_RULES.birthday(amountSpent, tier.multiplier, cfg.earn_rate)
      : EARN_RULES.dining(amountSpent, tier.multiplier, cfg.earn_rate);
    if (pts > 0) { await awardPoints(tenantId, memberId, pts, rule, isBirthday ? 'Birthday dining bonus' : 'Dining spend', locationId, userId, checkId, amountSpent); total += pts; }
  }

  if (isPrivateEvent && amountSpent > 0) {
    const pts = EARN_RULES.private_event(amountSpent);
    await awardPoints(tenantId, memberId, pts, 'private_event', 'Private event booking', locationId, userId, checkId, amountSpent);
    total += pts;
  }

  await queryForTenant(tenantId, 'UPDATE loyalty_members SET visit_count=visit_count+1, last_visit=CURRENT_DATE, updated_at=now() WHERE id=$1', [memberId]);

  // Cross-venue check
  const monthVisits = await queryForTenant(tenantId, `
    SELECT COUNT(DISTINCT location_id) as venues FROM loyalty_transactions
    WHERE member_id=$1 AND rule='dining' AND created_at > date_trunc('month', now())
  `, [memberId]);
  if (parseInt(monthVisits.rows[0]?.venues||0) >= 2) {
    const already = await queryForTenant(tenantId, `
      SELECT id FROM loyalty_transactions WHERE member_id=$1 AND rule='cross_venue' AND created_at > date_trunc('month', now()) LIMIT 1
    `, [memberId]);
    if (!already.rows.length) { await awardPoints(tenantId, memberId, 200, 'cross_venue', 'Cross-venue visit bonus', locationId, userId); total += 200; }
  }

  return { points_earned: total };
}

async function recalcTier(tenantId, memberId) {
  const r = await adminQuery('SELECT points_lifetime, invite_only, tenant_id FROM loyalty_members WHERE id=$1', [memberId]);
  const m = r.rows[0]; if (!m) return;
  const cfg = await getLoyaltyConfig(m.tenant_id || tenantId);
  const newTier = getTierFromConfig(m.points_lifetime, cfg, m.invite_only);
  await adminQuery('UPDATE loyalty_members SET tier=$1, updated_at=now() WHERE id=$2', [newTier.key, memberId]);
}

// ── CHALLENGES ────────────────────────────────────────────────────────────────
const CHALLENGE_TEMPLATES = [
  { key:'spice_explorer',    label:'Explorer',         desc:'Visit 3+ different venues', target:3, metric:'venues',   pts:800,  emoji:'🗺️' },
  { key:'regular',           label:'Regular',          desc:'Dine 4 times this month',   target:4, metric:'visits',   pts:400,  emoji:'🔥' },
  { key:'festival',          label:'Festival Feaster', desc:'Dine during 2 festivals',   target:2, metric:'events',   pts:600,  emoji:'🪔' },
  { key:'review_master',     label:'Review Master',    desc:'Leave 3 Google reviews',    target:3, metric:'reviews',  pts:500,  emoji:'⭐' },
  { key:'referral_champion', label:'Referral Champion',desc:'Refer 5 new guests',        target:5, metric:'referrals',pts:2500, emoji:'🦚' },
  { key:'dish_hunter',       label:'Dish Hunter',      desc:'Try 5 signature dishes',    target:5, metric:'dishes',   pts:600,  emoji:'🍽️' },
];

async function seedChallenges(tenantId) {
  await ensureTables();
  for (const tmpl of CHALLENGE_TEMPLATES) {
    const exists = await queryForTenant(tenantId,
      'SELECT id FROM loyalty_challenges WHERE tenant_id=$1 AND (key=$2 OR LOWER(label)=LOWER($3)) LIMIT 1',
      [tenantId, tmpl.key, tmpl.label]
    );
    if (exists.rows.length) continue;
    await queryForTenant(tenantId, `
      INSERT INTO loyalty_challenges (tenant_id, key, label, description, target, metric, points_reward, emoji, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
    `, [tenantId, tmpl.key, tmpl.label, tmpl.desc, tmpl.target, tmpl.metric, tmpl.pts, tmpl.emoji]).catch(() => {});
  }
}

async function createChallenge(tenantId, data) {
  await ensureTables();
  const { label, description, target, metric, points_reward, emoji, start_date, end_date } = data;
  if (!label?.trim()) throw Object.assign(new Error('Label required'), { status: 400 });
  const exists = await queryForTenant(tenantId, 'SELECT id FROM loyalty_challenges WHERE tenant_id=$1 AND LOWER(label)=LOWER($2)', [tenantId, label.trim()]);
  if (exists.rows.length) throw Object.assign(new Error(`Challenge "${label}" already exists`), { status: 409 });
  const r = await queryForTenant(tenantId, `
    INSERT INTO loyalty_challenges (tenant_id, label, description, target, metric, points_reward, emoji, active, start_date, end_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9) RETURNING *
  `, [tenantId, label.trim(), description||null, target||1, metric||'visits', points_reward||0, emoji||null, start_date||null, end_date||null]);
  return r.rows[0];
}

async function getChallenges(tenantId) {
  await seedChallenges(tenantId);
  const r = await queryForTenant(tenantId, `
    SELECT c.*,
      COUNT(cp.id) FILTER (WHERE cp.completed=true) as completed_count,
      COUNT(cp.id) as enrolled_count
    FROM loyalty_challenges c
    LEFT JOIN loyalty_challenge_progress cp ON cp.challenge_id=c.id
    WHERE c.tenant_id=$1
    GROUP BY c.id ORDER BY c.created_at
  `, [tenantId]);
  return r.rows;
}

async function updateChallenge(tenantId, challengeId, data) {
  const allowed = ['label','description','target','metric','points_reward','emoji','active','start_date','end_date'];
  const updates=[], values=[]; let i=1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  values.push(challengeId, tenantId);
  const r = await queryForTenant(tenantId,
    `UPDATE loyalty_challenges SET ${updates.join(',')} WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`, values);
  return r.rows[0];
}

async function deleteChallenge(tenantId, challengeId) {
  await queryForTenant(tenantId, 'DELETE FROM loyalty_challenges WHERE id=$1 AND tenant_id=$2', [challengeId, tenantId]);
  return { ok: true };
}

async function updateChallengeProgress(tenantId, memberId, rule, locationId) {
  const metricMap = { dining:'visits', birthday:'visits', cross_venue:'venues', review:'reviews', referral:'referrals', private_event:'events' };
  const metric = metricMap[rule];
  if (!metric) return;
  const challenges = await queryForTenant(tenantId, 'SELECT * FROM loyalty_challenges WHERE tenant_id=$1 AND active=true AND metric=$2', [tenantId, metric]);
  for (const ch of challenges.rows) {
    const upsert = await queryForTenant(tenantId, `
      INSERT INTO loyalty_challenge_progress (tenant_id, challenge_id, member_id, progress)
      VALUES ($1,$2,$3,1)
      ON CONFLICT (challenge_id, member_id) DO UPDATE
      SET progress = LEAST(loyalty_challenge_progress.progress + 1, $4)
      RETURNING *
    `, [tenantId, ch.id, memberId, ch.target]);
    const prog = upsert.rows[0];
    if (prog.progress >= ch.target && !prog.completed) {
      await queryForTenant(tenantId, 'UPDATE loyalty_challenge_progress SET completed=true, completed_at=now() WHERE id=$1', [prog.id]);
      await awardPoints(tenantId, memberId, ch.points_reward, 'challenge', `Challenge completed: ${ch.label}`, locationId, null);
    }
  }
}

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────────
async function getCampaigns(tenantId) {
  await ensureTables();
  const r = await queryForTenant(tenantId, 'SELECT * FROM loyalty_campaigns WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId]);
  return r.rows;
}

async function createCampaign(tenantId, data, userId) {
  await ensureTables();
  const { type, name, description, targetTiers, multiplier, bonusPoints, startDate, endDate } = data;
  const exists = await queryForTenant(tenantId, 'SELECT id FROM loyalty_campaigns WHERE tenant_id=$1 AND LOWER(name)=LOWER($2)', [tenantId, name?.trim()||'']);
  if (exists.rows.length) throw Object.assign(new Error(`Campaign "${name}" already exists`), { status: 409 });
  const r = await queryForTenant(tenantId, `
    INSERT INTO loyalty_campaigns (tenant_id, type, name, description, target_tiers, multiplier, bonus_points, start_date, end_date, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *
  `, [tenantId, type, name, description||null, targetTiers||[], multiplier||null, bonusPoints||null, startDate||null, endDate||null]);
  return r.rows[0];
}

async function updateCampaign(tenantId, campaignId, data) {
  const allowed = ['name','description','type','target_tiers','multiplier','bonus_points','start_date','end_date','status'];
  const updates=[], values=[]; let i=1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  values.push(campaignId, tenantId);
  const r = await queryForTenant(tenantId,
    `UPDATE loyalty_campaigns SET ${updates.join(',')} WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`, values);
  return r.rows[0];
}

async function deleteCampaign(tenantId, campaignId) {
  await queryForTenant(tenantId, 'DELETE FROM loyalty_campaigns WHERE id=$1 AND tenant_id=$2', [campaignId, tenantId]);
  return { ok: true };
}

async function generateCampaignCopy(tenantId, campaignId) {
  const campRes = await queryForTenant(tenantId, 'SELECT * FROM loyalty_campaigns WHERE id=$1 AND tenant_id=$2', [campaignId, tenantId]);
  const camp = campRes.rows[0];
  if (!camp) throw new Error('Campaign not found');
  const cfg = await getLoyaltyConfig(tenantId);
  const campaignPrompt = `Write marketing copy for the "${cfg.program_name}" loyalty program.
Campaign: ${camp.name} | Type: ${camp.type}
Description: ${camp.description || 'N/A'}
Tiers: ${(camp.target_tiers||[]).join(', ') || 'all'}${camp.multiplier ? ' | Multiplier: '+camp.multiplier+'x' : ''}${camp.bonus_points ? ' | Bonus: +'+camp.bonus_points+' pts' : ''}

Return ONLY this JSON object, no other text, no markdown:
{"email":{"subject":"<subject line>","body":"<2-3 sentence email body>"},"sms":"<max 160 chars>","push":{"title":"<5 words max>","body":"<max 80 chars>"}}

Tone: warm, premium, welcoming.`;
  const rawResponse = await callClaude({ content: campaignPrompt, maxTokens: 800 });
  const text = rawResponse.trim();
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in Claude response');
  const copy = JSON.parse(text.slice(jsonStart, jsonEnd+1));
  await queryForTenant(tenantId, 'UPDATE loyalty_campaigns SET ai_copy=$1 WHERE id=$2', [JSON.stringify(copy), campaignId]);
  return copy;
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
async function getLeaderboard(tenantId, metric='points', limit=10) {
  await ensureTables();
  const orderMap = {
    points:    'points_lifetime DESC',
    visits:    'visit_count DESC',
    referrals: '(SELECT COUNT(*) FROM loyalty_members r WHERE r.referred_by_id=lm.id) DESC',
  };
  const r = await queryForTenant(tenantId, `
    SELECT lm.*, (SELECT COUNT(*) FROM loyalty_members r WHERE r.referred_by_id=lm.id) as referral_count
    FROM loyalty_members lm
    WHERE lm.tenant_id=$1 AND lm.active=true
    ORDER BY ${orderMap[metric]||orderMap.points}
    LIMIT $2
  `, [tenantId, limit]);
  return r.rows;
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
async function getSummary(tenantId, locationId) {
  await ensureTables();
  const params = [tenantId];
  const locWhere = locationId ? ' AND (location_id=$2 OR location_id IS NULL)' : '';
  if (locationId) params.push(locationId);
  const [members, tiers, pts, recent] = await Promise.all([
    queryForTenant(tenantId, `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE active=true) as active FROM loyalty_members WHERE tenant_id=$1${locWhere}`, params),
    queryForTenant(tenantId, `SELECT tier, COUNT(*) as count FROM loyalty_members WHERE tenant_id=$1${locWhere} AND active=true GROUP BY tier`, params),
    queryForTenant(tenantId, `SELECT COALESCE(SUM(points_balance),0) as outstanding, COALESCE(SUM(points_lifetime),0) as lifetime FROM loyalty_members WHERE tenant_id=$1${locWhere} AND active=true`, params),
    queryForTenant(tenantId, `SELECT COUNT(*) as this_month FROM loyalty_members WHERE tenant_id=$1${locWhere} AND created_at > date_trunc('month',now())`, params),
  ]);
  const tierCounts = {};
  tiers.rows.forEach(r => { tierCounts[r.tier] = parseInt(r.count); });
  return {
    total_members:      parseInt(members.rows[0]?.total||0),
    active_members:     parseInt(members.rows[0]?.active||0),
    new_this_month:     parseInt(recent.rows[0]?.this_month||0),
    outstanding_points: parseInt(pts.rows[0]?.outstanding||0),
    lifetime_points:    parseInt(pts.rows[0]?.lifetime||0),
    tiers: tierCounts,
  };
}

module.exports = {
  AGENT_ID, ensureTables, CHALLENGE_TEMPLATES, DEFAULT_CONFIG,
  getLoyaltyConfig, saveLoyaltyConfig,
  getMemberPortal, enrollMember,
  createMember, getMembers, getMember, updateMember,
  awardPoints, redeemPoints, adjustPoints, recordVisit,
  getChallenges, seedChallenges, createChallenge, updateChallenge, deleteChallenge,
  getCampaigns, createCampaign, updateCampaign, deleteCampaign, generateCampaignCopy,
  getLeaderboard, getSummary,
};
