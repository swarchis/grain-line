#!/usr/bin/env node
// ─── Pulse Demo Seed — Rooh SF ───────────────────────────────────────────────
// Populates ONE location with realistic demo data across all 11 agents.
// Run from apps/api directory:
//   cd apps/api && DATABASE_URL=... node ../../scripts/seed_demo.js
// OR use npm script: DATABASE_URL=... npm run seed:demo
//
// What gets created:
//   • Rooh SF location (or uses existing)
//   • 22 employees (FOH + BOH + management) with schedules, availability
//   • 8 weeks of weekly KPI (financial metrics)
//   • 45 inventory items with invoices, counts, par levels
//   • 29 menu items across 6 sections with 8 weeks of sales data
//   • 18 reviews (Google + Yelp) with responses
//   • Loyalty members + tiers
//   • Training modules with full content + gamification leaderboard
//   • Compliance certifications
//   • Published labor schedule for current week
//   • Marketing posts (published + drafts)
'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
const q = (text, params) => pool.query(text, params);

// ── Helpers ───────────────────────────────────────────────────────────────────
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const weekStart = (offset=0) => {
  const d = new Date(); const dow = d.getDay();
  d.setDate(d.getDate() - (dow===0?6:dow-1) + offset*7);
  return d.toISOString().slice(0,10);
};

async function seed() {
  console.log('🌱 Pulse Demo Seed — Rooh SF\n');

  // ── 1. Get tenant + location ──────────────────────────────────────────────
  // Show all tenants so user can confirm
  const allTenants = await q("SELECT id, name FROM tenants ORDER BY name");
  console.log('\nAll tenants:');
  allTenants.rows.forEach(t => console.log(`  "${t.name}" → ${t.id}`));

  // Target Rivaaz Restaurant Group (the account with vikram@roohsf.com)
  const tenantRes = await q("SELECT id, name FROM tenants ORDER BY name");
  if (!tenantRes.rows[0]) { console.error('No tenant found.'); process.exit(1); }
  
  // Pick the tenant that has a user vikram@roohsf.com
  const userRes = await q("SELECT tenant_id FROM users WHERE email='vikram@roohsf.com' LIMIT 1");
  if (!userRes.rows[0]) { console.error('Could not find vikram@roohsf.com — using first tenant'); }
  const TENANT = userRes.rows[0]?.tenant_id || tenantRes.rows[0].id;
  console.log('\n✓ Seeding into tenant:', TENANT);


  // ── Bootstrap tables that are normally created by ensureTables() on API boot ──
  console.log('  → Ensuring all tables exist...');
  const ensures = [
    // Agent 9 — schedules
    `CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID NOT NULL,
      week_start DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ, published_by UUID, total_hours NUMERIC(8,2) DEFAULT 0,
      total_cost NUMERIC(10,2) DEFAULT 0, notes TEXT, created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_id, week_start))`,
    `CREATE TABLE IF NOT EXISTS shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      location_id UUID NOT NULL, employee_id UUID, position VARCHAR(100),
      shift_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
      break_minutes INTEGER DEFAULT 30, notes TEXT, status VARCHAR(20) DEFAULT 'scheduled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS employee_availability (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL, avail_type VARCHAR(20) DEFAULT 'recurring',
      day_of_week INTEGER, date_start DATE, date_end DATE,
      start_time TIME, end_time TIME, available BOOLEAN DEFAULT true,
      notes TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    // Agent 11 — menu
    `CREATE TABLE IF NOT EXISTS menu_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      location_id UUID, name VARCHAR(200) NOT NULL, description TEXT,
      menu_type VARCHAR(50) DEFAULT 'dinner', sort_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      section_id UUID, recipe_id UUID, name VARCHAR(300) NOT NULL, description TEXT,
      price NUMERIC(10,2), price_override NUMERIC(10,2), food_cost NUMERIC(10,2),
      food_cost_pct NUMERIC(5,2), category VARCHAR(100), tags TEXT[] DEFAULT '{}',
      is_signature BOOLEAN DEFAULT false, is_seasonal BOOLEAN DEFAULT false,
      available BOOLEAN DEFAULT true, placement_notes TEXT, image_url TEXT,
      sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS menu_item_sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      item_id UUID NOT NULL, location_id UUID, week_start DATE NOT NULL,
      units_sold INTEGER DEFAULT 0, revenue NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(item_id, location_id, week_start))`,
    // Agent 6 — gamification
    `CREATE TABLE IF NOT EXISTS employee_gamification (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL, employee_name VARCHAR(200), location_id UUID,
      total_points INTEGER DEFAULT 0, available_points INTEGER DEFAULT 0,
      level VARCHAR(20) DEFAULT 'rookie', streak_days INTEGER DEFAULT 0,
      last_activity DATE, badges TEXT[] DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant_id, employee_id))`,
    `CREATE TABLE IF NOT EXISTS gamification_points (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL, employee_name VARCHAR(200), location_id UUID,
      point_type VARCHAR(50), points INTEGER, reference_id UUID, reference_type VARCHAR(50),
      note TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS gamification_challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      title VARCHAR(300), description TEXT, challenge_type VARCHAR(50) DEFAULT 'individual',
      metric VARCHAR(50), target NUMERIC, points_reward INTEGER DEFAULT 200, bonus_reward TEXT,
      start_date DATE, end_date DATE, status VARCHAR(20) DEFAULT 'active',
      created_by UUID, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS gamification_challenge_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      challenge_id UUID NOT NULL, employee_id UUID NOT NULL, employee_name VARCHAR(200),
      progress NUMERIC DEFAULT 0, completed BOOLEAN DEFAULT false,
      completed_at TIMESTAMPTZ, rank INTEGER, created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(challenge_id, employee_id))`,
    `CREATE TABLE IF NOT EXISTS gamification_rewards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      title VARCHAR(200), description TEXT, reward_type VARCHAR(30),
      value NUMERIC, points_cost INTEGER, active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now())`,
    // Agent 9 — time off / requests  
    `CREATE TABLE IF NOT EXISTS time_off_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL, location_id UUID, request_type VARCHAR(20) DEFAULT 'time_off',
      date_start DATE NOT NULL, date_end DATE NOT NULL, reason TEXT,
      status VARCHAR(20) DEFAULT 'pending', manager_notes TEXT,
      reviewed_by UUID, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS shift_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      request_type VARCHAR(20), shift_id UUID, from_employee_id UUID, to_employee_id UUID,
      status VARCHAR(20) DEFAULT 'pending', reason TEXT, manager_notes TEXT,
      reviewed_by UUID, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
    // Compliance
    `CREATE TABLE IF NOT EXISTS compliance_certifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      employee_name VARCHAR(200), employee_role VARCHAR(100), cert_key VARCHAR(50) NOT NULL,
      cert_label VARCHAR(200), issued_date DATE, expiry_date DATE NOT NULL, cert_number VARCHAR(100),
      issuer VARCHAR(200), notes TEXT, active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    // Loyalty
    `CREATE TABLE IF NOT EXISTS loyalty_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      name VARCHAR(200) NOT NULL, email VARCHAR(255), phone VARCHAR(30),
      tier loyalty_tier DEFAULT 'bronze', points_balance INTEGER DEFAULT 0,
      points_lifetime INTEGER DEFAULT 0, referral_code VARCHAR(20),
      referred_by_id UUID, streak_weeks INTEGER DEFAULT 0, last_visit_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    // Purchase orders
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, location_id UUID,
      title VARCHAR(200), vendor VARCHAR(200), status VARCHAR(20) DEFAULT 'draft',
      notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
  ];
  for (const sql of ensures) await q(sql).catch(e => { throw new Error('Table creation failed: ' + e.message + '\nSQL: ' + sql.slice(0,100)); });
  console.log('  ✓ All tables ready');

  let LOC;
  const locRes = await q("SELECT id, name FROM locations WHERE tenant_id=$1 AND active=true ORDER BY name ASC LIMIT 1", [TENANT]);
  if (locRes.rows[0]) console.log('  Using first alphabetical location:', locRes.rows[0].name);
  if (locRes.rows[0]) {
    LOC = locRes.rows[0].id;
    console.log('✓ Found existing location:', LOC);
  } else {
    const ins = await q(`INSERT INTO locations (tenant_id,name,address,city,state,zip,phone,timezone,active)
      VALUES ($1,'Rooh SF','333 Brannan St','San Francisco','CA','94107','(415) 525-4174','America/Los_Angeles',true) RETURNING id`, [TENANT]);
    LOC = ins.rows[0].id;
    console.log('✓ Created Rooh SF:', LOC);
  }


  // ── 2. Employees ──────────────────────────────────────────────────────────
  console.log('\n👥 Seeding employees...');
  const bcrypt = require('bcryptjs');
  const pwHash = await bcrypt.hash('demo123!', 10);

  const EMPLOYEES = [
    { fn:'Priya',    ln:'Sharma',    pos:'General Manager',   dept:'management', wt:'salary',  wr:85000, email:'priya@roohsf.com',     hire:'2021-03-15' },
    { fn:'Marcus',   ln:'Chen',      pos:'Assistant Manager', dept:'management', wt:'salary',  wr:65000, email:'marcus@roohsf.com',    hire:'2022-01-10' },
    { fn:'Anjali',   ln:'Patel',     pos:'Bar Manager',       dept:'management', wt:'salary',  wr:62000, email:'anjali@roohsf.com',    hire:'2022-06-01' },
    { fn:'Sofia',    ln:'Martinez',  pos:'Server',            dept:'foh',        wt:'hourly',  wr:16.50, email:'sofia@roohsf.com',     hire:'2022-09-12' },
    { fn:'James',    ln:'Washington',pos:'Server',            dept:'foh',        wt:'hourly',  wr:16.50, email:'james@roohsf.com',     hire:'2023-02-20' },
    { fn:'Lily',     ln:'Nguyen',    pos:'Server',            dept:'foh',        wt:'hourly',  wr:17.00, email:'lily@roohsf.com',      hire:'2021-11-05' },
    { fn:'Arjun',    ln:'Verma',     pos:'Server',            dept:'foh',        wt:'hourly',  wr:16.50, email:'arjun@roohsf.com',     hire:'2023-07-18' },
    { fn:'Chloe',    ln:'Thompson',  pos:'Host/Hostess',      dept:'foh',        wt:'hourly',  wr:18.00, email:'chloe@roohsf.com',     hire:'2023-01-09' },
    { fn:'Diego',    ln:'Flores',    pos:'Bartender',         dept:'foh',        wt:'hourly',  wr:19.00, email:'diego@roohsf.com',     hire:'2021-08-22' },
    { fn:'Mia',      ln:'Kim',       pos:'Bartender',         dept:'foh',        wt:'hourly',  wr:19.00, email:'mia@roohsf.com',       hire:'2022-04-14' },
    { fn:'Carlos',   ln:'Rivera',    pos:'Barback',           dept:'foh',        wt:'hourly',  wr:16.00, email:'carlos@roohsf.com',    hire:'2023-05-30' },
    { fn:'Nia',      ln:'Johnson',   pos:'Busser',            dept:'foh',        wt:'hourly',  wr:16.50, email:'nia@roohsf.com',       hire:'2023-09-01' },
    { fn:'Ethan',    ln:'Brown',     pos:'Food Runner',       dept:'foh',        wt:'hourly',  wr:16.50, email:'ethan@roohsf.com',     hire:'2023-10-15' },
    { fn:'Vikram',   ln:'Nair',      pos:'Executive Chef',    dept:'boh',        wt:'salary',  wr:95000, email:'chef.vikram@roohsf.com',hire:'2020-09-01' },
    { fn:'Rajan',    ln:'Mehta',     pos:'Sous Chef',         dept:'boh',        wt:'salary',  wr:72000, email:'rajan@roohsf.com',     hire:'2021-01-15' },
    { fn:'Kenji',    ln:'Tanaka',    pos:'Line Cook',         dept:'boh',        wt:'hourly',  wr:22.00, email:'kenji@roohsf.com',     hire:'2022-03-07' },
    { fn:'Fatima',   ln:'Al-Hassan', pos:'Line Cook',         dept:'boh',        wt:'hourly',  wr:21.00, email:'fatima@roohsf.com',    hire:'2022-07-19' },
    { fn:'Tommy',    ln:'Lee',       pos:'Line Cook',         dept:'boh',        wt:'hourly',  wr:20.50, email:'tommy@roohsf.com',     hire:'2023-03-22' },
    { fn:'Rosa',     ln:'Gutierrez', pos:'Prep Cook',         dept:'boh',        wt:'hourly',  wr:18.00, email:'rosa@roohsf.com',      hire:'2023-06-12' },
    { fn:'Andre',    ln:'Baptiste',  pos:'Prep Cook',         dept:'boh',        wt:'hourly',  wr:17.50, email:'andre@roohsf.com',     hire:'2023-08-05' },
    { fn:'Min',      ln:'Park',      pos:'Dishwasher',        dept:'boh',        wt:'hourly',  wr:16.50, email:'min@roohsf.com',       hire:'2023-11-01' },
    { fn:'Luis',     ln:'Morales',   pos:'Expeditor',         dept:'boh',        wt:'hourly',  wr:17.00, email:'luis@roohsf.com',      hire:'2023-04-17' },
  ];

  const empIds = {};
  for (const e of EMPLOYEES) {
    const existing = await q('SELECT id FROM employees WHERE tenant_id=$1 AND email=$2 LIMIT 1', [TENANT, e.email]);
    let eid;
    if (existing.rows[0]) {
      eid = existing.rows[0].id;
      await q('UPDATE employees SET first_name=$1,last_name=$2,position=$3,department=$4,wage_type=$5,wage_rate=$6,hire_date=$7 WHERE id=$8',
        [e.fn, e.ln, e.pos, e.dept, e.wt, e.wr, e.hire, eid]);
    } else {
      const r = await q(`INSERT INTO employees (tenant_id,location_id,name,first_name,last_name,email,position,department,wage_type,wage_rate,hire_date,status,archived,performance_score,role)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',false,$12,$13) RETURNING id`,
        [TENANT, LOC, `${e.fn} ${e.ln}`, e.fn, e.ln, e.email, e.pos, e.dept, e.wt, e.wr, e.hire,
         Math.floor(Math.random()*15)+85, e.dept==='management'?'manager':'staff']);
      eid = r.rows[0].id;
    }
    empIds[`${e.fn}_${e.ln}`] = eid;
  }
  console.log(`  ✓ ${EMPLOYEES.length} employees`);

  // Manager user accounts
  for (const e of EMPLOYEES.filter(x => x.dept==='management')) {
    await q(`INSERT INTO users (tenant_id,email,name,password_hash,role,location_ids,active)
      VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (tenant_id,email) DO NOTHING`,
      [TENANT, e.email, `${e.fn} ${e.ln}`, pwHash,
       e.pos==='General Manager'?'owner':'manager', `{${LOC}}`]);
  }
  console.log('\n  → seeding availability...');
  console.log('  ✓ Manager logins created (password: demo123!)');

  // Availability
  console.log('  → DELETE availability...');
  await q('DELETE FROM employee_availability WHERE tenant_id=$1', [TENANT]);
  for (const [key, eid] of Object.entries(empIds)) {
    const partTime = ['Carlos_Rivera','Nia_Johnson','Ethan_Brown','Min_Park'].includes(key);
    for (let dow = 0; dow < 7; dow++) {
      const avail = partTime ? (dow >= 4 || dow === 0) : dow !== 1;
      await q(`INSERT INTO employee_availability (tenant_id,employee_id,avail_type,day_of_week,start_time,end_time,available)
        VALUES ($1,$2,'recurring',$3,'10:00','23:00',$4)`, [TENANT, eid, dow, avail]);
    }
  }
  console.log('  ✓ Availability configured');

  // ── 3. Weekly KPI ─────────────────────────────────────────────────────────
  console.log('\n📊 Seeding financial KPIs...');
  console.log('  → inserting weekly_kpi rows...');
  const KPI = [
    { w:0, food:38400, bar:21600, labor:19800, covers:420, note:'Strong weekend, Diwali event' },
    { w:1, food:35200, bar:19800, labor:18200, covers:385, note:'Regular week' },
    { w:2, food:41200, bar:23100, labor:20100, covers:451, note:'Private dining buyout Sat' },
    { w:3, food:33800, bar:18900, labor:17900, covers:370, note:'Slow mid-week' },
    { w:4, food:36600, bar:20400, labor:18800, covers:400, note:'New cocktail menu launch' },
    { w:5, food:39100, bar:22200, labor:19400, covers:428, note:'Corporate group Friday' },
    { w:6, food:34500, bar:19200, labor:18100, covers:378, note:'Rainy week' },
    { w:7, food:42800, bar:24100, labor:21000, covers:468, note:"Valentine's — fully booked" },
  ];
  for (const d of KPI) {
    const total = d.food + d.bar;
    await q('DELETE FROM weekly_kpi WHERE tenant_id=$1 AND week_start=$2', [TENANT, weekStart(-d.w)]);
    await q(`INSERT INTO weekly_kpi
        (tenant_id,location_id,week_start,bar_net_sales,food_net_sales,total_sales,
         foh_labor,boh_labor,food_cost_pct,bar_cost_pct,
         bar_ordering,kitchen_ordering,rating_google,rating_yelp,rating_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
`,
      [TENANT, LOC, weekStart(-d.w), d.bar, d.food, total,
       (d.labor*0.55).toFixed(2), (d.labor*0.45).toFixed(2),
       (31+Math.random()*2-1).toFixed(1), (28+Math.random()*2-1).toFixed(1),
       (d.bar*0.28).toFixed(2), (d.food*0.31).toFixed(2),
       (4.1+Math.random()*0.3).toFixed(2), (3.9+Math.random()*0.4).toFixed(2),
       d.note]);
  }
  console.log('  ✓ 8 weeks KPI');

  // ── 4. Inventory ──────────────────────────────────────────────────────────
  console.log('\n📦 Seeding inventory...');
  console.log('  → inserting inventory items...');
  const ITEMS = [
    { name:'Lamb Chops (rack)',       cat:'food',    sub:'protein',  unit:'lb',    vendor:'Sysco',         par:15, reorder:5,  price:24.50 },
    { name:'Chicken Thighs',          cat:'food',    sub:'protein',  unit:'lb',    vendor:'Sysco',         par:30, reorder:10, price:4.20  },
    { name:'Paneer (fresh)',           cat:'food',    sub:'dairy',    unit:'lb',    vendor:'Local Dairy',   par:20, reorder:8,  price:6.80  },
    { name:'Tiger Prawns (16/20)',    cat:'food',    sub:'seafood',  unit:'lb',    vendor:'Pacific Coast', par:12, reorder:4,  price:18.50 },
    { name:'Salmon Fillet',           cat:'food',    sub:'seafood',  unit:'lb',    vendor:'Pacific Coast', par:10, reorder:4,  price:14.00 },
    { name:'Cilantro (bunch)',         cat:'food',    sub:'produce',  unit:'bunch', vendor:'Produce Pro',   par:40, reorder:15, price:0.85  },
    { name:'Ginger (fresh)',           cat:'food',    sub:'produce',  unit:'lb',    vendor:'Produce Pro',   par:10, reorder:4,  price:2.20  },
    { name:'Garlic (peeled)',          cat:'food',    sub:'produce',  unit:'lb',    vendor:'Produce Pro',   par:8,  reorder:3,  price:3.40  },
    { name:'Tomatoes (Roma)',          cat:'food',    sub:'produce',  unit:'lb',    vendor:'Produce Pro',   par:20, reorder:8,  price:1.60  },
    { name:'Onions (yellow)',          cat:'food',    sub:'produce',  unit:'lb',    vendor:'Produce Pro',   par:25, reorder:10, price:0.90  },
    { name:'Spinach (baby)',           cat:'food',    sub:'produce',  unit:'lb',    vendor:'Produce Pro',   par:8,  reorder:3,  price:4.20  },
    { name:'Lemon',                    cat:'food',    sub:'produce',  unit:'each',  vendor:'Produce Pro',   par:60, reorder:20, price:0.45  },
    { name:'Mint (fresh)',             cat:'food',    sub:'herb',     unit:'bunch', vendor:'Produce Pro',   par:20, reorder:8,  price:1.20  },
    { name:'Cucumber',                 cat:'food',    sub:'produce',  unit:'each',  vendor:'Produce Pro',   par:24, reorder:8,  price:0.80  },
    { name:'Basmati Rice (25lb)',      cat:'food',    sub:'dry',      unit:'bag',   vendor:'Sysco',         par:6,  reorder:2,  price:32.00 },
    { name:'Garam Masala',             cat:'food',    sub:'spice',    unit:'lb',    vendor:'Spice Route',   par:4,  reorder:1,  price:12.00 },
    { name:'Turmeric',                 cat:'food',    sub:'spice',    unit:'lb',    vendor:'Spice Route',   par:3,  reorder:1,  price:8.50  },
    { name:'Saffron',                  cat:'food',    sub:'spice',    unit:'gram',  vendor:'Spice Route',   par:30, reorder:10, price:1.80  },
    { name:'Cardamom (green)',         cat:'food',    sub:'spice',    unit:'oz',    vendor:'Spice Route',   par:16, reorder:6,  price:2.80  },
    { name:'Rose Water',               cat:'food',    sub:'flavoring',unit:'bottle',vendor:'Spice Route',   par:6,  reorder:2,  price:8.00  },
    { name:'Rose Petals (dried)',      cat:'food',    sub:'garnish',  unit:'oz',    vendor:'Spice Route',   par:8,  reorder:3,  price:4.50  },
    { name:'Heavy Cream',              cat:'food',    sub:'dairy',    unit:'qt',    vendor:'Local Dairy',   par:12, reorder:4,  price:3.20  },
    { name:'Butter (unsalted)',        cat:'food',    sub:'dairy',    unit:'lb',    vendor:'Local Dairy',   par:8,  reorder:3,  price:4.50  },
    { name:'Mango Pulp (canned)',      cat:'food',    sub:'pantry',   unit:'can',   vendor:'Sysco',         par:12, reorder:4,  price:4.20  },
    { name:'Coconut Milk',             cat:'food',    sub:'pantry',   unit:'can',   vendor:'Sysco',         par:10, reorder:4,  price:2.80  },
    { name:'Litchi (canned)',          cat:'food',    sub:'pantry',   unit:'can',   vendor:'Sysco',         par:8,  reorder:3,  price:3.60  },
    { name:"Hendrick's Gin (1L)",     cat:'liquor',  sub:'gin',      unit:'bottle',vendor:'Southern Wine', par:6,  reorder:2,  price:42.00 },
    { name:'Grey Goose Vodka (1L)',   cat:'liquor',  sub:'vodka',    unit:'bottle',vendor:'Southern Wine', par:6,  reorder:2,  price:38.00 },
    { name:'Johnnie Walker Black (1L)',cat:'liquor', sub:'whisky',   unit:'bottle',vendor:'Southern Wine', par:4,  reorder:2,  price:36.00 },
    { name:'Patron Silver (750ml)',   cat:'liquor',  sub:'tequila',  unit:'bottle',vendor:'Southern Wine', par:4,  reorder:2,  price:48.00 },
    { name:'Aperol (750ml)',           cat:'liquor',  sub:'aperitif', unit:'bottle',vendor:'Southern Wine', par:6,  reorder:2,  price:22.00 },
    { name:'Elderflower Liqueur',     cat:'liquor',  sub:'liqueur',  unit:'bottle',vendor:'Southern Wine', par:4,  reorder:2,  price:28.00 },
    { name:'Cardamom Bitters',        cat:'liquor',  sub:'bitters',  unit:'bottle',vendor:'Southern Wine', par:4,  reorder:2,  price:16.00 },
    { name:'Sauvignon Blanc (750ml)', cat:'liquor',  sub:'wine',     unit:'bottle',vendor:'Southern Wine', par:12, reorder:4,  price:14.00 },
    { name:'Kingfisher Beer (case)',  cat:'liquor',  sub:'beer',     unit:'case',  vendor:'Southern Wine', par:4,  reorder:2,  price:45.00 },
    { name:'Bar Lime Juice',          cat:'liquor',  sub:'mixer',    unit:'bottle',vendor:'Southern Wine', par:8,  reorder:3,  price:6.50  },
    { name:'Tonic Water (24pk)',      cat:'liquor',  sub:'mixer',    unit:'case',  vendor:'Southern Wine', par:4,  reorder:2,  price:24.00 },
    { name:'Compostable To-Go Boxes', cat:'supplies',sub:'packaging',unit:'case',  vendor:'US Foods',      par:4,  reorder:2,  price:68.00 },
    { name:'Cocktail Napkins',        cat:'supplies',sub:'paper',    unit:'case',  vendor:'US Foods',      par:3,  reorder:1,  price:42.00 },
    { name:'Candles (votive)',        cat:'supplies',sub:'decor',    unit:'box',   vendor:'US Foods',      par:10, reorder:4,  price:18.00 },
    { name:'Dish Soap (gallon)',      cat:'supplies',sub:'cleaning', unit:'jug',   vendor:'US Foods',      par:4,  reorder:2,  price:12.00 },
    { name:'Naan Flour',              cat:'food',    sub:'dry',      unit:'lb',    vendor:'Sysco',         par:20, reorder:8,  price:0.85  },
    { name:'Naan Flour (bread)',      cat:'food',    sub:'dry',      unit:'lb',    vendor:'Sysco',         par:20, reorder:8,  price:0.85  },
  ];

  const itemIds = {};
  for (const item of ITEMS) {
    const ex = await q('SELECT id FROM inventory_items WHERE tenant_id=$1 AND name=$2 LIMIT 1', [TENANT, item.name]);
    let iid;
    if (ex.rows[0]) {
      iid = ex.rows[0].id;
      await q('UPDATE inventory_items SET vendor=$1,par_level=$2,reorder_point=$3,last_price=$4 WHERE id=$5',
        [item.vendor, item.par, item.reorder, item.price, iid]);
    } else {
      const r = await q(`INSERT INTO inventory_items (tenant_id,location_id,name,category,sub_category,unit,vendor,par_level,reorder_point,last_price,avg_price_3,avg_price_6,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,true) RETURNING id`,
        [TENANT, LOC, item.name, item.cat, item.sub, item.unit, item.vendor, item.par, item.reorder, item.price]);
      iid = r.rows[0].id;
    }
    itemIds[item.name] = iid;
  }
  console.log(`  ✓ ${ITEMS.length} inventory items`);

  // 3 invoices
  const invoiceData = [
    { vendor:'Sysco', amount:3240.80, date:daysAgo(3), lines:['Lamb Chops (rack)','Chicken Thighs','Basmati Rice (25lb)','Mango Pulp (canned)','Coconut Milk'] },
    { vendor:'Southern Wine', amount:2180.50, date:daysAgo(7), lines:["Hendrick's Gin (1L)",'Grey Goose Vodka (1L)','Aperol (750ml)','Sauvignon Blanc (750ml)','Kingfisher Beer (case)'] },
    { vendor:'Produce Pro', amount:485.20, date:daysAgo(2), lines:['Cilantro (bunch)','Ginger (fresh)','Tomatoes (Roma)','Lemon','Mint (fresh)','Cucumber'] },
  ];
  for (const inv of invoiceData) {
    const r = await q(`INSERT INTO invoices (tenant_id,location_id,vendor,invoice_date,total_amount,status,category,scan_confidence)
      VALUES ($1,$2,$3,$4,$5,'approved','food',0.96) RETURNING id`, [TENANT, LOC, inv.vendor, inv.date, inv.amount]);
    for (const name of inv.lines) {
      const iid = itemIds[name]; if (!iid) continue;
      const itm = ITEMS.find(x => x.name===name);
      await q(`INSERT INTO invoice_line_items (invoice_id,tenant_id,inventory_item_id,description,quantity,unit,unit_price,total_price,matched)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [r.rows[0].id, TENANT, iid, name, itm.par, itm.unit, itm.price, (itm.par*itm.price).toFixed(2)]);
    }
  }
  console.log('  ✓ 3 invoices');

  // Inventory count
  const cntR = await q(`INSERT INTO inventory_counts (tenant_id,location_id,count_date,status,counted_by)
    VALUES ($1,$2,$3,'submitted',$4) RETURNING id`,
    [TENANT, LOC, daysAgo(1), Object.values(empIds)[0]]);
  if (cntR.rows[0]) {
    for (const [name, iid] of Object.entries(itemIds)) {
      const itm = ITEMS.find(x => x.name===name);
      const qty = ((itm.par||10) * (0.4+Math.random()*0.8)).toFixed(2);
      await q(`INSERT INTO inventory_count_lines (count_id,tenant_id,inventory_item_id,item_name,unit,quantity,unit_price,total_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [cntR.rows[0].id, TENANT, iid, name, itm.unit, qty, itm.price, (qty*itm.price).toFixed(2)]);
    }
    console.log('  ✓ Monthly inventory count');
  }

  // ── 5. Menu ───────────────────────────────────────────────────────────────
  console.log('\n🍽️  Seeding menu...');
  console.log('  → clearing old menu data...');
  await q('DELETE FROM menu_price_suggestions WHERE tenant_id=$1', [TENANT]);
  await q('DELETE FROM menu_item_sales WHERE tenant_id=$1', [TENANT]);
  await q('DELETE FROM menu_items WHERE tenant_id=$1', [TENANT]);
  await q('DELETE FROM menu_sections WHERE tenant_id=$1', [TENANT]);

  const SEC_DEFS = [
    { name:'Signature Cocktails',    menu_type:'bar',     order:0 },
    { name:'Starters & Small Plates',menu_type:'dinner',  order:1 },
    { name:'Breads',                  menu_type:'dinner',  order:2 },
    { name:'Mains',                   menu_type:'dinner',  order:3 },
    { name:'Tasting Menu',            menu_type:'tasting', order:4 },
    { name:'Desserts',                menu_type:'dinner',  order:5 },
  ];
  const secIds = {};
  for (const s of SEC_DEFS) {
    const r = await q('INSERT INTO menu_sections (tenant_id,location_id,name,menu_type,sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [TENANT, LOC, s.name, s.menu_type, s.order]);
    secIds[s.name] = r.rows[0].id;
  }

  const MENU = [
    // Cocktails
    { n:'Aparajita Fizz',         s:'Signature Cocktails',    p:18, c:3.20, sig:true, pop:62, desc:'House gin, elderflower, rose water, lychee, cardamom bitters, prosecco foam' },
    { n:'Saffron Old Fashioned',  s:'Signature Cocktails',    p:17, c:3.80, sig:true, pop:38, desc:'Bourbon, saffron syrup, cardamom bitters, orange peel' },
    { n:'Spiced Mango Margarita', s:'Signature Cocktails',    p:16, c:3.40, sig:false,pop:45, desc:'Patron, fresh mango, tajin rim, chili-lime salt' },
    { n:'Rooh Negroni',           s:'Signature Cocktails',    p:16, c:4.20, sig:true, pop:29, desc:'Gin, Campari, sweet vermouth, rose cardamom tincture' },
    { n:'Cucumber Gin Cooler',    s:'Signature Cocktails',    p:15, c:2.80, sig:false,pop:34, desc:"Hendrick's, cucumber, mint, lime, elderflower tonic" },
    { n:'Non-Alcoholic Jaljeera', s:'Signature Cocktails',    p:10, c:1.20, sig:false,pop:18, desc:'Spiced lemonade, mint, cumin, chaat masala' },
    // Starters
    { n:'Burrata Chaat',          s:'Starters & Small Plates',p:18, c:5.80, sig:true, pop:48, desc:'Burrata, pomegranate molasses, chaat masala, papdi crisps' },
    { n:'Tandoori Octopus',       s:'Starters & Small Plates',p:22, c:8.40, sig:false,pop:22, desc:'Charred octopus, mint chutney, pickled onion, sev' },
    { n:'Truffle Samosa',         s:'Starters & Small Plates',p:16, c:4.20, sig:true, pop:41, desc:'Black truffle, potato, peas, tamarind chutney' },
    { n:'Lamb Keema Sliders',     s:'Starters & Small Plates',p:19, c:6.80, sig:false,pop:35, desc:'Spiced lamb, pao bun, green chutney, pickled cucumber' },
    { n:'Spicy Tuna Papdi',       s:'Starters & Small Plates',p:17, c:5.60, sig:false,pop:28, desc:'Yellowfin tuna, papdi crisps, mango salsa, sriracha aioli' },
    { n:'Saag Paneer Gnudi',      s:'Starters & Small Plates',p:15, c:3.80, sig:false,pop:19, desc:'Ricotta-paneer dumplings, creamed spinach, crispy shallots' },
    // Breads
    { n:'Truffle Naan',           s:'Breads',                 p:14, c:2.40, sig:true, pop:74, desc:'House naan, black truffle oil, Parmesan, herbs' },
    { n:'Butter Garlic Naan',     s:'Breads',                 p:8,  c:1.20, sig:false,pop:88, desc:'Classic buttered naan, roasted garlic, sea salt' },
    { n:'Peshwari Naan',          s:'Breads',                 p:9,  c:1.60, sig:false,pop:31, desc:'Stuffed with coconut, almond, raisin, honey glaze' },
    // Mains
    { n:'Raan-E-Rooh',            s:'Mains',                  p:52, c:18.40,sig:true, pop:12, desc:'36-hour slow-braised lamb leg, saffron jus, pickled walnut' },
    { n:'Black Cod Amritsari',    s:'Mains',                  p:44, c:14.80,sig:false,pop:18, desc:'Miso-marinated black cod, crispy rice cake, ginger scallion' },
    { n:'Duck Vindaloo',          s:'Mains',                  p:38, c:11.20,sig:true, pop:22, desc:'Confit duck leg, Goan spice, vinegar reduction, coconut foam' },
    { n:'Chicken Tikka Masala',   s:'Mains',                  p:32, c:9.60, sig:false,pop:55, desc:'Free-range chicken, house masala, cream, fenugreek, basmati' },
    { n:'Dal Makhani (vegan)',    s:'Mains',                  p:26, c:5.40, sig:false,pop:38, desc:'48-hour black lentils, tomato, kashmiri chili, cashew cream' },
    { n:'Prawn Recheado',         s:'Mains',                  p:42, c:14.20,sig:false,pop:19, desc:'Tiger prawns, Goan recheado masala, kokum, coconut rice' },
    { n:'Mushroom Biryani',       s:'Mains',                  p:28, c:6.80, sig:false,pop:29, desc:'Wild mushroom, saffron basmati, caramelised onion, dum-style' },
    // Tasting
    { n:"Chef's 7-Course Tasting",s:'Tasting Menu',           p:125,c:38.00,sig:true, pop:8,  desc:'Seasonal ingredients, wine pairing available +$65' },
    { n:'Vegetarian 5-Course',    s:'Tasting Menu',           p:95, c:24.00,sig:false,pop:5,  desc:'Plant-forward modern Indian, optional wine pairing +$50' },
    // Desserts
    { n:'Gulab Jamun Sundae',     s:'Desserts',               p:14, c:2.80, sig:true, pop:35, desc:'Warm gulab jamun, cardamom ice cream, rose syrup, pistachio' },
    { n:'Mango Saffron Panna Cotta',s:'Desserts',             p:13, c:2.40, sig:false,pop:28, desc:'Alphonso mango, saffron set cream, mango sorbet, hazelnut crumble' },
    { n:'Dark Chocolate Chai Tart',s:'Desserts',              p:15, c:3.20, sig:false,pop:22, desc:'70% chocolate ganache, masala chai custard, gold leaf' },
    { n:'Kulfi on a Stick',       s:'Desserts',               p:10, c:1.60, sig:false,pop:31, desc:'Rose-pistachio kulfi, fresh mango, chaat masala dust' },
    { n:'Cheese Board (Indian)',  s:'Desserts',               p:22, c:7.20, sig:false,pop:12, desc:'3 artisan cheeses, quince, truffle honey, house crackers' },
  ];

  const menuIds = {};
  for (let i=0; i<MENU.length; i++) {
    const m = MENU[i];
    const r = await q(`INSERT INTO menu_items (tenant_id,location_id,section_id,name,description,price,food_cost,food_cost_pct,is_signature,available,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10) RETURNING id`,
      [TENANT, LOC, secIds[m.s], m.n, m.desc, m.p, m.c,
       ((m.c/m.p)*100).toFixed(1), m.sig||false, i]);
    menuIds[m.n] = r.rows[0].id;
    // 8 weeks sales
    for (let w=0; w<8; w++) {
      const units = Math.round(m.pop * (0.75+Math.random()*0.5));
      await q(`INSERT INTO menu_item_sales (tenant_id,item_id,location_id,week_start,units_sold,revenue)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (item_id,location_id,week_start) DO UPDATE SET units_sold=$5,revenue=$6`,
        [TENANT, r.rows[0].id, LOC, weekStart(-w), units, (units*m.p).toFixed(2)]);
    }
  }
  console.log(`  ✓ ${MENU.length} menu items + 8 weeks sales`);

  // ── 6. Reviews ────────────────────────────────────────────────────────────
  console.log('\n⭐ Seeding reviews...');
  console.log('  → inserting reviews...');
  const REVIEWS = [
    { plat:'google',rating:5,author:'Sarah K.',   date:daysAgo(2),  sentiment:'positive',status:'responded',
      text:"Absolutely stunning. The Aparajita Fizz was unlike anything I've had — rose water and elderflower with cardamom foam. Truffle Naan disappeared in seconds. Priya made us feel so special.",
      reply:"Thank you Sarah! The Aparajita Fizz is Anjali's masterpiece and we're thrilled it landed. Priya and the team will be delighted. We can't wait to welcome you back!" },
    { plat:'google',rating:5,author:'Michael T.', date:daysAgo(5),  sentiment:'positive',status:'responded',
      text:"Best Indian fine dining in SF. The Raan-E-Rooh was melt-in-your-mouth. Diego crafted us custom cocktails. Going back for the tasting menu.",
      reply:"Michael, your kind words mean everything! Diego is truly gifted behind the bar and the Raan-E-Rooh is Chef Vikram's labour of love. The tasting menu will not disappoint!" },
    { plat:'yelp',  rating:5,author:'Preethi R.', date:daysAgo(8),  sentiment:'positive',status:'draft',
      text:'Finally an Indian restaurant that pushes the cuisine forward. The duck vindaloo has a coconut foam that sounds gimmicky but works perfectly. Mia at the bar is a genius.', reply:null },
    { plat:'google',rating:4,author:'James L.',   date:daysAgo(12), sentiment:'positive',status:'pending',
      text:'Creative menu and beautiful space. Burrata Chaat was a revelation. Docking one star — server forgot bread with main. Otherwise flawless.', reply:null },
    { plat:'google',rating:5,author:'Anita M.',   date:daysAgo(14), sentiment:'positive',status:'responded',
      text:'Celebrated our anniversary here. Marcus arranged flowers and a personalized dessert. Saffron Old Fashioned is our new favourite drink.',
      reply:"Anita, happy anniversary! Marcus loves creating those personal moments and we're so glad it made your evening. The Saffron Old Fashioned is one of our proudest creations. See you again soon!" },
    { plat:'yelp',  rating:5,author:'Kevin W.',   date:daysAgo(18), sentiment:'positive',status:'responded',
      text:"The 7-course tasting menu was one of the best dining experiences of my life. Each course told a story. Worth every penny.",
      reply:"Kevin, this review genuinely made our kitchen team's day. The tasting menu is Chef Vikram's canvas and your appreciation means the world to all of us. Thank you!" },
    { plat:'google',rating:3,author:'Rachel B.',  date:daysAgo(20), sentiment:'neutral', status:'pending',
      text:'Food was good but service felt rushed on Saturday. Cocktails were excellent though.', reply:null },
    { plat:'google',rating:5,author:'Raj P.',     date:daysAgo(22), sentiment:'positive',status:'responded',
      text:"Lily is the best server we've had anywhere in SF. So knowledgeable. The Dal Makhani took me back to my grandmother's kitchen but elevated.",
      reply:"Raj, Lily absolutely beams when she talks about this review! We share guest feedback with our whole team and she was moved. The Dal Makhani is 48 hours of love in a bowl. Come back soon!" },
    { plat:'yelp',  rating:4,author:'Christina H.',date:daysAgo(28),sentiment:'positive',status:'draft',
      text:'Gorgeous interior, inventive food. Truffle Samosa was our favourite. Cocktails slightly pricey but creative.', reply:null },
    { plat:'google',rating:5,author:'David A.',   date:daysAgo(31), sentiment:'positive',status:'responded',
      text:'Brought clients for a business dinner. Anjali curated a bar experience for us. Professional, fun, memorable.',
      reply:"David, Anjali was so pleased to hear this — creating that curated experience is exactly what she lives for. Rooh is always ready for your next client dinner. Thank you!" },
    { plat:'google',rating:2,author:'Tom N.',     date:daysAgo(35), sentiment:'negative',status:'responded',
      text:'Reservation was lost on arrival. Manager apologised and seated us quickly. Food was excellent. Sort out the reservation system.',
      reply:"Tom, we're so sorry about the reservation confusion — this is not the Rooh standard. We have since addressed the issue with our booking system. We'd love to have you back on us. Please email priya@roohsf.com." },
    { plat:'yelp',  rating:5,author:'Maria G.',   date:daysAgo(38), sentiment:'positive',status:'responded',
      text:'The non-alcoholic Jaljeera is genius — complex and layered, not an afterthought. Octopus was fire. Coming back weekly.',
      reply:"Maria, your weekly visits are the highest compliment! The Jaljeera took Anjali 3 months to get right and we're thrilled it shows. See you soon!" },
    { plat:'google',rating:5,author:'Paul S.',    date:daysAgo(42), sentiment:'positive',status:'responded',
      text:"Arjun was our server and he was incredible — remembered my wife's allergy without being asked twice, knew every ingredient. Burrata chaat is better than anything in New York.",
      reply:"Paul, Arjun is a true professional and your recognition will inspire the whole team! Food safety is never a checkbox for us — it's hospitality. The Burrata Chaat thanks you!" },
    { plat:'google',rating:4,author:'Jennifer Y.',date:daysAgo(45),sentiment:'positive',status:'draft',
      text:'Lovely dinner. Prawn Recheado was the standout — perfectly spiced. Would love more vegetarian mains.', reply:null },
    { plat:'yelp',  rating:5,author:'Sanjay V.',  date:daysAgo(48), sentiment:'positive',status:'responded',
      text:'As an Indian-American, finding a place that respects the cuisine while being creative is rare. Chef Vikram is doing something special.',
      reply:"Sanjay, this means everything coming from you. Chef Vikram grew up with these flavours and pours that heritage into every plate. Thank you for seeing it." },
    { plat:'google',rating:4,author:'Amy C.',     date:daysAgo(52), sentiment:'positive',status:'responded',
      text:'Incredible food, slightly noisy weekends. Tasting menu exceptional value. Chloe at the front was warm and professional.',
      reply:"Amy, thank you! Chloe is a gem. The noise level on weekends is something we're actively working on with acoustic panels. The tasting menu was made for guests like you!" },
    { plat:'google',rating:5,author:'Omar F.',    date:daysAgo(55), sentiment:'positive',status:'responded',
      text:'The cocktail program alone is worth the visit. Every drink tells a story of India. Diego clearly has deep knowledge of Indian flavors.',
      reply:"Omar, Diego read this three times and is still smiling! He spent months researching the botanical history of Indian spices. Your appreciation is exactly what drives us." },
    { plat:'yelp',  rating:3,author:'Linda K.',   date:daysAgo(58), sentiment:'neutral', status:'pending',
      text:'Great food, confusing parking — nobody mentioned it is valet only. Food 5 stars. Communication 2 stars.', reply:null },
  ];

  let reviewNum = 1000;
  for (const rev of REVIEWS) {
    reviewNum++;
    // reviews table: external_id required, reviewer (not reviewer_name), text (not review_text),
    // response_draft (not response_text), UNIQUE(location_id, platform, external_id)
    await q(`INSERT INTO reviews
        (tenant_id,location_id,platform,external_id,reviewer,rating,text,review_date,sentiment,status,response_draft,employee_mentions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'[]')
      ON CONFLICT (location_id,platform,external_id) DO UPDATE SET text=$7,status=$10,response_draft=$11`,
      [TENANT, LOC, rev.plat, 'demo_'+reviewNum, rev.author, rev.rating,
       rev.text, rev.date, rev.sentiment, rev.status, rev.reply]);
  }
  console.log(`  ✓ ${REVIEWS.length} reviews`);

  // ── 7. Labor schedule ─────────────────────────────────────────────────────
  console.log('\n📅 Seeding labor schedule...');
  console.log('  → inserting schedule + shifts...');
  const schedR = await q(`INSERT INTO schedules (tenant_id,location_id,week_start,status)
    VALUES ($1,$2,$3,'published') ON CONFLICT (tenant_id,location_id,week_start) DO UPDATE SET status='published' RETURNING id`,
    [TENANT, LOC, weekStart(0)]);
  const SCHED_ID = schedR.rows[0].id;

  const SHIFTS = [
    { e:'Priya_Sharma',    days:[0,1,2,3,4,5,6], s:'11:00',end:'22:00', p:'General Manager' },
    { e:'Marcus_Chen',     days:[1,2,3,4,5],      s:'14:00',end:'23:00', p:'Assistant Manager' },
    { e:'Anjali_Patel',    days:[2,3,4,5,6],      s:'16:00',end:'02:00', p:'Bar Manager' },
    { e:'Sofia_Martinez',  days:[3,4,5,6],         s:'16:00',end:'23:30', p:'Server' },
    { e:'James_Washington',days:[0,1,4,5,6],       s:'16:00',end:'23:30', p:'Server' },
    { e:'Lily_Nguyen',     days:[0,2,3,5,6],       s:'16:00',end:'23:30', p:'Server' },
    { e:'Arjun_Verma',     days:[1,2,4,5,6],       s:'17:00',end:'23:30', p:'Server' },
    { e:'Chloe_Thompson',  days:[3,4,5,6],         s:'16:00',end:'23:00', p:'Host/Hostess' },
    { e:'Diego_Flores',    days:[2,3,4,5,6],       s:'15:00',end:'01:00', p:'Bartender' },
    { e:'Mia_Kim',         days:[0,1,4,5,6],       s:'16:00',end:'01:00', p:'Bartender' },
    { e:'Carlos_Rivera',   days:[4,5,6],            s:'17:00',end:'01:00', p:'Barback' },
    { e:'Nia_Johnson',     days:[5,6],              s:'17:00',end:'23:00', p:'Busser' },
    { e:'Ethan_Brown',     days:[4,5,6],            s:'17:00',end:'23:00', p:'Food Runner' },
    { e:'Vikram_Nair',     days:[0,2,3,4,5,6],     s:'10:00',end:'22:00', p:'Executive Chef' },
    { e:'Rajan_Mehta',     days:[1,2,3,4,5],       s:'11:00',end:'22:00', p:'Sous Chef' },
    { e:'Kenji_Tanaka',    days:[2,3,4,5,6],       s:'14:00',end:'23:00', p:'Line Cook' },
    { e:'Fatima_Al-Hassan',days:[0,1,4,5,6],       s:'14:00',end:'23:00', p:'Line Cook' },
    { e:'Tommy_Lee',       days:[1,2,3,4,5],       s:'15:00',end:'23:00', p:'Line Cook' },
    { e:'Rosa_Gutierrez',  days:[0,1,2,3,4],       s:'09:00',end:'17:00', p:'Prep Cook' },
    { e:'Andre_Baptiste',  days:[3,4,5,6],          s:'10:00',end:'18:00', p:'Prep Cook' },
    { e:'Min_Park',        days:[4,5,6],            s:'16:00',end:'01:00', p:'Dishwasher' },
    { e:'Luis_Morales',    days:[3,4,5,6],          s:'16:00',end:'23:00', p:'Expeditor' },
  ];
  const ws0 = weekStart(0);
  for (const sh of SHIFTS) {
    const eid = empIds[sh.e]; if (!eid) continue;
    for (const day of sh.days) {
      const d = new Date(ws0); d.setDate(d.getDate()+day);
      await q(`INSERT INTO shifts (tenant_id,schedule_id,location_id,employee_id,position,shift_date,start_time,end_time,break_minutes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,30)`,
        [TENANT, SCHED_ID, LOC, eid, sh.p, d.toISOString().slice(0,10), sh.s, sh.end]);
    }
  }
  console.log('  ✓ Full week schedule published');

  // ── 8. Training + gamification ────────────────────────────────────────────
  console.log('\n🎓 Seeding training + gamification...');
  console.log('  → adding columns...');

  const MODULES = [
    { title:'Aparajita Fizz — Cocktail Masterclass', cat:'beverage', mins:8, pts:75,
      desc:'History, technique, and upsell scripts for our signature cocktail.',
      content:'APARAJITA FIZZ GUIDE\n\nIngredients: 1.5oz Hendrick\'s Gin, 0.5oz elderflower liqueur, 0.5oz rose water, 1oz lychee juice, 2 dashes cardamom bitters, prosecco foam, dried rose petal garnish.\n\nTechnique: Shake gin, elderflower, rose water, lychee with ice 12 seconds. Double-strain into chilled coupe. Spoon (do not pour) prosecco foam. Garnish with rose petal.\n\nUPSELL: "The Aparajita Fizz took Anjali 6 months to perfect. It pairs beautifully with the Burrata Chaat — shall I bring both?"\n\nPrice: $18. Food cost: $3.20. Margin: 82%.' },
    { title:'Menu Knowledge — Starters Deep Dive', cat:'food', mins:10, pts:60,
      desc:'Every ingredient, allergen, and pairing for starters.',
      content:'STARTERS GUIDE\n\nBURRATA CHAAT ($18): Burrata, pomegranate molasses, chaat masala, papdi. Allergens: dairy, gluten. Pair with Crémant d\'Alsace.\n\nTRUFFLE SAMOSA ($16): Black truffle, potato, peas. Allergens: gluten. Pair with Grüner Veltliner.\n\nTANDOORI OCTOPUS ($22): 48hr brine, tandoor-cooked. No common allergens but cross-allergy possible. Prep time 30 min — set expectations.\n\nSELLING TIP: "Our Burrata Chaat is a fusion of Italian and Indian street food. The pomegranate molasses is made in-house and takes 3 days."' },
    { title:'Upselling Mastery — Hit Your APC Target', cat:'upselling', mins:6, pts:80,
      desc:'Scripts and techniques to increase average per-cover to $68.',
      content:'UPSELLING AT ROOH\n\nTarget APC: $68 | Current: $61 | Gap to close: $7/cover\n\nKEY MOMENTS:\n1. Arrival: "While you browse, can I start with our Aparajita Fizz? It\'s our signature — light, floral, absolutely stunning."\n2. Every table: "Our Truffle Naan is legendary — fresh truffle right from the tandoor. Shall I put one in?"\n3. Second drinks: "Another round? I\'d love to pour you a taste of the Grüner Veltliner — perfect with your mains."\n4. Dessert: "Our Gulab Jamun Sundae is unmissable — the cardamom ice cream is made in-house. Two spoons?"\n\nDATA: Tables with Truffle Naan: +$14 APC. Tables with signature cocktail: +$18 APC.' },
    { title:'Wine & Beverage Pairing Guide', cat:'beverage', mins:12, pts:70,
      desc:'Complete food and wine pairings for every section.',
      content:'ROOH PAIRING GUIDE\n\nCOCKTAILS WITH FOOD:\n• Aparajita Fizz → Burrata Chaat, Truffle Samosa\n• Saffron Old Fashioned → Raan-E-Rooh, Duck Vindaloo\n• Rooh Negroni → Tandoori Octopus, Lamb Sliders\n\nWINE BY COURSE:\nStarters: Champagne, Crémant, dry Rosé, Grüner Veltliner\nMeats: Côtes du Rhône, Northern Rhône Syrah, aged Burgundy\nFish: White Burgundy, Alsatian Riesling\nVegetarian: Natural wine, orange wine, Pinot Gris\nDessert: Moscato d\'Asti, Pedro Ximénez Sherry' },
    { title:'California Food Safety Certification Prep', cat:'safety', mins:15, pts:100,
      desc:'ServSafe core concepts for California food handler certification.',
      content:'CA FOOD SAFETY ESSENTIALS\n\nTEMPERATURE DANGER ZONE: 41°F–135°F\nHot hold: above 135°F | Cold hold: below 41°F\nCooling: 135°→70° within 2hr; 70°→41° within 4hr\n\nHANDWASHING: 20 seconds minimum. Required after: touching face, handling raw meat, restroom use, every 4 hours.\n\nBIG 8 ALLERGENS: Milk, Eggs, Fish, Shellfish, Tree nuts, Peanuts, Wheat, Soy. Always verify with kitchen — never guess.\n\nCROSS-CONTAMINATION: Red board (meat), yellow (poultry), blue (fish), green (produce). Never cross-use utensils for raw and cooked.' },
    { title:'Service Standards — The Rooh Way', cat:'service', mins:10, pts:60,
      desc:'5-star service philosophy, timing, and language standards.',
      content:'THE ROOH SERVICE PHILOSOPHY\n\n"We are storytellers. Every dish, every drink, every interaction is a chapter in the guest\'s story."\n\n10-MINUTE RULE:\n0 min: Seated — water, menus\n2 min: Greeting, cocktail order\n8 min: Food order or check back\nNever >10 min without acknowledgment\n\nLANGUAGE:\nSay: "May I recommend" | Not: "Do you want"\nSay: "Certainly" | Not: "No problem"\nSay: "Let me find out" | Not: "I don\'t know"\n\nFAREWELL: Eye contact + "Thank you for spending your evening with us" + hold door if possible.' },
  ];

  for (const m of MODULES) {
    const exists = await q('SELECT id FROM training_modules WHERE tenant_id=$1 AND title=$2 LIMIT 1', [TENANT, m.title]);
    if (!exists.rows[0]) {
      await q(`INSERT INTO training_modules (tenant_id,location_id,title,description,category,content,estimated_minutes,points_reward,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [TENANT, LOC, m.title, m.desc, m.cat, m.content, m.mins, m.pts]);
    }
  }

  // Gamification tables

  // Leaderboard
  const LEADERS = [
    { e:'Lily_Nguyen',     pts:2840, lvl:'expert', badges:['first_lesson','upsell_star','perfect_score','streak_7','review_hero'] },
    { e:'Diego_Flores',    pts:2210, lvl:'expert', badges:['first_lesson','upsell_star','challenge_winner','streak_7'] },
    { e:'Arjun_Verma',     pts:1980, lvl:'pro',    badges:['first_lesson','perfect_score','review_hero'] },
    { e:'Sofia_Martinez',  pts:1750, lvl:'pro',    badges:['first_lesson','team_player'] },
    { e:'Mia_Kim',         pts:1620, lvl:'pro',    badges:['first_lesson','upsell_star'] },
    { e:'James_Washington',pts:1380, lvl:'pro',    badges:['first_lesson'] },
    { e:'Kenji_Tanaka',    pts:1240, lvl:'pro',    badges:['first_lesson','perfect_score'] },
    { e:'Fatima_Al-Hassan',pts:980,  lvl:'pro',    badges:['first_lesson'] },
    { e:'Marcus_Chen',     pts:850,  lvl:'pro',    badges:['first_lesson'] },
    { e:'Chloe_Thompson',  pts:640,  lvl:'rookie', badges:['first_lesson'] },
    { e:'Rajan_Mehta',     pts:520,  lvl:'rookie', badges:[] },
    { e:'Tommy_Lee',       pts:410,  lvl:'rookie', badges:[] },
  ];
  for (const lb of LEADERS) {
    const eid = empIds[lb.e]; if (!eid) continue;
    const name = lb.e.replace('_',' ');
    await q(`INSERT INTO employee_gamification (tenant_id,employee_id,employee_name,location_id,total_points,available_points,level,badges,streak_days,last_activity,updated_at)
      VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,now())
      ON CONFLICT (tenant_id,employee_id) DO UPDATE SET total_points=$5,available_points=$5,level=$6,badges=$7`,
      [TENANT, eid, name, LOC, lb.pts, lb.lvl, lb.badges, Math.floor(Math.random()*14)+3, daysAgo(1)]);
    // Point history
    const types = ['training_complete','upsell','attendance','review_mention'];
    for (let i=0; i<Math.min(4, Math.ceil(lb.pts/400)); i++) {
      await q(`INSERT INTO gamification_points (tenant_id,employee_id,employee_name,location_id,point_type,points,note,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [TENANT, eid, name, LOC, types[i], Math.floor(lb.pts/Math.ceil(lb.pts/400)), types[i]+' achievement', daysAgo(Math.floor(Math.random()*30))]);
    }
  }
  console.log(`  ✓ ${LEADERS.length} gamification profiles`);

  // Active challenge
  const chalR = await q(`INSERT INTO gamification_challenges (tenant_id,location_id,title,description,challenge_type,metric,target,points_reward,bonus_reward,start_date,end_date,status)
    VALUES ($1,$2,'Aparajita Fizz Challenge','Sell 30 Aparajita Fizz this week — top seller wins dinner for two','individual','upsells',30,250,'Dinner for two at Rooh',$3,$4,'active')
    RETURNING id`, [TENANT, LOC, weekStart(0), weekStart(1)]);
  if (chalR.rows[0]) {
    for (const [emp, prog] of [['Diego_Flores',22],['Mia_Kim',18],['Lily_Nguyen',14],['Sofia_Martinez',11]]) {
      const eid = empIds[emp]; if (!eid) continue;
      await q(`INSERT INTO gamification_challenge_entries (tenant_id,challenge_id,employee_id,employee_name,progress,completed)
        VALUES ($1,$2,$3,$4,$5,false) ON CONFLICT (challenge_id,employee_id) DO NOTHING`,
        [TENANT, chalR.rows[0].id, eid, emp.replace('_',' '), prog]);
    }
  }

  // Rewards catalog
  for (const r of [
    ['$50 Cash Bonus','cash',50,500], ['Extra PTO Day','pto',null,800],
    ['$25 Amazon Gift Card','gift_card',25,300], ['Staff Meal for Two','recognition',80,400],
    ['Employee of the Month','recognition',null,200],
  ]) {
    const ex = await q('SELECT id FROM gamification_rewards WHERE tenant_id=$1 AND title=$2 LIMIT 1', [TENANT, r[0]]);
    if (!ex.rows[0]) await q(`INSERT INTO gamification_rewards (tenant_id,title,reward_type,value,points_cost,active) VALUES ($1,$2,$3,$4,$5,true)`, [TENANT, ...r]);
  }
  console.log('  ✓ Training modules, leaderboard, challenge, rewards');

  // ── 9. Compliance certs ───────────────────────────────────────────────────
  console.log('\n🛡️  Seeding compliance...');
  console.log('  → inserting certs...');

  const CERTS = [
    { e:'Priya Sharma',   role:'General Manager',cert:'food_manager',   label:'Food Safety Manager', issuer:'ServSafe', issued:daysAgo(180), expiry:daysAgo(-1280) },
    { e:'Priya Sharma',   role:'General Manager',cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(60),  expiry:daysAgo(-305) },
    { e:'Marcus Chen',    role:'Asst Manager',   cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(90),  expiry:daysAgo(-275) },
    { e:'Anjali Patel',   role:'Bar Manager',    cert:'rbs',            label:'RBS Certification',   issuer:'CA ABC',   issued:daysAgo(120), expiry:daysAgo(-245) },
    { e:'Vikram Nair',    role:'Executive Chef', cert:'food_manager',   label:'Food Safety Manager', issuer:'ServSafe', issued:daysAgo(200), expiry:daysAgo(-1095) },
    { e:'Vikram Nair',    role:'Executive Chef', cert:'haccp',          label:'HACCP Certification', issuer:'NSF',      issued:daysAgo(400), expiry:daysAgo(-325) },
    { e:'Rajan Mehta',    role:'Sous Chef',      cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(60),  expiry:daysAgo(-305) },
    { e:'Diego Flores',   role:'Bartender',      cert:'rbs',            label:'RBS Certification',   issuer:'CA ABC',   issued:daysAgo(150), expiry:daysAgo(-215) },
    { e:'Mia Kim',        role:'Bartender',      cert:'rbs',            label:'RBS Certification',   issuer:'CA ABC',   issued:daysAgo(40),  expiry:daysAgo(-325) },
    { e:'Sofia Martinez', role:'Server',         cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(30),  expiry:daysAgo(-335) },
    { e:'Lily Nguyen',    role:'Server',         cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(20),  expiry:daysAgo(-345) },
    { e:'Kenji Tanaka',   role:'Line Cook',      cert:'food_handlers',  label:'CA Food Handler',     issuer:'ServSafe', issued:daysAgo(10),  expiry:daysAgo(-355) },
  ];
  for (const c of CERTS) {
    const daysLeft = Math.floor((new Date(c.expiry)-new Date())/86400000);
    const status = daysLeft<0?'expired':daysLeft<30?'critical':daysLeft<90?'warning':'valid';
    const cex = await q('SELECT id FROM compliance_certifications WHERE tenant_id=$1 AND employee_name=$2 AND cert_key=$3 LIMIT 1', [TENANT, c.e, c.cert]);
    if (cex.rows[0]) continue;
    await q(`INSERT INTO compliance_certifications (tenant_id,location_id,employee_name,employee_role,cert_key,cert_label,issued_date,expiry_date,issuer,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [TENANT, LOC, c.e, c.role, c.cert, c.label, c.issued, c.expiry, c.issuer, daysLeft >= 0]);
  }
  console.log(`  ✓ ${CERTS.length} certifications`);

  // ── 10. Loyalty members ───────────────────────────────────────────────────
  console.log('\n🎁 Seeding loyalty...');
  console.log('  → inserting members...');

  const LOYALTY = [
    { name:'David Lee',    email:'david.lee@me.com',   tier:'platinum',pts:5800,life:12400,weeks:15 },
    { name:'Maya Krishnan',email:'maya.k@gmail.com',   tier:'platinum',pts:4200,life:9800, weeks:12 },
    { name:'Anita Gupta',  email:'anita.g@gmail.com',  tier:'gold',    pts:3200,life:6100, weeks:8  },
    { name:'Sarah Kim',    email:'sarah.k@gmail.com',  tier:'gold',    pts:2840,life:5200, weeks:7  },
    { name:'Raj Patel',    email:'raj.p@gmail.com',    tier:'gold',    pts:2210,life:4800, weeks:6  },
    { name:'Lisa Wong',    email:'lisa.w@icloud.com',  tier:'gold',    pts:2100,life:4200, weeks:5  },
    { name:'James Abbott', email:'j.abbott@me.com',    tier:'gold',    pts:1980,life:3800, weeks:5  },
    { name:'Emily Chen',   email:'emily.c@yahoo.com',  tier:'silver',  pts:1180,life:2200, weeks:3  },
    { name:'Michael Torres',email:'mtorres@gmail.com', tier:'silver',  pts:980, life:1800, weeks:3  },
    { name:'Preethi Nair', email:'preethi@gmail.com',  tier:'silver',  pts:1050,life:2100, weeks:3  },
    { name:'Jessica Park', email:'jpark@gmail.com',    tier:'silver',  pts:760, life:1400, weeks:2  },
    { name:'Nina Patel',   email:'nina.p@yahoo.com',   tier:'silver',  pts:820, life:1600, weeks:2  },
    { name:'Rohan Sharma', email:'rohan.s@gmail.com',  tier:'bronze',  pts:380, life:680,  weeks:1  },
    { name:'Carlos Mendez',email:'c.mendez@gmail.com', tier:'bronze',  pts:220, life:420,  weeks:0  },
    { name:'Tom Sullivan', email:'tsullivan@gmail.com',tier:'bronze',  pts:150, life:300,  weeks:0  },
  ];
  for (const m of LOYALTY) {
    const lex = await q('SELECT id FROM loyalty_members WHERE tenant_id=$1 AND email=$2 LIMIT 1', [TENANT, m.email]);
    if (lex.rows[0]) continue;
    await q(`INSERT INTO loyalty_members (tenant_id,location_id,name,email,tier,points_balance,points_lifetime,streak_weeks,last_visit_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [TENANT, LOC, m.name, m.email, m.tier, m.pts, m.life, m.weeks, daysAgo(Math.floor(Math.random()*14))]);
  }
  console.log(`  ✓ ${LOYALTY.length} loyalty members`);

  // ── 11. Marketing posts ───────────────────────────────────────────────────
  console.log('\n📣 Seeding marketing posts...');
  console.log('  → inserting posts...');
  const POSTS = [
    { plat:'instagram', status:'published', date:daysAgo(7),
      content:"🌸 Introducing our Spring cocktail menu. The Aparajita Fizz has a seasonal twist — butterfly pea blossom ice, elderflower foam, and a hint of rosewater. Available this weekend. Reserve via link in bio. #RoohSF #IndianFineDining #SFCocktails" },
    { plat:'instagram', status:'published', date:daysAgo(14),
      content:"Tandoor season is here. 🔥 Our Raan-E-Rooh — 36-hour slow-braised lamb — is back on the tasting menu. Pairs beautifully with the Saffron Old Fashioned. Limited portions nightly. #Tandoor #SFEats #RoohSF" },
    { plat:'google', status:'published', date:daysAgo(10),
      content:"New on the menu: Chef Vikram's Duck Vindaloo with coconut foam is now permanent after popular demand. Confit duck leg, Goan recheado spice, house coconut foam. Available nightly. #NewMenu" },
    { plat:'instagram', status:'draft', date:daysAgo(0),
      content:"Behind the bar with Anjali 🍸 Watch how our Bar Manager creates the Rooh Negroni — gin, Campari, sweet vermouth, and our house rose-cardamom tincture. 3 days to infuse. Worth every second. #CocktailCraft" },
    { plat:'instagram', status:'approved', date:daysAgo(-5),
      content:"Mother's Day at Rooh ❤️ Treat mum to something extraordinary. 3-course prix fixe $89pp. Private dining available for 8+. Book by May 1 for 15% early bird. #MothersDay #SFRestaurants" },
    { plat:'google', status:'published', date:daysAgo(21),
      content:"Join us for our exclusive Winemaker Dinner featuring 6 courses paired with Château Montelena wines. $175pp inclusive. Only 8 seats remaining. Reserve: roohsf.com/events" },
  ];
  for (const p of POSTS) {
    // social_posts uses caption not content, and hashtags is required
    await q(`INSERT INTO social_posts (tenant_id,location_id,platform,caption,hashtags,status,scheduled_at,published_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [TENANT, LOC, p.plat, p.content, '', p.status, p.date, p.status==='published'?p.date:null]);
  }
  console.log(`  ✓ ${POSTS.length} marketing posts`);

  // ── Done ──────────────────────────────────────────────────────────────────
  // ── Verification counts ───────────────────────────────────────
  console.log('\n📋 Verifying seeded data...');
  const counts = await Promise.all([
    q('SELECT COUNT(*) FROM employees WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM weekly_kpi WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM inventory_items WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM menu_items WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM reviews WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM shifts WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM training_modules WHERE tenant_id=$1', [TENANT]),
    q('SELECT COUNT(*) FROM employee_gamification WHERE tenant_id=$1', [TENANT]),
    q('SELECT COUNT(*) FROM compliance_certifications WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM loyalty_members WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
    q('SELECT COUNT(*) FROM social_posts WHERE tenant_id=$1 AND location_id=$2', [TENANT, LOC]),
  ]);
  const labels = ['employees','weekly_kpi','inventory_items','menu_items','reviews','shifts','training_modules','gamification','certs','loyalty','social_posts'];
  console.log('  Counts in DB for Rooh SF:');
  labels.forEach((l,i) => console.log(`    ${l}: ${counts[i].rows[0].count}`));

  // Get location name to confirm
  const locName = await q('SELECT name FROM locations WHERE id=$1', [LOC]);
  const allLocs = await q('SELECT name FROM locations WHERE tenant_id=$1 ORDER BY name', [TENANT]);
  console.log(`\n  📍 Location seeded: "${locName.rows[0]?.name}" (id: ${LOC})`);
  console.log('  All locations in tenant:', allLocs.rows.map(r=>r.name).join(', '));
  console.log('  ⚠️  Select the location shown above in each agent dropdown!');
  console.log('  ⚠️  In each agent, make sure this location is selected in the dropdown!');

  console.log('\n' + '═'.repeat(58));
  console.log('✅  DEMO SEED COMPLETE');
  console.log('═'.repeat(58));
  console.log(`
  📍 Location:  Rooh SF, 333 Brannan St, San Francisco CA

  📊 Data seeded:
     • ${EMPLOYEES.length} employees (management + FOH + BOH)
     • 8 weeks financial KPIs + labor schedule
     • ${ITEMS.length} inventory items, 3 invoices, 1 count
     • ${MENU.length} menu items across 6 sections + 8wk sales
     • ${REVIEWS.length} reviews (Google + Yelp) with responses
     • ${MODULES.length} training modules with full content
     • ${LEADERS.length} gamification profiles + leaderboard + challenge
     • ${CERTS.length} compliance certifications
     • ${LOYALTY.length} loyalty members (Bronze → Platinum)
     • ${POSTS.length} marketing posts

  🔑 Login credentials:
     Owner:   vikram@roohsf.com / vikram123!
     GM:      priya@roohsf.com  / demo123!
     Bar Mgr: anjali@roohsf.com / demo123!
  `);

  await pool.end();
}

seed().catch(e => {
  console.error('\n❌ Seed failed:');
  console.error('  message:', e.message);
  console.error('  detail:', e.detail || '(none)');
  console.error('  hint:', e.hint || '(none)');
  console.error('  table:', e.table || '(none)');
  console.error('  column:', e.column || '(none)');
  console.error('  constraint:', e.constraint || '(none)');
  console.error('  code:', e.code || '(none)');
  pool.end();
  process.exit(1);
});
