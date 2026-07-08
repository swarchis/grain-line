// ─── Agent 9: Labor & Scheduling ─────────────────────────────────────────────
const { adminQuery } = require('@restaurantos/db');
const { callClaude, parseJSON } = require('../../lib/claude');
const AGENT_ID = 'agent_9_labor';

// ── Ensure tables (cached — runs DDL once per process, not per request) ────────
let _tablesReady = false;
async function ensureTables() {
  if (_tablesReady) return;
  const stmts = [`
    CREATE TABLE IF NOT EXISTS schedules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID NOT NULL,
      week_start      DATE NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft',
      published_at    TIMESTAMPTZ,
      published_by    UUID,
      total_hours     NUMERIC(8,2) DEFAULT 0,
      total_cost      NUMERIC(10,2) DEFAULT 0,
      notes           TEXT,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_id, week_start)
    )`,`
    CREATE TABLE IF NOT EXISTS shifts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      schedule_id     UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      location_id     UUID NOT NULL,
      employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
      position        VARCHAR(100),
      shift_date      DATE NOT NULL,
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      break_minutes   INTEGER DEFAULT 30,
      notes           TEXT,
      status          VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS employee_availability (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      avail_type      VARCHAR(20) NOT NULL DEFAULT 'recurring',
      day_of_week     INTEGER,
      date_start      DATE,
      date_end        DATE,
      start_time      TIME,
      end_time        TIME,
      available       BOOLEAN NOT NULL DEFAULT true,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS shift_requests (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID NOT NULL,
      request_type    VARCHAR(20) NOT NULL,
      shift_id        UUID REFERENCES shifts(id) ON DELETE CASCADE,
      from_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      to_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      reason          TEXT,
      manager_notes   TEXT,
      reviewed_by     UUID,
      reviewed_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS labor_forecasts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID NOT NULL,
      forecast_date   DATE NOT NULL,
      day_of_week     INTEGER,
      projected_sales NUMERIC(10,2),
      recommended_hours NUMERIC(6,2),
      recommended_staff INTEGER,
      labor_pct_target  NUMERIC(5,2) DEFAULT 30,
      actual_hours    NUMERIC(6,2),
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, location_id, forecast_date)
    )`,`
    CREATE TABLE IF NOT EXISTS time_off_requests (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      location_id     UUID,
      request_type    VARCHAR(20) NOT NULL DEFAULT 'time_off',
      date_start      DATE NOT NULL,
      date_end        DATE NOT NULL,
      reason          TEXT,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',
      manager_notes   TEXT,
      reviewed_by     UUID,
      reviewed_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS employee_badges (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      badge_key       VARCHAR(50) NOT NULL,
      badge_label     VARCHAR(100) NOT NULL,
      awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, employee_id, badge_key)
    )`,
  ];
  for (const sql of stmts) await adminQuery(sql).catch(e => console.error('[agent9] table error:', e.message));


  // employees table exists from original schema — add missing columns
  const empMigrations = [
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS position VARCHAR(100)",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS wage_type VARCHAR(20) DEFAULT 'hourly'",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS wage_rate NUMERIC(10,2)",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS performance_score INTEGER DEFAULT 100",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(20) DEFAULT 'foh'",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(200)",
    "ALTER TABLE employees ALTER COLUMN location_id DROP NOT NULL",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS staff_pin VARCHAR(100)",
    "ALTER TABLE employees ALTER COLUMN staff_pin TYPE VARCHAR(100)",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ",
  ];
  for (const sql of empMigrations) await adminQuery(sql).catch(() => {});

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS shifts_schedule   ON shifts(schedule_id)',
    'CREATE INDEX IF NOT EXISTS shifts_employee   ON shifts(employee_id)',
    'CREATE INDEX IF NOT EXISTS shifts_date       ON shifts(shift_date)',
    'CREATE INDEX IF NOT EXISTS employees_tenant  ON employees(tenant_id)',
    'CREATE INDEX IF NOT EXISTS employees_loc     ON employees(location_id)',
    'CREATE INDEX IF NOT EXISTS schedule_week     ON schedules(tenant_id, location_id, week_start)',
    'CREATE INDEX IF NOT EXISTS team_msg_channel  ON team_messages(tenant_id, channel, created_at DESC)',
  ];
  for (const sql of indexes) await adminQuery(sql).catch(() => {});
  // Messaging tables
  await adminQuery(`CREATE TABLE IF NOT EXISTS team_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, location_id UUID,
    channel VARCHAR(50) NOT NULL DEFAULT 'all_staff',
    sender_id UUID, sender_name VARCHAR(200) NOT NULL, sender_role VARCHAR(50),
    content TEXT NOT NULL, msg_type VARCHAR(20) NOT NULL DEFAULT 'message',
    pinned BOOLEAN DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).catch(()=>{});
  await adminQuery(`CREATE TABLE IF NOT EXISTS message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES team_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(message_id, employee_id)
  )`).catch(()=>{});
  _tablesReady = true;
}

// ── Positions / roles config ──────────────────────────────────────────────────
const POSITIONS = {
  foh: ['Server','Host/Hostess','Bartender','Barback','Busser','Food Runner','Cashier'],
  boh: ['Executive Chef','Sous Chef','Line Cook','Prep Cook','Dishwasher','Expeditor'],
  management: ['General Manager','Assistant Manager','Bar Manager','Kitchen Manager','Shift Lead'],
};

// ── Badges ────────────────────────────────────────────────────────────────────
const BADGE_DEFINITIONS = [
  { key:'six_months',     label:'6 Month Milestone',    icon:'🥈', desc:'6 months with the team' },
  { key:'one_year',       label:'1 Year Anniversary',   icon:'🥇', desc:'1 year of dedication' },
  { key:'two_years',      label:'2 Year Veteran',       icon:'🏆', desc:'2+ years — true veteran' },
  { key:'reliable',       label:'Rock Solid',           icon:'💎', desc:'No missed shifts in 3 months' },
  { key:'team_player',    label:'Team Player',          icon:'🤝', desc:'Covered 3+ swaps for teammates' },
  { key:'top_performer',  label:'Top Performer',        icon:'⭐', desc:'Performance score 95+' },
  { key:'trainer',        label:'Trainer',              icon:'🎓', desc:'Trained a new team member' },
];

// ── Employees ─────────────────────────────────────────────────────────────────
async function getEmployees(tenantId, { locationId, status, position, department, archived = false } = {}) {
  await ensureTables();
  let where = 'e.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId)  { where += ` AND (e.location_id=$${i++} OR e.location_id IS NULL)`; params.push(locationId); }
  if (status)      { where += ` AND e.status=$${i++}`; params.push(status); }
  else if (!archived) { where += ` AND e.status != 'inactive'`; }
  if (position)    { where += ` AND e.position=$${i++}`; params.push(position); }
  if (department)  { where += ` AND e.department=$${i++}`; params.push(department); }
  if (archived)    { where += ` AND COALESCE(e.archived, false) = true`; }
  else             { where += ` AND COALESCE(e.archived, false) = false`; }

  const r = await adminQuery(`
    SELECT e.*,
      COALESCE(e.first_name, split_part(COALESCE(e.name,''), ' ', 1)) as first_name,
      COALESCE(e.last_name,  CASE WHEN e.name LIKE '% %' THEN split_part(e.name, ' ', 2) ELSE '' END) as last_name,
      l.name as location_name,
      COALESCE(json_agg(eb.badge_key) FILTER (WHERE eb.badge_key IS NOT NULL), '[]') as badges
    FROM employees e
    LEFT JOIN locations l ON l.id = e.location_id
    LEFT JOIN employee_badges eb ON eb.employee_id = e.id AND eb.tenant_id = e.tenant_id
    WHERE ${where}
    GROUP BY e.id, l.name
    ORDER BY COALESCE(e.last_name, e.name) NULLS LAST
  `, params);
  return r.rows;
}

async function upsertEmployee(tenantId, data) {
  await ensureTables();
  const { id, locationId, firstName, lastName, email, phone, role, position,
          wageType, wageRate, hireDate, status, notes } = data;

  if (id) {
    const allowed = ['location_id','name','first_name','last_name','email','phone','role',
                     'position','wage_type','wage_rate','hire_date','status','notes'];
    const updates = [], values = []; let i = 1;
    const map = { locationId:'location_id', firstName:'first_name', lastName:'last_name',
                  wageType:'wage_type', wageRate:'wage_rate', hireDate:'hire_date' };
    for (const [k,v] of Object.entries(data)) {
      const col = map[k] || k;
      if (allowed.includes(col) && v !== undefined) { updates.push(`${col}=$${i++}`); values.push(v); }
    }
    if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status:400 });
    values.push(id, tenantId);
    const r = await adminQuery(
      `UPDATE employees SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
      values
    );
    await checkAndAwardBadges(tenantId, id);
    return r.rows[0];
  }

  const r = await adminQuery(`
    INSERT INTO employees
      (tenant_id, location_id, name, first_name, last_name, email, phone, role,
       position, wage_type, wage_rate, hire_date, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
  `, [tenantId, locationId||null, `${firstName} ${lastName}`.trim(),
      firstName, lastName, email||null, phone||null,
      role||'staff', position||null, wageType||'hourly', wageRate||null,
      hireDate||null, status||'active', notes||null]);
  return r.rows[0];
}

async function deleteEmployee(tenantId, employeeId) {
  await adminQuery(
    "UPDATE employees SET status='inactive', updated_at=now() WHERE id=$1 AND tenant_id=$2",
    [employeeId, tenantId]
  );
  return { ok: true };
}

// ── Availability ──────────────────────────────────────────────────────────────
async function getAvailability(tenantId, employeeId) {
  const r = await adminQuery(
    'SELECT * FROM employee_availability WHERE tenant_id=$1 AND employee_id=$2 ORDER BY day_of_week, date_start',
    [tenantId, employeeId]
  );
  return r.rows;
}

async function setAvailability(tenantId, employeeId, entries) {
  await adminQuery('DELETE FROM employee_availability WHERE tenant_id=$1 AND employee_id=$2', [tenantId, employeeId]);
  for (const e of entries) {
    await adminQuery(`
      INSERT INTO employee_availability
        (tenant_id, employee_id, avail_type, day_of_week, date_start, date_end, start_time, end_time, available, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [tenantId, employeeId, e.availType||'recurring', e.dayOfWeek??null, e.dateStart||null,
        e.dateEnd||null, e.startTime||null, e.endTime||null, e.available??true, e.notes||null]);
  }
  return getAvailability(tenantId, employeeId);
}

// ── Schedules ─────────────────────────────────────────────────────────────────
async function getOrCreateSchedule(tenantId, locationId, weekStart) {
  await ensureTables();
  const existing = await adminQuery(
    'SELECT * FROM schedules WHERE tenant_id=$1 AND location_id=$2 AND week_start=$3',
    [tenantId, locationId, weekStart]
  );
  if (existing.rows[0]) return existing.rows[0];

  const r = await adminQuery(`
    INSERT INTO schedules (tenant_id, location_id, week_start, status)
    VALUES ($1,$2,$3,'draft') RETURNING *
  `, [tenantId, locationId, weekStart]);
  return r.rows[0];
}

async function getScheduleWithShifts(tenantId, locationId, weekStart) {
  await ensureTables();
  const schedule = await getOrCreateSchedule(tenantId, locationId, weekStart);

  const shifts = await adminQuery(`
    SELECT s.*,
      COALESCE(e.first_name, split_part(COALESCE(e.name,''), ' ', 1)) as first_name,
      COALESCE(e.last_name, CASE WHEN e.name LIKE '% %' THEN split_part(e.name, ' ', 2) ELSE '' END) as last_name,
      e.position as employee_position,
      e.department,
      e.wage_rate, e.wage_type,
      EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600 -
        COALESCE(s.break_minutes,30)/60.0 as shift_hours
    FROM shifts s
    LEFT JOIN employees e ON e.id = s.employee_id
    WHERE s.schedule_id=$1
    ORDER BY s.shift_date, s.start_time, e.last_name
  `, [schedule.id]);

  // Labor cost calc
  const totalHours = shifts.rows.reduce((s, sh) => s + parseFloat(sh.shift_hours||0), 0);
  const totalCost  = shifts.rows.reduce((s, sh) => {
    const hrs  = parseFloat(sh.shift_hours || 0);
    const rate = parseFloat(sh.wage_rate || 0);
    return s + (sh.wage_type === 'hourly' ? hrs * rate : rate / 52 / 40 * hrs * 40);
  }, 0);

  // Overtime flags (CA: >8hrs/day, >40hrs/week per employee)
  const overtimeAlerts = detectOvertime(shifts.rows);

  return { schedule, shifts: shifts.rows, totalHours, totalCost, overtimeAlerts };
}

function detectOvertime(shifts) {
  const byEmployee = {};
  const alerts = [];

  for (const s of shifts) {
    if (!s.employee_id) continue;
    if (!byEmployee[s.employee_id]) byEmployee[s.employee_id] = { name:`${s.first_name} ${s.last_name}`, byDay:{}, totalHours:0 };
    const emp = byEmployee[s.employee_id];
    const hrs  = parseFloat(s.shift_hours || 0);
    emp.byDay[s.shift_date] = (emp.byDay[s.shift_date] || 0) + hrs;
    emp.totalHours += hrs;
  }

  for (const [empId, data] of Object.entries(byEmployee)) {
    if (data.totalHours > 40) {
      alerts.push({ employeeId: empId, name: data.name, type:'weekly_ot',
        message:`${data.totalHours.toFixed(1)}h scheduled this week — OT after 40h (CA law)`, severity:'warning' });
    }
    for (const [date, hrs] of Object.entries(data.byDay)) {
      if (hrs > 8) {
        alerts.push({ employeeId: empId, name: data.name, type:'daily_ot', date,
          message:`${hrs.toFixed(1)}h on ${date} — OT after 8h (CA law)`, severity: hrs > 12 ? 'critical' : 'warning' });
      }
    }
  }
  return alerts;
}

// ── Shifts ────────────────────────────────────────────────────────────────────
async function createShift(tenantId, data) {
  await ensureTables();
  const { scheduleId, locationId, employeeId, position, shiftDate, startTime, endTime, breakMinutes, notes } = data;
  const r = await adminQuery(`
    INSERT INTO shifts
      (tenant_id, schedule_id, location_id, employee_id, position, shift_date, start_time, end_time, break_minutes, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [tenantId, scheduleId, locationId, employeeId||null, position||null,
      shiftDate, startTime, endTime, breakMinutes??30, notes||null]);
  await recalcScheduleTotals(tenantId, scheduleId);
  return r.rows[0];
}

async function updateShift(tenantId, shiftId, data) {
  const allowed = ['employee_id','position','shift_date','start_time','end_time','break_minutes','notes','status'];
  const updates = [], values = []; let i = 1;
  const map = { employeeId:'employee_id', shiftDate:'shift_date', startTime:'start_time', endTime:'end_time', breakMinutes:'break_minutes' };
  for (const [k,v] of Object.entries(data)) {
    const col = map[k] || k;
    if (allowed.includes(col)) { updates.push(`${col}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status:400 });
  values.push(shiftId, tenantId);
  const r = await adminQuery(
    `UPDATE shifts SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
    values
  );
  const shift = r.rows[0];
  if (shift) await recalcScheduleTotals(tenantId, shift.schedule_id);
  return shift;
}

async function deleteShift(tenantId, shiftId) {
  const s = await adminQuery('SELECT schedule_id FROM shifts WHERE id=$1 AND tenant_id=$2', [shiftId, tenantId]);
  await adminQuery('DELETE FROM shifts WHERE id=$1 AND tenant_id=$2', [shiftId, tenantId]);
  if (s.rows[0]) await recalcScheduleTotals(tenantId, s.rows[0].schedule_id);
  return { ok: true };
}

async function recalcScheduleTotals(tenantId, scheduleId) {
  await adminQuery(`
    UPDATE schedules SET
      total_hours = (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time-start_time))/3600 - COALESCE(break_minutes,30)/60.0),0) FROM shifts WHERE schedule_id=$1),
      total_cost  = (SELECT COALESCE(SUM(
        CASE WHEN e.wage_type='hourly'
          THEN (EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600 - COALESCE(s.break_minutes,30)/60.0) * COALESCE(e.wage_rate,0)
          ELSE COALESCE(e.wage_rate,0)/52/5*1
        END
      ),0) FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id WHERE s.schedule_id=$1),
      updated_at  = now()
    WHERE id=$1
  `, [scheduleId]);
}

// ── Copy week ─────────────────────────────────────────────────────────────────
async function copySchedule(tenantId, fromLocationId, fromWeekStart, toWeekStart) {
  await ensureTables();
  const fromSched = await adminQuery(
    'SELECT * FROM schedules WHERE tenant_id=$1 AND location_id=$2 AND week_start=$3',
    [tenantId, fromLocationId, fromWeekStart]
  );
  if (!fromSched.rows[0]) throw Object.assign(new Error('Source schedule not found'), { status:404 });

  const toSched = await getOrCreateSchedule(tenantId, fromLocationId, toWeekStart);

  // Delete existing shifts in target week
  await adminQuery('DELETE FROM shifts WHERE schedule_id=$1', [toSched.id]);

  // Copy shifts, adjusting dates
  const dayDiff = (new Date(toWeekStart) - new Date(fromWeekStart)) / (1000 * 60 * 60 * 24);
  const shifts  = await adminQuery('SELECT * FROM shifts WHERE schedule_id=$1', [fromSched.rows[0].id]);

  for (const sh of shifts.rows) {
    const newDate = new Date(sh.shift_date);
    newDate.setDate(newDate.getDate() + dayDiff);
    await adminQuery(`
      INSERT INTO shifts (tenant_id, schedule_id, location_id, employee_id, position, shift_date, start_time, end_time, break_minutes, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [tenantId, toSched.id, sh.location_id, sh.employee_id, sh.position,
        newDate.toISOString().slice(0,10), sh.start_time, sh.end_time, sh.break_minutes, sh.notes]);
  }

  await recalcScheduleTotals(tenantId, toSched.id);
  return getScheduleWithShifts(tenantId, fromLocationId, toWeekStart);
}

// ── Publish schedule ──────────────────────────────────────────────────────────
async function publishSchedule(tenantId, scheduleId, publishedBy) {
  // Mark as published
  const r = await adminQuery(
    "UPDATE schedules SET status='published', published_at=now(), published_by=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [publishedBy||null, scheduleId, tenantId]
  );
  const schedule = r.rows[0];
  if (!schedule) throw new Error('Schedule not found');

  // Get shifts with employee info for notifications
  const shifts = await adminQuery(`
    SELECT s.*, s.shift_date::text as shift_date_str,
      e.first_name, e.last_name, e.email,
      e.position as employee_position
    FROM shifts s
    LEFT JOIN employees e ON e.id = s.employee_id
    WHERE s.schedule_id=$1
    ORDER BY s.shift_date, s.start_time
  `, [scheduleId]);

  const ws   = schedule.week_start instanceof Date
    ? schedule.week_start.toISOString().slice(0,10)
    : String(schedule.week_start).slice(0,10);
  const wEnd = new Date(ws+'T12:00'); wEnd.setDate(wEnd.getDate()+6);
  const weekLabel = `${new Date(ws+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${wEnd.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;

  // Post to All Staff channel
  await sendMessage(tenantId, {
    locationId: schedule.location_id,
    channel:    'all_staff',
    senderName: 'Pulse',
    senderRole: 'system',
    content:    `📅 Schedule published for ${weekLabel}. Open the Pulse Staff app or check with your manager to see your shifts.`,
    msgType:    'announcement',
  }).catch(e => console.error('[publish] channel msg failed:', e.message));

  // Send individual emails to employees who have email on file
  const byEmployee = {};
  for (const sh of shifts.rows) {
    if (!sh.employee_id || !sh.email) continue;
    if (!byEmployee[sh.employee_id]) {
      byEmployee[sh.employee_id] = {
        firstName: sh.first_name || 'Team member',
        email:     sh.email,
        shifts:    [],
      };
    }
    byEmployee[sh.employee_id].shifts.push(sh);
  }

  const emailResults = { sent: 0, failed: 0, noEmail: 0 };

  // Count employees without email
  const totalEmpIds = new Set(shifts.rows.filter(s=>s.employee_id).map(s=>s.employee_id));
  emailResults.noEmail = totalEmpIds.size - Object.keys(byEmployee).length;

  if (process.env.RESEND_API_KEY && Object.keys(byEmployee).length > 0) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'schedule@pulse.restaurant';

    for (const [empId, emp] of Object.entries(byEmployee)) {
      const shiftRows = emp.shifts
        .sort((a,b) => a.shift_date > b.shift_date ? 1 : -1)
        .map(sh => {
          const d = new Date((sh.shift_date_str||sh.shift_date)+'T12:00');
          const day = d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
          const start = sh.start_time?.slice(0,5)||'';
          const end   = sh.end_time?.slice(0,5)||'';
          const fmt   = t => { if(!t)return ''; const [h,m]=t.split(':'); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; };
          return `<tr><td style="padding:8px 16px;border-bottom:1px solid #eee">${day}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;font-family:monospace">${fmt(start)} – ${fmt(end)}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#666">${sh.employee_position||sh.position||''}</td></tr>`;
        }).join('');

      const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#1a1a1a;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:20px">Your schedule is ready</h2>
          <p style="margin:6px 0 0;color:#aaa;font-size:14px">${weekLabel}</p>
        </div>
        <div style="border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;padding:20px 0">
          <p style="padding:0 20px;font-size:14px;color:#333">Hi ${emp.firstName}, your shifts for <strong>${weekLabel}</strong> are:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr style="background:#f9f9f9"><th style="padding:8px 16px;text-align:left;color:#666;font-weight:600;font-size:12px;text-transform:uppercase">Day</th><th style="padding:8px 16px;text-align:left;color:#666;font-weight:600;font-size:12px;text-transform:uppercase">Time</th><th style="padding:8px 16px;text-align:left;color:#666;font-weight:600;font-size:12px;text-transform:uppercase">Role</th></tr></thead>
            <tbody>${shiftRows}</tbody>
          </table>
          <p style="padding:16px 20px 0;font-size:12px;color:#999">Questions? Contact your manager. View full schedule at your restaurant's Pulse Staff app.</p>
        </div>
      </body></html>`;

      try {
        await resend.emails.send({
          from: fromEmail,
          to:   emp.email,
          subject: `Your schedule for ${weekLabel}`,
          html,
        });
        emailResults.sent++;
      } catch(e) {
        console.error('[publish] email failed for', emp.email, e.message);
        emailResults.failed++;
      }
    }
  }

  return { ...schedule, emailResults, weekLabel };
}

// ── Shift requests (swap / pickup) ────────────────────────────────────────────
async function getRequests(tenantId, { locationId, status } = {}) {
  await ensureTables();
  let where = 'sr.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ` AND sr.location_id=$${i++}`; params.push(locationId); }
  if (status)     { where += ` AND sr.status=$${i++}`; params.push(status); }

  const r = await adminQuery(`
    SELECT sr.*,
      fe.first_name as from_first, fe.last_name as from_last,
      te.first_name as to_first,   te.last_name as to_last,
      s.shift_date, s.start_time, s.end_time, s.position
    FROM shift_requests sr
    LEFT JOIN employees fe ON fe.id = sr.from_employee_id
    LEFT JOIN employees te ON te.id = sr.to_employee_id
    LEFT JOIN shifts s ON s.id = sr.shift_id
    WHERE ${where}
    ORDER BY sr.created_at DESC
  `, params);
  return r.rows;
}

async function createRequest(tenantId, data) {
  await ensureTables();
  const { locationId, requestType, shiftId, fromEmployeeId, toEmployeeId, reason } = data;
  const r = await adminQuery(`
    INSERT INTO shift_requests (tenant_id, location_id, request_type, shift_id, from_employee_id, to_employee_id, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [tenantId, locationId, requestType, shiftId, fromEmployeeId, toEmployeeId||null, reason||null]);
  return r.rows[0];
}

async function reviewRequest(tenantId, requestId, { approved, managerNotes, reviewedBy }) {
  const req = await adminQuery('SELECT * FROM shift_requests WHERE id=$1 AND tenant_id=$2', [requestId, tenantId]);
  const r = req.rows[0];
  if (!r) throw Object.assign(new Error('Request not found'), { status:404 });

  const status = approved ? 'approved' : 'declined';
  await adminQuery(
    'UPDATE shift_requests SET status=$1, manager_notes=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4',
    [status, managerNotes||null, reviewedBy, requestId]
  );

  // If swap approved, actually swap the employees
  if (approved && r.request_type === 'swap' && r.shift_id && r.to_employee_id) {
    await adminQuery('UPDATE shifts SET employee_id=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3', [r.to_employee_id, r.shift_id, tenantId]);

    // Award team_player badge to helper
    await awardBadge(tenantId, r.to_employee_id, 'team_player').catch(() => {});
  }

  return { ok: true, status };
}


// ── Time off requests ─────────────────────────────────────────────────────────
async function getTimeOffRequests(tenantId, { locationId, status, employeeId } = {}) {
  await ensureTables();
  let where = 'tor.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId)  { where += ` AND tor.location_id=$${i++}`; params.push(locationId); }
  if (status)      { where += ` AND tor.status=$${i++}`; params.push(status); }
  if (employeeId)  { where += ` AND tor.employee_id=$${i++}`; params.push(employeeId); }
  const r = await adminQuery(`
    SELECT tor.*,
      e.first_name, e.last_name, e.position,
      COALESCE(e.first_name, split_part(COALESCE(e.name,''), ' ', 1)) as first_name,
      COALESCE(e.last_name, CASE WHEN e.name LIKE '% %' THEN split_part(e.name, ' ', 2) ELSE '' END) as last_name
    FROM time_off_requests tor
    JOIN employees e ON e.id = tor.employee_id
    WHERE ${where}
    ORDER BY tor.created_at DESC
  `, params);
  return r.rows;
}

async function createTimeOffRequest(tenantId, data) {
  await ensureTables();
  const { employeeId, locationId, requestType, dateStart, dateEnd, reason } = data;
  const r = await adminQuery(`
    INSERT INTO time_off_requests (tenant_id, employee_id, location_id, request_type, date_start, date_end, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [tenantId, employeeId, locationId||null, requestType||'time_off', dateStart, dateEnd, reason||null]);
  return r.rows[0];
}

async function reviewTimeOffRequest(tenantId, requestId, { approved, managerNotes, reviewedBy }) {
  const status = approved ? 'approved' : 'declined';
  const r = await adminQuery(
    'UPDATE time_off_requests SET status=$1, manager_notes=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 AND tenant_id=$5 RETURNING *',
    [status, managerNotes||null, reviewedBy, requestId, tenantId]
  );
  return r.rows[0];
}

// ── AI Forecasting ────────────────────────────────────────────────────────────
async function generateForecast(tenantId, locationId, weekStart) {
  await ensureTables();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Pull 8 weeks of historical sales from invoice data
  const salesHistory = await adminQuery(`
    SELECT
      EXTRACT(DOW FROM i.invoice_date)::INTEGER as day_of_week,
      TO_CHAR(i.invoice_date, 'Day') as day_name,
      AVG(i.total_amount) as avg_daily_sales,
      COUNT(*) as data_points
    FROM invoices i
    WHERE i.tenant_id=$1 AND i.location_id=$2
      AND i.invoice_date >= CURRENT_DATE - interval '8 weeks'
      AND i.status = 'approved'
    GROUP BY 1, 2 ORDER BY 1
  `, [tenantId, locationId]).then(r => r.rows).catch(() => []);

  // Get last 4 weeks of actual shift hours by day
  const shiftHistory = await adminQuery(`
    SELECT
      EXTRACT(DOW FROM sh.shift_date)::INTEGER as day_of_week,
      AVG(EXTRACT(EPOCH FROM (sh.end_time-sh.start_time))/3600 - COALESCE(sh.break_minutes,30)/60.0) as avg_shift_hours,
      COUNT(DISTINCT sh.employee_id) as avg_staff_count
    FROM shifts sh
    JOIN schedules sc ON sc.id = sh.schedule_id
    WHERE sc.tenant_id=$1 AND sc.location_id=$2
      AND sh.shift_date >= CURRENT_DATE - interval '4 weeks'
    GROUP BY 1 ORDER BY 1
  `, [tenantId, locationId]).then(r => r.rows).catch(() => []);

  const prompt = `You are a restaurant labor forecasting expert. Based on the data below, generate staffing recommendations for the week of ${weekStart}.

Historical daily sales (last 8 weeks):
${salesHistory.map(s => `${s.day_name.trim()}: avg $${parseFloat(s.avg_daily_sales||0).toFixed(0)}/day`).join('\n') || 'No sales data yet'}

Recent shift patterns (last 4 weeks):
${shiftHistory.map(s => `DOW ${s.day_of_week}: avg ${parseFloat(s.avg_shift_hours||0).toFixed(1)}h/shift, ${s.avg_staff_count} staff`).join('\n') || 'No shift data yet'}

California restaurant context: Target labor cost 28-32% of sales. Include FOH and BOH splits.

Return ONLY a JSON array (no markdown) with 7 objects, one per day (Mon-Sun), each with:
{ "date": "YYYY-MM-DD", "day": "Monday", "projected_sales": 0, "recommended_hours": 0, "recommended_staff": 0, "labor_pct_target": 30, "foh_staff": 0, "boh_staff": 0, "notes": "" }`;

  try {
    // replaced by callClaude
  const text = json.content[0].text.replace(/```json?|```/g, '').trim();
    const days  = JSON.parse(text);

    // Upsert into labor_forecasts
    for (const d of days) {
      await adminQuery(`
        INSERT INTO labor_forecasts
          (tenant_id, location_id, forecast_date, day_of_week, projected_sales,
           recommended_hours, recommended_staff, labor_pct_target, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (tenant_id, location_id, forecast_date)
        DO UPDATE SET projected_sales=$5, recommended_hours=$6, recommended_staff=$7, notes=$9
      `, [tenantId, locationId, d.date, new Date(d.date).getDay(),
          d.projected_sales, d.recommended_hours, d.recommended_staff,
          d.labor_pct_target || 30, d.notes]);
    }
    return days;
  } catch(e) {
    console.error('[agent9] forecast error:', e.message);
    return generateBasicForecast(weekStart, salesHistory);
  }
}

function generateBasicForecast(weekStart, salesHistory) {
  const days = [];
  const start = new Date(weekStart);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const multipliers = [0.7, 0.6, 0.65, 0.7, 0.85, 1.0, 0.95]; // typical restaurant pattern
  const baseRevenue = 5000;

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const dow  = date.getDay();
    const sales = Math.round(baseRevenue * multipliers[dow]);
    const hours = Math.round(sales / 150); // rough $150/labor-hour rule
    days.push({
      date: date.toISOString().slice(0,10),
      day: dayNames[dow],
      projected_sales: sales,
      recommended_hours: hours,
      recommended_staff: Math.ceil(hours / 7),
      labor_pct_target: 30,
      foh_staff: Math.ceil(hours / 7 * 0.6),
      boh_staff: Math.ceil(hours / 7 * 0.4),
      notes: 'Basic estimate — no historical data',
    });
  }
  return days;
}

async function getForecast(tenantId, locationId, weekStart) {
  await ensureTables();
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const r = await adminQuery(
    'SELECT * FROM labor_forecasts WHERE tenant_id=$1 AND location_id=$2 AND forecast_date BETWEEN $3 AND $4 ORDER BY forecast_date',
    [tenantId, locationId, weekStart, end.toISOString().slice(0,10)]
  );
  return r.rows;
}

// ── Payroll export ────────────────────────────────────────────────────────────
async function getPayrollExport(tenantId, locationId, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const r = await adminQuery(`
    SELECT
      e.first_name, e.last_name, e.position, e.wage_type, e.wage_rate,
      SUM(EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600 - COALESCE(s.break_minutes,30)/60.0) as total_hours,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600 - COALESCE(s.break_minutes,30)/60.0 > 8
        THEN (EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600 - COALESCE(s.break_minutes,30)/60.0 - 8) ELSE 0 END) as ot_hours,
      SUM(CASE WHEN e.wage_type='hourly'
        THEN (EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600 - COALESCE(s.break_minutes,30)/60.0) * COALESCE(e.wage_rate,0)
        ELSE COALESCE(e.wage_rate,0)/52 END) as total_pay,
      COUNT(s.id) as shift_count
    FROM shifts s
    JOIN schedules sc ON sc.id = s.schedule_id
    JOIN employees e ON e.id = s.employee_id
    WHERE sc.tenant_id=$1 AND sc.location_id=$2
      AND s.shift_date BETWEEN $3 AND $4
    GROUP BY e.id, e.first_name, e.last_name, e.position, e.wage_type, e.wage_rate
    ORDER BY e.last_name
  `, [tenantId, locationId, weekStart, weekEnd.toISOString().slice(0,10)]);
  return r.rows;
}

// ── Badges ────────────────────────────────────────────────────────────────────
async function awardBadge(tenantId, employeeId, badgeKey) {
  const def = BADGE_DEFINITIONS.find(b => b.key === badgeKey);
  if (!def) return;
  await adminQuery(`
    INSERT INTO employee_badges (tenant_id, employee_id, badge_key, badge_label)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING
  `, [tenantId, employeeId, badgeKey, def.label]);
}

async function checkAndAwardBadges(tenantId, employeeId) {
  const emp = await adminQuery('SELECT * FROM employees WHERE id=$1 AND tenant_id=$2', [employeeId, tenantId]);
  if (!emp.rows[0]) return;
  const e = emp.rows[0];

  if (e.hire_date) {
    const months = Math.floor((new Date() - new Date(e.hire_date)) / (1000*60*60*24*30));
    if (months >= 24) await awardBadge(tenantId, employeeId, 'two_years').catch(()=>{});
    else if (months >= 12) await awardBadge(tenantId, employeeId, 'one_year').catch(()=>{});
    else if (months >= 6)  await awardBadge(tenantId, employeeId, 'six_months').catch(()=>{});
  }
  if (e.performance_score >= 95) await awardBadge(tenantId, employeeId, 'top_performer').catch(()=>{});
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getSummary(tenantId, locationId) {
  await ensureTables();
  const params = [tenantId];
  const locWhere = locationId ? ' AND (location_id=$2 OR location_id IS NULL)' : '';
  if (locationId) params.push(locationId);

  const [emps, reqs, sched] = await Promise.all([
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) as total FROM employees WHERE tenant_id=$1${locWhere}`, params),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='pending') as pending FROM shift_requests WHERE tenant_id=$1${locationId?' AND location_id=$2':''}`, params),
    adminQuery(`SELECT COUNT(*) as this_week FROM shifts s JOIN schedules sc ON sc.id=s.schedule_id WHERE sc.tenant_id=$1${locationId?' AND sc.location_id=$2':''} AND s.shift_date BETWEEN CURRENT_DATE AND CURRENT_DATE+6`, params),
  ]);

  return {
    employees:  emps.rows[0],
    requests:   reqs.rows[0],
    schedule:   sched.rows[0],
    positions:  POSITIONS,
    badges:     BADGE_DEFINITIONS,
  };
}


// ── Team messaging ─────────────────────────────────────────────────────────────
async function getMessages(tenantId, { locationId, channel = 'all_staff', limit = 50, before } = {}) {
  const params = [tenantId, channel];
  let where = 'tenant_id=$1 AND channel=$2';
  let i = 3;
  if (locationId) { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (before)     { where += ` AND created_at < $${i++}`; params.push(before); }
  params.push(parseInt(limit) || 50);
  const r = await adminQuery(
    `SELECT * FROM team_messages WHERE ${where} ORDER BY created_at DESC LIMIT $${i}`,
    params
  );
  return r.rows.reverse(); // chronological order
}

async function sendMessage(tenantId, { locationId, channel = 'all_staff', senderId, senderName, senderRole, content, msgType = 'message' }) {
  if (!content?.trim()) throw new Error('Message content required');
  const r = await adminQuery(
    `INSERT INTO team_messages (tenant_id, location_id, channel, sender_id, sender_name, sender_role, content, msg_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, locationId||null, channel, senderId||null, senderName||'Manager', senderRole||'manager', content.trim(), msgType]
  );
  return r.rows[0];
}

async function pinMessage(tenantId, messageId, pinned) {
  await adminQuery(
    'UPDATE team_messages SET pinned=$1 WHERE id=$2 AND tenant_id=$3',
    [pinned, messageId, tenantId]
  );
}

async function deleteMessage(tenantId, messageId) {
  await adminQuery('DELETE FROM team_messages WHERE id=$1 AND tenant_id=$2', [messageId, tenantId]);
}

async function getUnreadCount(tenantId, employeeId, locationId) {
  const r = await adminQuery(
    `SELECT COUNT(*) as cnt FROM team_messages tm
     WHERE tm.tenant_id=$1
       AND (tm.location_id=$2 OR tm.location_id IS NULL)
       AND tm.id NOT IN (SELECT message_id FROM message_reads WHERE employee_id=$3)
       AND tm.created_at > NOW() - INTERVAL '7 days'`,
    [tenantId, locationId, employeeId]
  );
  return parseInt(r.rows[0]?.cnt || 0);
}

async function markRead(tenantId, employeeId, messageIds) {
  for (const id of messageIds) {
    await adminQuery(
      `INSERT INTO message_reads (message_id, employee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, employeeId]
    ).catch(()=>{});
  }
}


// ── Staff PIN auth ─────────────────────────────────────────────────────────────
async function setStaffPin(tenantId, employeeId, pin) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4-6 digits');
  await ensureTables();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(pin, 10);
  await adminQuery(
    'UPDATE employees SET staff_pin=$1, pin_set_at=now() WHERE id=$2 AND tenant_id=$3',
    [hash, employeeId, tenantId]
  );
}

async function staffLogin(tenantId, locationId, pin) {
  await ensureTables();
  if (!pin || !/^\d{4,6}$/.test(pin.trim())) throw new Error('Invalid PIN format');

  // Find all employees for this location who have a PIN set
  const r = await adminQuery(
    `SELECT id, first_name, last_name, position, department, email, staff_pin, location_id
     FROM employees
     WHERE tenant_id=$1
       AND (location_id=$2 OR location_id IS NULL)
       AND staff_pin IS NOT NULL
       AND (archived IS NULL OR archived=false)`,
    [tenantId, locationId]
  );

  const bcrypt = require('bcryptjs');
  for (const emp of r.rows) {
    const match = await bcrypt.compare(pin.trim(), emp.staff_pin);
    if (match) {
      return {
        id:         emp.id,
        firstName:  emp.first_name,
        lastName:   emp.last_name,
        position:   emp.position,
        department: emp.department,
        email:      emp.email,
        locationId: emp.location_id || locationId,
        tenantId,
      };
    }
  }
  throw new Error('Invalid PIN. Please check with your manager.');
}

async function getMyShifts(tenantId, employeeId, locationId) {
  await ensureTables();
  // Current week + next 2 weeks
  const r = await adminQuery(
    `SELECT s.id, s.shift_date::text as shift_date, s.start_time, s.end_time,
            s.break_minutes, s.notes, s.position,
            sc.status as schedule_status, sc.week_start::text as week_start
     FROM shifts s
     JOIN schedules sc ON sc.id = s.schedule_id
     WHERE s.employee_id=$1 AND s.tenant_id=$2
       AND s.shift_date >= CURRENT_DATE - INTERVAL '1 day'
       AND s.shift_date <= CURRENT_DATE + INTERVAL '21 days'
       AND sc.status = 'published'
     ORDER BY s.shift_date, s.start_time`,
    [employeeId, tenantId]
  );
  return r.rows;
}

async function getMyTeam(tenantId, locationId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT first_name, last_name, position, department
     FROM employees
     WHERE tenant_id=$1 AND (location_id=$2 OR location_id IS NULL)
       AND (archived IS NULL OR archived=false)
     ORDER BY department, last_name`,
    [tenantId, locationId]
  );
  return r.rows;
}

module.exports = {
  getTimeOffRequests, createTimeOffRequest, reviewTimeOffRequest,
  AGENT_ID, ensureTables, POSITIONS, BADGE_DEFINITIONS,
  getEmployees, upsertEmployee, deleteEmployee,
  getAvailability, setAvailability,
  getOrCreateSchedule, getScheduleWithShifts, publishSchedule, copySchedule,
  createShift, updateShift, deleteShift,
  getRequests, createRequest, reviewRequest,
  generateForecast, getForecast,
  getPayrollExport, awardBadge, checkAndAwardBadges,
  getSummary,
  getMessages, sendMessage, pinMessage, deleteMessage, getUnreadCount, markRead,
  setStaffPin, staffLogin, getMyShifts, getMyTeam,
};
