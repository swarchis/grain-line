// ─── Loyalty Webhook — POS-agnostic payment handler ──────────────────────────
// Accepts a standard payload from any POS system.
// Each POS sends a POST to /api/loyalty/webhook with an adapter-translated body.
//
// Standard payload:
// {
//   pos:          'toast' | 'square' | 'revel' | 'manual' | string
//   secret:       string   (LOYALTY_WEBHOOK_SECRET env var)
//   tenant_id:    uuid
//   location_id:  uuid     (optional — matched by location_ref if omitted)
//   location_ref: string   (POS location ID, used to look up location_id)
//   check_id:     string   (POS check/order ID — used for dedup)
//   amount:       number   (total spend in dollars, e.g. 85.50)
//   tip:          number   (tip amount — excluded from points calc)
//   phone:        string   (customer phone, e.g. +14155551234)
//   email:        string   (customer email — fallback if no phone match)
//   is_birthday:  boolean
//   metadata:     object   (any extra POS-specific data)
// }

const router  = require('express').Router();
const { adminQuery } = require('@restaurantos/db');

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

async function findMember(tenantId, phone, email) {
  // Try phone first — match any common format
  if (phone) {
    const norm    = normalisePhone(phone);
    const digits  = phone.replace(/\D/g, '');
    const formats = new Set([phone, norm, digits,
      digits.length === 11 ? digits.slice(1) : null,  // strip leading 1
    ].filter(Boolean));

    for (const fmt of formats) {
      const r = await adminQuery(
        `SELECT * FROM loyalty_members
         WHERE tenant_id=$1 AND phone=$2 AND active=true LIMIT 1`,
        [tenantId, fmt]
      );
      if (r.rows[0]) return r.rows[0];
    }
  }
  // Fallback to email
  if (email) {
    const r = await adminQuery(
      `SELECT * FROM loyalty_members
       WHERE tenant_id=$1 AND LOWER(email)=LOWER($2) AND active=true LIMIT 1`,
      [tenantId, email]
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

async function resolveLocation(tenantId, locationId, locationRef) {
  if (locationId) return locationId;
  if (locationRef) {
    // Try matching by toast_location_id or any location identifier
    const r = await adminQuery(
      `SELECT id FROM locations
       WHERE tenant_id=$1 AND (
         toast_location_id=$2 OR
         yelp_business_id=$2 OR
         name ILIKE $2
       ) LIMIT 1`,
      [tenantId, locationRef]
    );
    return r.rows[0]?.id || null;
  }
  return null;
}

async function isDuplicate(tenantId, checkId, pos) {
  if (!checkId) return false;
  const r = await adminQuery(
    `SELECT id FROM loyalty_transactions
     WHERE tenant_id=$1 AND reference_id=$2 AND rule='dining' LIMIT 1`,
    [tenantId, `${pos}:${checkId}`]
  );
  return r.rows.length > 0;
}

// Run once on first request
let migrationsRun = false;
async function ensureWebhookMigrations() {
  if (migrationsRun) return;
  migrationsRun = true;
  const cols = [
    // Drop conflicting NOT NULL constraints from original migration
    "ALTER TABLE loyalty_members ALTER COLUMN guest_id DROP NOT NULL",
    "ALTER TABLE loyalty_members ALTER COLUMN tier DROP NOT NULL",
    "ALTER TABLE loyalty_members ALTER COLUMN referral_code DROP NOT NULL",
    "ALTER TABLE loyalty_members ALTER COLUMN streak_weeks DROP NOT NULL",
    "ALTER TABLE loyalty_transactions ALTER COLUMN member_id DROP NOT NULL",
    "ALTER TABLE loyalty_transactions ALTER COLUMN location_id DROP NOT NULL",
    "ALTER TABLE loyalty_transactions ALTER COLUMN type DROP NOT NULL",
    "ALTER TABLE loyalty_transactions ALTER COLUMN points DROP NOT NULL",
    "ALTER TABLE loyalty_transactions ALTER COLUMN description DROP NOT NULL",
    // Add missing columns
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS balance_after INTEGER DEFAULT 0",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reason VARCHAR(100)",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS rule VARCHAR(50)",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reference_id VARCHAR(200)",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS amount_spent NUMERIC(10,2)",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS created_by UUID",
    "CREATE INDEX IF NOT EXISTS loyalty_tx_tenant ON loyalty_transactions(tenant_id)",
  ];
  for (const sql of cols) await adminQuery(sql).catch(() => {});
}

// ── POST /api/loyalty/webhook ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    await ensureWebhookMigrations();
    const {
      pos = 'unknown', secret, tenant_id, location_id, location_ref,
      check_id, amount, tip = 0, phone, email, is_birthday = false, metadata = {}
    } = req.body;

    // ── Auth ──────────────────────────────────────────────────────────────────
    const expectedSecret = process.env.LOYALTY_WEBHOOK_SECRET;
    if (expectedSecret && secret && secret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!tenant_id)          return res.status(400).json({ ok: false, error: 'tenant_id required' });
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: 'amount required' });
    if (!phone && !email)    return res.status(400).json({ ok: false, error: 'phone or email required' });

    // ── Dedup ─────────────────────────────────────────────────────────────────
    if (check_id && await isDuplicate(tenant_id, check_id, pos)) {
      return res.json({ ok: true, skipped: true, reason: 'duplicate check_id' });
    }

    // ── Find member ───────────────────────────────────────────────────────────
    const member = await findMember(tenant_id, phone, email);
    if (!member) {
      return res.json({ ok: true, skipped: true, reason: 'member not found', phone, email });
    }

    // ── Resolve location ──────────────────────────────────────────────────────
    const resolvedLocationId = await resolveLocation(tenant_id, location_id, location_ref);

    // ── Load config and calc points ───────────────────────────────────────────
    const cfgRes = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [tenant_id]);
    const settings = cfgRes.rows[0]?.settings || {};
    const loyalty  = settings.loyalty || {};
    const earnRate = loyalty.earn_rate || 10;
    const tiers    = loyalty.tiers || [
      { key:'bronze', multiplier:1.0 },{ key:'silver', multiplier:1.25 },
      { key:'gold',   multiplier:1.5 },{ key:'platinum', multiplier:2.0 },
    ];

    const tierConfig  = tiers.find(t => t.key === member.tier) || tiers[0];
    const multiplier  = tierConfig.multiplier || 1;
    const spendable   = Math.max(0, parseFloat(amount) - parseFloat(tip));
    const rule        = is_birthday ? 'birthday' : 'dining';
    const basePoints  = Math.floor((spendable / 100) * earnRate * multiplier);
    const points      = is_birthday ? basePoints * 2 : basePoints;

    if (points <= 0) {
      return res.json({ ok: true, skipped: true, reason: 'no points to award', amount, earnRate });
    }

    // ── Award points ──────────────────────────────────────────────────────────
    const newBalance  = member.points_balance  + points;
    const newLifetime = member.points_lifetime + points;

    await adminQuery(
      'UPDATE loyalty_members SET points_balance=$1, points_lifetime=$2, visit_count=visit_count+1, last_visit=CURRENT_DATE, updated_at=now() WHERE id=$3',
      [newBalance, newLifetime, member.id]
    );

    await adminQuery(
      `INSERT INTO loyalty_transactions
        (tenant_id, member_id, location_id, type, points, balance_after, reason, rule, reference_id, amount_spent)
       VALUES ($1,$2,$3,'earn',$4,$5,$6,$7,$8,$9)`,
      [
        tenant_id, member.id, resolvedLocationId,
        points, newBalance,
        is_birthday ? 'Birthday dining bonus' : `${pos} dining — $${spendable.toFixed(2)}`,
        rule,
        check_id ? `${pos}:${check_id}` : null,
        spendable,
      ]
    );

    // ── Recalc tier ───────────────────────────────────────────────────────────
    const newTier = [...tiers].reverse().find(t => newLifetime >= t.minPts) || tiers[0];
    if (newTier.key !== member.tier) {
      await adminQuery(
        'UPDATE loyalty_members SET tier=$1, updated_at=now() WHERE id=$2',
        [newTier.key, member.id]
      );
    }

    console.log(`[loyalty-webhook] ${pos} | ${member.name} | +${points}pts | balance:${newBalance} | check:${check_id}`);

    res.json({
      ok:            true,
      member_id:     member.id,
      member_name:   member.name,
      points_awarded:points,
      new_balance:   newBalance,
      tier:          newTier.key,
      tier_changed:  newTier.key !== member.tier,
    });

  } catch(e) {
    console.error('[loyalty-webhook] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/loyalty/webhook/test — test endpoint ────────────────────────────
router.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Loyalty webhook is active',
    payload_example: {
      pos:         'toast',
      secret:      'YOUR_LOYALTY_WEBHOOK_SECRET',
      tenant_id:   'your-tenant-uuid',
      location_ref:'toast-location-id or location name',
      check_id:    'unique-check-id',
      amount:      85.50,
      tip:         15.00,
      phone:       '+14155551234',
      email:       'customer@example.com',
      is_birthday: false,
    },
    pos_adapters: {
      toast:  'POST with toast check data translated to standard payload',
      square: 'POST with square order data translated to standard payload',
      manual: 'POST directly from Pulse UI when staff records a visit',
    },
  });
});

module.exports = router;
