// ─── Pulse Assistant — Restaurant AI ─────────────────────────────────────────
'use strict';
const { adminQuery, queryForTenant } = require('@restaurantos/db');

// ── Ensure tables ─────────────────────────────────────────────────────────────
let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await adminQuery(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    location_id UUID,
    title       VARCHAR(500) NOT NULL DEFAULT 'New conversation',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await adminQuery(`CREATE INDEX IF NOT EXISTS chat_sessions_tenant ON chat_sessions(tenant_id, updated_at DESC)`);
  await adminQuery(`CREATE TABLE IF NOT EXISTS chat_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    tenant_id        UUID NOT NULL,
    role             VARCHAR(20) NOT NULL,
    content          TEXT NOT NULL,
    tool_calls       JSONB DEFAULT '[]',
    context_used     JSONB DEFAULT '{}',
    tokens_used      INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await adminQuery(`CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages(session_id, created_at)`);
  _ready = true;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
async function getSessions(tenantId, limit = 30) {
  await ensureTables();
  const r = await adminQuery(`
    SELECT s.*, COUNT(m.id) as message_count,
      MAX(m.created_at) as last_message_at
    FROM chat_sessions s
    LEFT JOIN chat_messages m ON m.session_id = s.id
    WHERE s.tenant_id = $1
    GROUP BY s.id
    ORDER BY COALESCE(MAX(m.created_at), s.created_at) DESC
    LIMIT $2
  `, [tenantId, limit]);
  return r.rows;
}

async function createSession(tenantId, locationId) {
  await ensureTables();
  const r = await adminQuery(
    `INSERT INTO chat_sessions (tenant_id, location_id) VALUES ($1, $2) RETURNING *`,
    [tenantId, locationId || null]
  );
  return r.rows[0];
}

async function updateSessionTitle(tenantId, sessionId, title) {
  await adminQuery(
    `UPDATE chat_sessions SET title=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3`,
    [title.slice(0, 500), sessionId, tenantId]
  );
}

async function deleteSession(tenantId, sessionId) {
  await adminQuery(`DELETE FROM chat_sessions WHERE id=$1 AND tenant_id=$2`, [sessionId, tenantId]);
}

async function getMessages(tenantId, sessionId, limit = 50) {
  await ensureTables();
  const r = await adminQuery(`
    SELECT * FROM chat_messages
    WHERE session_id = $1 AND tenant_id = $2
    ORDER BY created_at ASC
    LIMIT $3
  `, [sessionId, tenantId, limit]);
  return r.rows;
}

async function saveMessage(tenantId, sessionId, role, content, extras = {}) {
  const r = await adminQuery(`
    INSERT INTO chat_messages (session_id, tenant_id, role, content, tool_calls, context_used, tokens_used)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `, [sessionId, tenantId, role, content,
      JSON.stringify(extras.tool_calls || []),
      JSON.stringify(extras.context || {}),
      extras.tokens || 0]);
  return r.rows[0];
}

// ── Context assembly — parallel fetch from all agents ────────────────────────
async function assembleContext(tenantId, locationId) {
  const loc  = locationId || null;
  const locs = loc ? [loc] : [];

  const results = await Promise.allSettled([
    // Financial
    adminQuery(`SELECT total_sales, food_cost_pct, bar_cost_pct, foh_pct, boh_pct,
      rating_google, rating_yelp, week_start
      FROM weekly_kpi WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}
      ORDER BY week_start DESC LIMIT 4`,
      loc ? [tenantId, loc] : [tenantId]),
    // Inventory
    adminQuery(`SELECT COUNT(*) as total_items,
      COUNT(*) FILTER (WHERE last_price IS NULL) as unpriced,
      COUNT(*) FILTER (WHERE par_level IS NOT NULL AND par_level > 0) as with_par
      FROM inventory_items WHERE tenant_id=$1 AND active=true ${loc?'AND (location_id=$2 OR location_id IS NULL)':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='pending_review') as pending_invoices
      FROM invoices WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    // Reviews
    adminQuery(`SELECT COUNT(*) as total, ROUND(AVG(rating),1) as avg_rating,
      COUNT(*) FILTER (WHERE status='pending') as pending_response,
      COUNT(*) FILTER (WHERE rating <= 2) as negative
      FROM reviews WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}
      AND review_date > now() - interval '30 days'`,
      loc ? [tenantId, loc] : [tenantId]),
    // Staff
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='active' AND NOT COALESCE(archived,false)) as active_staff,
      COUNT(*) FILTER (WHERE department='foh') as foh,
      COUNT(*) FILTER (WHERE department='boh') as boh
      FROM employees WHERE tenant_id=$1 ${loc?'AND (location_id=$2 OR location_id IS NULL)':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    adminQuery(`SELECT COUNT(*) as shifts_this_week FROM shifts s
      JOIN schedules sc ON sc.id = s.schedule_id
      WHERE sc.tenant_id=$1 ${loc?'AND sc.location_id=$2':''}
      AND s.shift_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6`,
      loc ? [tenantId, loc] : [tenantId]),
    // Menu
    adminQuery(`SELECT COUNT(*) as total_items, COUNT(*) FILTER (WHERE available) as active_items,
      ROUND(AVG(CASE WHEN price>0 THEN (price-COALESCE(food_cost,0))/price*100 END),1) as avg_margin,
      ROUND(AVG(price),2) as avg_price
      FROM menu_items WHERE tenant_id=$1 ${loc?'AND (location_id=$2 OR location_id IS NULL)':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    // Top menu items by sales
    adminQuery(`SELECT mi.name, SUM(s.units_sold) as total_units,
      ROUND((mi.price - COALESCE(mi.food_cost,0))/NULLIF(mi.price,0)*100,1) as margin_pct
      FROM menu_item_sales s JOIN menu_items mi ON mi.id = s.item_id
      WHERE s.tenant_id=$1 ${loc?'AND s.location_id=$2':''}
      AND s.week_start >= CURRENT_DATE - interval '4 weeks'
      GROUP BY mi.id, mi.name, mi.price, mi.food_cost
      ORDER BY total_units DESC LIMIT 8`,
      loc ? [tenantId, loc] : [tenantId]),
    // Loyalty
    adminQuery(`SELECT COUNT(*) as total_members,
      COUNT(*) FILTER (WHERE tier='platinum') as platinum,
      COUNT(*) FILTER (WHERE tier='gold') as gold,
      COUNT(*) FILTER (WHERE last_visit_date > CURRENT_DATE - 30) as active_30d
      FROM loyalty_members WHERE tenant_id=$1 ${loc?'AND (location_id=$2 OR location_id IS NULL)':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    // Compliance
    adminQuery(`SELECT COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired,
      COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30) as expiring_soon,
      COUNT(*) FILTER (WHERE expiry_date > CURRENT_DATE+30) as valid
      FROM compliance_certifications WHERE tenant_id=$1 AND active=true ${loc?'AND (location_id=$2 OR location_id IS NULL)':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    // Pending time-off requests
    adminQuery(`SELECT COUNT(*) as pending_time_off FROM time_off_requests
      WHERE tenant_id=$1 AND status='pending' ${loc?'AND location_id=$2':''}`,
      loc ? [tenantId, loc] : [tenantId]),
    // Location name
    adminQuery(`SELECT name, city, state FROM locations WHERE id=$1 LIMIT 1`,
      loc ? [loc] : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const get = (i) => results[i].status === 'fulfilled' ? results[i].value.rows : [];
  const get0 = (i) => get(i)[0] || {};

  const kpi4wk = get(0);
  const latestKpi = kpi4wk[0] || {};
  const prevKpi   = kpi4wk[1] || {};
  const salesTrend = latestKpi.total_sales && prevKpi.total_sales
    ? ((latestKpi.total_sales - prevKpi.total_sales) / prevKpi.total_sales * 100).toFixed(1)
    : null;

  return {
    location:     get0(11),
    financial: {
      latest_week:   latestKpi,
      sales_trend_pct: salesTrend,
      weeks_of_data: kpi4wk.length,
    },
    inventory: {
      ...get0(1),
      pending_invoices: get0(2).pending_invoices,
    },
    reviews: get0(3),
    labor: {
      ...get0(4),
      shifts_this_week: get0(5).shifts_this_week,
    },
    menu: {
      ...get0(6),
      top_items: get(7),
    },
    loyalty:    get0(8),
    compliance: {
      ...get0(9),
      pending_time_off: get0(10).pending_time_off,
    },
  };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(context, tenantName) {
  const loc  = context.location;
  const kpi  = context.financial.latest_week;
  const now  = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  return `You are Pulse, an expert AI restaurant operator and advisor for ${tenantName || 'this restaurant group'}${loc?.name ? `, specifically for ${loc.name} in ${loc.city}, ${loc.state}` : ''}.

Today is ${now}.

You have deep expertise in:
- Restaurant operations, P&L management, food and labor cost control
- Menu engineering, pricing strategy, and profitability optimization
- Staff scheduling, HR compliance (especially California labor law)
- Marketing, social media, and reputation management
- Loyalty programs and guest retention
- Food safety regulations, permits, and compliance
- Industry benchmarks (fine dining: food cost 28-32%, labor 30-35%, prime cost 55-65%)

LIVE BUSINESS DATA (as of right now):
${kpi.week_start ? `\nFinancials (week of ${kpi.week_start}):
- Total sales: ${kpi.total_sales ? '$'+Number(kpi.total_sales).toLocaleString() : 'no data'}
- Food cost: ${kpi.food_cost_pct ? kpi.food_cost_pct+'%' : 'unknown'} (target: 28-32%)
- Bar cost: ${kpi.bar_cost_pct ? kpi.bar_cost_pct+'%' : 'unknown'} (target: 20-25%)
- FOH labor: ${kpi.foh_pct ? kpi.foh_pct+'%' : 'unknown'} | BOH labor: ${kpi.boh_pct ? kpi.boh_pct+'%' : 'unknown'}
- Google rating: ${kpi.rating_google || 'not tracked'} | Yelp: ${kpi.rating_yelp || 'not tracked'}
${context.financial.sales_trend_pct ? `- Sales trend vs prior week: ${context.financial.sales_trend_pct}%` : ''}` : ''}

Staff & Scheduling:
- Active staff: ${context.labor.active_staff || 0} (${context.labor.foh || 0} FOH / ${context.labor.boh || 0} BOH)
- Shifts scheduled this week: ${context.labor.shifts_this_week || 0}
- Pending time-off requests: ${context.compliance.pending_time_off || 0}

Menu:
- ${context.menu.active_items || 0} active items, avg price $${context.menu.avg_price || 0}, avg margin ${context.menu.avg_margin || 0}%
${context.menu.top_items?.length ? `- Top sellers (last 4 weeks): ${context.menu.top_items.slice(0,5).map(i=>`${i.name} (${i.total_units} units, ${i.margin_pct}% margin)`).join('; ')}` : ''}

Inventory:
- ${context.inventory.total_items || 0} tracked items, ${context.inventory.pending_invoices || 0} invoices pending review

Guest Experience:
- Reviews (last 30 days): ${context.reviews.total || 0} reviews, avg ${context.reviews.avg_rating || 'N/A'} ★
- ${context.reviews.pending_response || 0} reviews need response, ${context.reviews.negative || 0} negative
- Loyalty members: ${context.loyalty.total_members || 0} total (${context.loyalty.platinum || 0} platinum, ${context.loyalty.gold || 0} gold), ${context.loyalty.active_30d || 0} active in last 30 days

Compliance:
- Certifications: ${context.compliance.valid || 0} valid, ${context.compliance.expiring_soon || 0} expiring within 30 days, ${context.compliance.expired || 0} expired

ACCURACY RULES (follow strictly):
- ONLY cite numbers that appear in the LIVE BUSINESS DATA section above. Never invent figures.
- If a metric is shown as "no data" or "unknown", say so — do not estimate or fabricate it.
- If asked about something not in the data (e.g. a specific transaction, a date outside the data range), say "I don't have that detail — check [relevant module]" rather than guessing.
- When you use a number, say where it comes from: "Your food cost last week was 31.2%" not just "food costs are around 30%".
- If data fields are null or missing, acknowledge the gap rather than filling it with assumptions.

RESPONSE GUIDELINES:
- Be direct — lead with the key number or finding, then explain
- For operational issues in the data (high food cost, expiring certs, unanswered reviews), flag them proactively  
- A focused 2-3 paragraph answer beats a wall of bullets
- Suggest the relevant Pulse module for deeper analysis. Modules are grouped:
  • Front of House: Business Growth & Marketing, Reputation Management (reviews), Local Visibility & SEO, Loyalty & Customer Incentives, Menu Engineering
  • Back of House: Business Health & KPIs, Cash Flow & Profitability, Labor & Scheduling, Inventory Management, Compliance & Governance, Training & Performance
- For strategy questions beyond the current data, use your restaurant industry knowledge and label it clearly as general guidance vs data-driven insight
- When drafting content (review response, social post, email), produce the full ready-to-use draft`;
}

// ── Tools Claude can call for deeper data ────────────────────────────────────
const TOOLS = [
  {
    name: 'get_weekly_kpi_trend',
    description: 'Fetch weekly KPI data for the last N weeks. Use when asked about trends, comparisons, or specific time periods.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'number', description: 'Number of weeks to fetch (max 12)', default: 8 }
      }
    }
  },
  {
    name: 'get_menu_matrix',
    description: 'Fetch full menu engineering matrix — Stars, Plowhorses, Puzzles, Dogs with margins and sales data.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_reviews_detail',
    description: 'Fetch recent reviews with text content. Use when asked about specific feedback, sentiment, or guest experience.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10 },
        platform: { type: 'string', enum: ['google','yelp','all'], default: 'all' },
        sentiment: { type: 'string', enum: ['positive','neutral','negative','all'], default: 'all' }
      }
    }
  },
  {
    name: 'get_labor_detail',
    description: 'Fetch current week schedule, employee list, and overtime alerts.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_inventory_alerts',
    description: 'Fetch inventory items below par level, pending invoices with price changes.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_loyalty_members',
    description: 'Fetch loyalty program detail — tier breakdown, recent activity, top members.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'run_sql',
    description: `Run a read-only SQL query against the restaurant database to answer any data question. Use this when no other tool fits — comparisons across locations or time, payroll analysis, guest list questions, campaign performance, monthly sales trends, etc.

SCHEMA (all tables have tenant_id; ALWAYS filter tenant_id = $1):
- weekly_kpi(tenant_id, location_id, week_start DATE, total_sales, bar_net_sales, food_net_sales, bar_ordering, kitchen_ordering, bar_cost_pct, food_cost_pct, foh_labor, boh_labor, foh_pct, boh_pct, event_inquiries, event_converted, event_revenue, cash_deposited, cash_spent, rating_google, rating_yelp, rating_opentable)
- weekly_payroll(tenant_id, location_name TEXT, week_ending DATE, total_payroll, payroll_base, er_taxes_other, er_taxes_foh, er_taxes_boh, er_taxes_support, net_sales, payroll_pct, payroll_tax_pct, foh_wages, foh_pct, boh_wages, boh_pct, other_wages, other_pct, support_wages, support_pct)
- monthly_sales(tenant_id, location_name TEXT, currency, year INT, month INT, net_sales)
- newsletter_contacts(tenant_id, location_id, email, first_name, last_name, phone, source, tags TEXT[], subscribed BOOL, sms_subscribed BOOL, last_visit DATE, visit_count INT, created_at)
- newsletters(tenant_id, subject, status, sent_at, sent_count, open_count)
- text_campaigns(tenant_id, name, channel, status, sent_at, sent_count, failed_count)
- locations(id, tenant_id, name) — join weekly_kpi.location_id = locations.id for names

RULES: single SELECT (or WITH...SELECT) statement only. Use $1 for tenant_id. Add LIMIT. Dates: week_start/week_ending are Mondays/Sundays. Money is NUMERIC.`,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'PostgreSQL SELECT statement using $1 as the tenant_id parameter' },
        purpose: { type: 'string', description: 'One sentence on what this answers' }
      },
      required: ['query']
    }
  },
];

// ── Safe read-only SQL execution ───────────────────────────────────────────────
const SQL_BLOCKLIST = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|vacuum|do|call|execute|pg_sleep|pg_read|pg_write|set\s)\b/i;
async function runSafeSql(query, tenantId) {
  const q = String(query || '').trim().replace(/;+\s*$/, '');
  if (!q) return { error: 'Empty query' };
  if (q.includes(';')) return { error: 'Only a single statement is allowed' };
  if (!/^(select|with)\b/i.test(q)) return { error: 'Only SELECT queries are allowed' };
  if (SQL_BLOCKLIST.test(q)) return { error: 'Query contains a disallowed keyword' };
  if (!q.includes('$1')) return { error: 'Query must filter by tenant_id = $1' };
  const limited = /\blimit\s+\d+/i.test(q) ? q : q + ' LIMIT 200';
  try {
    const result = await Promise.race([
      adminQuery(limited, [tenantId]),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Query timed out (8s)')), 8000)),
    ]);
    // Serialize dates cleanly
    const rows = result.rows.map(r => {
      const o = {};
      for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      return o;
    });
    return { rowCount: rows.length, rows: rows.slice(0, 200) };
  } catch (e) {
    return { error: 'SQL error: ' + e.message };
  }
}

// ── Tool execution ─────────────────────────────────────────────────────────────
async function executeTool(name, input, tenantId, locationId) {
  const loc = locationId || null;
  const locWhere = loc ? ' AND (location_id=$2 OR location_id IS NULL)' : '';
  const locParams = (base) => loc ? [...base, loc] : base;

  switch (name) {
    case 'get_weekly_kpi_trend': {
      const weeks = Math.min(input.weeks || 8, 12);
      const r = await adminQuery(`
        SELECT week_start, total_sales, food_cost_pct, bar_cost_pct,
          foh_pct, boh_pct, rating_google, rating_yelp, rating_notes
        FROM weekly_kpi WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}
        ORDER BY week_start DESC LIMIT $${loc?3:2}`,
        loc ? [tenantId, loc, weeks] : [tenantId, weeks]);
      return r.rows;
    }
    case 'get_menu_matrix': {
      const r = await adminQuery(`
        SELECT mi.name, mi.price, mi.food_cost,
          ROUND((mi.price-COALESCE(mi.food_cost,0))/NULLIF(mi.price,0)*100,1) as margin_pct,
          ROUND((mi.price-COALESCE(mi.food_cost,0)),2) as gross_profit,
          COALESCE(SUM(s.units_sold),0) as total_units_4wk,
          ROUND(AVG(s.units_sold),1) as avg_weekly_units,
          ms.name as section
        FROM menu_items mi
        LEFT JOIN menu_item_sales s ON s.item_id=mi.id AND s.week_start >= CURRENT_DATE - interval '4 weeks'
        LEFT JOIN menu_sections ms ON ms.id = mi.section_id
        WHERE mi.tenant_id=$1 ${loc?'AND (mi.location_id=$2 OR mi.location_id IS NULL)':''} AND mi.available=true
        GROUP BY mi.id, mi.name, mi.price, mi.food_cost, ms.name
        ORDER BY total_units_4wk DESC`,
        loc ? [tenantId, loc] : [tenantId]);
      return r.rows;
    }
    case 'get_reviews_detail': {
      const { limit=10, platform='all', sentiment='all' } = input;
      let where = `tenant_id=$1 ${locWhere.replace('location_id','location_id')}`;
      const params = locParams([tenantId]);
      if (platform !== 'all') { where += ` AND platform=$${params.length+1}`; params.push(platform); }
      if (sentiment !== 'all') { where += ` AND sentiment=$${params.length+1}`; params.push(sentiment); }
      params.push(Math.min(limit, 20));
      const r = await adminQuery(`
        SELECT reviewer, platform, rating, text, review_date, sentiment, status, response_draft
        FROM reviews WHERE ${where}
        ORDER BY review_date DESC LIMIT $${params.length}`, params);
      return r.rows;
    }
    case 'get_labor_detail': {
      const [emps, shifts, ot] = await Promise.all([
        adminQuery(`SELECT first_name, last_name, position, department, wage_type, wage_rate, status
          FROM employees WHERE tenant_id=$1${loc?' AND (location_id=$2 OR location_id IS NULL)':''} AND status='active' AND NOT COALESCE(archived,false)
          ORDER BY department, last_name`,
          loc ? [tenantId, loc] : [tenantId]),
        adminQuery(`SELECT e.first_name, e.last_name, s.position, s.shift_date, s.start_time, s.end_time
          FROM shifts s JOIN schedules sc ON sc.id=s.schedule_id
          LEFT JOIN employees e ON e.id=s.employee_id
          WHERE sc.tenant_id=$1${loc?' AND sc.location_id=$2':''} AND s.shift_date BETWEEN CURRENT_DATE AND CURRENT_DATE+6
          ORDER BY s.shift_date, s.start_time`,
          loc ? [tenantId, loc] : [tenantId]),
      ]);
      return { employees: emps.rows, current_week_shifts: shifts.rows };
    }
    case 'get_inventory_alerts': {
      const r = await adminQuery(`
        SELECT ii.name, ii.category, ii.unit, ii.par_level, ii.reorder_point,
          ii.last_price, ii.vendor,
          COALESCE((
            SELECT cl.quantity FROM inventory_count_lines cl
            JOIN inventory_counts ic ON ic.id=cl.count_id
            WHERE cl.inventory_item_id=ii.id AND ic.status='submitted'
            ORDER BY ic.created_at DESC LIMIT 1
          ), null) as last_count
        FROM inventory_items ii
        WHERE ii.tenant_id=$1${loc?' AND (ii.location_id=$2 OR ii.location_id IS NULL)':''} AND ii.active=true
        ORDER BY ii.category, ii.name`,
        loc ? [tenantId, loc] : [tenantId]);
      return r.rows;
    }
    case 'get_loyalty_members': {
      const r = await adminQuery(`
        SELECT name, tier, points_balance, points_lifetime, last_visit_date, streak_weeks
        FROM loyalty_members WHERE tenant_id=$1${locWhere}
        ORDER BY points_lifetime DESC LIMIT 20`,
        locParams([tenantId]));
      return r.rows;
    }
    default:
      if (name === 'run_sql') {
        return await runSafeSql(input.query, tenantId);
      }
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Main stream handler ───────────────────────────────────────────────────────
async function streamChat({ tenantId, locationId, sessionId, userMessage, tenantName, res }) {
  await ensureTables();

  // Ensure session exists
  const sessionCheck = await adminQuery(
    'SELECT id FROM chat_sessions WHERE id=$1 AND tenant_id=$2', [sessionId, tenantId]);
  if (!sessionCheck.rows[0]) throw Object.assign(new Error('Session not found'), { status: 404 });

  // Load conversation history (last 12 messages for context)
  const history = await getMessages(tenantId, sessionId, 50);
  const recentHistory = history.slice(-12);

  // Save user message
  await saveMessage(tenantId, sessionId, 'user', userMessage);

  // Auto-title session if this is first message
  if (history.length === 0) {
    const title = userMessage.length > 80 ? userMessage.slice(0, 77) + '…' : userMessage;
    await updateSessionTitle(tenantId, sessionId, title);
  }

  // Assemble live context
  const context = await assembleContext(tenantId, locationId);
  const systemPrompt = buildSystemPrompt(context, tenantName);

  // Build messages array for Claude
  const messages = [
    ...recentHistory
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let fullResponse = '';
  let toolCallsUsed = [];
  let totalTokens = 0;

  // ── Agentic loop: stream → handle tool calls → continue ──────────────────
  let loopMessages = [...messages];
  let iterations = 0;
  const MAX_ITERATIONS = 4;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let streamRes;
    try {
      streamRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: systemPrompt,
          tools: TOOLS,
          messages: loopMessages,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      send('error', { message: e.name === 'AbortError' ? 'Response timed out' : e.message });
      res.end();
      return;
    }
    clearTimeout(timeout);

    if (!streamRes.ok) {
      const errText = await streamRes.text();
      console.error('[assistant] Claude API error', streamRes.status, errText.slice(0, 300));
      send('error', { message: `API error ${streamRes.status}: ${errText.slice(0, 200)}` });
      res.end();
      return;
    }

    // Parse SSE stream from Claude (Web ReadableStream in Node 18+)
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolUse = null;
    let currentToolInput = '';
    let assistantContent = [];
    let currentTextBlock = null;
    let stopReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        let evt;
        try { evt = JSON.parse(data); } catch { continue; }

        if (evt.type === 'message_start') {
          totalTokens += evt.message?.usage?.input_tokens || 0;
        }
        if (evt.type === 'message_delta') {
          totalTokens += evt.usage?.output_tokens || 0;
          stopReason = evt.delta?.stop_reason;
        }
        if (evt.type === 'content_block_start') {
          if (evt.content_block.type === 'text') {
            currentTextBlock = { type: 'text', text: '' };
            assistantContent.push(currentTextBlock);
          } else if (evt.content_block.type === 'tool_use') {
            currentToolUse = { type: 'tool_use', id: evt.content_block.id, name: evt.content_block.name, input: {} };
            currentToolInput = '';
            assistantContent.push(currentToolUse);
            send('tool_start', { name: evt.content_block.name });
          }
        }
        if (evt.type === 'content_block_delta') {
          if (evt.delta.type === 'text_delta' && currentTextBlock) {
            currentTextBlock.text += evt.delta.text;
            fullResponse += evt.delta.text;
            send('delta', { text: evt.delta.text });
          }
          if (evt.delta.type === 'input_json_delta') {
            currentToolInput += evt.delta.partial_json;
          }
        }
        if (evt.type === 'content_block_stop') {
          if (currentToolUse) {
            try { currentToolUse.input = JSON.parse(currentToolInput || '{}'); } catch { currentToolUse.input = {}; }
            currentToolInput = '';
            currentToolUse = null;
          }
        }
      }
    }

    // If Claude used tools, execute them and continue
    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    if (toolUses.length > 0 && stopReason === 'tool_use') {
      // Filter out empty text blocks — Claude rejects them
      const validContent = assistantContent.filter(b => b.type === 'tool_use' || (b.type === 'text' && b.text));
      // Add assistant message with tool calls to history
      loopMessages.push({ role: 'assistant', content: validContent });

      // Execute all tools
      const toolResults = [];
      for (const tu of toolUses) {
        send('tool_running', { name: tu.name });
        let result;
        try {
          result = await executeTool(tu.name, tu.input, tenantId, locationId);
        } catch(toolErr) {
          console.error('[assistant] tool error:', tu.name, toolErr.message);
          result = { error: toolErr.message, tool: tu.name };
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
        toolCallsUsed.push({ name: tu.name, input: tu.input });
        send('tool_done', { name: tu.name, rows: Array.isArray(result) ? result.length : 1 });
      }

      // Add tool results and continue loop
      loopMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // No tool calls — we're done
    break;
  }

  // Save assistant response
  if (fullResponse) {
    await saveMessage(tenantId, sessionId, 'assistant', fullResponse, {
      tool_calls: toolCallsUsed,
      context: {
        location_id: locationId,
        kpi_week: context.financial.latest_week?.week_start,
      },
      tokens: totalTokens,
    });
  }

  send('done', { sessionId, tokens: totalTokens });
  res.end();
}

module.exports = {
  ensureTables,
  getSessions, createSession, deleteSession,
  getMessages, updateSessionTitle,
  streamChat,
};
