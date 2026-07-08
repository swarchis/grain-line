// ─── Recipe Management & Costing ──────────────────────────────────────────────
// Sits inside Agent 3 (Inventory). Uses inventory_items as the ingredient source.
//
// Key concepts:
//   Recipe   — a dish or bulk prep item with a yield (e.g. "Butter Chicken, serves 1"
//              or "Makhani Sauce, yields 10L")
//   Sub-recipe — a recipe used as an ingredient in another recipe (e.g. Makhani Sauce
//               inside Butter Chicken). Cost flows through automatically.
//   Costing  — per-portion cost = total cost ÷ yield_qty
//              Food cost % = portion cost ÷ menu price × 100

const { adminQuery, queryForTenant } = require('@restaurantos/db');

// ── Ensure tables ──────────────────────────────────────────────────────────────
async function ensureRecipeTables() {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS recipes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      name            VARCHAR(300) NOT NULL,
      description     TEXT,
      category        VARCHAR(100),
      type            VARCHAR(20) NOT NULL DEFAULT 'dish',
      yield_qty       NUMERIC(10,3) NOT NULL DEFAULT 1,
      yield_unit      VARCHAR(30) NOT NULL DEFAULT 'portion',
      menu_price      NUMERIC(10,2),
      active          BOOLEAN NOT NULL DEFAULT true,
      notes           TEXT,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      recipe_id         UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_type   VARCHAR(20) NOT NULL DEFAULT 'item',
      inventory_item_id UUID,
      sub_recipe_id     UUID,
      name              VARCHAR(300),
      qty               NUMERIC(10,4) NOT NULL,
      unit              VARCHAR(30) NOT NULL,
      unit_cost         NUMERIC(10,4),
      notes             TEXT,
      sort_order        INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE INDEX IF NOT EXISTS recipes_tenant ON recipes(tenant_id)
  `).catch(() => {});
  await adminQuery(`
    CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe ON recipe_ingredients(recipe_id)
  `).catch(() => {});
  // xtraCHEF parity columns (June 12, 2026)
  for (const sql of [
    "ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shelf_life VARCHAR(50)",
    "ALTER TABLE recipes ADD COLUMN IF NOT EXISTS prep_time_mins INTEGER",
    "ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time_mins INTEGER",
    "ALTER TABLE recipes ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(10,2)",
    "ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS yield_pct NUMERIC(6,2) DEFAULT 100",
  ]) await adminQuery(sql).catch(() => {});
}

// ── Unit conversion helpers ────────────────────────────────────────────────────
// Converts a recipe line's unit to the ingredient's purchase unit for costing
const UNIT_CONVERSIONS = {
  // Weight
  kg: { g: 0.001, lb: 0.453592, oz: 0.0283495 },
  g:  { kg: 1000, lb: 453.592, oz: 28.3495 },
  lb: { kg: 2.20462, g: 2204.62, oz: 16 },
  oz: { kg: 35.274, g: 35274, lb: 0.0625 },
  // Volume
  l:    { ml: 0.001, qt: 0.946353, gal: 3.78541, cup: 0.236588, tbsp: 0.0147868, tsp: 0.00492892, floz: 0.0295735 },
  ml:   { l: 1000, qt: 946353, gal: 3785410, cup: 236588, tbsp: 14786.8, tsp: 4928.92, floz: 29573.5 },
  qt:   { l: 1.05669, ml: 1056.69, gal: 4, cup: 4 },
  gal:  { l: 0.264172, ml: 264.172, qt: 0.25, cup: 0.0625 },
  cup:  { l: 4.22675, ml: 4226.75, qt: 0.25, tbsp: 0.0625 },
  tbsp: { l: 67.628, ml: 67628, cup: 16, tsp: 3 },
  tsp:  { l: 202.884, ml: 202884, tbsp: 0.333 },
  floz: { l: 33.814, ml: 33814, cup: 8 },
};

function convertUnit(qty, fromUnit, toUnit) {
  if (fromUnit === toUnit) return qty;
  const from = fromUnit?.toLowerCase();
  const to   = toUnit?.toLowerCase();
  if (UNIT_CONVERSIONS[from]?.[to]) return qty * UNIT_CONVERSIONS[from][to];
  return null; // incompatible units — return null, cost will be manual
}

// ── Cost calculation ───────────────────────────────────────────────────────────
async function calcIngredientCost(tenantId, line) {
  // Usable yield (xtraCHEF parity): computing 2 cups of an 80%-yield item costs 2/0.8 cups of purchases.
  const yieldFactor = (line.yield_pct != null && parseFloat(line.yield_pct) > 0) ? parseFloat(line.yield_pct) / 100 : 1;
  // If unit_cost is manually set, use it (imported costs are already yield-adjusted)
  if (line.unit_cost != null) return parseFloat(line.unit_cost) * parseFloat(line.qty);

  if (line.ingredient_type === 'sub_recipe' && line.sub_recipe_id) {
    // Get sub-recipe cost per yield unit
    const sub = await getRecipeWithCost(tenantId, line.sub_recipe_id);
    if (!sub) return 0;
    const subPortionCost = sub.total_cost / parseFloat(sub.yield_qty);
    // Convert recipe units if needed
    const converted = convertUnit(parseFloat(line.qty), line.unit, sub.yield_unit);
    return (converted ?? parseFloat(line.qty)) * subPortionCost;
  }

  if (line.inventory_item_id) {
    const item = await adminQuery(
      'SELECT last_price, avg_price_3, unit FROM inventory_items WHERE id=$1 AND tenant_id=$2',
      [line.inventory_item_id, tenantId]
    );
    if (!item.rows[0]) return 0;
    const pricePerUnit = parseFloat(item.rows[0].avg_price_3 || item.rows[0].last_price || 0);
    const converted    = convertUnit(parseFloat(line.qty), line.unit, item.rows[0].unit);
    return ((converted ?? parseFloat(line.qty)) * pricePerUnit) / yieldFactor;
  }

  return 0;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
async function getRecipes(tenantId, { locationId, category, type, search } = {}) {
  await ensureRecipeTables();
  let where = 'r.tenant_id=$1 AND r.active=true';
  const params = [tenantId]; let i = 2;

  if (locationId) {
    where += ` AND (r.location_id=$${i++} OR r.location_id IS NULL)`;
    params.push(locationId);
  }
  if (category) { where += ` AND r.category=$${i++}`;  params.push(category); }
  if (type)     { where += ` AND r.type=$${i++}`;      params.push(type); }
  if (search)   { where += ` AND r.name ILIKE $${i++}`;params.push(`%${search}%`); }

  const r = await adminQuery(`
    SELECT r.*,
      COUNT(ri.id) as ingredient_count,
      l.name as location_name
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    LEFT JOIN locations l ON l.id = r.location_id
    WHERE ${where}
    GROUP BY r.id, l.name
    ORDER BY r.category, r.name
  `, params);

  // Attach live costs
  const recipes = await Promise.all(r.rows.map(async rec => {
    const cost = await calcRecipeCost(tenantId, rec.id);
    return { ...rec, ...cost };
  }));

  return recipes;
}

async function getRecipeWithCost(tenantId, recipeId) {
  await ensureRecipeTables();
  const r = await adminQuery(
    'SELECT * FROM recipes WHERE id=$1 AND tenant_id=$2',
    [recipeId, tenantId]
  );
  if (!r.rows[0]) return null;
  const cost = await calcRecipeCost(tenantId, recipeId);
  return { ...r.rows[0], ...cost };
}

async function calcRecipeCost(tenantId, recipeId) {
  const lines = await adminQuery(
    'SELECT * FROM recipe_ingredients WHERE recipe_id=$1 ORDER BY sort_order, created_at',
    [recipeId]
  );

  let totalCost = 0;
  const linesWithCost = await Promise.all(lines.rows.map(async line => {
    const lineCost = await calcIngredientCost(tenantId, line);
    totalCost += lineCost;
    return { ...line, line_cost: lineCost };
  }));

  const recipe = await adminQuery('SELECT yield_qty, menu_price FROM recipes WHERE id=$1', [recipeId]);
  const rec    = recipe.rows[0] || {};
  const yieldQty    = parseFloat(rec.yield_qty || 1);
  const menuPrice   = parseFloat(rec.menu_price || 0);
  const portionCost = totalCost / yieldQty;
  const foodCostPct = menuPrice > 0 ? (portionCost / menuPrice) * 100 : null;

  return {
    ingredients:    linesWithCost,
    total_cost:     Math.round(totalCost * 10000) / 10000,
    portion_cost:   Math.round(portionCost * 10000) / 10000,
    food_cost_pct:  foodCostPct ? Math.round(foodCostPct * 100) / 100 : null,
  };
}

async function createRecipe(tenantId, data) {
  await ensureRecipeTables();
  const { locationId, name, description, category, type, yieldQty, yieldUnit,
          menuPrice, notes, ingredients, createdBy } = data;

  const r = await adminQuery(`
    INSERT INTO recipes
      (tenant_id, location_id, name, description, category, type,
       yield_qty, yield_unit, menu_price, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [tenantId, locationId||null, name, description||null, category||null,
      type||'dish', yieldQty||1, yieldUnit||'portion', menuPrice||null,
      notes||null, createdBy||null]);

  const recipe = r.rows[0];

  // Insert ingredients
  if (ingredients?.length) {
    for (let i = 0; i < ingredients.length; i++) {
      await addIngredientLine(tenantId, recipe.id, { ...ingredients[i], sortOrder: i });
    }
  }

  return getRecipeWithCost(tenantId, recipe.id);
}

async function updateRecipe(tenantId, recipeId, data) {
  await ensureRecipeTables();
  const allowed = ['name','description','category','type','yield_qty','yield_unit',
                   'menu_price','notes','active','location_id'];
  const updates = [], values = []; let i = 1;
  for (const [k,v] of Object.entries(data)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase → snake_case
    if (allowed.includes(col)) { updates.push(`${col}=$${i++}`); values.push(v); }
  }
  if (!updates.length) return getRecipeWithCost(tenantId, recipeId);
  values.push(recipeId, tenantId);
  await adminQuery(
    `UPDATE recipes SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1}`,
    values
  );
  return getRecipeWithCost(tenantId, recipeId);
}

async function deleteRecipe(tenantId, recipeId) {
  // Soft delete
  await adminQuery(
    'UPDATE recipes SET active=false, updated_at=now() WHERE id=$1 AND tenant_id=$2',
    [recipeId, tenantId]
  );
  return { ok: true };
}

// ── Ingredient lines ───────────────────────────────────────────────────────────
async function addIngredientLine(tenantId, recipeId, data) {
  const { ingredientType, inventoryItemId, subRecipeId, name, qty, unit,
          unitCost, notes, sortOrder } = data;

  // Auto-fetch item name if not provided
  let resolvedName = name;
  if (!resolvedName && inventoryItemId) {
    const item = await adminQuery('SELECT name FROM inventory_items WHERE id=$1', [inventoryItemId]);
    resolvedName = item.rows[0]?.name;
  }
  if (!resolvedName && subRecipeId) {
    const sub = await adminQuery('SELECT name FROM recipes WHERE id=$1', [subRecipeId]);
    resolvedName = sub.rows[0]?.name;
  }

  const r = await adminQuery(`
    INSERT INTO recipe_ingredients
      (tenant_id, recipe_id, ingredient_type, inventory_item_id, sub_recipe_id,
       name, qty, unit, unit_cost, notes, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [tenantId, recipeId, ingredientType||'item', inventoryItemId||null,
      subRecipeId||null, resolvedName||null, qty, unit, unitCost||null,
      notes||null, sortOrder||0]);

  return r.rows[0];
}

async function updateIngredientLine(tenantId, lineId, data) {
  const allowed = ['qty','unit','unit_cost','notes','sort_order'];
  const updates = [], values = []; let i = 1;
  for (const [k,v] of Object.entries(data)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) { updates.push(`${col}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'),{status:400});
  values.push(lineId, tenantId);
  const r = await adminQuery(
    `UPDATE recipe_ingredients SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function deleteIngredientLine(tenantId, lineId) {
  await adminQuery(
    'DELETE FROM recipe_ingredients WHERE id=$1 AND tenant_id=$2',
    [lineId, tenantId]
  );
  return { ok: true };
}

// ── Costing report ─────────────────────────────────────────────────────────────
async function getCostingReport(tenantId, { locationId, category } = {}) {
  const recipes = await getRecipes(tenantId, { locationId, category });
  const grouped = {};
  for (const r of recipes) {
    const cat = r.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  }

  const summary = {
    total_recipes:        recipes.length,
    avg_food_cost_pct:    recipes.filter(r=>r.food_cost_pct).reduce((s,r)=>s+r.food_cost_pct,0) / (recipes.filter(r=>r.food_cost_pct).length||1),
    high_cost_recipes:    recipes.filter(r=>r.food_cost_pct > 35).length,
    missing_prices:       recipes.filter(r=>!r.menu_price).length,
  };

  return { summary, by_category: grouped, recipes };
}

module.exports = {
  ensureRecipeTables,
  getRecipes, getRecipeWithCost, calcRecipeCost,
  createRecipe, updateRecipe, deleteRecipe,
  addIngredientLine, updateIngredientLine, deleteIngredientLine,
  getCostingReport, convertUnit,
};
