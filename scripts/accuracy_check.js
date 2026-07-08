'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (t,p=[]) => pool.query(t,p);

const TENANT = 'fae33a6d-1124-48ac-bff8-3a734072acad';
const LOC    = '19a68183-b312-480f-b59c-093ed39e6340';

async function check() {
  const results = await Promise.all([
    q('SELECT week_start, total_sales, food_cost_pct, bar_cost_pct FROM weekly_kpi WHERE tenant_id=$1 ORDER BY week_start DESC LIMIT 2', [TENANT]),
    q('SELECT COUNT(*) as total, ROUND(AVG(rating),2) as avg_rating, COUNT(*) FILTER(WHERE rating<=2) as negative, COUNT(*) FILTER(WHERE status=\'pending\') as pending FROM reviews WHERE tenant_id=$1 AND location_id=$2', [TENANT,LOC]),
    q('SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status=\'active\') as active FROM employees WHERE tenant_id=$1 AND location_id=$2', [TENANT,LOC]),
    q('SELECT COUNT(*) as total, ROUND(AVG(CASE WHEN price>0 THEN (price-COALESCE(food_cost,0))/price*100 END),1) as avg_margin FROM menu_items WHERE tenant_id=$1 AND location_id=$2', [TENANT,LOC]),
    q('SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE tier=\'platinum\') as platinum, COUNT(*) FILTER(WHERE tier=\'gold\') as gold FROM loyalty_members WHERE tenant_id=$1 AND location_id=$2', [TENANT,LOC]),
    q(`SELECT mi.name, SUM(s.units_sold) as units FROM menu_item_sales s JOIN menu_items mi ON mi.id=s.item_id WHERE s.tenant_id=$1 AND s.week_start >= CURRENT_DATE-28 GROUP BY mi.name ORDER BY units DESC LIMIT 5`, [TENANT]),
    q('SELECT COUNT(*) FILTER(WHERE expiry_date < CURRENT_DATE) as expired, COUNT(*) FILTER(WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30) as expiring FROM compliance_certifications WHERE tenant_id=$1 AND location_id=$2', [TENANT,LOC]),
  ]);

  console.log('\n=== GROUND TRUTH FOR ACCURACY TESTING ===\n');
  console.log('FINANCIAL (latest week):');
  results[0].rows.forEach(r => console.log(' ', r.week_start, '| sales:', r.total_sales, '| food_cost:', r.food_cost_pct+'%', '| bar_cost:', r.bar_cost_pct+'%'));
  console.log('\nREVIEWS:', results[1].rows[0]);
  console.log('EMPLOYEES:', results[2].rows[0]);
  console.log('MENU:', results[3].rows[0]);
  console.log('LOYALTY:', results[4].rows[0]);
  console.log('\nTOP SELLERS (last 4 weeks):');
  results[5].rows.forEach(r => console.log(' ', r.name, '-', r.units, 'units'));
  console.log('\nCOMPLIANCE:', results[6].rows[0]);
  
  await pool.end();
}
check().catch(e => { console.error(e.message); pool.end(); });
