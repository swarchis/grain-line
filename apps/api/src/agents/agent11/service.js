// ─── Agent 11: Menu Management & Optimization ────────────────────────────────
const { adminQuery } = require('@restaurantos/db');
const { callClaude, parseJSON } = require('../../lib/claude');
const { once } = require('../../lib/tableCache');
const AGENT_ID = 'agent_11_menu';

// ── Ensure tables ──────────────────────────────────────────────────────────────
const ensureTables = once('agent11', async function() {
  const stmts = [`
    CREATE TABLE IF NOT EXISTS menu_sections (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      name          VARCHAR(200) NOT NULL,
      description   TEXT,
      menu_type     VARCHAR(50) NOT NULL DEFAULT 'dinner',
      sort_order    INTEGER DEFAULT 0,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS menu_items (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      section_id      UUID REFERENCES menu_sections(id) ON DELETE SET NULL,
      recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
      name            VARCHAR(300) NOT NULL,
      description     TEXT,
      price           NUMERIC(10,2),
      price_override  NUMERIC(10,2),
      food_cost       NUMERIC(10,2),
      food_cost_pct   NUMERIC(5,2),
      category        VARCHAR(100),
      tags            TEXT[] DEFAULT '{}',
      is_signature    BOOLEAN DEFAULT false,
      is_seasonal     BOOLEAN DEFAULT false,
      available       BOOLEAN NOT NULL DEFAULT true,
      placement_notes TEXT,
      image_url       TEXT,
      sort_order      INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS menu_item_sales (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL,
      item_id     UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      location_id UUID,
      week_start  DATE NOT NULL,
      units_sold  INTEGER NOT NULL DEFAULT 0,
      revenue     NUMERIC(10,2) DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(item_id, location_id, week_start)
    )`,`
    CREATE TABLE IF NOT EXISTS menu_price_suggestions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      item_id       UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      current_price NUMERIC(10,2),
      suggested_price NUMERIC(10,2),
      reason        TEXT,
      impact_est    TEXT,
      suggestion_type VARCHAR(30) NOT NULL DEFAULT 'ai',
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      applied_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ];
  for (const sql of stmts) await adminQuery(sql).catch(e=>console.error('[agent11] table error:', e.message));
  const indexes = [
    'CREATE INDEX IF NOT EXISTS menu_items_tenant  ON menu_items(tenant_id)',
    'CREATE INDEX IF NOT EXISTS menu_items_section ON menu_items(section_id)',
    'CREATE INDEX IF NOT EXISTS menu_sales_item    ON menu_item_sales(item_id)',
    'CREATE INDEX IF NOT EXISTS menu_sections_tenant ON menu_sections(tenant_id)',
  ];
  for (const sql of indexes) await adminQuery(sql).catch(()=>{});
});

// ── Sections ──────────────────────────────────────────────────────────────────
async function getSections(tenantId, { locationId, menuType } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const p=[tenantId]; let i=2;
  if (locationId) { where+=` AND (location_id=$${i++} OR location_id IS NULL)`; p.push(locationId); }
  if (menuType)   { where+=` AND menu_type=$${i++}`; p.push(menuType); }
  const r = await adminQuery(`SELECT * FROM menu_sections WHERE ${where} AND active=true ORDER BY sort_order, name`, p);
  return r.rows;
}

async function upsertSection(tenantId, data) {
  await ensureTables();
  const { id, locationId, name, description, menuType, sortOrder } = data;
  if (id) {
    const r = await adminQuery(
      'UPDATE menu_sections SET name=$1,description=$2,menu_type=$3,sort_order=$4,updated_at=now() WHERE id=$5 AND tenant_id=$6 RETURNING *',
      [name, description||null, menuType||'dinner', sortOrder??0, id, tenantId]);
    return r.rows[0];
  }
  const r = await adminQuery(
    'INSERT INTO menu_sections (tenant_id,location_id,name,description,menu_type,sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [tenantId, locationId||null, name, description||null, menuType||'dinner', sortOrder??0]);
  return r.rows[0];
}

async function deleteSection(tenantId, sectionId) {
  await adminQuery("UPDATE menu_sections SET active=false WHERE id=$1 AND tenant_id=$2", [sectionId, tenantId]);
  return { ok:true };
}

// ── Menu items ────────────────────────────────────────────────────────────────
async function getMenuItems(tenantId, { locationId, sectionId, available, includeRecipeCost=true } = {}) {
  await ensureTables();
  let where = 'mi.tenant_id=$1'; const p=[tenantId]; let i=2;
  if (locationId) { where+=` AND (mi.location_id=$${i++} OR mi.location_id IS NULL)`; p.push(locationId); }
  if (sectionId)  { where+=` AND mi.section_id=$${i++}`; p.push(sectionId); }
  if (available!=null) { where+=` AND mi.available=$${i++}`; p.push(available); }

  const r = await adminQuery(`
    SELECT mi.*,
      ms.name as section_name, ms.menu_type, ms.sort_order as section_order,
      r.name as recipe_name,
      -- live food cost from recipe ingredients
      COALESCE(mi.food_cost, (
        SELECT SUM(COALESCE(ri.unit_cost, ii.last_price, 0) * ri.qty)
        FROM recipe_ingredients ri
        LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
        WHERE ri.recipe_id = mi.recipe_id AND ri.tenant_id = mi.tenant_id
      )) as food_cost_live,
      -- sales last 4 weeks
      COALESCE((
        SELECT SUM(s.units_sold) FROM menu_item_sales s
        WHERE s.item_id = mi.id AND s.week_start >= CURRENT_DATE - interval '4 weeks'
      ), 0) as units_4wk,
      COALESCE((
        SELECT AVG(s.units_sold) FROM menu_item_sales s
        WHERE s.item_id = mi.id AND s.week_start >= CURRENT_DATE - interval '4 weeks'
      ), 0) as avg_weekly_sales
    FROM menu_items mi
    LEFT JOIN menu_sections ms ON ms.id = mi.section_id
    LEFT JOIN recipes r ON r.id = mi.recipe_id
    WHERE ${where}
    ORDER BY ms.sort_order NULLS LAST, mi.sort_order, mi.name
  `, p);

  return r.rows.map(item => {
    const price     = parseFloat(item.price_override || item.price || 0);
    const cost      = parseFloat(item.food_cost_live || item.food_cost || 0);
    const margin    = price > 0 ? ((price - cost) / price * 100) : 0;
    const profit    = price - cost;
    return { ...item, price, food_cost_live:cost, margin_pct: parseFloat(margin.toFixed(1)), gross_profit: parseFloat(profit.toFixed(2)) };
  });
}

async function upsertMenuItem(tenantId, data) {
  await ensureTables();
  const { id, locationId, sectionId, recipeId, name, description, price,
          priceOverride, foodCost, category, tags, isSignature, isSeasonal,
          available, placementNotes, imageUrl, sortOrder } = data;

  if (id) {
    const allowed = { section_id:sectionId, recipe_id:recipeId, name, description, price,
                      price_override:priceOverride, food_cost:foodCost, category, tags,
                      is_signature:isSignature, is_seasonal:isSeasonal, available,
                      placement_notes:placementNotes, image_url:imageUrl, sort_order:sortOrder };
    const updates=[], values=[]; let i=1;
    for (const [col,val] of Object.entries(allowed)) {
      if (val !== undefined) { updates.push(`${col}=$${i++}`); values.push(val); }
    }
    values.push(id, tenantId);
    const r = await adminQuery(
      `UPDATE menu_items SET ${updates.join(',')},updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
      values);
    return r.rows[0];
  }

  const r = await adminQuery(`
    INSERT INTO menu_items (tenant_id,location_id,section_id,recipe_id,name,description,price,food_cost,category,tags,is_signature,is_seasonal,available,placement_notes,sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
  `, [tenantId, locationId||null, sectionId||null, recipeId||null, name, description||null,
      price||null, foodCost||null, category||null, tags||'{}', isSignature||false,
      isSeasonal||false, available??true, placementNotes||null, sortOrder??0]);
  return r.rows[0];
}

async function deleteMenuItem(tenantId, itemId) {
  await adminQuery("UPDATE menu_items SET available=false,updated_at=now() WHERE id=$1 AND tenant_id=$2", [itemId, tenantId]);
  return { ok:true };
}

async function upsertSales(tenantId, itemId, locationId, weekStart, unitsSold, revenue) {
  await ensureTables();
  await adminQuery(`
    INSERT INTO menu_item_sales (tenant_id, item_id, location_id, week_start, units_sold, revenue)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (item_id, location_id, week_start)
    DO UPDATE SET units_sold=$5, revenue=$6
  `, [tenantId, itemId, locationId||null, weekStart, unitsSold, revenue||0]);
  return { ok:true };
}

// ── Matrix (menu engineering) ─────────────────────────────────────────────────
// Stars=high margin + high popularity, Plowhorses=low margin + high popularity
// Puzzles=high margin + low popularity, Dogs=low margin + low popularity
async function getMatrix(tenantId, { locationId, menuType } = {}) {
  const items = await getMenuItems(tenantId, { locationId, available:true });

  if (items.length === 0) return { items:[], quadrants:{}, averages:{} };

  const withSales = items.filter(i => parseFloat(i.avg_weekly_sales) > 0 || parseFloat(i.margin_pct) > 0);
  const allItems  = items; // include zero-sales for completeness

  // Calculate averages for quadrant thresholds
  const avgSales  = allItems.reduce((s,i)=>s+parseFloat(i.avg_weekly_sales||0),0) / Math.max(allItems.length,1);
  const avgMargin = allItems.reduce((s,i)=>s+parseFloat(i.margin_pct||0),0) / Math.max(allItems.length,1);
  const avgProfit = allItems.reduce((s,i)=>s+parseFloat(i.gross_profit||0),0) / Math.max(allItems.length,1);

  const classify = item => {
    const highPop    = parseFloat(item.avg_weekly_sales||0) >= avgSales;
    const highMargin = parseFloat(item.gross_profit||0) >= avgProfit;
    if (highPop && highMargin)  return 'star';
    if (highPop && !highMargin) return 'plowhorse';
    if (!highPop && highMargin) return 'puzzle';
    return 'dog';
  };

  const classified = allItems.map(item => ({ ...item, quadrant: classify(item) }));

  return {
    items: classified,
    averages: { avg_weekly_sales: parseFloat(avgSales.toFixed(1)), avg_margin_pct: parseFloat(avgMargin.toFixed(1)), avg_gross_profit: parseFloat(avgProfit.toFixed(2)) },
    quadrants: {
      star:      classified.filter(i=>i.quadrant==='star'),
      plowhorse: classified.filter(i=>i.quadrant==='plowhorse'),
      puzzle:    classified.filter(i=>i.quadrant==='puzzle'),
      dog:       classified.filter(i=>i.quadrant==='dog'),
    },
  };
}

// ── AI pricing suggestions ────────────────────────────────────────────────────
async function generatePricingSuggestions(tenantId, locationId) {
  await ensureTables();

  const items = await getMenuItems(tenantId, { locationId, available:true });
  if (items.length === 0) return [];

  // Get recent financial context
  const kpi = await adminQuery(`
    SELECT AVG(total_sales) as avg_weekly_sales,
           AVG(food_net_sales) as avg_food_sales,
           AVG(bar_net_sales) as avg_bar_sales
    FROM weekly_kpi WHERE tenant_id=$1
      AND (location_id=$2 OR location_id IS NULL)
      AND week_start >= CURRENT_DATE - interval '8 weeks'
  `, [tenantId, locationId]).then(r=>r.rows[0]).catch(()=>({}));

  const topItems = items.slice(0,20).map(i=>({
    id: i.id, name: i.name, category: i.category,
    price: i.price, food_cost: i.food_cost_live,
    margin_pct: i.margin_pct, gross_profit: i.gross_profit,
    avg_weekly_sales: i.avg_weekly_sales, quadrant: null,
    is_signature: i.is_signature,
  }));

  const prompt = `You are a restaurant menu pricing expert for an upscale Indian fusion restaurant in San Francisco.

Current menu data (top 20 items):
${JSON.stringify(topItems, null, 2)}

Recent financials:
- Weekly avg food sales: $${parseFloat(kpi?.avg_food_sales||0).toFixed(0)}
- Weekly avg bar sales: $${parseFloat(kpi?.avg_bar_sales||0).toFixed(0)}

Target food cost: 28-32%. Target gross margin: 68-72%.

Generate pricing suggestions. Consider:
1. Items with food cost > 35% need price increases
2. High-selling items with room to increase (demand inelastic)
3. Low-selling high-margin items may be priced too high
4. Signature/premium items can command higher margins
5. Psychological pricing ($14 → $15, not $14 → $14.73)
6. Seasonal adjustments if applicable

Return ONLY a JSON array (no markdown), max 10 suggestions:
[{
  "item_id": "uuid",
  "item_name": "string",
  "current_price": 0,
  "suggested_price": 0,
  "reason": "short explanation (max 15 words)",
  "impact_est": "e.g. +$180/week at current volume",
  "suggestion_type": "price_increase|price_decrease|seasonal|bundle"
}]`;

  const text = await callClaude({ content: prompt, maxTokens: 4000 });
  // Robust extraction — handles truncated JSON
  let suggestions = [];
  try {
    const clean = text.replace(/```json?\n?|```/g,'').trim();
    suggestions = JSON.parse(clean);
    if (!Array.isArray(suggestions)) suggestions = [];
  } catch(e) {
    // Extract complete objects from truncated array
    const matches = text.match(/\{[^{}]{20,500}\}/g) || [];
    for (const m of matches) {
      try { const obj = JSON.parse(m); if (obj.item_id) suggestions.push(obj); } catch(_) {}
    }
  }

  // Store suggestions
  for (const s of suggestions) {
    if (!s.item_id) continue;
    await adminQuery(`
      INSERT INTO menu_price_suggestions (tenant_id, item_id, current_price, suggested_price, reason, impact_est, suggestion_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [tenantId, s.item_id, s.current_price, s.suggested_price, s.reason, s.impact_est, s.suggestion_type||'ai']).catch(()=>{});
  }
  return suggestions;
}

async function getPriceSuggestions(tenantId, { status='pending' } = {}) {
  const r = await adminQuery(`
    SELECT ps.*, mi.name as item_name, mi.price as current_price_live, mi.category
    FROM menu_price_suggestions ps
    JOIN menu_items mi ON mi.id = ps.item_id
    WHERE ps.tenant_id=$1 AND ps.status=$2
    ORDER BY ps.created_at DESC
  `, [tenantId, status]);
  return r.rows;
}

async function applyPriceSuggestion(tenantId, suggestionId) {
  const s = await adminQuery('SELECT * FROM menu_price_suggestions WHERE id=$1 AND tenant_id=$2', [suggestionId, tenantId]);
  if (!s.rows[0]) throw Object.assign(new Error('Suggestion not found'), {status:404});
  const sug = s.rows[0];
  await adminQuery('UPDATE menu_items SET price=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3', [sug.suggested_price, sug.item_id, tenantId]);
  await adminQuery("UPDATE menu_price_suggestions SET status='applied', applied_at=now() WHERE id=$1", [suggestionId]);
  return { ok:true };
}

async function dismissPriceSuggestion(tenantId, suggestionId) {
  await adminQuery("UPDATE menu_price_suggestions SET status='dismissed' WHERE id=$1 AND tenant_id=$2", [suggestionId, tenantId]);
  return { ok:true };
}

// ── AI optimization ───────────────────────────────────────────────────────────
async function getMenuOptimizations(tenantId, locationId) {
  await ensureTables();

  const [matrix, waste] = await Promise.all([
    getMatrix(tenantId, { locationId }),
    adminQuery(`
      SELECT ii.name, SUM(ic.quantity - COALESCE(
        (SELECT SUM(ri.qty * mis.units_sold) FROM recipe_ingredients ri
         JOIN menu_item_sales mis ON mis.item_id = (SELECT id FROM menu_items WHERE recipe_id = ri.recipe_id LIMIT 1)
         WHERE ri.inventory_item_id = ii.id
         AND mis.week_start >= CURRENT_DATE - interval '4 weeks'), 0
      )) as est_waste
      FROM inventory_count_lines ic
      JOIN inventory_items ii ON ii.id = ic.inventory_item_id
      WHERE ic.tenant_id=$1
      GROUP BY ii.id, ii.name
      HAVING SUM(ic.quantity) > 0
      ORDER BY SUM(ic.quantity) DESC LIMIT 10
    `, [tenantId]).then(r=>r.rows).catch(()=>[]),
  ]);

  const prompt = `You are a restaurant menu optimization expert for an upscale Indian fusion restaurant (Rooh SF concept).

Menu engineering matrix:
Stars (high margin + high popularity): ${matrix.quadrants.star?.map(i=>i.name).join(', ')||'none'}
Plowhorses (popular but low margin): ${matrix.quadrants.plowhorse?.map(i=>i.name).join(', ')||'none'}
Puzzles (high margin but low sales): ${matrix.quadrants.puzzle?.map(i=>i.name).join(', ')||'none'}
Dogs (low margin + low popularity): ${matrix.quadrants.dog?.map(i=>i.name).join(', ')||'none'}

Avg weekly sales threshold: ${matrix.averages.avg_weekly_sales} units
Avg gross profit threshold: $${matrix.averages.avg_gross_profit}

High-inventory ingredients (potential waste): ${waste.map(w=>w.name).join(', ')||'none'}

Generate 5-7 specific, actionable menu optimization recommendations. Focus on:
1. What to promote/spotlight (Stars)
2. How to improve Plowhorses (raise price, reduce portion/cost)
3. How to rescue Puzzles (better placement, staff training, rename/redescribe)
4. Whether Dogs should be removed or reimagined
5. Ingredient utilization to reduce waste
6. Menu layout and design placement tips

Return ONLY a JSON array (no markdown):
[{
  "title": "short title",
  "category": "pricing|placement|removal|promotion|waste|design",
  "priority": "high|medium|low",
  "action": "2-3 sentence specific action to take",
  "impact": "estimated impact on revenue/cost",
  "items_affected": ["item name", ...]
}]`;

  const text = await callClaude({ content: prompt, maxTokens: 4000 });
  return parseJSON(text);
}

// ── Import from recipes ───────────────────────────────────────────────────────
async function importFromRecipes(tenantId, locationId) {
  await ensureTables();
  const recipes = await adminQuery(`
    SELECT r.*,
      COALESCE((
        SELECT SUM(COALESCE(ri.unit_cost, ii.last_price, 0) * ri.qty)
        FROM recipe_ingredients ri
        LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
        WHERE ri.recipe_id = r.id
      ), 0) as food_cost_calc
    FROM recipes r
    WHERE r.tenant_id=$1 AND r.active=true
      AND r.id NOT IN (SELECT recipe_id FROM menu_items WHERE tenant_id=$1 AND recipe_id IS NOT NULL)
  `, [tenantId]);

  let imported = 0;
  for (const r of recipes.rows) {
    await adminQuery(`
      INSERT INTO menu_items (tenant_id, location_id, recipe_id, name, description, price, food_cost, category, available)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
      ON CONFLICT DO NOTHING
    `, [tenantId, locationId||null, r.id, r.name, r.description||null,
        r.menu_price||null, r.food_cost_calc||null, r.category||null]);
    imported++;
  }
  return { imported };
}

// ── What-if simulation ────────────────────────────────────────────────────────
async function simulatePriceChange(tenantId, { itemId, newPrice, elasticity = -1.2 } = {}) {
  const item = await adminQuery(`
    SELECT mi.*, COALESCE((
      SELECT SUM(s.units_sold) FROM menu_item_sales s
      WHERE s.item_id = mi.id AND s.week_start >= CURRENT_DATE - interval '4 weeks'
    ), 0) as units_4wk FROM menu_items mi WHERE mi.id=$1 AND mi.tenant_id=$2
  `, [itemId, tenantId]);
  const i = item.rows[0];
  if (!i) throw Object.assign(new Error('Item not found'), {status:404});

  const curPrice   = parseFloat(i.price || 0);
  const foodCost   = parseFloat(i.food_cost || 0);
  const weeklyUnits = parseFloat(i.units_4wk || 0) / 4;

  if (curPrice === 0) return { error: 'No current price set' };

  const priceDelta   = (newPrice - curPrice) / curPrice;
  const volDelta     = priceDelta * elasticity;
  const newUnits     = weeklyUnits * (1 + volDelta);
  const curProfit    = weeklyUnits * (curPrice - foodCost);
  const newProfit    = newUnits * (newPrice - foodCost);
  const profitDelta  = newProfit - curProfit;

  return {
    item_name:      i.name,
    current_price:  curPrice,
    new_price:      newPrice,
    current_units:  parseFloat(weeklyUnits.toFixed(1)),
    estimated_units: parseFloat(newUnits.toFixed(1)),
    current_weekly_profit:  parseFloat(curProfit.toFixed(2)),
    estimated_weekly_profit: parseFloat(newProfit.toFixed(2)),
    weekly_profit_delta: parseFloat(profitDelta.toFixed(2)),
    annual_profit_delta: parseFloat((profitDelta * 52).toFixed(2)),
    margin_pct_current:  curPrice > 0 ? parseFloat(((curPrice-foodCost)/curPrice*100).toFixed(1)) : 0,
    margin_pct_new:      newPrice > 0 ? parseFloat(((newPrice-foodCost)/newPrice*100).toFixed(1)) : 0,
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getSummary(tenantId, locationId) {
  await ensureTables();
  const [items, sections, suggestions] = await Promise.all([
    adminQuery(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE available) as active,
      AVG(CASE WHEN price>0 THEN (price-COALESCE(food_cost,0))/price*100 END) as avg_margin,
      AVG(price) as avg_price FROM menu_items WHERE tenant_id=$1 AND (location_id=$2 OR location_id IS NULL)`,
      [tenantId, locationId]),
    adminQuery('SELECT COUNT(*) as total FROM menu_sections WHERE tenant_id=$1 AND active=true', [tenantId]),
    adminQuery("SELECT COUNT(*) as pending FROM menu_price_suggestions WHERE tenant_id=$1 AND status='pending'", [tenantId]),
  ]);
  return {
    items: items.rows[0],
    sections: sections.rows[0],
    suggestions: suggestions.rows[0],
  };
}


// ── Menu PDF/Image Scanner ────────────────────────────────────────────────────
async function scanMenu(tenantId, { fileBase64, mimeType, locationId }) {
  await ensureTables();
  const isPdf = mimeType === 'application/pdf';
  const fileContent = isPdf
    ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data:fileBase64 } }
    : { type:'image',    source:{ type:'base64', media_type:mimeType,           data:fileBase64 } };

  const prompt = `You are a restaurant menu analyst. Extract every menu item from this menu.

For each item extract:
- name (exact as written)
- description (if present)
- price (number, no $ symbol)
- category/section heading it appears under (e.g. "Starters", "Signature Cocktails", "Mains")
- any tags you can infer: "signature", "vegetarian", "vegan", "spicy", "seasonal"

Also extract all section/category names in the order they appear.

Return ONLY valid JSON (no markdown):
{
  "restaurant_name": "string or null",
  "menu_type": "dinner|lunch|brunch|bar|tasting",
  "sections": [
    { "name": "section name", "sort_order": 0 }
  ],
  "items": [
    {
      "name": "item name",
      "description": "description or null",
      "price": 0.00,
      "section": "section name this item belongs to",
      "category": "food|beverage|dessert|cocktail",
      "tags": ["signature","vegetarian","vegan","spicy","seasonal"],
      "is_signature": false
    }
  ]
}

Be thorough — extract every single item. If a price is not visible, use null.`;

  const text = await callClaude({
    content: [fileContent, { type:'text', text:prompt }],
    maxTokens: 4000,
    timeoutMs: 60000,
  });

  let parsed;
  try { parsed = JSON.parse(text.replace(/```json?|```/g,'').trim()); }
  catch(_) { throw new Error('Could not parse menu data from file — try a clearer image or PDF'); }

  // Persist sections
  const sectionMap = {};
  for (let i=0; i<(parsed.sections||[]).length; i++) {
    const sec = parsed.sections[i];
    const r = await adminQuery(`
      INSERT INTO menu_sections (tenant_id, location_id, name, menu_type, sort_order)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING RETURNING *
    `, [tenantId, locationId||null, sec.name, parsed.menu_type||'dinner', i]);
    // If conflict, fetch existing
    const existing = r.rows[0] || (await adminQuery(
      'SELECT * FROM menu_sections WHERE tenant_id=$1 AND name=$2 LIMIT 1',
      [tenantId, sec.name]
    )).rows[0];
    if (existing) sectionMap[sec.name] = existing.id;
  }

  // Persist items
  const created = [];
  for (let i=0; i<(parsed.items||[]).length; i++) {
    const item = parsed.items[i];
    const sectionId = item.section ? sectionMap[item.section] || null : null;
    const r = await adminQuery(`
      INSERT INTO menu_items
        (tenant_id, location_id, section_id, name, description, price, category, tags, is_signature, available, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
      ON CONFLICT DO NOTHING RETURNING *
    `, [tenantId, locationId||null, sectionId, item.name, item.description||null,
        item.price||null, item.category||null,
        Array.isArray(item.tags)?item.tags:'{}',
        item.is_signature||item.tags?.includes('signature')||false, i]);
    if (r.rows[0]) created.push(r.rows[0]);
  }

  return {
    restaurant_name: parsed.restaurant_name,
    menu_type:       parsed.menu_type,
    sections_created: Object.keys(sectionMap).length,
    items_created:   created.length,
    items_total:     (parsed.items||[]).length,
    sections:        parsed.sections||[],
    items:           created,
  };
}

module.exports = {
  AGENT_ID, ensureTables,
  getSections, upsertSection, deleteSection,
  getMenuItems, upsertMenuItem, deleteMenuItem, upsertSales,
  getMatrix, generatePricingSuggestions, getPriceSuggestions,
  applyPriceSuggestion, dismissPriceSuggestion,
  getMenuOptimizations, importFromRecipes, simulatePriceChange,
  getSummary, scanMenu,
};
