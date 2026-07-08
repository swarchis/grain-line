// Agent 3: Inventory Management
// Invoice scanning (Claude Vision), item catalog, physical counts, COGS
require('dotenv').config();
const { once } = require('../../lib/tableCache');
const { queryForTenant, adminQuery } = require('@restaurantos/db');
const { eventBus } = require('../../lib/eventBus');

const AGENT_ID   = 'agent_3_inventory';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

async function apiFetch(url, opts = {}) {
  const fetch = (await import('node-fetch')).default;
  return fetch(url, opts);
}

// ── Ensure tables ─────────────────────────────────────────────────────────────
const ensureTables = once('agent3', async function() {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      name            VARCHAR(200) NOT NULL,
      category        VARCHAR(50)  NOT NULL DEFAULT 'food',
      sub_category    VARCHAR(100),
      unit            VARCHAR(30)  NOT NULL DEFAULT 'each',
      storage_area    VARCHAR(50)  NOT NULL DEFAULT 'dry_storage',
      vendor          VARCHAR(100),
      vendor_sku      VARCHAR(100),
      par_level       NUMERIC(10,3),
      reorder_point   NUMERIC(10,3),
      last_price      NUMERIC(10,4),
      avg_price_3     NUMERIC(10,4),
      avg_price_6     NUMERIC(10,4),
      price_history   JSONB NOT NULL DEFAULT '[]',
      active          BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      title           VARCHAR(200),
      vendor          VARCHAR(200),
      status          VARCHAR(20) NOT NULL DEFAULT 'draft',
      notes           TEXT,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      order_id          UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_name         VARCHAR(200) NOT NULL,
      unit              VARCHAR(30),
      vendor            VARCHAR(200),
      vendor_sku        VARCHAR(100),
      par_level         NUMERIC(10,3),
      current_stock     NUMERIC(10,3),
      order_qty         NUMERIC(10,3) NOT NULL,
      unit_price        NUMERIC(10,4),
      notes             TEXT,
      sort_order        INTEGER DEFAULT 0
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS invoices (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      vendor          VARCHAR(200),
      invoice_number  VARCHAR(100),
      invoice_date    DATE,
      delivery_date   DATE,
      total_amount    NUMERIC(12,2),
      status          VARCHAR(30) NOT NULL DEFAULT 'pending_review',
      raw_text        TEXT,
      scan_confidence NUMERIC(4,2),
      file_url        TEXT,
      category        VARCHAR(20) NOT NULL DEFAULT 'food',
      notes           TEXT,
      approved_by     UUID,
      approved_at     TIMESTAMPTZ,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      tenant_id       UUID NOT NULL,
      inventory_item_id UUID REFERENCES inventory_items(id),
      description     VARCHAR(300) NOT NULL,
      quantity        NUMERIC(10,3),
      unit            VARCHAR(30),
      unit_price      NUMERIC(10,4),
      total_price     NUMERIC(12,2),
      matched         BOOLEAN NOT NULL DEFAULT false,
      flagged         BOOLEAN NOT NULL DEFAULT false,
      flag_reason     VARCHAR(200),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

    await adminQuery(`
    CREATE TABLE IF NOT EXISTS vendors (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL,
      name           VARCHAR(200) NOT NULL,
      category       VARCHAR(50) DEFAULT 'food',
      contact_name   VARCHAR(150),
      phone          VARCHAR(50),
      email          VARCHAR(200),
      address        TEXT,
      account_number VARCHAR(100),
      payment_terms  VARCHAR(100),
      website        VARCHAR(300),
      notes          TEXT,
      source         VARCHAR(20) DEFAULT 'manual',
      active         BOOLEAN DEFAULT true,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch(() => {});
  await adminQuery('CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_name ON vendors(tenant_id, lower(trim(name)))').catch(() => {});
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      count_date      DATE NOT NULL,
      period_start    DATE,
      period_end      DATE,
      category        VARCHAR(20) NOT NULL DEFAULT 'food',
      status          VARCHAR(30) NOT NULL DEFAULT 'in_progress',
      total_value     NUMERIC(12,2),
      notes           TEXT,
      counted_by      UUID,
      submitted_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  // Migrate existing tables — add missing columns if they don't exist
  const migrations = [
    // Fix old schema: period column was NOT NULL, make it nullable
    "ALTER TABLE inventory_counts ALTER COLUMN period DROP NOT NULL",
    // Rename old period column to period_legacy to avoid conflicts (ignore if doesn't exist)
    "DO $ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_counts' AND column_name='period') THEN ALTER TABLE inventory_counts RENAME COLUMN period TO period_legacy; END IF; END $",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS count_date DATE",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS period_start DATE",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS period_end DATE",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'food'",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'in_progress'",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS total_value NUMERIC(12,2)",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS counted_by UUID",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ",
    "ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS location_id UUID",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS storage_area VARCHAR(50) DEFAULT 'dry_storage'",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor_sku VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS par_level NUMERIC(10,3)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(10,3)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS avg_price_3 NUMERIC(10,4)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS avg_price_6 NUMERIC(10,4)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]'",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()",
    "ALTER TABLE inventory_count_lines ADD COLUMN IF NOT EXISTS storage_area VARCHAR(50)",
    "ALTER TABLE inventory_count_lines ADD COLUMN IF NOT EXISTS notes TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_items_tenant_name ON inventory_items (tenant_id, LOWER(name), COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))",
  ];
  for (const sql of migrations) {
    await adminQuery(sql).catch(() => {});
  }

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS inventory_count_lines (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      count_id            UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
      inventory_item_id   UUID REFERENCES inventory_items(id),
      tenant_id           UUID NOT NULL,
      item_name           VARCHAR(200) NOT NULL,
      unit                VARCHAR(30),
      storage_area        VARCHAR(50),
      quantity            NUMERIC(10,3),
      unit_price          NUMERIC(10,4),
      total_value         NUMERIC(12,2),
      notes               TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  // Backfill vendor on existing catalog items from their invoice history
  await adminQuery(`
    UPDATE inventory_items ii
    SET vendor = sub.vendor
    FROM (
      SELECT DISTINCT ON (li.inventory_item_id)
        li.inventory_item_id, i.vendor
      FROM invoice_line_items li
      JOIN invoices i ON i.id = li.invoice_id
      WHERE li.inventory_item_id IS NOT NULL
        AND i.vendor IS NOT NULL AND i.vendor != ''
      ORDER BY li.inventory_item_id, i.created_at DESC
    ) sub
    WHERE ii.id = sub.inventory_item_id
      AND (ii.vendor IS NULL OR ii.vendor = '')
  `).catch(() => {});
});

// ── INVOICE SCANNING ──────────────────────────────────────────────────────────
async function scanInvoice(tenantId, { imageBase64, mimeType, locationId, category, userId }) {
  await ensureTables();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  // Call Claude Vision to extract invoice data
  const prompt = `You are a restaurant inventory expert. Extract ALL line items from this vendor invoice.

Return ONLY valid JSON with this exact structure:
{
  "vendor": "vendor name",
  "invoice_number": "invoice # if visible",
  "invoice_date": "YYYY-MM-DD or null",
  "total_amount": 0.00,
  "line_items": [
    {
      "description": "exact item name from invoice",
      "quantity": 0.00,
      "unit": "CS/EA/LB/OZ/GAL/etc",
      "unit_price": 0.00,
      "total_price": 0.00,
      "category": "produce/meat/dairy/dry/beverage/cleaning/paper/other"
    }
  ],
  "confidence": 0.95
}

Be precise with quantities and prices. If a field is not visible, use null.`;

  const res = await apiFetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Claude Vision error');

  const text = (data.content || []).map(b => b.text || '').join('').trim();
  let extracted;
  try { extracted = JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch(_) { throw new Error('Could not parse invoice data from image'); }

  // Save invoice to DB
  const invoiceResult = await queryForTenant(tenantId, `
    INSERT INTO invoices (tenant_id, location_id, vendor, invoice_number, invoice_date, total_amount, status, raw_text, scan_confidence, category, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,'pending_review',$7,$8,$9,$10) RETURNING *
  `, [tenantId, locationId||null, extracted.vendor, extracted.invoice_number, extracted.invoice_date, extracted.total_amount, text, extracted.confidence, category||'food', userId||null]);

  const invoice = invoiceResult.rows[0];

  // Save line items + try to match to existing catalog items
  const lineItems = [];
  for (const item of (extracted.line_items || [])) {
    // Try to match to existing inventory item (fuzzy name match)
    const matchResult = await queryForTenant(tenantId, `
      SELECT id, name, last_price FROM inventory_items
      WHERE tenant_id = $1
      AND (location_id = $2 OR location_id IS NULL)
      AND active = true
      AND LOWER(name) LIKE LOWER($3)
      LIMIT 1
    `, [tenantId, locationId||null, `%${item.description.split(' ')[0]}%`]);

    const match = matchResult.rows[0];
    let flagged = false, flagReason = null;

    // Flag price increases > 10%
    if (match?.last_price && item.unit_price) {
      const pctChange = ((item.unit_price - match.last_price) / match.last_price) * 100;
      if (pctChange > 10) {
        flagged = true;
        flagReason = `Price up ${pctChange.toFixed(0)}% (was $${match.last_price})`;
      }
    }

    const liResult = await queryForTenant(tenantId, `
      INSERT INTO invoice_line_items (invoice_id, tenant_id, inventory_item_id, description, quantity, unit, unit_price, total_price, matched, flagged, flag_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [invoice.id, tenantId, match?.id||null, item.description, item.quantity, item.unit, item.unit_price, item.total_price, !!match, flagged, flagReason]);

    lineItems.push(liResult.rows[0]);
  }

  return { invoice, lineItems, extracted };
}

// ── Approve invoice + update catalog prices ───────────────────────────────────
async function approveInvoice(tenantId, invoiceId, userId) {
  const check = await queryForTenant(tenantId, 'SELECT status FROM invoices WHERE id=$1 AND tenant_id=$2', [invoiceId, tenantId]);
  if (check.rows[0]?.status === 'approved') return { ok:true, skipped:true };
  // Update invoice status
  await queryForTenant(tenantId, `
    UPDATE invoices SET status='approved', approved_by=$1, approved_at=now(), updated_at=now()
    WHERE id=$2 AND tenant_id=$3
  `, [userId||null, invoiceId, tenantId]);

  // Update prices in catalog for matched items
  // Get invoice vendor for propagation to catalog items
  const invoiceRow = await queryForTenant(tenantId, 'SELECT vendor FROM invoices WHERE id=$1', [invoiceId]);
  const invoiceVendor = invoiceRow.rows[0]?.vendor || null;
  // Auto-capture vendor into the directory (no-op if already present)
  if (invoiceVendor && invoiceVendor.trim()) {
    await adminQuery(
      `INSERT INTO vendors (tenant_id, name, category, source) VALUES ($1,$2,'food','invoice')
       ON CONFLICT (tenant_id, lower(trim(name))) DO NOTHING`,
      [tenantId, invoiceVendor.trim()]).catch(() => {});
  }

  const lineItems = await queryForTenant(tenantId, `
    SELECT * FROM invoice_line_items WHERE invoice_id=$1 AND matched=true AND inventory_item_id IS NOT NULL
  `, [invoiceId]);

  for (const li of lineItems.rows) {
    if (!li.unit_price) continue;
    // Get current price history
    const itemResult = await queryForTenant(tenantId, 'SELECT price_history, last_price FROM inventory_items WHERE id=$1', [li.inventory_item_id]);
    const item = itemResult.rows[0];
    if (!item) continue;

    const history = item.price_history || [];
    history.push({ price: parseFloat(li.unit_price), date: new Date().toISOString() });
    const recent = history.slice(-9).map(h => h.price);
    const avg3 = recent.slice(-3).reduce((a,b)=>a+b,0) / Math.min(3, recent.length);
    const avg6 = recent.slice(-6).reduce((a,b)=>a+b,0) / Math.min(6, recent.length);

    // Update price AND vendor (if item has no vendor set yet, or always update to latest)
    await queryForTenant(tenantId, `
      UPDATE inventory_items
      SET last_price=$1, avg_price_3=$2, avg_price_6=$3, price_history=$4,
          vendor=COALESCE(vendor, $5),
          updated_at=now()
      WHERE id=$6 AND tenant_id=$7
    `, [li.unit_price, avg3.toFixed(4), avg6.toFixed(4), JSON.stringify(history.slice(-20)),
        li.vendor || invoiceVendor, li.inventory_item_id, tenantId]);
  }

  // Auto-add unmatched items to catalog
  const unmatched = await queryForTenant(tenantId, `
    SELECT li.*, i.location_id FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id
    WHERE li.invoice_id=$1 AND li.matched=false
  `, [invoiceId]);

  for (const li of unmatched.rows) {
    // Case-insensitive name check before insert
    const dup = await queryForTenant(tenantId,
      'SELECT id FROM inventory_items WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) AND (location_id=$3 OR location_id IS NULL) LIMIT 1',
      [tenantId, li.description, li.location_id||null]);
    if (dup.rows[0]) {
      // Already exists — update price and vendor, mark as matched
      await queryForTenant(tenantId,
        `UPDATE inventory_items
          SET last_price=COALESCE($1, last_price),
              vendor=COALESCE(vendor, $2),
              vendor_sku=COALESCE(vendor_sku, $3),
              updated_at=now()
          WHERE id=$4`,
        [li.unit_price||null, li.vendor||invoiceVendor||null, li.vendor_sku||null, dup.rows[0].id]);
      await queryForTenant(tenantId,
        'UPDATE invoice_line_items SET matched=true, inventory_item_id=$1 WHERE id=$2',
        [dup.rows[0].id, li.id]);
    } else {
      const newItem = await queryForTenant(tenantId,
        'INSERT INTO inventory_items (tenant_id,location_id,name,unit,last_price,vendor,vendor_sku,price_history) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [tenantId, li.location_id||null, li.description, li.unit||'each', li.unit_price,
         li.vendor || invoiceVendor || null,
         li.vendor_sku || null,
         JSON.stringify([{price:parseFloat(li.unit_price||0),date:new Date().toISOString()}])]);
      if (newItem.rows[0]) {
        await queryForTenant(tenantId,
          'UPDATE invoice_line_items SET matched=true, inventory_item_id=$1 WHERE id=$2',
          [newItem.rows[0].id, li.id]);
      }
    }
  }

  // Publish event to Agent 2
  await eventBus.publish({ eventType:'inventory.invoice.approved', tenantId, sourceAgent:AGENT_ID, payload:{ invoiceId } }).catch(()=>{});

  return { ok: true };
}

// ── CATALOG CRUD ──────────────────────────────────────────────────────────────
async function getItems(tenantId, { locationId, category, storageArea, search } = {}) {
  await ensureTables();
  const params = [tenantId]; let i = 2;
  let where = 'tenant_id = $1 AND active = true';
  if (locationId)  { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (category)    { where += ` AND category=$${i++}`;    params.push(category); }
  if (storageArea) { where += ` AND storage_area=$${i++}`; params.push(storageArea); }
  if (search)      { where += ` AND LOWER(name) LIKE LOWER($${i++})`; params.push(`%${search}%`); }
  const r = await queryForTenant(tenantId, `SELECT * FROM inventory_items WHERE ${where} ORDER BY category, name`, params);
  return r.rows;
}

async function upsertItem(tenantId, data, userId) {
  await ensureTables();
  const { id, location_id, name, category, sub_category, unit, storage_area, vendor, vendor_sku, par_level, reorder_point } = data;
  if (id) {
    const r = await queryForTenant(tenantId, `
      UPDATE inventory_items SET name=$1,category=$2,sub_category=$3,unit=$4,storage_area=$5,vendor=$6,vendor_sku=$7,par_level=$8,reorder_point=$9,updated_at=now()
      WHERE id=$10 AND tenant_id=$11 RETURNING *
    `, [name,category||'food',sub_category||null,unit||'each',storage_area||'dry_storage',vendor||null,vendor_sku||null,par_level||null,reorder_point||null,id,tenantId]);
    return r.rows[0];
  }
  const r = await queryForTenant(tenantId, `
    INSERT INTO inventory_items (tenant_id,location_id,name,category,sub_category,unit,storage_area,vendor,vendor_sku,par_level,reorder_point)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
  `, [tenantId,location_id||null,name,category||'food',sub_category||null,unit||'each',storage_area||'dry_storage',vendor||null,vendor_sku||null,par_level||null,reorder_point||null]);
  return r.rows[0];
}

// ── INVOICES ──────────────────────────────────────────────────────────────────
async function getInvoices(tenantId, { locationId, status, category, limit=50 } = {}) {
  await ensureTables();
  const params = [tenantId]; let i = 2;
  let where = 'tenant_id = $1';
  if (locationId) { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (status)     { where += ` AND status=$${i++}`;   params.push(status); }
  if (category)   { where += ` AND category=$${i++}`; params.push(category); }
  params.push(limit);
  const r = await queryForTenant(tenantId, `SELECT * FROM invoices WHERE ${where} ORDER BY created_at DESC LIMIT $${i}`, params);
  return r.rows;
}

async function getInvoiceDetail(tenantId, invoiceId) {
  const inv = await queryForTenant(tenantId, 'SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2', [invoiceId, tenantId]);
  const lines = await queryForTenant(tenantId, `
    SELECT li.*, ii.name as catalog_name, ii.storage_area
    FROM invoice_line_items li
    LEFT JOIN inventory_items ii ON ii.id = li.inventory_item_id
    WHERE li.invoice_id=$1 ORDER BY li.created_at ASC
  `, [invoiceId]);
  return { invoice: inv.rows[0], lineItems: lines.rows };
}

async function updateLineItem(tenantId, lineItemId, data) {
  const allowed = ['description','quantity','unit','unit_price','total_price','flagged','flag_reason'];
  const updates=[],values=[];let i=1;
  for(const[k,v]of Object.entries(data)){if(allowed.includes(k)){updates.push(`${k}=$${i++}`);values.push(v);}}
  if(!updates.length) throw Object.assign(new Error('Nothing to update'),{status:400});
  values.push(lineItemId,tenantId);
  const r=await queryForTenant(tenantId,`UPDATE invoice_line_items SET ${updates.join(',')} WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,values);
  return r.rows[0];
}

// ── PHYSICAL COUNTS ───────────────────────────────────────────────────────────
async function createCount(tenantId, { locationId, countDate, category, periodStart, periodEnd, userId }) {
  await ensureTables();
  const r = await queryForTenant(tenantId, `
    INSERT INTO inventory_counts (tenant_id,location_id,count_date,period_start,period_end,category,status,counted_by)
    VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7) RETURNING *
  `, [tenantId,locationId||null,countDate,periodStart||null,periodEnd||null,category||'food',userId||null]);
  const count = r.rows[0];

  // Pre-populate with all active items for this category
  const items = await getItems(tenantId, { locationId, category });
  for (const item of items) {
    await queryForTenant(tenantId, `
      INSERT INTO inventory_count_lines (count_id,inventory_item_id,tenant_id,item_name,unit,storage_area,unit_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [count.id,item.id,tenantId,item.name,item.unit,item.storage_area,item.last_price||0]);
  }
  return count;
}

async function getCounts(tenantId, { locationId, category, status } = {}) {
  await ensureTables();
  const params=[tenantId];let i=2;let where='tenant_id=$1';
  if(locationId){where+=` AND (location_id=$${i++} OR location_id IS NULL)`;params.push(locationId);}
  if(category){where+=` AND category=$${i++}`;params.push(category);}
  if(status){where+=` AND status=$${i++}`;params.push(status);}
  const r=await queryForTenant(tenantId,`SELECT * FROM inventory_counts WHERE ${where} ORDER BY count_date DESC LIMIT 50`,params);
  return r.rows;
}

async function getCountDetail(tenantId, countId) {
  const count=await queryForTenant(tenantId,'SELECT * FROM inventory_counts WHERE id=$1 AND tenant_id=$2',[countId,tenantId]);
  // Shelf-to-sheet: lines come back in physical walk order, not alphabetical
  const lines=await queryForTenant(tenantId,`SELECT cl.*,ii.par_level,ii.reorder_point,ii.vendor FROM inventory_count_lines cl LEFT JOIN inventory_items ii ON ii.id=cl.inventory_item_id WHERE cl.count_id=$1 ORDER BY COALESCE(array_position($2::text[],COALESCE(cl.storage_area,'other')),99),cl.item_name`,[countId,AREA_WALK_ORDER]);
  return { count:count.rows[0], lines:lines.rows };
}

async function updateCountLine(tenantId, lineId, { quantity, notes }) {
  const r=await queryForTenant(tenantId,`
    UPDATE inventory_count_lines SET quantity=$1, total_value=($1 * COALESCE(unit_price,0)), notes=$2
    WHERE id=$3 AND tenant_id=$4 RETURNING *
  `,[quantity,notes||null,lineId,tenantId]);
  return r.rows[0];
}

async function submitCount(tenantId, countId, userId) {
  // Calculate total value
  const lines=await queryForTenant(tenantId,'SELECT SUM(total_value) as total FROM inventory_count_lines WHERE count_id=$1',[countId]);
  const total=lines.rows[0]?.total||0;
  const r=await queryForTenant(tenantId,`
    UPDATE inventory_counts SET status='submitted',total_value=$1,submitted_at=now(),counted_by=$2,updated_at=now()
    WHERE id=$3 AND tenant_id=$4 RETURNING *
  `,[total,userId||null,countId,tenantId]);
  await eventBus.publish({eventType:'inventory.count.submitted',tenantId,sourceAgent:AGENT_ID,payload:{countId,total}}).catch(()=>{});
  return r.rows[0];
}

// ── COGS CALCULATION ──────────────────────────────────────────────────────────
async function calculateCOGS(tenantId, { locationId, periodStart, periodEnd, category }) {
  // Opening inventory (last submitted count before period)
  const opening=await queryForTenant(tenantId,`
    SELECT ic.total_value,ic.count_date FROM inventory_counts ic
    WHERE ic.tenant_id=$1 AND ic.status='submitted' AND ic.category=$2
    ${locationId?'AND (ic.location_id=$4 OR ic.location_id IS NULL)':''}
    AND ic.count_date < $3 ORDER BY ic.count_date DESC LIMIT 1
  `,[tenantId,category||'food',periodStart,...(locationId?[locationId]:[])]);

  // Closing inventory (first submitted count after period)
  const closing=await queryForTenant(tenantId,`
    SELECT ic.total_value,ic.count_date FROM inventory_counts ic
    WHERE ic.tenant_id=$1 AND ic.status='submitted' AND ic.category=$2
    ${locationId?'AND (ic.location_id=$4 OR ic.location_id IS NULL)':''}
    AND ic.count_date >= $3 ORDER BY ic.count_date ASC LIMIT 1
  `,[tenantId,category||'food',periodEnd,...(locationId?[locationId]:[])]);

  // Purchases during period
  const purchases=await queryForTenant(tenantId,`
    SELECT COALESCE(SUM(total_amount),0) as total FROM invoices
    WHERE tenant_id=$1 AND status='approved' AND category=$2
    ${locationId?'AND (location_id=$5 OR location_id IS NULL)':''}
    AND invoice_date BETWEEN $3 AND $4
  `,[tenantId,category||'food',periodStart,periodEnd,...(locationId?[locationId]:[])]);

  const openVal=parseFloat(opening.rows[0]?.total_value||0);
  const closeVal=parseFloat(closing.rows[0]?.total_value||0);
  const purchVal=parseFloat(purchases.rows[0]?.total||0);
  const cogs=openVal+purchVal-closeVal;

  return {
    period_start:    periodStart,
    period_end:      periodEnd,
    category,
    opening_inventory: openVal,
    purchases:         purchVal,
    closing_inventory: closeVal,
    cogs,
    opening_date:    opening.rows[0]?.count_date,
    closing_date:    closing.rows[0]?.count_date,
  };
}

// Physical walk order for shelf-to-sheet counting (cold to dry to bar to front)
const AREA_WALK_ORDER = ['walk_in_cooler','walk_in_freezer','prep_area','dry_storage','bar_storage','foh_storage','other'];

// ── PRICE WATCH ───────────────────────────────────────────────────────────────
// Items whose latest invoice price moved vs their 3-invoice average.
// Zero data entry: price_history is already maintained by approveInvoice.
async function getPriceWatch(tenantId, { locationId, thresholdPct = 5 } = {}) {
  await ensureTables();
  const params = [tenantId];
  const locFilter = locationId ? 'AND (ii.location_id=$2 OR ii.location_id IS NULL)' : '';
  if (locationId) params.push(locationId);
  const r = await adminQuery(`
    SELECT ii.id, ii.name, ii.vendor, ii.unit, ii.category,
           ii.last_price, ii.avg_price_3, ii.avg_price_6,
           jsonb_array_length(ii.price_history) AS price_points,
           COALESCE((
             SELECT SUM(li.quantity) FROM invoice_line_items li
             JOIN invoices inv ON inv.id = li.invoice_id
             WHERE li.inventory_item_id = ii.id AND inv.tenant_id = ii.tenant_id
               AND inv.status='approved' AND inv.invoice_date > CURRENT_DATE - 60
           ), 0) AS qty_60d
    FROM inventory_items ii
    WHERE ii.tenant_id=$1 AND ii.active=true
      AND ii.last_price IS NOT NULL AND ii.avg_price_3 IS NOT NULL AND ii.avg_price_3 > 0
      AND jsonb_array_length(ii.price_history) >= 2
      ${locFilter}
  `, params);

  const movers = r.rows.map(it => {
    const last = parseFloat(it.last_price), avg3 = parseFloat(it.avg_price_3);
    const pct = (last - avg3) / avg3 * 100;
    const monthlyQty = parseFloat(it.qty_60d || 0) / 2;
    return {
      ...it,
      pct_change: parseFloat(pct.toFixed(1)),
      direction: pct > 0 ? 'up' : 'down',
      monthly_qty: parseFloat(monthlyQty.toFixed(1)),
      monthly_impact: parseFloat((monthlyQty * (last - avg3)).toFixed(2)),
    };
  }).filter(it => Math.abs(it.pct_change) >= thresholdPct)
    .sort((a, b) => Math.abs(b.monthly_impact) - Math.abs(a.monthly_impact) || Math.abs(b.pct_change) - Math.abs(a.pct_change));

  const totalImpact = movers.filter(m => m.monthly_impact > 0).reduce((s2, m) => s2 + m.monthly_impact, 0);
  return { movers, watch_count: movers.length, monthly_impact_up: parseFloat(totalImpact.toFixed(2)) };
}

// ── LIVE FOOD-COST TREND ──────────────────────────────────────────────────────
// Approved invoice spend vs weekly sales — a running cost %% with no count needed.
async function getFoodCostTrend(tenantId, { locationId, weeks = 12 } = {}) {
  await ensureTables();
  const params = [tenantId, weeks];
  const locInv = locationId ? 'AND (i.location_id=$3 OR i.location_id IS NULL)' : '';
  const locKpi = locationId ? 'AND k.location_id=$3' : '';
  if (locationId) params.push(locationId);
  const r = await adminQuery(`
    WITH p AS (
      SELECT date_trunc('week', i.invoice_date)::date AS wk,
             SUM(i.total_amount) FILTER (WHERE i.category = 'food')     AS food_purchases,
             SUM(i.total_amount) FILTER (WHERE i.category = 'beverage') AS bev_purchases,
             SUM(i.total_amount)                                        AS total_purchases
      FROM invoices i
      WHERE i.tenant_id=$1 AND i.status='approved' AND i.invoice_date IS NOT NULL
        AND i.invoice_date > CURRENT_DATE - ($2::int * 7) ${locInv}
      GROUP BY 1
    ),
    s AS (
      SELECT k.week_start::date AS wk,
             SUM(k.total_sales) AS total_sales,
             SUM(k.food_net_sales) AS food_sales,
             SUM(k.bar_net_sales)  AS bar_sales
      FROM weekly_kpi k
      WHERE k.tenant_id=$1 AND k.week_start > CURRENT_DATE - ($2::int * 7) ${locKpi}
      GROUP BY 1
    )
    SELECT COALESCE(p.wk, s.wk)::text AS week_start,
           p.food_purchases, p.bev_purchases, p.total_purchases,
           s.total_sales, s.food_sales, s.bar_sales
    FROM p FULL JOIN s ON s.wk = p.wk
    ORDER BY 1
  `, params);

  const rows = r.rows.map(w => {
    const fp = parseFloat(w.food_purchases || 0), bp = parseFloat(w.bev_purchases || 0), tp = parseFloat(w.total_purchases || 0);
    const fs = parseFloat(w.food_sales || 0),  bs = parseFloat(w.bar_sales || 0),   ts = parseFloat(w.total_sales || 0);
    return {
      week_start: w.week_start,
      food_purchases: fp, bev_purchases: bp, total_purchases: tp,
      total_sales: ts,
      food_cost_pct:  fs > 0 ? parseFloat((fp / fs * 100).toFixed(1)) : null,
      bar_cost_pct:   bs > 0 ? parseFloat((bp / bs * 100).toFixed(1)) : null,
      blended_pct:    ts > 0 ? parseFloat((tp / ts * 100).toFixed(1)) : null,
    };
  });
  return { weeks: rows };
}

async function getSummary(tenantId, locationIds) {
  await ensureTables();
  const params=[tenantId];
  const locFilter=locationIds?.length?`AND (location_id=ANY($2::uuid[]) OR location_id IS NULL)`:'';
  if(locationIds?.length)params.push(locationIds);
  const [items,invoices,counts]=await Promise.all([
    queryForTenant(tenantId,`SELECT COUNT(*) as total,COUNT(*) FILTER(WHERE last_price IS NOT NULL) as priced FROM inventory_items WHERE tenant_id=$1 AND active=true ${locFilter}`,params),
    queryForTenant(tenantId,`SELECT COUNT(*) FILTER(WHERE status='pending_review') as pending FROM invoices WHERE tenant_id=$1 ${locFilter}`,params),
    queryForTenant(tenantId,`SELECT COUNT(*) FILTER(WHERE status='in_progress') as active FROM inventory_counts WHERE tenant_id=$1 ${locFilter}`,params),
  ]);
  return { items:items.rows[0], invoices:invoices.rows[0], counts:counts.rows[0], agent:AGENT_ID };
}

// ── Purchase Orders / Order Lists ────────────────────────────────────────────
async function generateOrderList(tenantId, { locationId, category } = {}) {
  // Find items at or below reorder_point (or par_level if no reorder_point set)
  const items = await adminQuery(`
    SELECT ii.*,
      COALESCE(
        (SELECT cl.quantity FROM inventory_count_lines cl
         JOIN inventory_counts ic ON ic.id = cl.count_id
         WHERE cl.inventory_item_id = ii.id
           AND ic.tenant_id = ii.tenant_id
           AND ic.status = 'submitted'
         ORDER BY ic.created_at DESC LIMIT 1),
        0
      ) as current_stock
    FROM inventory_items ii
    WHERE ii.tenant_id=$1
      AND ii.active=true
      ${locationId ? 'AND (ii.location_id=$2 OR ii.location_id IS NULL)' : ''}
      ${category ? `AND ii.category='${category}'` : ''}
    ORDER BY ii.vendor NULLS LAST, ii.category, ii.name
  `, locationId ? [tenantId, locationId] : [tenantId]);

  return items.rows
    .filter(item => {
      const stock = parseFloat(item.current_stock || 0);
      const reorder = parseFloat(item.reorder_point || item.par_level || 0);
      return reorder > 0 && stock <= reorder;
    })
    .map(item => {
      const stock     = parseFloat(item.current_stock || 0);
      const par       = parseFloat(item.par_level || 0);
      const orderQty  = Math.max(0, par - stock);
      return {
        inventory_item_id: item.id,
        item_name:   item.name,
        unit:        item.unit,
        vendor:      item.vendor,
        vendor_sku:  item.vendor_sku,
        par_level:   item.par_level,
        current_stock: stock,
        order_qty:   Math.ceil(orderQty),
        unit_price:  item.last_price || item.avg_price_3 || null,
        category:    item.category,
      };
    });
}

async function getPurchaseOrders(tenantId, { locationId, status } = {}) {
  let where = 'po.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ` AND (po.location_id=${i++} OR po.location_id IS NULL)`; params.push(locationId); }
  if (status)     { where += ` AND po.status=${i++}`; params.push(status); }
  const r = await adminQuery(`
    SELECT po.*, COUNT(pol.id) as line_count,
      COALESCE(SUM(pol.order_qty * pol.unit_price),0) as total_cost
    FROM purchase_orders po
    LEFT JOIN purchase_order_lines pol ON pol.order_id = po.id
    WHERE ${where}
    GROUP BY po.id ORDER BY po.created_at DESC LIMIT 50
  `, params);
  return r.rows;
}

async function getPurchaseOrder(tenantId, orderId) {
  const [order, lines] = await Promise.all([
    adminQuery('SELECT * FROM purchase_orders WHERE id=$1 AND tenant_id=$2', [orderId, tenantId]),
    adminQuery('SELECT * FROM purchase_order_lines WHERE order_id=$1 ORDER BY sort_order, item_name', [orderId]),
  ]);
  if (!order.rows[0]) throw Object.assign(new Error('Order not found'), { status:404 });
  return { ...order.rows[0], lines: lines.rows };
}

async function createPurchaseOrder(tenantId, data) {
  const { locationId, title, vendor, notes, lines = [], createdBy } = data;
  const r = await adminQuery(`
    INSERT INTO purchase_orders (tenant_id, location_id, title, vendor, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [tenantId, locationId||null, title||null, vendor||null, notes||null, createdBy||null]);
  const order = r.rows[0];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await adminQuery(`
      INSERT INTO purchase_order_lines
        (tenant_id, order_id, inventory_item_id, item_name, unit, vendor, vendor_sku,
         par_level, current_stock, order_qty, unit_price, notes, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [tenantId, order.id, l.inventory_item_id||null, l.item_name, l.unit||null,
        l.vendor||null, l.vendor_sku||null, l.par_level||null, l.current_stock||null,
        l.order_qty, l.unit_price||null, l.notes||null, i]);
  }
  return getPurchaseOrder(tenantId, order.id);
}

async function updatePurchaseOrderLine(tenantId, lineId, data) {
  const allowed = ['order_qty','unit_price','notes','item_name','unit','vendor'];
  const updates = [], values = []; let i = 1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=${i++}`); values.push(v); }
  }
  if (!updates.length) return;
  values.push(lineId, tenantId);
  const r = await adminQuery(`UPDATE purchase_order_lines SET ${updates.join(',')} WHERE id=${i} AND tenant_id=${i+1} RETURNING *`, values);
  return r.rows[0];
}

async function deletePurchaseOrderLine(tenantId, lineId) {
  await adminQuery('DELETE FROM purchase_order_lines WHERE id=$1 AND tenant_id=$2', [lineId, tenantId]);
  return { ok:true };
}

async function addPurchaseOrderLine(tenantId, orderId, line) {
  const r = await adminQuery(`
    INSERT INTO purchase_order_lines
      (tenant_id, order_id, inventory_item_id, item_name, unit, vendor, vendor_sku, order_qty, unit_price, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  `, [tenantId, orderId, line.inventory_item_id||null, line.item_name, line.unit||null,
      line.vendor||null, line.vendor_sku||null, line.order_qty, line.unit_price||null, line.notes||null]);
  return r.rows[0];
}

async function updatePurchaseOrderStatus(tenantId, orderId, status) {
  const r = await adminQuery(
    'UPDATE purchase_orders SET status=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING *',
    [status, orderId, tenantId]
  );
  return r.rows[0];
}

async function deletePurchaseOrder(tenantId, orderId) {
  await adminQuery('DELETE FROM purchase_orders WHERE id=$1 AND tenant_id=$2', [orderId, tenantId]);
  return { ok:true };
}

// ── VENDOR DIRECTORY ──────────────────────────────────────────────────────────
async function getVendors(tenantId, { search, category, includeInactive } = {}) {
  await ensureTables();
  // Seed directory from any invoice vendors not yet captured (idempotent)
  await adminQuery(`
    INSERT INTO vendors (tenant_id, name, category, source)
    SELECT DISTINCT ON (lower(trim(vendor))) tenant_id, trim(vendor), 'food', 'invoice'
    FROM invoices
    WHERE tenant_id=$1 AND vendor IS NOT NULL AND trim(vendor) != ''
    ON CONFLICT (tenant_id, lower(trim(name))) DO NOTHING
  `, [tenantId]).catch(() => {});

  const where = ['v.tenant_id=$1']; const params=[tenantId]; let i=2;
  if (!includeInactive) where.push('v.active=true');
  if (category) { where.push(`v.category=$${i++}`); params.push(category); }
  if (search) { where.push(`(v.name ILIKE $${i} OR v.contact_name ILIKE $${i} OR v.email ILIKE $${i})`); params.push('%'+search+'%'); i++; }
  const r = await adminQuery(`
    SELECT v.*, s.invoice_count, s.last_invoice_date, s.spend_90d
    FROM vendors v
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS invoice_count,
             MAX(inv.invoice_date) AS last_invoice_date,
             COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.invoice_date >= now() - interval '90 days'), 0) AS spend_90d
      FROM invoices inv
      WHERE inv.tenant_id = v.tenant_id
        AND lower(trim(inv.vendor)) = lower(trim(v.name))
        AND inv.status = 'approved'
    ) s ON true
    WHERE ${where.join(' AND ')}
    ORDER BY v.name ASC
  `, params);
  return r.rows;
}

const VENDOR_FIELDS = ['name','category','contact_name','phone','email','address','account_number','payment_terms','website','notes','active'];

async function addVendor(tenantId, data) {
  await ensureTables();
  if (!data.name || !String(data.name).trim()) throw new Error('Vendor name is required');
  const cols=['tenant_id'], vals=[tenantId], ph=['$1']; let i=2;
  for (const f of VENDOR_FIELDS) if (data[f] !== undefined) { cols.push(f); vals.push(f==='name'?String(data[f]).trim():data[f]); ph.push('$'+i++); }
  if (!cols.includes('source')) { cols.push('source'); vals.push('manual'); ph.push('$'+i++); }
  try {
    const r = await adminQuery(`INSERT INTO vendors (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`, vals);
    return r.rows[0];
  } catch (e) {
    if (String(e.message).includes('vendors_tenant_name')) throw new Error('A vendor with this name already exists');
    throw e;
  }
}

async function updateVendor(tenantId, vendorId, data) {
  await ensureTables();
  const sets=[], vals=[]; let i=1;
  for (const f of VENDOR_FIELDS) if (data[f] !== undefined) { sets.push(`${f}=$${i++}`); vals.push(f==='name'?String(data[f]).trim():data[f]); }
  if (!sets.length) throw new Error('Nothing to update');
  sets.push('updated_at=now()');
  vals.push(tenantId, vendorId);
  const r = await adminQuery(`UPDATE vendors SET ${sets.join(', ')} WHERE tenant_id=$${i++} AND id=$${i} RETURNING *`, vals);
  if (!r.rows.length) throw new Error('Vendor not found');
  return r.rows[0];
}

async function deleteVendor(tenantId, vendorId) {
  await ensureTables();
  // Soft delete — keeps invoice spend joins intact
  await adminQuery('UPDATE vendors SET active=false, updated_at=now() WHERE tenant_id=$1 AND id=$2', [tenantId, vendorId]);
  return { ok:true };
}

module.exports = {
  getVendors, addVendor, updateVendor, deleteVendor,
  getPriceWatch, getFoodCostTrend,
  AGENT_ID, ensureTables,
  scanInvoice, scanBulkInvoices, approveInvoice,
  getItems, upsertItem,
  generateOrderList, getPurchaseOrders, getPurchaseOrder,
  createPurchaseOrder, updatePurchaseOrderLine, deletePurchaseOrderLine,
  addPurchaseOrderLine, updatePurchaseOrderStatus, deletePurchaseOrder,
  getInvoices, getInvoiceDetail, updateLineItem,
  createCount, getCounts, getCountDetail, updateCountLine, submitCount,
  calculateCOGS, getSummary,
  enqueueEmailInvoice, processEmailQueue, getEmailQueue,
  deleteInvoice, deleteItem,
};


// ── DELETE INVOICE ────────────────────────────────────────────────────────────
async function deleteInvoice(tenantId, invoiceId) {
  // Delete line items first (cascade should handle it but be explicit)
  await queryForTenant(tenantId, 'DELETE FROM invoice_line_items WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId]);
  await queryForTenant(tenantId, 'DELETE FROM invoices WHERE id=$1 AND tenant_id=$2', [invoiceId, tenantId]);
  return { ok: true };
}

// ── DELETE ITEM ───────────────────────────────────────────────────────────────
async function deleteItem(tenantId, itemId) {
  // Soft delete — set active=false so history is preserved
  await queryForTenant(tenantId, 'UPDATE inventory_items SET active=false, updated_at=now() WHERE id=$1 AND tenant_id=$2', [itemId, tenantId]);
  return { ok: true };
}

// ── BULK INVOICE SCAN ─────────────────────────────────────────────────────────
async function scanBulkInvoices(tenantId, { invoices, locationId, userId }) {
  const results = [];
  for (const inv of invoices) {
    try {
      const result = await scanInvoice(tenantId, {
        imageBase64: inv.imageBase64,
        mimeType:    inv.mimeType || 'image/jpeg',
        locationId,
        category:    inv.category || 'food',
        userId,
      });
      results.push({ ok: true, filename: inv.filename, data: result });
    } catch(e) {
      results.push({ ok: false, filename: inv.filename, error: e.message });
    }
    // Pause between scans to avoid Claude rate limits
    await new Promise(r => setTimeout(r, 600));
  }
  return results;
}

// ── EMAIL INVOICE QUEUE ───────────────────────────────────────────────────────
async function ensureEmailQueue() {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS invoice_email_queue (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      from_email    VARCHAR(300),
      subject       VARCHAR(500),
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      attachments   JSONB NOT NULL DEFAULT '[]',
      status        VARCHAR(30) NOT NULL DEFAULT 'pending',
      processed_at  TIMESTAMPTZ,
      invoice_ids   UUID[] NOT NULL DEFAULT '{}',
      error         TEXT,
      location_id   UUID,
      raw_payload   JSONB
    )
  `).catch(() => {});
}

async function enqueueEmailInvoice(tenantId, { fromEmail, subject, attachments, locationId, rawPayload }) {
  await ensureEmailQueue();
  const r = await queryForTenant(tenantId, `
    INSERT INTO invoice_email_queue (tenant_id, from_email, subject, attachments, location_id, raw_payload)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [tenantId, fromEmail, subject, JSON.stringify(attachments), locationId||null, JSON.stringify(rawPayload||{})]);
  return r.rows[0];
}

async function processEmailQueue(tenantId) {
  await ensureEmailQueue();
  const pending = await queryForTenant(tenantId, `
    SELECT * FROM invoice_email_queue
    WHERE tenant_id=$1 AND status='pending'
    ORDER BY received_at ASC LIMIT 10
  `, [tenantId]);

  const results = [];
  for (const item of pending.rows) {
    try {
      await queryForTenant(tenantId, "UPDATE invoice_email_queue SET status='processing' WHERE id=$1", [item.id]);
      const attachments = item.attachments || [];
      const invoiceIds = [];
      for (const att of attachments) {
        if (!att.base64 || !att.mimeType) continue;
        const result = await scanInvoice(tenantId, {
          imageBase64: att.base64,
          mimeType:    att.mimeType,
          locationId:  item.location_id,
          category:    'food',
        });
        invoiceIds.push(result.invoice.id);
        await new Promise(r => setTimeout(r, 600));
      }
      await queryForTenant(tenantId, `
        UPDATE invoice_email_queue SET status='processed', processed_at=now(), invoice_ids=$1 WHERE id=$2
      `, [invoiceIds, item.id]);
      results.push({ id: item.id, ok: true, invoiceCount: invoiceIds.length });
    } catch(e) {
      await queryForTenant(tenantId, `
        UPDATE invoice_email_queue SET status='error', error=$1 WHERE id=$2
      `, [e.message, item.id]);
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  return results;
}

async function getEmailQueue(tenantId, status) {
  await ensureEmailQueue();
  const params = [tenantId];
  const whereStatus = status ? ` AND status=$2` : '';
  if (status) params.push(status);
  const r = await queryForTenant(tenantId, `
    SELECT * FROM invoice_email_queue WHERE tenant_id=$1${whereStatus}
    ORDER BY received_at DESC LIMIT 50
  `, params);
  return r.rows;
}
