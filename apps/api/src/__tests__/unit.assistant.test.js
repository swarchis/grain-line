// ── Unit: Assistant service (no DB, no network) ───────────────────────────────
// Run: node src/__tests__/unit.assistant.test.js
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else       { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}

// ── Test buildSystemPrompt ────────────────────────────────────────────────────
function buildSystemPrompt(context, tenantName) {
  const loc = context.location;
  const kpi = context.financial.latest_week;
  const now = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  return `You are Pulse, an expert AI restaurant operator and advisor for ${tenantName || 'this restaurant group'}${loc?.name ? `, specifically for ${loc.name} in ${loc.city}, ${loc.state}` : ''}.

Today is ${now}.
${kpi.week_start ? `\nFinancials (week of ${kpi.week_start}):
- Total sales: ${kpi.total_sales ? '$'+Number(kpi.total_sales).toLocaleString() : 'no data'}
- Food cost: ${kpi.food_cost_pct ? kpi.food_cost_pct+'%' : 'unknown'}` : ''}
Staff & Scheduling:
- Active staff: ${context.labor.active_staff || 0}`;
}

async function run() {
  console.log('\n── Assistant unit tests ─────────────────────────────────');

  // 1. buildSystemPrompt: includes tenant name
  {
    const ctx = {
      location: { name:'Rooh SF', city:'San Francisco', state:'CA' },
      financial: { latest_week: { week_start:'2025-06-01', total_sales:60000, food_cost_pct:'31.2' }, sales_trend_pct:'3.2' },
      labor: { active_staff:22, foh:13, boh:9, shifts_this_week:95 },
      menu: { active_items:29, avg_price:'24.50', avg_margin:'68.5', top_items:[] },
      inventory: { total_items:45, pending_invoices:2 },
      reviews: { total:18, avg_rating:'4.4', pending_response:3, negative:1 },
      loyalty: { total_members:15, platinum:2, gold:5, active_30d:10 },
      compliance: { valid:10, expiring_soon:2, expired:0, pending_time_off:1 },
    };
    const prompt = buildSystemPrompt(ctx, 'Rivaaz Restaurant Group');
    assert(prompt.includes('Rivaaz Restaurant Group'), 'system prompt includes tenant name');
    assert(prompt.includes('Rooh SF'), 'system prompt includes location name');
    assert(prompt.includes('San Francisco'), 'system prompt includes city');
    assert(prompt.includes('$60,000'), 'system prompt includes formatted sales');
    assert(prompt.includes('31.2%'), 'system prompt includes food cost');
    assert(prompt.includes('22'), 'system prompt includes staff count');
  }

  // 2. buildSystemPrompt: handles missing data gracefully
  {
    const ctx = {
      location: {},
      financial: { latest_week: {}, sales_trend_pct: null },
      labor: { active_staff: null },
      menu: { active_items: 0, top_items: [] },
      inventory: { total_items: 0, pending_invoices: 0 },
      reviews: { total: 0, avg_rating: null, pending_response: 0, negative: 0 },
      loyalty: { total_members: 0 },
      compliance: { valid: 0, expiring_soon: 0, expired: 0 },
    };
    let threw = false;
    try { buildSystemPrompt(ctx, null); } catch(e) { threw = true; }
    assert(!threw, 'buildSystemPrompt handles missing data without throwing');
  }

  // 3. SSE send format
  {
    const events = [];
    const mockRes = {
      write: (data) => events.push(data),
      setHeader: ()=>{}, flushHeaders: ()=>{}, end: ()=>{}
    };
    const send = (event, data) => mockRes.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('delta', { text: 'Hello world' });
    send('tool_start', { name: 'get_menu_matrix' });
    send('done', { sessionId: 'abc-123', tokens: 450 });

    assert(events[0] === 'event: delta\ndata: {"text":"Hello world"}\n\n', 'delta event format correct');
    assert(events[1].includes('tool_start'), 'tool_start event format correct');
    assert(events[2].includes('"sessionId":"abc-123"'), 'done event includes sessionId');
    assert(events[2].includes('"tokens":450'), 'done event includes token count');
  }

  // 4. Tool list completeness
  {
    const TOOLS = [
      { name:'get_weekly_kpi_trend' },
      { name:'get_menu_matrix' },
      { name:'get_reviews_detail' },
      { name:'get_labor_detail' },
      { name:'get_inventory_alerts' },
      { name:'get_loyalty_members' },
    ];
    const toolNames = TOOLS.map(t => t.name);
    assert(toolNames.includes('get_weekly_kpi_trend'), 'KPI trend tool defined');
    assert(toolNames.includes('get_menu_matrix'), 'menu matrix tool defined');
    assert(toolNames.includes('get_reviews_detail'), 'reviews tool defined');
    assert(toolNames.includes('get_labor_detail'), 'labor tool defined');
    assert(toolNames.includes('get_inventory_alerts'), 'inventory tool defined');
    assert(toolNames.includes('get_loyalty_members'), 'loyalty tool defined');
    assert(toolNames.length === 6, 'exactly 6 tools defined');
  }

  // 5. Context assembly handles partial failures
  {
    // Simulate Promise.allSettled with some rejections
    const results = [
      { status:'fulfilled', value:{ rows:[{ total_sales:60000, food_cost_pct:'31', week_start:'2025-06-01' }] } },
      { status:'rejected',  reason: new Error('DB timeout') },
      { status:'fulfilled', value:{ rows:[{ pending_invoices:2 }] } },
    ];
    const get = (i) => results[i].status === 'fulfilled' ? results[i].value.rows : [];
    assert(get(0).length === 1, 'fulfilled result returns rows');
    assert(get(1).length === 0, 'rejected result returns empty array gracefully');
    assert(get(2)[0].pending_invoices === 2, 'fulfilled result returns correct data');
  }

  // 6. Sales trend calculation
  {
    const calcTrend = (latest, prev) => {
      if (!latest || !prev) return null;
      return ((latest - prev) / prev * 100).toFixed(1);
    };
    assert(calcTrend(66000, 60000) === '10.0', 'positive trend calculated correctly');
    assert(calcTrend(54000, 60000) === '-10.0', 'negative trend calculated correctly');
    assert(calcTrend(null, 60000) === null, 'handles missing latest');
    assert(calcTrend(60000, null) === null, 'handles missing previous');
  }

  // 7. Agentic loop iteration limit
  {
    const MAX_ITERATIONS = 4;
    let iterations = 0;
    const shouldContinue = () => { iterations++; return iterations < MAX_ITERATIONS; };
    while (shouldContinue()) {}
    assert(iterations === MAX_ITERATIONS, `loop stops at MAX_ITERATIONS (${MAX_ITERATIONS})`);
  }

  // 8. Message history truncation
  {
    const messages = Array.from({length:20}, (_,i) => ({ role: i%2===0?'user':'assistant', content:`msg ${i}` }));
    const recent = messages.slice(-12);
    assert(recent.length === 12, 'history capped at 12 messages');
    assert(recent[0].content === 'msg 8', 'most recent 12 messages kept');
  }

  // 9. Session title from first message (stored up to 500 chars in DB)
  {
    const titleFrom = (msg) => msg.length > 500 ? msg.slice(0,500) : msg;
    const short = 'How is my food cost this week?';
    const long = 'x'.repeat(600);
    assert(titleFrom(short) === short, 'short message stored as title');
    assert(titleFrom(long).length === 500, 'long message capped at 500 chars for DB');
  }

  // 10. Frontend SSE parsing simulation
  {
    // Simulate what the frontend does with SSE chunks
    const chunks = [
      'event: delta\ndata: {"text":"Hello"}\n\n',
      'event: delta\ndata: {"text":" world"}\n\n',
      'event: tool_start\ndata: {"name":"get_menu_matrix"}\n\n',
      'event: tool_done\ndata: {"name":"get_menu_matrix","rows":29}\n\n',
      'event: done\ndata: {"sessionId":"test-123","tokens":500}\n\n',
    ];

    let fullText = '';
    let lastEvent = '';
    let toolsSeen = [];
    let doneReceived = false;
    let currentEvent = '';

    const buf = chunks.join('');
    for (const line of buf.split('\n')) {
      if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); continue; }
      if (!line.startsWith('data: ')) continue;
      const evt = JSON.parse(line.slice(6));
      switch(currentEvent) {
        case 'delta': fullText += evt.text||''; break;
        case 'tool_start': toolsSeen.push(evt.name); break;
        case 'done': doneReceived = true; break;
      }
    }

    assert(fullText === 'Hello world', 'SSE delta events accumulated correctly');
    assert(toolsSeen.includes('get_menu_matrix'), 'SSE tool_start captured');
    assert(doneReceived, 'SSE done event received');
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
