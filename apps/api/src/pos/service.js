'use strict';
// ─── POS Integration: Square (OAuth) + Toast (existing credentials) ──────────
// Pulls closed orders, aggregates into Mon-Sun weeks, and upserts total_sales
// (and bar/food split where category mapping allows) into weekly_kpi so the
// Financial KPI agent fills itself automatically.

const { adminQuery } = require('@restaurantos/db');
const integrations   = require('../integrations/service');
const agent2         = require('../agents/agent2/service');

const SQUARE_BASE = process.env.SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

// ── Week helpers ───────────────────────────────────────────────────────────────
function mondayOf(dateStr) {
  const d = new Date(dateStr);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

// ── Square OAuth ───────────────────────────────────────────────────────────────
function squareConnectUrl(tenantId) {
  const appId = process.env.SQUARE_APP_ID;
  if (!appId) throw new Error('SQUARE_APP_ID not configured in Railway');
  const jwt = require('jsonwebtoken');
  const state = jwt.sign({ tenantId, t: Date.now() }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const scopes = ['ORDERS_READ', 'PAYMENTS_READ', 'MERCHANT_PROFILE_READ', 'ITEMS_READ'].join('+');
  return `${SQUARE_BASE}/oauth2/authorize?client_id=${appId}&scope=${scopes}&session=false&state=${encodeURIComponent(state)}`;
}

async function squareCallback(code, state) {
  const jwt = require('jsonwebtoken');
  let payload;
  try { payload = jwt.verify(state, process.env.JWT_SECRET); }
  catch (e) { throw new Error('Invalid or expired connect link — try again from Setup'); }
  const tenantId = payload.tenantId;

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Square token exchange failed: ' + (data.errors?.[0]?.detail || 'unknown'));

  // Fetch Square locations for mapping
  const locRes = await fetch(`${SQUARE_BASE}/v2/locations`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const locData = await locRes.json();
  const squareLocations = (locData.locations || []).map(l => ({ id: l.id, name: l.name }));

  await integrations.setIntegration(tenantId, 'square', {
    status: 'active',
    credentials: {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      merchantId:   data.merchant_id,
      expiresAt:    data.expires_at,
    },
    config: { squareLocations, locationMap: autoMapLocations(squareLocations, await getPulseLocations(tenantId)) },
  });
  return tenantId;
}

async function getPulseLocations(tenantId) {
  const r = await adminQuery('SELECT id, name FROM locations WHERE tenant_id=$1 AND active IS NOT FALSE', [tenantId]);
  return r.rows;
}

// Match Square location names to Pulse location names (case-insensitive substring)
function autoMapLocations(squareLocs, pulseLocs) {
  const map = {};
  for (const sq of squareLocs) {
    const hit = pulseLocs.find(p =>
      p.name.toLowerCase().includes(sq.name.toLowerCase()) ||
      sq.name.toLowerCase().includes(p.name.toLowerCase())
    );
    if (hit) map[sq.id] = hit.id;
    else if (pulseLocs.length === 1) map[sq.id] = pulseLocs[0].id;
  }
  return map;
}

async function setLocationMap(tenantId, provider, locationMap) {
  const integ = await integrations.getIntegration(tenantId, provider);
  if (!integ) throw new Error(provider + ' not connected');
  await integrations.setIntegration(tenantId, provider, {
    config: { ...(integ.config || {}), locationMap },
  });
}

// Refresh Square token if near expiry
async function getSquareToken(tenantId) {
  const integ = await integrations.getIntegration(tenantId, 'square');
  if (!integ?.credentials?.accessToken) return null;
  const expires = integ.credentials.expiresAt ? new Date(integ.credentials.expiresAt) : null;
  if (expires && expires.getTime() - Date.now() < 7 * 86400e3 && integ.credentials.refreshToken) {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${SQUARE_BASE}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APP_ID, client_secret: process.env.SQUARE_APP_SECRET,
        refresh_token: integ.credentials.refreshToken, grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      await integrations.setIntegration(tenantId, 'square', {
        credentials: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at },
      });
      return { token: data.access_token, config: integ.config };
    }
  }
  return { token: integ.credentials.accessToken, config: integ.config };
}

// ── Square sales sync ──────────────────────────────────────────────────────────
// Pulls completed orders for the last N days, buckets by (square location, week),
// classifies line items as bar vs food by category name, upserts into weekly_kpi.
const BAR_KEYWORDS = ['bar','beer','wine','cocktail','liquor','spirits','beverage alc','drinks - alc'];

async function syncSquareSales(tenantId, { days = 30 } = {}) {
  const tw = await getSquareToken(tenantId);
  if (!tw) throw new Error('Square not connected');
  const { token, config } = tw;
  const locationMap = config?.locationMap || {};
  const squareLocIds = Object.keys(locationMap);
  if (!squareLocIds.length) throw new Error('No Square locations mapped to Pulse locations yet');

  const fetch = (await import('node-fetch')).default;
  const beginTime = new Date(Date.now() - days * 86400e3).toISOString();

  // Optional: fetch catalog categories once to classify bar vs food
  let barCategoryIds = new Set();
  try {
    const catRes = await fetch(`${SQUARE_BASE}/v2/catalog/list?types=CATEGORY`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const catData = await catRes.json();
    (catData.objects || []).forEach(o => {
      const name = (o.category_data?.name || '').toLowerCase();
      if (BAR_KEYWORDS.some(k => name.includes(k))) barCategoryIds.add(o.id);
    });
  } catch (e) { /* classification optional */ }

  // weekKey -> pulseLocId -> { total, bar, food }
  const buckets = {};
  let cursor = null, fetched = 0;

  do {
    const body = {
      location_ids: squareLocIds,
      query: {
        filter: {
          state_filter: { states: ['COMPLETED'] },
          date_time_filter: { closed_at: { start_at: beginTime } },
        },
        sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' },
      },
      limit: 500,
      ...(cursor ? { cursor } : {}),
    };
    const res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.errors) throw new Error('Square API: ' + data.errors[0].detail);

    for (const order of (data.orders || [])) {
      const pulseLocId = locationMap[order.location_id];
      if (!pulseLocId || !order.closed_at) continue;
      const week = mondayOf(order.closed_at);
      buckets[week] = buckets[week] || {};
      buckets[week][pulseLocId] = buckets[week][pulseLocId] || { total: 0, bar: 0, food: 0 };
      const b = buckets[week][pulseLocId];

      const orderTotal = (order.total_money?.amount || 0) / 100;
      b.total += orderTotal;
      for (const li of (order.line_items || [])) {
        const amt = (li.total_money?.amount || 0) / 100;
        if (li.category_id && barCategoryIds.has(li.category_id)) b.bar += amt;
        else b.food += amt;
      }
      fetched++;
    }
    cursor = data.cursor || null;
  } while (cursor);

  // Upsert into weekly_kpi
  let weeksWritten = 0;
  for (const [week, locs] of Object.entries(buckets)) {
    for (const [locId, b] of Object.entries(locs)) {
      await agent2.upsertWeeklyData(tenantId, {
        week_start:     week,
        location_id:    locId,
        total_sales:    parseFloat(b.total.toFixed(2)),
        bar_net_sales:  barCategoryIds.size ? parseFloat(b.bar.toFixed(2)) : undefined,
        food_net_sales: barCategoryIds.size ? parseFloat(b.food.toFixed(2)) : undefined,
      }, null);
      weeksWritten++;
    }
  }

  await integrations.setIntegration(tenantId, 'square', {
    config: { ...(config || {}), lastSync: new Date().toISOString(), lastSyncOrders: fetched },
  });

  return { ordersProcessed: fetched, weekBucketsWritten: weeksWritten };
}

// ── Toast sales sync (uses existing toast adapter credentials) ────────────────
async function syncToastSales(tenantId, { days = 30 } = {}) {
  // Existing toast config lives in tenants/locations via toastAdapter
  const cfgRes = await adminQuery(
    `SELECT l.id AS pulse_loc_id, l.toast_location_id, t.toast_client_id, t.toast_client_secret
     FROM locations l JOIN tenants t ON t.id = l.tenant_id
     WHERE l.tenant_id=$1 AND l.toast_location_id IS NOT NULL`, [tenantId]
  ).catch(() => ({ rows: [] }));

  if (!cfgRes.rows.length) throw new Error('No Toast credentials configured. Use Settings → Toast, or import a Toast Sales Summary CSV instead.');

  const toastAdapter = require('../routes/toastAdapter');
  const fetch = (await import('node-fetch')).default;
  const { toast_client_id, toast_client_secret } = cfgRes.rows[0];

  // Auth (reuse pattern from adapter)
  const authRes = await fetch('https://ws-api.toasttab.com/authentication/v1/authentication/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: toast_client_id, clientSecret: toast_client_secret, userAccessType: 'TOAST_MACHINE_CLIENT' }),
  });
  const authData = await authRes.json();
  const token = authData.token?.accessToken;
  if (!token) throw new Error('Toast authentication failed');

  const buckets = {};
  let fetched = 0;
  const start = new Date(Date.now() - days * 86400e3);

  for (const loc of cfgRes.rows) {
    // Toast ordersBulk: paginate by businessDate
    for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const businessDate = d.toISOString().slice(0, 10).replace(/-/g, '');
      const res = await fetch(
        `https://ws-api.toasttab.com/orders/v2/ordersBulk?businessDate=${businessDate}&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}`, 'Toast-Restaurant-External-ID': loc.toast_location_id } }
      );
      if (!res.ok) continue;
      const orders = await res.json();
      for (const order of (Array.isArray(orders) ? orders : [])) {
        for (const check of (order.checks || [])) {
          if (check.voided || check.paymentStatus !== 'PAID') continue;
          const week = mondayOf(order.businessDate
            ? `${String(order.businessDate).slice(0,4)}-${String(order.businessDate).slice(4,6)}-${String(order.businessDate).slice(6,8)}`
            : check.paidDate || new Date().toISOString());
          buckets[week] = buckets[week] || {};
          buckets[week][loc.pulse_loc_id] = (buckets[week][loc.pulse_loc_id] || 0) + (check.totalAmount || 0);
          fetched++;
        }
      }
    }
  }

  let weeksWritten = 0;
  for (const [week, locs] of Object.entries(buckets)) {
    for (const [locId, total] of Object.entries(locs)) {
      await agent2.upsertWeeklyData(tenantId, {
        week_start: week, location_id: locId,
        total_sales: parseFloat(Number(total).toFixed(2)),
      }, null);
      weeksWritten++;
    }
  }
  return { ordersProcessed: fetched, weekBucketsWritten: weeksWritten };
}

// ── Toast CSV fallback (Sales Summary export) ─────────────────────────────────
// Toast → Reports → Sales Summary → export CSV per week or day range.
async function importToastCsv(tenantId, locationId, csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV appears empty');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const dateCol  = header.findIndex(h => h.includes('date'));
  const salesCol = header.findIndex(h => h.includes('net sales') || h.includes('net_sales') || h === 'sales');
  if (dateCol < 0 || salesCol < 0) throw new Error('Need columns: Date and Net Sales (Toast Sales Summary export)');

  const buckets = {};
  let rows = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.replace(/[$",]/g, '').trim());
    const date = cols[dateCol]; const val = parseFloat(cols[salesCol]);
    if (!date || isNaN(val)) continue;
    const parts = date.split('/');
    const iso = parts.length === 3
      ? `${parts[2].length===2?'20'+parts[2]:parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
      : date;
    const week = mondayOf(iso);
    buckets[week] = (buckets[week] || 0) + val;
    rows++;
  }

  let weeksWritten = 0;
  for (const [week, total] of Object.entries(buckets)) {
    await agent2.upsertWeeklyData(tenantId, {
      week_start: week, location_id: locationId,
      total_sales: parseFloat(total.toFixed(2)),
    }, null);
    weeksWritten++;
  }
  return { rowsProcessed: rows, weeksWritten };
}

async function getPosStatus(tenantId) {
  const [square, toastLocs] = await Promise.all([
    integrations.getIntegration(tenantId, 'square'),
    adminQuery('SELECT COUNT(*)::int AS n FROM locations WHERE tenant_id=$1 AND toast_location_id IS NOT NULL', [tenantId]).catch(() => ({ rows: [{ n: 0 }] })),
  ]);
  return {
    square: {
      status: square?.status || 'not_connected',
      locations: square?.config?.squareLocations || [],
      locationMap: square?.config?.locationMap || {},
      lastSync: square?.config?.lastSync || null,
    },
    toast: {
      status: toastLocs.rows[0]?.n > 0 ? 'configured' : 'not_connected',
      locationCount: toastLocs.rows[0]?.n || 0,
    },
  };
}

module.exports = {
  squareConnectUrl, squareCallback, setLocationMap,
  syncSquareSales, syncToastSales, importToastCsv, getPosStatus, getPulseLocations,
};
