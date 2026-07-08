'use strict';
// ─── Insights: Monday Brief + cross-source canned reports ────────────────────
const { adminQuery } = require('@restaurantos/db');
const { callClaude } = require('../lib/claude');

// ── Monday Morning Brief ───────────────────────────────────────────────────────
// Compares last completed week vs prior 4-week average per location and has
// Claude write a short owner brief. Returns { html, text, stats }.
async function generateMondayBrief(tenantId) {
  const data = await adminQuery(`
    WITH ranked AS (
      SELECT l.name AS location, k.week_start, k.total_sales, k.foh_labor, k.boh_labor,
             k.food_cost_pct, k.bar_cost_pct, k.rating_google,
             ROW_NUMBER() OVER (PARTITION BY k.location_id ORDER BY k.week_start DESC) AS rn
      FROM weekly_kpi k JOIN locations l ON l.id = k.location_id
      WHERE k.tenant_id = $1 AND k.total_sales IS NOT NULL
    )
    SELECT location,
      MAX(CASE WHEN rn=1 THEN week_start::text END)             AS last_week,
      MAX(CASE WHEN rn=1 THEN total_sales END)                  AS last_sales,
      AVG(CASE WHEN rn BETWEEN 2 AND 5 THEN total_sales END)    AS avg_sales,
      MAX(CASE WHEN rn=1 THEN foh_labor+COALESCE(boh_labor,0) END) AS last_labor,
      AVG(CASE WHEN rn BETWEEN 2 AND 5 THEN foh_labor+COALESCE(boh_labor,0) END) AS avg_labor,
      MAX(CASE WHEN rn=1 THEN food_cost_pct END)                AS last_food_pct,
      AVG(CASE WHEN rn BETWEEN 2 AND 5 THEN food_cost_pct END)  AS avg_food_pct,
      MAX(CASE WHEN rn=1 THEN rating_google END)                AS google_rating
    FROM ranked WHERE rn <= 5 GROUP BY location ORDER BY location
  `, [tenantId]);

  if (!data.rows.length) throw new Error('No KPI data yet — connect a POS or import weekly data first');

  const stats = data.rows.map(r => ({
    location:  r.location,
    week:      r.last_week,
    sales:     parseFloat(r.last_sales || 0),
    salesVsAvg: r.avg_sales ? ((r.last_sales - r.avg_sales) / r.avg_sales * 100).toFixed(1) : null,
    labor:     r.last_labor ? parseFloat(r.last_labor) : null,
    laborVsAvg: r.avg_labor && r.last_labor ? ((r.last_labor - r.avg_labor) / r.avg_labor * 100).toFixed(1) : null,
    foodPct:   r.last_food_pct, foodPctAvg: r.avg_food_pct ? parseFloat(r.avg_food_pct).toFixed(1) : null,
    google:    r.google_rating,
  }));

  // Top vendor price movers from the Inventory agent (best effort — skip if no data)
  let priceMovers = [];
  try {
    const inv = require('../agents/agent3/service');
    const pw = await inv.getPriceWatch(tenantId, { thresholdPct: 5 });
    priceMovers = (pw.movers || []).slice(0, 3).map(m => ({
      item: m.name, vendor: m.vendor, change_pct: m.pct_change, est_monthly_impact: m.monthly_impact,
    }));
  } catch (e) { /* inventory not in use yet */ }

  const prompt = [
    'You are the operations analyst for a restaurant group. Write a Monday morning brief for the owner.',
    'Last completed week vs the prior 4-week average, per location:',
    JSON.stringify(stats, null, 1),
    priceMovers.length ? 'Vendor price movers (latest invoice price vs 3-invoice average):' : '',
    priceMovers.length ? JSON.stringify(priceMovers) : '',
    '',
    'Write: (1) a one-line headline for the week, (2) 3-5 short bullets — biggest win, biggest concern, any anomaly worth investigating, (3) ONE concrete suggested action for this week.',
    'Plain, direct, numbers included. No fluff, no greetings. Under 180 words.',
    'Return ONLY JSON: {"headline":"...","bullets":["..."],"action":"..."}',
  ].join('\n');

  const text = await callClaude({ content: prompt, maxTokens: 700 });
  let brief;
  try { brief = JSON.parse(text.replace(/^```json?\n?/, '').replace(/```$/, '').trim()); }
  catch (e) { brief = { headline: 'Weekly summary', bullets: [text.slice(0, 400)], action: '' }; }

  return { brief, stats };
}

// Send the brief by email to the owner (uses Resend like newsletters)
async function sendMondayBrief(tenantId) {
  const { brief, stats } = await generateMondayBrief(tenantId);
  const owner = await adminQuery(
    "SELECT email, name FROM users WHERE tenant_id=$1 AND role='owner' AND active=true LIMIT 1", [tenantId]
  );
  if (!owner.rows.length) return { sent: false, reason: 'no owner', brief };
  const KEY = process.env.RESEND_API_KEY;
  if (!KEY) return { sent: false, reason: 'RESEND_API_KEY not set', brief };

  const { Resend } = require('resend');
  const resend = new Resend(KEY);
  const html = [
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px">',
    `<h2 style="margin:0 0 4px">📊 ${brief.headline}</h2>`,
    '<p style="color:#888;font-size:13px;margin:0 0 16px">Your Pulse Monday Brief</p>',
    '<ul style="line-height:1.8;padding-left:20px">',
    ...brief.bullets.map(b => `<li>${b}</li>`),
    '</ul>',
    brief.action ? `<div style="background:#faf6ee;border-left:3px solid #b8741a;padding:12px 16px;margin-top:16px"><strong>This week:</strong> ${brief.action}</div>` : '',
    '</div>',
  ].join('');

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'brief@pulse.restaurant',
    to: owner.rows[0].email,
    subject: '📊 ' + brief.headline,
    html,
  });
  return { sent: true, to: owner.rows[0].email, brief };
}

// Cron entry: send to every tenant that has KPI data (call from a Railway cron hitting the route)
async function sendAllMondayBriefs() {
  const tenants = await adminQuery(`SELECT DISTINCT tenant_id FROM weekly_kpi WHERE week_start > now() - interval '21 days'`);
  const results = [];
  for (const t of tenants.rows) {
    try { results.push({ tenantId: t.tenant_id, ...(await sendMondayBrief(t.tenant_id)) }); }
    catch (e) { results.push({ tenantId: t.tenant_id, sent: false, reason: e.message }); }
  }
  return results;
}

// ── Canned report: Marketing ROI ───────────────────────────────────────────────
// Joins each sent campaign/newsletter to the sales of the week it was sent vs
// the prior 4-week average — directional incremental-revenue signal.
async function marketingRoi(tenantId, { locationId } = {}) {
  const sends = await adminQuery(`
    SELECT 'email' AS channel, subject AS name, sent_at, sent_count FROM newsletters
      WHERE tenant_id=$1 AND status='sent' AND sent_at IS NOT NULL
    UNION ALL
    SELECT channel, name, sent_at, sent_count FROM text_campaigns
      WHERE tenant_id=$1 AND status='sent' AND sent_at IS NOT NULL
    ORDER BY sent_at DESC LIMIT 25
  `, [tenantId]);

  const out = [];
  for (const s of sends.rows) {
    const sentDate = s.sent_at.toISOString().slice(0, 10);
    const r = await adminQuery(`
      WITH wk AS (
        SELECT (date_trunc('week', $2::date))::date AS send_week
      )
      SELECT
        (SELECT COALESCE(SUM(total_sales),0) FROM weekly_kpi, wk
          WHERE tenant_id=$1 ${locationId ? 'AND location_id=$3' : ''} AND week_start = wk.send_week) AS send_week_sales,
        (SELECT COALESCE(AVG(weekly.s),0) FROM (
          SELECT SUM(total_sales) AS s FROM weekly_kpi, wk
          WHERE tenant_id=$1 ${locationId ? 'AND location_id=$3' : ''}
            AND week_start BETWEEN wk.send_week - interval '28 days' AND wk.send_week - interval '7 days'
          GROUP BY week_start) weekly) AS baseline
    `, locationId ? [tenantId, sentDate, locationId] : [tenantId, sentDate]);

    const row = r.rows[0];
    const sendWeek = parseFloat(row.send_week_sales || 0);
    const baseline = parseFloat(row.baseline || 0);
    out.push({
      channel: s.channel, name: s.name, sentAt: sentDate, recipients: s.sent_count,
      sendWeekSales: sendWeek, baselineSales: parseFloat(baseline.toFixed(2)),
      lift: baseline ? parseFloat((sendWeek - baseline).toFixed(2)) : null,
      liftPct: baseline ? parseFloat(((sendWeek - baseline) / baseline * 100).toFixed(1)) : null,
    });
  }
  return out;
}

// ── Canned report: Labor vs Demand ─────────────────────────────────────────────
// Weekly sales-per-labor-dollar by location with flags for over/under staffing.
async function laborVsDemand(tenantId, { weeks = 12 } = {}) {
  const r = await adminQuery(`
    SELECT l.name AS location, k.week_start::text, k.total_sales,
           (COALESCE(k.foh_labor,0)+COALESCE(k.boh_labor,0)) AS total_labor,
           k.foh_pct, k.boh_pct,
           CASE WHEN COALESCE(k.foh_labor,0)+COALESCE(k.boh_labor,0) > 0
                THEN ROUND(k.total_sales / (COALESCE(k.foh_labor,0)+COALESCE(k.boh_labor,0)), 2)
                ELSE NULL END AS sales_per_labor_dollar
    FROM weekly_kpi k JOIN locations l ON l.id = k.location_id
    WHERE k.tenant_id=$1 AND k.total_sales IS NOT NULL
      AND k.week_start > now() - ($2 || ' weeks')::interval
    ORDER BY l.name, k.week_start DESC
  `, [tenantId, String(Math.min(weeks, 52))]);

  // Per-location average + flag weeks deviating >15%
  const byLoc = {};
  r.rows.forEach(row => { (byLoc[row.location] = byLoc[row.location] || []).push(row); });
  const result = [];
  for (const [location, rows] of Object.entries(byLoc)) {
    const vals = rows.map(x => parseFloat(x.sales_per_labor_dollar)).filter(v => v > 0);
    const avg = vals.length ? vals.reduce((a, b) => a + b) / vals.length : null;
    result.push({
      location, avgSalesPerLaborDollar: avg ? parseFloat(avg.toFixed(2)) : null,
      weeks: rows.map(x => ({
        week: x.week_start, sales: parseFloat(x.total_sales),
        labor: parseFloat(x.total_labor), efficiency: x.sales_per_labor_dollar ? parseFloat(x.sales_per_labor_dollar) : null,
        flag: avg && x.sales_per_labor_dollar
          ? (x.sales_per_labor_dollar < avg * 0.85 ? 'overstaffed' : x.sales_per_labor_dollar > avg * 1.15 ? 'understaffed_risk' : 'normal')
          : null,
      })),
    });
  }
  return result;
}

module.exports = { generateMondayBrief, sendMondayBrief, sendAllMondayBriefs, marketingRoi, laborVsDemand };
