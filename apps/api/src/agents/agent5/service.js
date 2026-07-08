// Agent 5: Cash P&L — Plaid bank/credit card integration
require('dotenv').config();
const { once } = require('../../lib/tableCache');
const { queryForTenant, adminQuery } = require('@restaurantos/db');

const AGENT_ID = 'agent_5_cashpl';

// ── Plaid client ──────────────────────────────────────────────────────────────
function getPlaidClient() {
  const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
  const env = process.env.PLAID_ENV || 'sandbox';
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET':    process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

// ── Ensure tables ─────────────────────────────────────────────────────────────
const ensureTables = once('agent5', async function() {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      item_id         VARCHAR(200) NOT NULL,
      access_token    VARCHAR(500) NOT NULL,
      institution_id  VARCHAR(100),
      institution_name VARCHAR(200),
      accounts        JSONB NOT NULL DEFAULT '[]',
      status          VARCHAR(30) NOT NULL DEFAULT 'active',
      last_sync       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, item_id)
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS plaid_transactions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      location_id       UUID,
      plaid_item_id     UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
      transaction_id    VARCHAR(200) NOT NULL,
      account_id        VARCHAR(200),
      account_name      VARCHAR(200),
      amount            NUMERIC(12,2) NOT NULL,
      date              DATE NOT NULL,
      name              VARCHAR(500),
      merchant_name     VARCHAR(300),
      category          VARCHAR(100),
      sub_category      VARCHAR(100),
      pl_category       VARCHAR(50) NOT NULL DEFAULT 'other',
      pending           BOOLEAN NOT NULL DEFAULT false,
      iso_currency_code VARCHAR(10) DEFAULT 'USD',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, transaction_id)
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS pl_manual_entries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      period_start  DATE NOT NULL,
      period_end    DATE NOT NULL,
      category      VARCHAR(50) NOT NULL,
      label         VARCHAR(200) NOT NULL,
      amount        NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_id, period_start, label, amount)
    )
  `).catch(() => {});
  // Add unique constraint to existing tables that were created without it
  await adminQuery(`
    ALTER TABLE pl_manual_entries
    ADD CONSTRAINT pl_manual_entries_dedup
    UNIQUE (tenant_id, location_id, period_start, label, amount)
  `).catch(() => {}); // ignore if already exists

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS pl_targets (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      food_cost_pct NUMERIC(5,2) DEFAULT 28,
      labor_cost_pct NUMERIC(5,2) DEFAULT 32,
      overhead_pct  NUMERIC(5,2) DEFAULT 15,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_id)
    )
  `).catch(() => {});

  // Migrations
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS pl_category_rules (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      pattern       VARCHAR(300) NOT NULL,
      category      VARCHAR(100) NOT NULL,
      match_count   INTEGER NOT NULL DEFAULT 1,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, pattern)
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS pl_custom_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL,
      key         VARCHAR(100) NOT NULL,
      label       VARCHAR(200) NOT NULL,
      sign        INTEGER NOT NULL DEFAULT -1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, key)
    )
  `).catch(() => {});

  const migrations = [
    "ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS cursor VARCHAR(500)",
  ];
  for (const sql of migrations) await adminQuery(sql).catch(() => {});
});


// ── Category rules (learning) ─────────────────────────────────────────────────
async function getCategoryRules(tenantId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT pattern, category, match_count FROM pl_category_rules
     WHERE tenant_id=$1 ORDER BY match_count DESC LIMIT 500`, [tenantId]
  );
  return r.rows;
}

async function saveRuleFromRecategorization(tenantId, description, category) {
  if (!description || !category) return;
  const pattern = description.trim().toLowerCase().slice(0, 200);
  await adminQuery(
    `INSERT INTO pl_category_rules (tenant_id, pattern, category, match_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (tenant_id, pattern)
     DO UPDATE SET category=$3, match_count=pl_category_rules.match_count+1, updated_at=now()`,
    [tenantId, pattern, category]
  ).catch(() => {});
}

async function getCustomCategories(tenantId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT key, label, sign FROM pl_custom_categories WHERE tenant_id=$1 ORDER BY label`,
    [tenantId]
  );
  return r.rows;
}

async function saveCustomCategory(tenantId, { key, label, sign = -1 }) {
  await ensureTables();
  // sanitize key
  const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
  const r = await adminQuery(
    `INSERT INTO pl_custom_categories (tenant_id, key, label, sign)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, key) DO UPDATE SET label=$3, sign=$4
     RETURNING *`,
    [tenantId, safeKey, label.trim().slice(0, 200), sign]
  );
  return r.rows[0];
}

async function deleteCustomCategory(tenantId, key) {
  await adminQuery(
    `DELETE FROM pl_custom_categories WHERE tenant_id=$1 AND key=$2`,
    [tenantId, key]
  );
}

// ── P&L categories (expanded) ─────────────────────────────────────────────────
const PL_CATEGORIES = [
  'revenue','cogs','labor','rent','utilities','insurance','marketing',
  'repairs','credit_card_fees','professional_fees','supplies','other','transfer','excluded'
];

function mapPLCategory(plaidCategory, name = '') {
  const cat = (plaidCategory || '').toLowerCase();
  const n   = (name || '').toLowerCase();

  if (cat.includes('payroll') || cat.includes('wages') || n.includes('payroll') || n.includes('gusto') || n.includes('adp') || n.includes('homebase')) return 'labor';
  if (cat.includes('food') || cat.includes('restaurant supply') || cat.includes('grocery') || n.includes('sysco') || n.includes('us foods') || n.includes('produce') || n.includes('beverage') || n.includes('liquor')) return 'cogs';
  if (cat.includes('rent') || cat.includes('lease') || n.includes('rent ') || n.includes(' rent')) return 'rent';
  if (cat.includes('utilities') || cat.includes('electric') || cat.includes('gas utility') || cat.includes('water') || n.includes('pg&e') || n.includes('pge') || n.includes('utility') || n.includes('comcast') || n.includes('at&t internet')) return 'utilities';
  if (cat.includes('insurance') || n.includes('insurance') || n.includes('hiscox') || n.includes('next insurance')) return 'insurance';
  if (cat.includes('repair') || cat.includes('maintenance') || n.includes('repair') || n.includes('maintenance') || n.includes('hvac') || n.includes('plumber') || n.includes('electrician') || n.includes('handyman')) return 'repairs';
  if (n.includes('stripe fee') || n.includes('square fee') || n.includes('toast fee') || n.includes('processing fee') || n.includes('merchant fee') || cat.includes('service charge') && cat.includes('financial')) return 'credit_card_fees';
  if (n.includes('accounting') || n.includes('bookkeeping') || n.includes('lawyer') || n.includes('attorney') || n.includes('consultant') || cat.includes('legal') || cat.includes('accounting')) return 'professional_fees';
  if (cat.includes('office supplies') || cat.includes('janitorial') || n.includes('cleaning') || n.includes('supplies') || n.includes('uniform') || n.includes('linen')) return 'supplies';
  if (cat.includes('marketing') || cat.includes('advertising') || n.includes('google ads') || n.includes('meta ads') || n.includes('yelp ads') || n.includes('instagram')) return 'marketing';
  if (cat.includes('deposit') || cat.includes('pos sale') || n.includes('toast') || n.includes('square') || n.includes('stripe') || n.includes('opentable') || n.includes('resy') || cat.includes('restaurant sale')) return 'revenue';
  if (cat.includes('transfer') || n.includes('transfer') || n.includes('zelle') || n.includes('venmo business')) return 'transfer';
  return 'other';
}


// ── Plaid Link update mode (re-auth an item in LOGIN_REQUIRED state) ──────────
async function createUpdateLinkToken(tenantId, plaidItemId, userId) {
  const itemResult = await queryForTenant(tenantId,
    'SELECT * FROM plaid_items WHERE id=$1 AND tenant_id=$2', [plaidItemId, tenantId]);
  const item = itemResult.rows[0];
  if (!item) throw new Error('Item not found');

  const client = getPlaidClient();
  const res = await client.linkTokenCreate({
    user:         { client_user_id: `${tenantId}-${userId || 'user'}` },
    client_name:  'Pulse',
    country_codes:['US'],
    language:     'en',
    access_token: item.access_token,  // update mode — pass existing token
  });
  return { link_token: res.data.link_token, item_id: plaidItemId };
}

// ── Plaid Link token ──────────────────────────────────────────────────────────
async function createLinkToken(tenantId, userId) {
  await ensureTables();
  const client = getPlaidClient();
  const res = await client.linkTokenCreate({
    user:           { client_user_id: `${tenantId}-${userId || 'user'}` },
    client_name:    'Pulse',
    products:       ['transactions'],
    country_codes:  ['US'],
    language:       'en',
  });
  return { link_token: res.data.link_token };
}

// ── Exchange public token for access token ────────────────────────────────────
async function exchangePublicToken(tenantId, { publicToken, locationId, userId }) {
  await ensureTables();
  const client = getPlaidClient();

  // Exchange token
  const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = exchange.data;

  // Get institution info
  const itemRes = await client.itemGet({ access_token });
  const instId  = itemRes.data.item.institution_id;
  let instName  = 'Unknown Bank';
  if (instId) {
    try {
      const instRes = await client.institutionsGetById({ institution_id: instId, country_codes: ['US'] });
      instName = instRes.data.institution.name;
    } catch(_) {}
  }

  // Get accounts
  const acctRes  = await client.accountsGet({ access_token });
  const accounts = acctRes.data.accounts.map(a => ({
    account_id: a.account_id, name: a.name, mask: a.mask,
    type: a.type, subtype: a.subtype,
    balances: { current: a.balances.current, available: a.balances.available },
  }));

  // Save item
  await queryForTenant(tenantId, `
    INSERT INTO plaid_items (tenant_id, location_id, item_id, access_token, institution_id, institution_name, accounts)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (tenant_id, item_id) DO UPDATE
    SET access_token=$4, institution_name=$6, accounts=$7, updated_at=now()
  `, [tenantId, locationId||null, item_id, access_token, instId, instName, JSON.stringify(accounts)]);

  // Kick off initial sync
  const itemResult = await queryForTenant(tenantId, 'SELECT id FROM plaid_items WHERE tenant_id=$1 AND item_id=$2', [tenantId, item_id]);
  if (itemResult.rows[0]) {
    syncTransactions(tenantId, itemResult.rows[0].id).catch(e => console.error('[plaid sync]', e.message));
  }

  return { institution_name: instName, accounts };
}

// ── Sync transactions for an item ─────────────────────────────────────────────
async function syncTransactions(tenantId, plaidItemId, resetCursor = false) {
  const itemResult = await queryForTenant(tenantId,
    'SELECT * FROM plaid_items WHERE id=$1 AND tenant_id=$2',
    [plaidItemId, tenantId]
  );
  const item = itemResult.rows[0];
  if (!item) throw Object.assign(new Error('Plaid item not found'), { status: 404 });

  const client = getPlaidClient();
  let cursor  = resetCursor ? null : (item.cursor || null);
  let hasMore = true;
  let added   = 0;
  console.log(`[plaid sync] item=${plaidItemId} cursor=${cursor ? 'exists' : 'null'} reset=${resetCursor}`);

  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: item.access_token,
      cursor:       cursor || undefined,
      count:        500,
    });
    const { added: newTx, modified, removed, next_cursor, has_more } = res.data;
    console.log(`[plaid sync] batch: added=${newTx.length} modified=${modified.length} removed=${removed.length} has_more=${has_more}`);

    // Upsert new/modified transactions
    for (const tx of [...newTx, ...modified]) {
      const plCat = mapPLCategory(tx.personal_finance_category?.primary || tx.category?.[0] || '', tx.merchant_name || tx.name);
      await queryForTenant(tenantId, `
        INSERT INTO plaid_transactions
          (tenant_id, location_id, plaid_item_id, transaction_id, account_id, account_name,
           amount, date, name, merchant_name, category, sub_category, pl_category, pending, iso_currency_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (tenant_id, transaction_id) DO UPDATE
        SET amount=$7, date=$8, name=$9, merchant_name=$10, pl_category=$13, pending=$14
      `, [
        tenantId, item.location_id, plaidItemId, tx.transaction_id,
        tx.account_id,
        item.accounts.find(a => a.account_id === tx.account_id)?.name || '',
        tx.amount, tx.date, tx.name, tx.merchant_name || null,
        tx.personal_finance_category?.primary || tx.category?.[0] || null,
        tx.personal_finance_category?.detailed || tx.category?.[1] || null,
        plCat, tx.pending, tx.iso_currency_code || 'USD',
      ]).catch(() => {});
      added++;
    }

    // Remove deleted transactions
    for (const r of removed) {
      await queryForTenant(tenantId,
        'DELETE FROM plaid_transactions WHERE tenant_id=$1 AND transaction_id=$2',
        [tenantId, r.transaction_id]
      ).catch(() => {});
    }

    cursor  = next_cursor;
    hasMore = has_more;
  }

  // Update cursor and last sync time
  await queryForTenant(tenantId,
    'UPDATE plaid_items SET cursor=$1, last_sync=now(), updated_at=now() WHERE id=$2',
    [cursor, plaidItemId]
  );

  return { synced: added };
}

// ── Get connected items ───────────────────────────────────────────────────────
async function getItems(tenantId, locationId) {
  await ensureTables();
  const params = [tenantId];
  const locWhere = locationId ? ' AND (location_id=$2 OR location_id IS NULL)' : '';
  if (locationId) params.push(locationId);
  const r = await queryForTenant(tenantId,
    `SELECT id, institution_name, institution_id, accounts, status, last_sync, created_at
     FROM plaid_items WHERE tenant_id=$1 AND status='active'${locWhere} ORDER BY created_at`,
    params
  );
  return r.rows;
}

async function removeItem(tenantId, itemId) {
  const item = await queryForTenant(tenantId, 'SELECT * FROM plaid_items WHERE id=$1 AND tenant_id=$2', [itemId, tenantId]);
  if (!item.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  try {
    const client = getPlaidClient();
    await client.itemRemove({ access_token: item.rows[0].access_token });
  } catch(_) {}
  await queryForTenant(tenantId, 'UPDATE plaid_items SET status=$1 WHERE id=$2', ['removed', itemId]);
  return { ok: true };
}

// ── P&L calculation ───────────────────────────────────────────────────────────
async function getPL(tenantId, { locationId, periodStart, periodEnd, groupBy = 'week' }) {
  await ensureTables();

  const locWhere = locationId ? " AND (pt.location_id=$4 OR pt.location_id IS NULL)" : "";
  const params   = [tenantId, periodStart, periodEnd];
  if (locationId) params.push(locationId);

  // Transactions from Plaid
  const txResult = await queryForTenant(tenantId, `
    SELECT
      pl_category,
      SUM(CASE WHEN pl_category = 'revenue' THEN -amount ELSE amount END) as amount,
      COUNT(*) as tx_count,
      date_trunc($5, date::timestamptz) as period
    FROM plaid_transactions pt
    WHERE pt.tenant_id=$1
      AND pt.date BETWEEN $2 AND $3
      AND pt.pending = false
      AND pt.pl_category != 'transfer'
      ${locWhere}
    GROUP BY pl_category, date_trunc($5, date::timestamptz)
    ORDER BY period, pl_category
  `, [...params, groupBy]);

  // Manual entries
  const manualResult = await queryForTenant(tenantId, `
    SELECT category as pl_category, SUM(amount) as amount, COUNT(*) as tx_count,
           date_trunc($4, period_start::timestamptz) as period
    FROM pl_manual_entries
    WHERE tenant_id=$1 AND period_start >= $2 AND period_end <= $3
    ${locationId ? "AND (location_id=$5 OR location_id IS NULL)" : ""}
    GROUP BY category, date_trunc($4, period_start::timestamptz)
    ORDER BY period, category
  `, locationId ? [tenantId, periodStart, periodEnd, groupBy, locationId] : [tenantId, periodStart, periodEnd, groupBy]);

  // COGS from inventory (approved invoices)
  const cogsResult = await queryForTenant(tenantId, `
    SELECT
      'cogs' as pl_category,
      SUM(total_amount) as amount,
      COUNT(*) as tx_count,
      date_trunc($4, invoice_date::timestamptz) as period
    FROM invoices
    WHERE tenant_id=$1 AND status='approved'
      AND invoice_date BETWEEN $2 AND $3
      ${locationId ? "AND (location_id=$5 OR location_id IS NULL)" : ""}
    GROUP BY date_trunc($4, invoice_date::timestamptz)
  `, locationId ? [tenantId, periodStart, periodEnd, groupBy, locationId] : [tenantId, periodStart, periodEnd, groupBy]);

  // Targets
  const targetParams = [tenantId, locationId || null];
  const targetResult = await queryForTenant(tenantId,
    'SELECT * FROM pl_targets WHERE tenant_id=$1 AND (location_id=$2 OR location_id IS NULL) LIMIT 1',
    targetParams
  );
  const targets = targetResult.rows[0] || { food_cost_pct: 28, labor_cost_pct: 32, overhead_pct: 15 };

  // Merge all data by period
  const periods = {};
  const addToPeriod = (row) => {
    const p = row.period ? new Date(row.period).toISOString().slice(0,10) : 'total';
    if (!periods[p]) periods[p] = { period: p, revenue: 0, cogs: 0, labor: 0, rent: 0, utilities: 0, insurance: 0, marketing: 0, other: 0 };
    const cat = row.pl_category || 'other';
    if (periods[p][cat] !== undefined) periods[p][cat] += parseFloat(row.amount || 0);
    else periods[p].other += parseFloat(row.amount || 0);
  };

  [...txResult.rows, ...manualResult.rows, ...cogsResult.rows].forEach(addToPeriod);

  // Calculate derived metrics per period
  const periodsArr = Object.values(periods).sort((a,b) => a.period.localeCompare(b.period)).map(p => {
    const grossProfit = p.revenue - p.cogs;
    const totalOpex   = p.labor + p.rent + p.utilities + p.insurance + p.marketing + p.other;
    const netIncome   = grossProfit - totalOpex;
    return {
      ...p,
      gross_profit:     grossProfit,
      total_opex:       totalOpex,
      net_income:       netIncome,
      food_cost_pct:    p.revenue > 0 ? (p.cogs   / p.revenue * 100) : 0,
      labor_cost_pct:   p.revenue > 0 ? (p.labor  / p.revenue * 100) : 0,
      net_margin_pct:   p.revenue > 0 ? (netIncome / p.revenue * 100) : 0,
    };
  });

  // Summary totals
  const totals = periodsArr.reduce((acc, p) => {
    Object.keys(p).forEach(k => { if (typeof p[k] === 'number') acc[k] = (acc[k] || 0) + p[k]; });
    return acc;
  }, { period: 'total' });
  if (totals.revenue > 0) {
    totals.food_cost_pct  = totals.cogs   / totals.revenue * 100;
    totals.labor_cost_pct = totals.labor  / totals.revenue * 100;
    totals.net_margin_pct = totals.net_income / totals.revenue * 100;
  }

  return { periods: periodsArr, totals, targets };
}

// ── Get transactions ──────────────────────────────────────────────────────────
async function getTransactions(tenantId, { locationId, periodStart, periodEnd, plCategory, search, limit = 100 } = {}) {
  await ensureTables();
  const lim = parseInt(limit) || 100;

  // Query 1: Plaid transactions
  const plaidParams = [tenantId]; let pi = 2;
  let plaidWhere = 'AND pending=false';
  if (locationId)  { plaidWhere += ` AND (location_id=$${pi++} OR location_id IS NULL)`; plaidParams.push(locationId); }
  if (periodStart) { plaidWhere += ` AND date >= $${pi++}`;  plaidParams.push(periodStart); }
  if (periodEnd)   { plaidWhere += ` AND date <= $${pi++}`;  plaidParams.push(periodEnd); }
  if (plCategory)  { plaidWhere += ` AND pl_category=$${pi++}`; plaidParams.push(plCategory); }
  if (search)      { plaidWhere += ` AND (LOWER(COALESCE(merchant_name,name,'')) LIKE LOWER($${pi++}))`; plaidParams.push(`%${search}%`); }
  plaidParams.push(lim);

  const plaidResult = await adminQuery(
    `SELECT id, tenant_id, location_id, date::text AS date,
            COALESCE(merchant_name, name, '') AS merchant_name,
            COALESCE(merchant_name, name, '') AS name,
            amount, pl_category, pending, COALESCE(account_name,'') AS account_name, 'plaid' AS source
     FROM plaid_transactions WHERE tenant_id=$1 ${plaidWhere}
     ORDER BY date DESC LIMIT $${pi}`, plaidParams
  ).catch(() => ({ rows: [] }));

  // Query 2: Manual / imported entries
  const manParams = [tenantId]; let mi = 2;
  let manWhere = '';
  if (locationId)  { manWhere += ` AND (location_id=$${mi++} OR location_id IS NULL)`; manParams.push(locationId); }
  if (periodStart) { manWhere += ` AND period_start >= $${mi++}`;  manParams.push(periodStart); }
  if (periodEnd)   { manWhere += ` AND period_start <= $${mi++}`;  manParams.push(periodEnd); }
  if (plCategory)  { manWhere += ` AND category=$${mi++}`; manParams.push(plCategory); }
  if (search)      { manWhere += ` AND LOWER(label) LIKE LOWER($${mi++})`; manParams.push(`%${search}%`); }
  manParams.push(lim);

  const manResult = await adminQuery(
    `SELECT id, tenant_id, location_id, period_start::text AS date,
            label AS merchant_name, label AS name,
            amount, category AS pl_category, false AS pending,
            'Imported' AS account_name, 'imported' AS source
     FROM pl_manual_entries WHERE tenant_id=$1 ${manWhere}
     ORDER BY period_start DESC LIMIT $${mi}`, manParams
  ).catch(() => ({ rows: [] }));

  // Merge, sort by date desc, cap at limit
  return [...plaidResult.rows, ...manResult.rows]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, lim);
}

async function updateTransactionCategory(tenantId, txId, plCategory) {
  // Find the transaction description for rule learning
  const ptx = await adminQuery(
    `SELECT COALESCE(merchant_name, name, '') AS desc FROM plaid_transactions WHERE id=$1 AND tenant_id=$2
     UNION ALL SELECT label FROM pl_manual_entries WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
    [txId, tenantId]
  ).catch(() => ({ rows: [] }));
  const desc = ptx.rows[0]?.desc;

  // Update category in both tables
  await adminQuery('UPDATE plaid_transactions SET pl_category=$1 WHERE id=$2 AND tenant_id=$3', [plCategory, txId, tenantId]).catch(()=>{});
  await adminQuery('UPDATE pl_manual_entries SET category=$1 WHERE id=$2 AND tenant_id=$3', [plCategory, txId, tenantId]).catch(()=>{});

  // Learn from this manual categorization
  if (desc) await saveRuleFromRecategorization(tenantId, desc, plCategory);

  return { id: txId, pl_category: plCategory };
}

// ── Manual entries ────────────────────────────────────────────────────────────
async function createManualEntry(tenantId, data) {
  await ensureTables();
  const { locationId, periodStart, periodEnd, category, label, amount, notes, userId } = data;
  const r = await queryForTenant(tenantId, `
    INSERT INTO pl_manual_entries (tenant_id, location_id, period_start, period_end, category, label, amount, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [tenantId, locationId||null, periodStart, periodEnd, category, label, amount, notes||null, userId||null]);
  return r.rows[0];
}

async function deleteManualEntry(tenantId, entryId) {
  await queryForTenant(tenantId, 'DELETE FROM pl_manual_entries WHERE id=$1 AND tenant_id=$2', [entryId, tenantId]);
  return { ok: true };
}

// ── Targets ───────────────────────────────────────────────────────────────────
async function saveTargets(tenantId, { locationId, foodCostPct, laborCostPct, overheadPct }) {
  await ensureTables();
  await queryForTenant(tenantId, `
    INSERT INTO pl_targets (tenant_id, location_id, food_cost_pct, labor_cost_pct, overhead_pct)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (tenant_id, location_id) DO UPDATE
    SET food_cost_pct=$3, labor_cost_pct=$4, overhead_pct=$5, updated_at=now()
  `, [tenantId, locationId||null, foodCostPct||28, laborCostPct||32, overheadPct||15]);
  return { ok: true };
}

async function getSummary(tenantId, locationId) {
  await ensureTables();
  const today      = new Date().toISOString().slice(0,10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);

  const [items, revenue, spend] = await Promise.all([
    queryForTenant(tenantId, `SELECT COUNT(*) FROM plaid_items WHERE tenant_id=$1 AND status='active'${locationId?" AND (location_id=$2 OR location_id IS NULL)":''}`, locationId?[tenantId,locationId]:[tenantId]),
    queryForTenant(tenantId, `SELECT COALESCE(SUM(-amount),0) as total FROM plaid_transactions WHERE tenant_id=$1 AND pl_category='revenue' AND date BETWEEN $2 AND $3 AND pending=false${locationId?" AND (location_id=$4 OR location_id IS NULL)":''}`, locationId?[tenantId,monthStart,today,locationId]:[tenantId,monthStart,today]),
    queryForTenant(tenantId, `SELECT COALESCE(SUM(amount),0) as total FROM plaid_transactions WHERE tenant_id=$1 AND pl_category!='revenue' AND pl_category!='transfer' AND date BETWEEN $2 AND $3 AND pending=false${locationId?" AND (location_id=$4 OR location_id IS NULL)":''}`, locationId?[tenantId,monthStart,today,locationId]:[tenantId,monthStart,today]),
  ]);

  return {
    connected_accounts: parseInt(items.rows[0]?.count || 0),
    revenue_mtd:        parseFloat(revenue.rows[0]?.total || 0),
    spend_mtd:          parseFloat(spend.rows[0]?.total || 0),
    net_mtd:            parseFloat(revenue.rows[0]?.total || 0) - parseFloat(spend.rows[0]?.total || 0),
  };
}


// ── Sandbox: fire test transactions ──────────────────────────────────────────
async function fireSandboxTransactions(tenantId, plaidItemId) {
  const itemResult = await queryForTenant(tenantId,
    'SELECT * FROM plaid_items WHERE id=$1 AND tenant_id=$2', [plaidItemId, tenantId]);
  const item = itemResult.rows[0];
  if (!item) throw new Error('Item not found');

  const client = getPlaidClient();

  // In sandbox, use sandbox/transactions/create to seed test data
  try {
    const endDate   = new Date().toISOString().slice(0,10);
    const startDate = new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10);
    // Create sandbox test transactions
    await client.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: ['transactions'],
    });
  } catch(_) {}

  // Just go straight to the legacy sync — it reads whatever is there
  return syncTransactionsLegacy(tenantId, plaidItemId);
}

// ── Fallback: use older transactions/get API ──────────────────────────────────
async function syncTransactionsLegacy(tenantId, plaidItemId) {
  const itemResult = await queryForTenant(tenantId,
    'SELECT * FROM plaid_items WHERE id=$1 AND tenant_id=$2', [plaidItemId, tenantId]);
  const item = itemResult.rows[0];
  if (!item) throw new Error('Item not found');

  const client = getPlaidClient();
  const endDate   = new Date().toISOString().slice(0,10);
  const startDate = new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10);
  console.log(`[plaid legacy] syncing ${plaidItemId} from ${startDate} to ${endDate}`);

  let offset = 0, total = 0, added = 0;
  do {
    let res;
    try {
      res = await client.transactionsGet({
        access_token: item.access_token,
        start_date:   startDate,
        end_date:     endDate,
        options:      { count: 500, offset },
      });
    } catch(e) {
      const plaidErr = e.response?.data || e.message;
      console.error('[plaid legacy] transactionsGet error:', JSON.stringify(plaidErr));
      throw new Error(typeof plaidErr === 'object' ? (plaidErr.error_message || plaidErr.error_code || JSON.stringify(plaidErr)) : plaidErr);
    }
    total = res.data.total_transactions;
    const txns = res.data.transactions;

    for (const tx of txns) {
      const plCat = mapPLCategory(tx.category?.[0] || '', tx.merchant_name || tx.name);
      await queryForTenant(tenantId, `
        INSERT INTO plaid_transactions
          (tenant_id, location_id, plaid_item_id, transaction_id, account_id, account_name,
           amount, date, name, merchant_name, category, pl_category, pending, iso_currency_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (tenant_id, transaction_id) DO UPDATE
        SET amount=$7, date=$8, name=$9, merchant_name=$10, pl_category=$12, pending=$13
      `, [
        tenantId, item.location_id, plaidItemId, tx.transaction_id,
        tx.account_id,
        item.accounts?.find(a => a.account_id === tx.account_id)?.name || '',
        tx.amount, tx.date, tx.name, tx.merchant_name || null,
        tx.category?.[0] || null, plCat, tx.pending,
        tx.iso_currency_code || 'USD',
      ]).catch(() => {});
      added++;
    }
    offset += txns.length;
  } while (offset < total);

  await queryForTenant(tenantId,
    'UPDATE plaid_items SET last_sync=now() WHERE id=$1', [plaidItemId]);

  return { synced: added };
}


// ── Monthly P&L — groups all transactions by calendar month ──────────────────
async function getMonthlyPL(tenantId, locationId, months = 6) {
  await ensureTables();
  const locFilter = locationId ? ' AND (pt.location_id=$3 OR pt.location_id IS NULL)' : '';
  const params    = locationId ? [tenantId, months, locationId] : [tenantId, months];

  // Plaid transactions grouped by month
  const txRows = await adminQuery(`
    SELECT
      to_char(date_trunc('month', date::timestamptz), 'YYYY-MM') AS month,
      pl_category,
      SUM(CASE WHEN pl_category='revenue' THEN -amount ELSE amount END) AS amount,
      COUNT(*) AS tx_count
    FROM plaid_transactions pt
    WHERE pt.tenant_id=$1
      AND pt.pending=false
      AND pt.pl_category != 'transfer'
      AND date >= date_trunc('month', CURRENT_DATE - ($2-1 || ' months')::interval)
      ${locFilter}
    GROUP BY month, pl_category
    ORDER BY month, pl_category
  `, params);

  // Manual entries grouped by month
  const manualRows = await adminQuery(`
    SELECT
      to_char(date_trunc('month', period_start::timestamptz), 'YYYY-MM') AS month,
      category AS pl_category,
      SUM(CASE WHEN category='revenue' THEN amount ELSE amount END) AS amount,
      COUNT(*) AS tx_count
    FROM pl_manual_entries
    WHERE tenant_id=$1
      AND period_start >= date_trunc('month', CURRENT_DATE - ($2-1 || ' months')::interval)
      ${locationId ? 'AND (location_id=$3 OR location_id IS NULL)' : ''}
    GROUP BY month, pl_category
    ORDER BY month, pl_category
  `, params).catch(() => ({ rows: [] }));

  // Build month map
  const monthData = {};
  const allMonths = new Set();

  for (const row of [...txRows.rows, ...manualRows.rows]) {
    allMonths.add(row.month);
    if (!monthData[row.month]) monthData[row.month] = {};
    const cat = row.pl_category || 'other';
    monthData[row.month][cat] = (monthData[row.month][cat] || 0) + parseFloat(row.amount || 0);
  }

  // Pure cash basis — no KPI fallback. Data comes from bank/Plaid only.

  const EXPENSE_CATS = ['cogs','labor','rent','utilities','insurance','repairs','credit_card_fees','professional_fees','supplies','marketing','other'];

  const periods = [...allMonths].sort().map(month => {
    const d = monthData[month] || {};
    const revenue      = d.revenue      || 0;
    const totalExpense = EXPENSE_CATS.reduce((s, c) => s + (d[c] || 0), 0);
    const grossProfit  = revenue - (d.cogs || 0) - (d.labor || 0);
    const netIncome    = revenue - totalExpense;

    return {
      month,
      label: new Date(month + '-15').toLocaleDateString('en-US', { month:'short', year:'numeric' }),
      revenue,
      cogs:               d.cogs               || 0,
      labor:              d.labor              || 0,
      rent:               d.rent               || 0,
      utilities:          d.utilities          || 0,
      insurance:          d.insurance          || 0,
      repairs:            d.repairs            || 0,
      credit_card_fees:   d.credit_card_fees   || 0,
      professional_fees:  d.professional_fees  || 0,
      supplies:           d.supplies           || 0,
      marketing:          d.marketing          || 0,
      other:              d.other              || 0,
      gross_profit:       grossProfit,
      total_expense:      totalExpense,
      net_income:         netIncome,
      net_margin_pct:     revenue > 0 ? (netIncome / revenue * 100) : null,
      cogs_pct:           revenue > 0 ? (d.cogs   / revenue * 100)  : null,
      labor_pct:          revenue > 0 ? (d.labor  / revenue * 100)  : null,
      data_source:        'bank',
    };
  });

  return { periods, months: periods.length };
}


// ── CSV / PDF statement upload ─────────────────────────────────────────────────
const { callClaude, parseJSON } = require('../../lib/claude');

async function parseAndImportStatement(tenantId, locationId, fileContent, fileName, mimeType) {
  await ensureTables();

  const isCSV = mimeType === 'text/csv' || fileName.toLowerCase().endsWith('.csv');
  const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  if (!isCSV && !isPDF) throw new Error('Unsupported file type. Please upload a CSV file exported from your bank.');

  // For CSV: split into chunks of 150 rows to stay well under token limits
  const CAT_GUIDE = `Categories:
- revenue: deposits, POS settlements (Toast, Square, Stripe, OpenTable, Resy)
- cogs: food/beverage vendors (Sysco, US Foods, produce, alcohol distributors)
- labor: payroll, Gusto, ADP, HotSchedules, Homebase
- rent: lease/rent payments
- utilities: PG&E, gas, water, electric, internet (Comcast, AT&T)
- insurance: any insurance payment
- repairs: maintenance, HVAC, plumber, repair companies
- credit_card_fees: Stripe fees, Square fees, processing fees, merchant fees
- professional_fees: accountant, bookkeeper, lawyer, consultant
- supplies: cleaning, uniforms, kitchen supplies, linen
- marketing: Google Ads, Meta, Yelp advertising
- other: anything else that is a business expense
- transfer: bank transfers between accounts, owner draws (imported but not counted in P&L)
- excluded: personal expenses, non-business items (visible but not counted in P&L)`;

  // Load learned rules and custom categories for this tenant
  const [learnedRules, customCats] = await Promise.all([
    getCategoryRules(tenantId).catch(() => []),
    getCustomCategories(tenantId).catch(() => []),
  ]);

  const rulesSection = learnedRules.length > 0
    ? `\nPreviously learned mappings (apply these first):\n` +
      learnedRules.slice(0, 50).map(r => `- "${r.pattern}" → ${r.category} (used ${r.match_count}x)`).join('\n')
    : '';

  const customCatSection = customCats.length > 0
    ? `\nCustom categories (also valid):\n` +
      customCats.map(c => `- ${c.key}: ${c.label}`).join('\n')
    : '';

  function buildPrompt(rows) {
    return `Parse these bank/credit card transactions for a restaurant P&L.
${CAT_GUIDE}${customCatSection}${rulesSection}

Transactions:
${rows}

Return ONLY a valid complete JSON array — no markdown, no explanation, no trailing text:
[{"date":"YYYY-MM-DD","description":"merchant name","amount":123.45,"is_debit":true,"pl_category":"cogs","confidence":"high"}]`;
  }

  function extractTransactions(text) {
    // Try clean parse first
    try {
      const clean = text.replace(/```json?\n?|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) return parsed;
    } catch(_) {}
    // Extract all complete objects — handles truncation
    const results = [];
    const regex = /\{\s*"date"\s*:\s*"[^"]+",\s*"description"\s*:\s*"[^"]*",\s*"amount"\s*:\s*[\d.]+,\s*"is_debit"\s*:\s*(?:true|false),\s*"pl_category"\s*:\s*"[^"]+",\s*"confidence"\s*:\s*"[^"]+"\s*\}/g;
    const matches = text.match(regex) || [];
    for (const m of matches) {
      try { results.push(JSON.parse(m)); } catch(_) {}
    }
    return results;
  }

  let allTransactions = [];

  if (isCSV) {
    const csvText = (Buffer.isBuffer(fileContent) ? fileContent.toString('utf8') : fileContent).trim();
    const lines = csvText.split('\n').filter(l => l.trim());
    const header = lines[0];
    const dataLines = lines.slice(1).filter(l => l.trim());

    // Process in chunks of 75 rows — smaller chunks = more reliable JSON completion
    const CHUNK = 75;
    const chunkErrors = [];
    for (let ci = 0; ci < dataLines.length; ci += CHUNK) {
      const chunk = dataLines.slice(ci, ci + CHUNK);
      const chunkText = [header, ...chunk].join('\n');
      const prompt = buildPrompt(chunkText);
      try {
        const resultText = await callClaude({ content: prompt, maxTokens: 8000, timeoutMs: 90000 });
        const txs = extractTransactions(resultText);
        if (txs.length === 0) {
          // Retry once with smaller batch if nothing extracted
          const half = Math.ceil(chunk.length / 2);
          for (const subChunk of [chunk.slice(0, half), chunk.slice(half)]) {
            if (subChunk.length === 0) continue;
            const subText = [header, ...subChunk].join('\n');
            const subResult = await callClaude({ content: buildPrompt(subText), maxTokens: 8000, timeoutMs: 90000 });
            allTransactions = allTransactions.concat(extractTransactions(subResult));
          }
        } else {
          allTransactions = allTransactions.concat(txs);
        }
      } catch(chunkErr) {
        chunkErrors.push({ rows: `${ci+1}-${ci+chunk.length}`, error: chunkErr.message });
        console.error(`[agent5/import] chunk ${ci}-${ci+chunk.length} failed:`, chunkErr.message);
      }
    }
    if (chunkErrors.length > 0) {
      console.warn(`[agent5/import] ${chunkErrors.length} chunks had errors, recovered what we could`);
    }
  } else {
    // PDF — single call with document block
    const base64 = Buffer.isBuffer(fileContent) ? fileContent.toString('base64') : fileContent;
    const prompt = `Parse this bank statement PDF for a restaurant P&L.
${CAT_GUIDE}
Return ONLY a valid complete JSON array:
[{"date":"YYYY-MM-DD","description":"string","amount":123.45,"is_debit":true,"pl_category":"cogs","confidence":"high"}]`;
    const resultText = await callClaude({
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt }
      ],
      maxTokens: 8000,
      timeoutMs: 90000,
    });
    allTransactions = extractTransactions(resultText);
  }

  if (allTransactions.length === 0) {
    throw new Error('No transactions found. Make sure the file has transaction data with dates and amounts.');
  }

  // Save to pl_manual_entries
  let imported = 0;
  for (const tx of allTransactions) {
    if (!tx.date || tx.amount == null) continue;
    // transfers ARE imported — visible in transactions tab but excluded from P&L calculations
    const amount = Math.abs(parseFloat(tx.amount));
    if (amount === 0) continue;
    const ins = await adminQuery(
      `INSERT INTO pl_manual_entries (tenant_id, location_id, period_start, period_end, category, label, amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, location_id, period_start, label, amount) DO NOTHING
       RETURNING id`,
      [tenantId, locationId || null,
       tx.date, tx.date,
       tx.pl_category || 'other',
       (tx.description || 'Imported transaction').slice(0, 200),
       amount,
       `Imported from ${fileName} · confidence: ${tx.confidence || 'unknown'}`]
    ).catch(() => ({ rows: [] }));
    if (ins.rows.length > 0) imported++;
    // else: duplicate, silently skipped
  }

  const duplicates_skipped = allTransactions.length - imported;
  return {
    imported,
    total: allTransactions.length,
    skipped_transfers: 0,
    duplicates_skipped: Math.max(0, duplicates_skipped),
    transactions: allTransactions.slice(0, 50)
  };
}


module.exports = {
  AGENT_ID, ensureTables,
  createLinkToken, exchangePublicToken,
  getItems, removeItem, syncTransactions,
  getPL, getTransactions, updateTransactionCategory,
  createManualEntry, deleteManualEntry,
  saveTargets, getSummary,
  fireSandboxTransactions, syncTransactionsLegacy, createUpdateLinkToken,
  getMonthlyPL, parseAndImportStatement,
  getCategoryRules, saveRuleFromRecategorization,
  getCustomCategories, saveCustomCategory, deleteCustomCategory,
};
