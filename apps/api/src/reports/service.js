'use strict';
const { adminQuery } = require('@restaurantos/db');

let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS monthly_sales (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_name VARCHAR(200) NOT NULL,
      currency      VARCHAR(10) NOT NULL DEFAULT 'USD',
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      net_sales     NUMERIC(14,2),
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_name, year, month)
    )
  `).catch(() => {});
  await adminQuery(`CREATE INDEX IF NOT EXISTS monthly_sales_tenant ON monthly_sales(tenant_id, location_name, year, month)`).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS weekly_payroll (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_name   VARCHAR(200) NOT NULL,
      week_ending     DATE NOT NULL,
      total_payroll   NUMERIC(12,2),
      payroll_base    NUMERIC(12,2),
      er_taxes        NUMERIC(12,2),
      net_sales       NUMERIC(12,2),
      payroll_pct     NUMERIC(6,2),
      foh_wages       NUMERIC(12,2),
      foh_pct         NUMERIC(6,2),
      boh_wages       NUMERIC(12,2),
      boh_pct         NUMERIC(6,2),
      other_wages     NUMERIC(12,2),
      other_pct       NUMERIC(6,2),
      support_wages   NUMERIC(12,2),
      support_pct     NUMERIC(6,2),
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_name, week_ending)
    )
  `).catch(() => {});
  await adminQuery(`CREATE INDEX IF NOT EXISTS weekly_payroll_tenant ON weekly_payroll(tenant_id, location_name, week_ending DESC)`).catch(() => {});
  _ready = true;
}

async function getMonthlySales(tenantId, { locationName, yearFrom, yearTo } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationName) { where += ` AND location_name=$${i++}`; params.push(locationName); }
  if (yearFrom)     { where += ` AND year>=$${i++}`;          params.push(parseInt(yearFrom)); }
  if (yearTo)       { where += ` AND year<=$${i++}`;          params.push(parseInt(yearTo)); }
  const r = await adminQuery(
    `SELECT location_name, currency, year, month, net_sales, notes
     FROM monthly_sales WHERE ${where}
     ORDER BY location_name, year, month`, params
  );
  return r.rows;
}

async function upsertMonthlySales(tenantId, { locationName, currency, year, month, netSales, notes }) {
  await ensureTables();
  const r = await adminQuery(`
    INSERT INTO monthly_sales (tenant_id, location_name, currency, year, month, net_sales, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (tenant_id, location_name, year, month) DO UPDATE SET
      net_sales  = EXCLUDED.net_sales,
      currency   = EXCLUDED.currency,
      notes      = COALESCE(EXCLUDED.notes, monthly_sales.notes),
      updated_at = now()
    RETURNING *`,
    [tenantId, locationName, currency || 'USD', parseInt(year), parseInt(month), netSales, notes || null]
  );
  return r.rows[0];
}

async function deleteMonthlySales(tenantId, { locationName, year, month }) {
  await adminQuery(
    'DELETE FROM monthly_sales WHERE tenant_id=$1 AND location_name=$2 AND year=$3 AND month=$4',
    [tenantId, locationName, parseInt(year), parseInt(month)]
  );
}

async function getLocations(tenantId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT DISTINCT location_name, currency FROM monthly_sales WHERE tenant_id=$1 ORDER BY location_name`,
    [tenantId]
  );
  return r.rows;
}


async function getWeeklyPayroll(tenantId, { locationName, yearFrom, yearTo, limit = 500 } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationName) { where += ` AND location_name=$${i++}`; params.push(locationName); }
  if (yearFrom)     { where += ` AND EXTRACT(YEAR FROM week_ending)>=$${i++}`; params.push(parseInt(yearFrom)); }
  if (yearTo)       { where += ` AND EXTRACT(YEAR FROM week_ending)<=$${i++}`; params.push(parseInt(yearTo)); }
  params.push(limit);
  const r = await adminQuery(
    `SELECT *, week_ending::text AS week_ending_str FROM weekly_payroll WHERE ${where} ORDER BY weekly_payroll.week_ending DESC LIMIT $${i}`, params
  );
  return r.rows;
}

async function upsertWeeklyPayroll(tenantId, data) {
  await ensureTables();
  const { locationName, weekEnding, totalPayroll, payrollBase,
          erTaxesOther, erTaxesFoh, erTaxesBoh, erTaxesSupport,
          netSales, payrollPct, payrollTaxPct,
          fohWages, fohPct, bohWages, bohPct, otherWages, otherPct,
          supportWages, supportPct, notes } = data;
  const r = await adminQuery(`
    INSERT INTO weekly_payroll
      (tenant_id, location_name, week_ending, total_payroll, payroll_base,
       er_taxes_other, er_taxes_foh, er_taxes_boh, er_taxes_support,
       net_sales, payroll_pct, payroll_tax_pct,
       foh_wages, foh_pct, boh_wages, boh_pct,
       other_wages, other_pct, support_wages, support_pct, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    ON CONFLICT (tenant_id, location_name, week_ending) DO UPDATE SET
      total_payroll=COALESCE(EXCLUDED.total_payroll,weekly_payroll.total_payroll),
      payroll_base=COALESCE(EXCLUDED.payroll_base,weekly_payroll.payroll_base),
      er_taxes_other=COALESCE(EXCLUDED.er_taxes_other,weekly_payroll.er_taxes_other),
      er_taxes_foh=COALESCE(EXCLUDED.er_taxes_foh,weekly_payroll.er_taxes_foh),
      er_taxes_boh=COALESCE(EXCLUDED.er_taxes_boh,weekly_payroll.er_taxes_boh),
      er_taxes_support=COALESCE(EXCLUDED.er_taxes_support,weekly_payroll.er_taxes_support),
      net_sales=COALESCE(EXCLUDED.net_sales,weekly_payroll.net_sales),
      payroll_pct=COALESCE(EXCLUDED.payroll_pct,weekly_payroll.payroll_pct),
      payroll_tax_pct=COALESCE(EXCLUDED.payroll_tax_pct,weekly_payroll.payroll_tax_pct),
      foh_wages=COALESCE(EXCLUDED.foh_wages,weekly_payroll.foh_wages),
      foh_pct=COALESCE(EXCLUDED.foh_pct,weekly_payroll.foh_pct),
      boh_wages=COALESCE(EXCLUDED.boh_wages,weekly_payroll.boh_wages),
      boh_pct=COALESCE(EXCLUDED.boh_pct,weekly_payroll.boh_pct),
      other_wages=COALESCE(EXCLUDED.other_wages,weekly_payroll.other_wages),
      other_pct=COALESCE(EXCLUDED.other_pct,weekly_payroll.other_pct),
      support_wages=COALESCE(EXCLUDED.support_wages,weekly_payroll.support_wages),
      support_pct=COALESCE(EXCLUDED.support_pct,weekly_payroll.support_pct),
      notes=COALESCE(EXCLUDED.notes,weekly_payroll.notes)
    RETURNING *`,
    [tenantId, locationName, weekEnding, totalPayroll||null, payrollBase||null,
     erTaxesOther||null, erTaxesFoh||null, erTaxesBoh||null, erTaxesSupport||null,
     netSales||null, payrollPct||null, payrollTaxPct||null,
     fohWages||null, fohPct||null, bohWages||null, bohPct||null,
     otherWages||null, otherPct||null, supportWages||null, supportPct||null, notes||null]
  );
  return r.rows[0];
}

async function getPayrollLocations(tenantId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT DISTINCT location_name FROM weekly_payroll WHERE tenant_id=$1 ORDER BY location_name`,
    [tenantId]
  );
  return r.rows.map(r => r.location_name);
}

module.exports = { getMonthlySales, upsertMonthlySales, deleteMonthlySales, getLocations, ensureTables,
  getWeeklyPayroll, upsertWeeklyPayroll, getPayrollLocations };
