#!/usr/bin/env node
// Import an xtraCHEF (Toast) prep-recipe CSV export into Pulse recipes.
// Usage:
//   cd apps/api
//   DATABASE_URL=postgres://… node import_xtrachef_recipe.js "~/Downloads/Walnut Butter Crust_San Francisco_20260612_141048.csv" "Rooh SF"
// Args: <csv path> <location name (or unique fragment, e.g. "Alora")>
// Idempotent: re-running replaces the recipe's ingredient lines.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

const TENANT = 'fae33a6d-1124-48ac-bff8-3a734072acad'; // Rivaaz Restaurant Group

// ── CSV: char-walk parser (gotcha #5 — quoted commas like "Butter, Unsalted") ──
function parseCsv(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const clean$ = v => { const n = parseFloat(String(v||'').replace(/[$,%\s]/g,'')); return isNaN(n) ? null : n; };
const UNIT_MAP = { pound:'lb', pounds:'lb', lb:'lb', lbs:'lb', ounce:'oz', ounces:'oz', oz:'oz',
  gram:'g', grams:'g', g:'g', kg:'kg', kilogram:'kg', quart:'qt', quarts:'qt', qt:'qt',
  gallon:'gal', gallons:'gal', gal:'gal', cup:'cup', cups:'cup', pint:'pint', pints:'pint',
  each:'each', ea:'each', liter:'l', l:'l', ml:'ml', tbsp:'tbsp', tsp:'tsp', bunch:'bunch', case:'case' };

function parseMeasurement(m) {
  const t = String(m||'').trim();
  const match = t.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return { qty: 1, unit: 'each' };
  const qty = parseFloat(match[1]);
  const rawUnit = (match[2]||'each').trim().toLowerCase();
  return { qty: isNaN(qty) ? 1 : qty, unit: UNIT_MAP[rawUnit] || rawUnit || 'each' };
}

// Find a labeled value anywhere in the sheet: the cell to the right of a label,
// or the cell in the row beneath a header row (xtraCHEF uses both layouts).
const KNOWN_LABELS = new Set(['type','portion','portion size','batch size','shelf life','preprecipe yield',
  'prep time','cook time','food cost','labor cost','prime cost','unit cost','date & time','location',
  'prep recipe name','recipe name','ingredient','measurement','yield','usable yield','cost'].map(s=>s));
function findLabeled(rows, label) {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].findIndex(x => String(x).trim().toLowerCase() === label.toLowerCase());
    if (c >= 0) {
      const right = String(rows[r][c+1] ?? '').trim();
      // In xtraCHEF header rows the right neighbor is another LABEL — value lives in the row beneath
      if (right !== '' && !KNOWN_LABELS.has(right.toLowerCase())) return right;
      const below = String((rows[r+1] && rows[r+1][c]) ?? '').trim();
      if (below !== '') return below;
    }
  }
  return null;
}

(async () => {
  const [,, csvArg, locArg] = process.argv;
  if (!csvArg) { console.error('Usage: node import_xtrachef_recipe.js <csv path> <location name>'); process.exit(1); }
  if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
  const csvPath = csvArg.replace(/^~(?=$|\/)/, os.homedir());
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  const q = (sql, params) => pool.query(sql, params);

  try {
    // ── Header fields ──
    const name = findLabeled(rows, 'Prep Recipe Name') || findLabeled(rows, 'Recipe Name');
    if (!name) throw new Error('Could not find "Prep Recipe Name" in the CSV — is this an xtraCHEF recipe export?');
    const isPrep    = findLabeled(rows, 'Prep Recipe Name') != null;
    const shelfLife = (findLabeled(rows, 'Shelf Life') || '').trim() || null;
    const minsOf    = l => { const v = clean$((findLabeled(rows, l)||'').replace(/mins?/i,'')); return v && v > 0 ? Math.round(v) : null; };
    const prepMins  = minsOf('Prep Time'), cookMins = minsOf('Cook Time');
    const laborCost = clean$(findLabeled(rows, 'Labor Cost'));
    const batchSize = (findLabeled(rows, 'Batch Size') || '').trim();
    const batch     = batchSize ? parseMeasurement(batchSize) : { qty: 1, unit: 'batch' };

    // ── Location ──
    const locs = (await q('SELECT id, name FROM locations WHERE tenant_id=$1', [TENANT])).rows;
    let loc = null;
    if (locArg) loc = locs.find(l => l.name.toLowerCase().includes(locArg.toLowerCase()));
    if (!loc && locs.length === 1) loc = locs[0];
    if (!loc) { console.error(`Location not matched. Pass one of: ${locs.map(l=>l.name).join(' | ')}`); process.exit(1); }

    // ── Ingredient rows: between the "Ingredient,Type,Measurement…" header and EOF ──
    const hdrIdx = rows.findIndex(r => String(r[0]).trim() === 'Ingredient');
    if (hdrIdx < 0) throw new Error('Ingredient header row not found');
    const ingRows = rows.slice(hdrIdx+1).filter(r => String(r[0]||'').trim() !== '');

    // ── Upsert recipe (idempotent by tenant+name) ──
    const existing = await q('SELECT id FROM recipes WHERE tenant_id=$1 AND lower(name)=lower($2)', [TENANT, name]);
    let recipeId;
    if (existing.rows.length) {
      recipeId = existing.rows[0].id;
      await q(`UPDATE recipes SET type=$1, yield_qty=$2, yield_unit=$3, shelf_life=$4,
               prep_time_mins=$5, cook_time_mins=$6, labor_cost=$7, location_id=$8, updated_at=now()
               WHERE id=$9 AND tenant_id=$10`,
        [isPrep?'prep':'dish', batch.qty, batch.unit, shelfLife, prepMins, cookMins, laborCost, loc.id, recipeId, TENANT]);
      await q('DELETE FROM recipe_ingredients WHERE recipe_id=$1 AND tenant_id=$2', [recipeId, TENANT]);
      console.log(`Updating existing recipe "${name}" (${recipeId}) — ingredient lines replaced`);
    } else {
      const r = await q(`INSERT INTO recipes (tenant_id, location_id, name, type, yield_qty, yield_unit,
               shelf_life, prep_time_mins, cook_time_mins, labor_cost, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Imported from xtraCHEF') RETURNING id`,
        [TENANT, loc.id, name, isPrep?'prep':'dish', batch.qty, batch.unit, shelfLife, prepMins, cookMins, laborCost]);
      recipeId = r.rows[0].id;
      console.log(`Created recipe "${name}" (${recipeId}) at ${loc.name}`);
    }

    // ── Ingredient lines ──
    let total = 0, sort = 0; const unmatchedPrep = [];
    for (const r of ingRows) {
      const [ing, type, measurement, , usableYield, cost] = r.map(x => String(x||'').trim());
      const { qty, unit } = parseMeasurement(measurement);
      const lineCost = clean$(cost) ?? 0;
      const unitCost = qty > 0 ? lineCost / qty : lineCost;
      const yieldPct = clean$(usableYield) ?? 100;
      total += lineCost; sort++;

      let ingredientType = 'item', invItemId = null, subRecipeId = null;
      if (/prep\s*recipe/i.test(type)) {
        const sub = await q('SELECT id FROM recipes WHERE tenant_id=$1 AND lower(name)=lower($2)', [TENANT, ing]);
        if (sub.rows.length) { ingredientType = 'sub_recipe'; subRecipeId = sub.rows[0].id; }
        else unmatchedPrep.push(ing);
      } else {
        const item = await q(
          `SELECT id FROM inventory_items WHERE tenant_id=$1 AND active=true AND lower(name)=lower($2)
           UNION ALL
           SELECT id FROM inventory_items WHERE tenant_id=$1 AND active=true AND name ILIKE '%'||$2||'%' LIMIT 1`,
          [TENANT, ing]);
        if (item.rows.length) invItemId = item.rows[0].id;
      }
      // unit_cost always carried from xtraCHEF so costs match exactly even when unmatched
      await q(`INSERT INTO recipe_ingredients (tenant_id, recipe_id, ingredient_type, inventory_item_id,
               sub_recipe_id, name, qty, unit, unit_cost, yield_pct, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [TENANT, recipeId, ingredientType, invItemId, subRecipeId, ing, qty, unit, unitCost, yieldPct, sort]);
      console.log(`  + ${ing}  ${qty} ${unit}  $${lineCost.toFixed(2)}${invItemId?'  [matched item]':subRecipeId?'  [sub-recipe]':''}`);
    }

    console.log(`\nImported ${sort} ingredients · food cost $${total.toFixed(2)}` +
      (laborCost ? ` · labor $${laborCost.toFixed(2)} · prime $${(total+laborCost).toFixed(2)}` : ''));
    const fc = clean$(findLabeled(rows, 'Food Cost'));
    if (fc != null && Math.abs(fc - total) > 0.05) console.log(`⚠ xtraCHEF header food cost $${fc.toFixed(2)} differs from line sum $${total.toFixed(2)} — check the export`);
    if (unmatchedPrep.length) console.log(`⚠ Sub-recipes not in Pulse yet (imported as plain lines with their cost): ${unmatchedPrep.join(', ')} — export those from xtraCHEF and import them too, then re-run this import to link them.`);
  } finally { await pool.end(); }
})().catch(e => { console.error('IMPORT FAILED:', e.message); process.exit(1); });
