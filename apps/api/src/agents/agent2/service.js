// ─── Agent 2: Financial KPI — Service ────────────────────────────────────────
require('dotenv').config();
const { queryForTenant, transactionForTenant } = require('@restaurantos/db');
const { eventBus } = require('../../lib/eventBus');

const AGENT_ID = 'agent_2_financial';

// ── Ensure weekly_kpi table exists (extends weekly_sales) ─────────────────────
// We store Fitoor's exact categories in a dedicated table
// Run once — migration 002 would do this properly
async function ensureTable(tenantId) {
  const { adminQuery } = require('@restaurantos/db');
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS weekly_kpi (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      location_id       UUID,
      week_start        DATE NOT NULL,
      -- Sales
      bar_net_sales     NUMERIC(12,2),
      food_net_sales    NUMERIC(12,2),
      total_sales       NUMERIC(12,2),
      -- Ordering / COGs
      bar_ordering      NUMERIC(12,2),
      kitchen_ordering  NUMERIC(12,2),
      other_ordering    NUMERIC(12,2),
      other_cost        NUMERIC(12,2),
      -- Calculated cost %
      bar_cost_pct      NUMERIC(6,2),
      food_cost_pct     NUMERIC(6,2),
      -- Labor
      foh_labor         NUMERIC(12,2),
      boh_labor         NUMERIC(12,2),
      foh_pct           NUMERIC(6,2),
      boh_pct           NUMERIC(6,2),
      -- Inventory (monthly, carried forward)
      bar_inventory     NUMERIC(12,2),
      kitchen_inventory NUMERIC(12,2),
      -- Events
      event_inquiries   INTEGER,
      event_converted   INTEGER,
      event_revenue     NUMERIC(12,2),
      event_conv_rate   NUMERIC(6,2),
      -- Cash
      cash_deposited    NUMERIC(12,2),
      cash_spent        NUMERIC(12,2),
      cash_in_toast     NUMERIC(12,2),
      cash_notes        TEXT,
      -- Ratings (from Agent 4 / manual)
      rating_google     NUMERIC(3,2),
      rating_yelp       NUMERIC(3,2),
      rating_opentable  NUMERIC(3,2),
      rating_notes      TEXT,
      -- Meta
      entered_by        UUID,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, week_start)
    )
  `).catch(() => {}); // ignore if already exists
  // Migration: add location_name for name-based imports
  await adminQuery('ALTER TABLE weekly_kpi ADD COLUMN IF NOT EXISTS location_name VARCHAR(200)').catch(() => {});
}

// ── Get all weekly entries ────────────────────────────────────────────────────
async function getWeeklyData(tenantId, locationId, limit = 52) {
  await ensureTable(tenantId);

  // Resolve location name so we can match rows imported by name
  let locationName = null;
  if (locationId) {
    try {
      const { adminQuery } = require('@restaurantos/db');
      const locRes = await adminQuery('SELECT name FROM locations WHERE id=$1', [locationId]);
      locationName = locRes.rows[0]?.name || null;
      // Backfill UUID on name-only rows
      if (locationName) {
        await adminQuery(
          'UPDATE weekly_kpi SET location_id=$1 WHERE tenant_id=$2 AND location_id IS NULL AND location_name=$3',
          [locationId, tenantId, locationName]
        ).catch(() => {});
      }
    } catch(_) {}
  }

  const params = [tenantId];
  let locFilter = '';
  if (locationId && locationName) {
    locFilter = ' AND (location_id = $2 OR location_name = $3)';
    params.push(locationId, locationName);
  } else if (locationId) {
    locFilter = ' AND location_id = $2';
    params.push(locationId);
  }
  params.push(limit);

  const limitIdx = params.length;
  const result = await queryForTenant(tenantId,
    `SELECT * FROM weekly_kpi WHERE tenant_id = $1 ${locFilter} ORDER BY week_start ASC LIMIT $${limitIdx}`,
    params
  );

  return { weeks: result.rows };
}

// ── Upsert a week's data ──────────────────────────────────────────────────────
async function upsertWeeklyData(tenantId, data, userId) {
  await ensureTable(tenantId);

  const {
    week_start, location_id,
    bar_net_sales, food_net_sales, total_sales,
    bar_ordering, kitchen_ordering, other_ordering, other_cost,
    bar_cost_pct, food_cost_pct,
    foh_labor, boh_labor, foh_pct, boh_pct,
    bar_inventory, kitchen_inventory,
    event_inquiries, event_converted, event_revenue, event_conv_rate,
    cash_deposited, cash_spent, cash_in_toast, cash_notes,
    rating_google, rating_yelp, rating_opentable, rating_notes,
  } = data;

  if (!week_start) throw Object.assign(new Error('week_start required'), { status: 400 });

  // Auto-fetch current ratings from Agent 4 reviews if not provided
  let gRating = rating_google, yRating = rating_yelp, otRating = rating_opentable;
  if (!gRating || !yRating || !otRating) {
    try {
      const ratings = await getLatestRatings(tenantId, location_id);
      gRating  = gRating  || ratings.google;
      yRating  = yRating  || ratings.yelp;
      otRating = otRating || ratings.opentable;
    } catch(_) {}
  }

  const result = await queryForTenant(tenantId, `
    INSERT INTO weekly_kpi (
      tenant_id, location_id, week_start,
      bar_net_sales, food_net_sales, total_sales,
      bar_ordering, kitchen_ordering, other_ordering, other_cost,
      bar_cost_pct, food_cost_pct,
      foh_labor, boh_labor, foh_pct, boh_pct,
      bar_inventory, kitchen_inventory,
      event_inquiries, event_converted, event_revenue, event_conv_rate,
      cash_deposited, cash_spent, cash_in_toast, cash_notes,
      rating_google, rating_yelp, rating_opentable, rating_notes,
      entered_by
    ) VALUES (
      $1,$2,$3,
      $4,$5,$6,
      $7,$8,$9,$10,
      $11,$12,
      $13,$14,$15,$16,
      $17,$18,
      $19,$20,$21,$22,
      $23,$24,$25,$26,
      $27,$28,$29,$30,
      $31
    )
    ON CONFLICT (tenant_id, COALESCE(location_name, ''), week_start)
    DO UPDATE SET
      location_id       = COALESCE(EXCLUDED.location_id,       weekly_kpi.location_id),
      bar_net_sales     = COALESCE(EXCLUDED.bar_net_sales,     weekly_kpi.bar_net_sales),
      food_net_sales    = COALESCE(EXCLUDED.food_net_sales,    weekly_kpi.food_net_sales),
      total_sales       = COALESCE(EXCLUDED.total_sales,       weekly_kpi.total_sales),
      bar_ordering      = COALESCE(EXCLUDED.bar_ordering,      weekly_kpi.bar_ordering),
      kitchen_ordering  = COALESCE(EXCLUDED.kitchen_ordering,  weekly_kpi.kitchen_ordering),
      other_ordering    = COALESCE(EXCLUDED.other_ordering,    weekly_kpi.other_ordering),
      other_cost        = COALESCE(EXCLUDED.other_cost,        weekly_kpi.other_cost),
      bar_cost_pct      = COALESCE(EXCLUDED.bar_cost_pct,      weekly_kpi.bar_cost_pct),
      food_cost_pct     = COALESCE(EXCLUDED.food_cost_pct,     weekly_kpi.food_cost_pct),
      foh_labor         = COALESCE(EXCLUDED.foh_labor,         weekly_kpi.foh_labor),
      boh_labor         = COALESCE(EXCLUDED.boh_labor,         weekly_kpi.boh_labor),
      foh_pct           = COALESCE(EXCLUDED.foh_pct,           weekly_kpi.foh_pct),
      boh_pct           = COALESCE(EXCLUDED.boh_pct,           weekly_kpi.boh_pct),
      bar_inventory     = COALESCE(EXCLUDED.bar_inventory,     weekly_kpi.bar_inventory),
      kitchen_inventory = COALESCE(EXCLUDED.kitchen_inventory, weekly_kpi.kitchen_inventory),
      event_inquiries   = COALESCE(EXCLUDED.event_inquiries,   weekly_kpi.event_inquiries),
      event_converted   = COALESCE(EXCLUDED.event_converted,   weekly_kpi.event_converted),
      event_revenue     = COALESCE(EXCLUDED.event_revenue,     weekly_kpi.event_revenue),
      event_conv_rate   = COALESCE(EXCLUDED.event_conv_rate,   weekly_kpi.event_conv_rate),
      cash_deposited    = COALESCE(EXCLUDED.cash_deposited,    weekly_kpi.cash_deposited),
      cash_spent        = COALESCE(EXCLUDED.cash_spent,        weekly_kpi.cash_spent),
      cash_in_toast     = COALESCE(EXCLUDED.cash_in_toast,     weekly_kpi.cash_in_toast),
      cash_notes        = COALESCE(EXCLUDED.cash_notes,        weekly_kpi.cash_notes),
      rating_google     = COALESCE(EXCLUDED.rating_google,     weekly_kpi.rating_google),
      rating_yelp       = COALESCE(EXCLUDED.rating_yelp,       weekly_kpi.rating_yelp),
      rating_opentable  = COALESCE(EXCLUDED.rating_opentable,  weekly_kpi.rating_opentable),
      rating_notes      = COALESCE(EXCLUDED.rating_notes,      weekly_kpi.rating_notes),
      updated_at        = now()
    RETURNING *
  `, [
    tenantId, location_id || null, week_start,
    bar_net_sales || null, food_net_sales || null, total_sales || null,
    bar_ordering || null, kitchen_ordering || null, other_ordering || null, other_cost || null,
    bar_cost_pct || null, food_cost_pct || null,
    foh_labor || null, boh_labor || null, foh_pct || null, boh_pct || null,
    bar_inventory || null, kitchen_inventory || null,
    event_inquiries || null, event_converted || null, event_revenue || null, event_conv_rate || null,
    cash_deposited || null, cash_spent || null, cash_in_toast || null, cash_notes || null,
    gRating || null, yRating || null, otRating || null, rating_notes || null,
    userId || null,
  ]);

  // Publish event for other agents
  await eventBus.publish({
    eventType:   'weekly.pos.sync.completed',
    tenantId,
    locationId:  location_id,
    sourceAgent: AGENT_ID,
    payload:     { weekStart: week_start, totalSales: total_sales },
  }).catch(() => {});

  return result.rows[0];
}

// ── Get latest average ratings from reviews table ─────────────────────────────
async function getLatestRatings(tenantId, locationId) {
  const params = [tenantId];
  let locFilter = '';
  if (locationId) { locFilter = ' AND location_id = $2'; params.push(locationId); }

  const result = await queryForTenant(tenantId, `
    SELECT
      platform,
      ROUND(AVG(rating), 2) as avg_rating
    FROM reviews
    WHERE tenant_id = $1 ${locFilter}
    AND review_date > now() - interval '30 days'
    GROUP BY platform
  `, params);

  const ratings = { google: null, yelp: null, opentable: null };
  result.rows.forEach(r => { ratings[r.platform] = parseFloat(r.avg_rating); });
  return ratings;
}

// ── Get review trends by week ─────────────────────────────────────────────────
// Aggregates reviews from Agent 4's reviews table into weekly buckets
async function getReviewTrends(tenantId, locationId, numWeeks = 12) {
  const params = [tenantId];
  let locFilter = '';
  if (locationId) { locFilter = ' AND location_id = $2'; params.push(locationId); }

  const result = await queryForTenant(tenantId, `
    SELECT
      date_trunc('week', review_date)::date as week_start,
      platform,
      ROUND(AVG(rating), 2) as avg_rating,
      COUNT(*) as review_count,
      COUNT(*) FILTER (WHERE rating >= 4) as positive_count,
      COUNT(*) FILTER (WHERE rating <= 2) as negative_count
    FROM reviews
    WHERE tenant_id = $1 ${locFilter}
    AND review_date > now() - interval '${numWeeks} weeks'
    GROUP BY week_start, platform
    ORDER BY week_start ASC
  `, params);

  // Pivot into weekly objects: { week, google, yelp, opentable, counts... }
  const weekMap = {};
  result.rows.forEach(r => {
    const wk = r.week_start;
    if (!weekMap[wk]) weekMap[wk] = { week: wk };
    weekMap[wk][r.platform]              = parseFloat(r.avg_rating);
    weekMap[wk][`${r.platform}_count`]   = parseInt(r.review_count);
    weekMap[wk][`${r.platform}_positive`]= parseInt(r.positive_count);
    weekMap[wk][`${r.platform}_negative`]= parseInt(r.negative_count);
  });

  return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
}

// ── KPI snapshot ──────────────────────────────────────────────────────────────
async function getKPISnapshot(tenantId, locationId, numWeeks = 12) {
  const { weeks } = await getWeeklyData(tenantId, locationId, numWeeks);
  if (!weeks.length) return { weeks: [], current: null, prior: null };
  const current = weeks[weeks.length - 1];
  const prior   = weeks[weeks.length - 2] || null;
  return { weeks, current, prior };
}

// ── Summary (used by dashboard) ───────────────────────────────────────────────
async function getSummary(tenantId, locationIds) {
  await ensureTable(tenantId);
  const params = [tenantId];
  const locFilter = locationIds?.length ? `AND location_id = ANY($2::uuid[])` : '';
  if (locationIds?.length) params.push(locationIds);

  const result = await queryForTenant(tenantId, `
    SELECT
      total_sales, bar_cost_pct, food_cost_pct, foh_pct, boh_pct,
      foh_labor, boh_labor,
      ROUND(total_sales * bar_cost_pct  / 100, 2) AS bar_cost,
      ROUND(total_sales * food_cost_pct / 100, 2) AS food_cost,
      week_start, rating_google, rating_yelp, rating_opentable
    FROM weekly_kpi
    WHERE tenant_id = $1 ${locFilter}
    ORDER BY week_start DESC
    LIMIT 1
  `, params);

  return { ...result.rows[0], agent: AGENT_ID };
}

// ── Event handlers (called by eventBus) ──────────────────────────────────────

// When Agent 3 submits inventory count, update COGs in the current week
async function handleInventorySubmitted(event) {
  const { tenantId, locationId, payload } = event;
  if (!payload?.period) return;

  // Find the most recent week for this period
  await queryForTenant(tenantId, `
    UPDATE weekly_kpi
    SET kitchen_inventory = $1, updated_at = now()
    WHERE tenant_id = $2
    AND week_start >= $3::date
    AND week_start < ($3::date + interval '7 days')
  `, [payload.food_total, tenantId, payload.period + '-01']);
}

// Flag on KPI dashboard when training is overdue
async function handleTrainingOverdue(event) {
  console.log(`[agent2] Training overdue flag received for tenant ${event.tenantId}`);
  // In production: write to a flags table shown on dashboard
}

// Update ROAS when an ad campaign converts
async function handleCampaignConverted(event) {
  console.log(`[agent2] Campaign converted: ${event.payload?.campaign_id}`);
  // In production: update ad_campaigns table ROAS
}

module.exports = {
  AGENT_ID,
  getWeeklyData,
  upsertWeeklyData,
  getReviewTrends,
  getKPISnapshot,
  getSummary,
  handleInventorySubmitted,
  handleTrainingOverdue,
  handleCampaignConverted,
};
