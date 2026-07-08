// ─── Toast POS Adapter ────────────────────────────────────────────────────────
// Two modes:
// 1. Webhook endpoint — receives Toast order_updated events (filters for CLOSED)
//    Note: Toast strips PII from webhooks, so phone/email lookup uses check customer
//    field if available, or falls back to the Orders API.
// 2. Poll endpoint — called by a cron/scheduler to pull recent closed orders
//    and award loyalty points.
//
// Setup in Toast Developer Portal:
//   Webhook URL: POST /api/toast/webhook
//   Events: order_updated

const router   = require('express').Router();
const { adminQuery } = require('@restaurantos/db');

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToastHeaders(clientId, clientSecret) {
  // Toast uses client_credentials OAuth
  return { 'Content-Type': 'application/json' };
}

async function fetchToastToken(clientId, clientSecret) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://ws-api.toasttab.com/authentication/v1/authentication/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      clientSecret,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  });
  const data = await res.json();
  return data.token?.accessToken;
}

async function fetchOrderDetails(restaurantGuid, orderGuid, token) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(
    `https://ws-api.toasttab.com/orders/v2/orders/${orderGuid}`,
    { headers: { Authorization: `Bearer ${token}`, 'Toast-Restaurant-External-ID': restaurantGuid } }
  );
  return res.json();
}

function extractCheckData(order) {
  // Get closed, non-voided checks with payments
  const checks = (order.checks || []).filter(c =>
    !c.voided && c.paymentStatus === 'PAID' && c.paidDate
  );
  return checks.map(check => ({
    checkGuid:    check.guid,
    totalAmount:  parseFloat(check.totalAmount || 0),
    taxAmount:    parseFloat(check.taxAmount || 0),
    tip:          (check.payments || []).reduce((s, p) => s + parseFloat(p.tipAmount || 0), 0),
    phone:        check.customer?.phone || null,
    email:        check.customer?.email || null,
    paidDate:     check.paidDate,
  }));
}

async function forwardToLoyaltyWebhook(tenantId, locationId, checkData, restaurantGuid, orderGuid) {
  // Import loyalty webhook handler directly — avoids HTTP round-trip on Railway
  const loyaltyHandler = require('./loyaltyWebhook');

  for (const check of checkData) {
    if (!check.phone && !check.email) continue;
    const netSpend = check.totalAmount - check.taxAmount;
    if (netSpend <= 0) continue;

    // Simulate a request object for the loyalty webhook handler
    const mockReq = {
      body: {
        pos:          'toast',
        secret:       process.env.LOYALTY_WEBHOOK_SECRET,
        tenant_id:    tenantId,
        location_id:  locationId,
        location_ref: restaurantGuid,
        check_id:     check.checkGuid,
        amount:       netSpend,
        tip:          check.tip,
        phone:        check.phone,
        email:        check.email,
      }
    };

    // Use adminQuery directly since we know the tenant
    const { adminQuery } = require('@restaurantos/db');
    
    // Inline the core loyalty awarding logic
    const memberRes = await adminQuery(
      `SELECT * FROM loyalty_members WHERE tenant_id=$1
       AND (phone=$2 OR UPPER(phone)=UPPER($2) OR phone=$3 OR LOWER(email)=LOWER($4))
       AND active=true LIMIT 1`,
      [tenantId, check.phone||'', (check.phone||'').replace(/\D/g,''), check.email||'']
    );
    const member = memberRes.rows[0];
    if (!member) {
      console.log(`[toast-adapter] check ${check.checkGuid}: member not found`);
      continue;
    }

    // Dedup check
    if (check.checkGuid) {
      const dup = await adminQuery(
        'SELECT id FROM loyalty_transactions WHERE tenant_id=$1 AND reference_id=$2 LIMIT 1',
        [tenantId, `toast:${check.checkGuid}`]
      );
      if (dup.rows.length) {
        console.log(`[toast-adapter] check ${check.checkGuid}: duplicate, skipping`);
        continue;
      }
    }

    // Get config and calc points
    const cfgRes = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [tenantId]);
    const loyalty = cfgRes.rows[0]?.settings?.loyalty || {};
    const earnRate = loyalty.earn_rate || 10;
    const tiers    = loyalty.tiers || [{key:'bronze',multiplier:1},{key:'silver',multiplier:1.25},{key:'gold',multiplier:1.5},{key:'platinum',multiplier:2}];
    const tier     = tiers.find(t => t.key === member.tier) || tiers[0];
    const points   = Math.floor((netSpend / 100) * earnRate * (tier.multiplier || 1));
    if (points <= 0) continue;

    const newBalance  = member.points_balance  + points;
    const newLifetime = member.points_lifetime + points;

    await adminQuery(
      'UPDATE loyalty_members SET points_balance=$1, points_lifetime=$2, visit_count=visit_count+1, last_visit=CURRENT_DATE, updated_at=now() WHERE id=$3',
      [newBalance, newLifetime, member.id]
    );
    await adminQuery(
      `INSERT INTO loyalty_transactions (tenant_id, member_id, location_id, type, points, balance_after, reason, rule, reference_id, amount_spent)
       VALUES ($1,$2,$3,'earn',$4,$5,$6,'dining',$7,$8)`,
      [tenantId, member.id, locationId, points, newBalance,
       `Toast dining — ${netSpend.toFixed(2)}`, `toast:${check.checkGuid}`, netSpend]
    );

    // Recalc tier
    const newTier = [...tiers].reverse().find(t => newLifetime >= (t.minPts||0)) || tiers[0];
    if (newTier.key !== member.tier) {
      await adminQuery('UPDATE loyalty_members SET tier=$1, updated_at=now() WHERE id=$2', [newTier.key, member.id]);
    }

    console.log(`[toast-adapter] check ${check.checkGuid}: ${member.name} +${points}pts balance:${newBalance}`);
  }
}

// ── Get tenant Toast config ───────────────────────────────────────────────────
async function getToastConfig(tenantId) {
  const r = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [tenantId]);
  return r.rows[0]?.settings?.toast || null;
}

// Webhook handled at top-level (before auth middleware) — see index.js

// ── GET /api/toast/status — check config ──────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const config = await getToastConfig(req.tenantId);
    res.json({ ok: true, data: {
      configured: !!(config?.client_id && config?.client_secret),
      restaurant_guid: config?.restaurant_guid || null,
    }});
  } catch(e) { next(e); }
});

// ── POST /api/toast/config — save Toast credentials ───────────────────────────
router.post('/config', async (req, res, next) => {
  try {
    const { client_id, client_secret, restaurant_guid } = req.body;
    const r = await adminQuery('SELECT settings FROM tenants WHERE id=$1', [req.tenantId]);
    const settings = r.rows[0]?.settings || {};
    settings.toast = { client_id, client_secret, restaurant_guid };
    await adminQuery('UPDATE tenants SET settings=$1 WHERE id=$2', [JSON.stringify(settings), req.tenantId]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// ── POST /api/toast/sync — manually pull recent closed orders ─────────────────
router.post('/sync', async (req, res, next) => {
  try {
    const config = await getToastConfig(req.tenantId);
    if (!config?.client_id) return res.status(400).json({ ok: false, error: 'Toast not configured' });

    const token = await fetchToastToken(config.client_id, config.client_secret);
    if (!token) return res.status(400).json({ ok: false, error: 'Toast authentication failed' });

    const fetch  = (await import('node-fetch')).default;
    const since  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
    const res2   = await fetch(
      `https://ws-api.toasttab.com/orders/v2/ordersBulk?startDate=${since}&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}`, 'Toast-Restaurant-External-ID': config.restaurant_guid } }
    );
    const orders = await res2.json();

    // Get location_id for this tenant's Toast restaurant
    const locRes = await adminQuery(
      'SELECT id FROM locations WHERE tenant_id=$1 AND toast_location_id=$2 LIMIT 1',
      [req.tenantId, config.restaurant_guid]
    );
    const location_id = locRes.rows[0]?.id;

    let processed = 0;
    for (const order of (Array.isArray(orders) ? orders : [])) {
      const checks = extractCheckData(order);
      if (checks.length) {
        await forwardToLoyaltyWebhook(req.tenantId, location_id, checks, config.restaurant_guid, order.guid);
        processed++;
      }
    }

    res.json({ ok: true, data: { orders_processed: processed } });
  } catch(e) { next(e); }
});

// Named export for public webhook (called before auth middleware)
async function handleWebhook(req, res) {
  // Respond immediately so Toast doesn't retry
  res.json({ ok: true, received: true });

  try {
    const { eventType, details } = req.body;
    if (!['order_updated','channel_order_updated'].includes(eventType)) return;
    const order        = details?.order;
    const restaurantId = details?.restaurantGuid;
    if (!order || !restaurantId) return;

    const closedChecks = (order.checks || []).filter(c => c.paymentStatus === 'PAID' && c.paidDate);
    if (!closedChecks.length) return;

    const tenantRes = await adminQuery(
      `SELECT t.id as tenant_id, l.id as location_id
       FROM locations l JOIN tenants t ON t.id = l.tenant_id
       WHERE l.toast_location_id = $1 LIMIT 1`,
      [restaurantId]
    );
    if (!tenantRes.rows[0]) return;

    const { tenant_id, location_id } = tenantRes.rows[0];
    const config = await getToastConfig(tenant_id);

    if (config?.client_id && config?.client_secret) {
      const token = await fetchToastToken(config.client_id, config.client_secret);
      if (token) {
        const fullOrder = await fetchOrderDetails(restaurantId, order.guid, token);
        const checks = extractCheckData(fullOrder);
        await forwardToLoyaltyWebhook(tenant_id, location_id, checks, restaurantId, order.guid);
        return;
      }
    }
    // No API creds — use whatever PII is in the webhook (usually empty)
    const checks = extractCheckData(order);
    await forwardToLoyaltyWebhook(tenant_id, location_id, checks, restaurantId, order.guid);
  } catch(e) {
    console.error('[toast-adapter] webhook error:', e.message);
  }
}

module.exports = router;
module.exports.handleWebhook = handleWebhook;
