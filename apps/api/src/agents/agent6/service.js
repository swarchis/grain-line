// ─── Agent 6: Training & Compliance ──────────────────────────────────────────
// California-specific compliance management:
// - Digital checklists (health, labor, inspections)
// - Certification tracking (Food Handler, ServSafe, work permits, harassment training)
// - Document vault (leases, operating agreements) with version history
// - Automated alerts (cert expiry, lease renewals, labor violations)
require('dotenv').config();
const { once } = require('../../lib/tableCache');
const { queryForTenant, adminQuery } = require('@restaurantos/db');

const AGENT_ID = 'agent_6_training';

// ── CA-specific certification requirements ─────────────────────────────────────
const CA_CERTIFICATIONS = [
  {
    key:          'food_handler',
    label:        'Food Handler Card',
    description:  'Required for all non-manager food employees within 30 days of hire',
    validity_days: 1095, // 3 years
    required_for:  ['cook','prep','server','busser','bartender','dishwasher','barback'],
    warning_days:  60,
    authority:     'CA Health & Safety Code §113948',
  },
  {
    key:          'food_manager',
    label:        'Food Protection Manager (ServSafe)',
    description:  'At least 1 certified manager required per location at all times',
    validity_days: 1825, // 5 years
    required_for:  ['manager','gm','chef','kitchen_manager'],
    warning_days:  90,
    authority:     'CA Health & Safety Code §113947.1',
  },
  {
    key:          'harassment_manager',
    label:        'Harassment Prevention — Manager',
    description:  '2-hour training for supervisors/managers every 2 years (AB1825)',
    validity_days: 730, // 2 years
    required_for:  ['manager','gm','supervisor'],
    warning_days:  60,
    authority:     'CA AB1825 / SB1343',
  },
  {
    key:          'harassment_staff',
    label:        'Harassment Prevention — Staff',
    description:  '1-hour training for all employees every 2 years (SB1343)',
    validity_days: 730,
    required_for:  ['all'],
    warning_days:  60,
    authority:     'CA SB1343',
  },
  {
    key:          'minor_work_permit',
    label:        'Minor Work Permit',
    description:  'Required for all employees under 18 — renewed annually',
    validity_days: 365,
    required_for:  ['minor'],
    warning_days:  30,
    authority:     'CA Labor Code §1285',
  },
  {
    key:          'workplace_violence',
    label:        'Workplace Violence Prevention',
    description:  'Training required for all employees — effective July 1 2024 (SB553)',
    validity_days: 365,
    required_for:  ['all'],
    warning_days:  30,
    authority:     'CA SB553',
  },
];

// ── CA checklist items (CalCode §1-48) ────────────────────────────────────────
const CHECKLIST_TEMPLATES = {
  daily_health: {
    label:       'Daily health & safety',
    frequency:   'daily',
    items: [
      { id:'dh1',  label:'Employee illness/symptom check conducted',           critical:true,  ref:'CalCode §1b' },
      { id:'dh2',  label:'Handwashing stations stocked (soap, paper towels)',  critical:true,  ref:'CalCode §5' },
      { id:'dh3',  label:'Food temps logged — cold ≤41°F, hot ≥135°F',        critical:true,  ref:'CalCode §14' },
      { id:'dh4',  label:'No bare-hand contact with ready-to-eat food',        critical:true,  ref:'CalCode §5' },
      { id:'dh5',  label:'Sanitizer concentration verified (50–100 ppm chlor)',critical:true,  ref:'CalCode §22' },
      { id:'dh6',  label:'Food stored ≥6" off floor, covered and labeled',     critical:false, ref:'CalCode §29' },
      { id:'dh7',  label:'Raw proteins stored below ready-to-eat foods',       critical:true,  ref:'CalCode §8' },
      { id:'dh8',  label:'Date labels on all opened/prepared items',           critical:false, ref:'CalCode §31' },
      { id:'dh9',  label:'Pest activity check — no evidence of rodents/insects',critical:true, ref:'CalCode §30' },
      { id:'dh10', label:'Restrooms clean and fully stocked',                  critical:false, ref:'CalCode §22' },
      { id:'dh11', label:'Proper signage posted (permit, rating, no-smoking)', critical:false, ref:'CA HSC' },
      { id:'dh12', label:'Garbage disposed, dumpster lids closed',             critical:false, ref:'CalCode §36' },
    ],
  },
  daily_labor: {
    label:       'Daily labor law',
    frequency:   'daily',
    items: [
      { id:'dl1',  label:'All employees took 30-min meal break by hour 5',     critical:true,  ref:'CA Labor Code §512' },
      { id:'dl2',  label:'10-min rest break every 4 hours provided',           critical:true,  ref:'IWC Wage Order' },
      { id:'dl3',  label:'No minors working past 10pm on school nights',       critical:true,  ref:'CA Labor Code §1294' },
      { id:'dl4',  label:'Minor work permits on file for all under-18 staff',  critical:true,  ref:'CA Labor Code §1285' },
      { id:'dl5',  label:'No employee worked more than 12 hrs without consent',critical:true,  ref:'CA Labor Code §510' },
      { id:'dl6',  label:'Tip pool compliant — no managers in pool',           critical:true,  ref:'CA Labor Code §351' },
    ],
  },
  weekly_safety: {
    label:       'Weekly safety inspection',
    frequency:   'weekly',
    items: [
      { id:'ws1',  label:'Walk-in cooler/freezer temps logged and calibrated',  critical:true,  ref:'CalCode §14' },
      { id:'ws2',  label:'Fire extinguishers inspected and accessible',         critical:true,  ref:'CA Fire Code' },
      { id:'ws3',  label:'First aid kit stocked and accessible',                critical:true,  ref:'CA Labor Code §6714' },
      { id:'ws4',  label:'Emergency exits clear and illuminated',               critical:true,  ref:'CA Fire Code' },
      { id:'ws5',  label:'Hood/ventilation cleaned and operational',            critical:false, ref:'CA Fire Code' },
      { id:'ws6',  label:'Deep clean of grease traps',                          critical:false, ref:'Local ordinance' },
      { id:'ws7',  label:'Pest control log reviewed',                           critical:false, ref:'CalCode §30' },
      { id:'ws8',  label:'All equipment functioning (dishwasher temp ≥180°F)', critical:true,  ref:'CalCode §15' },
      { id:'ws9',  label:'Food Handler Cards verified for new hires (<30 days)',critical:true,  ref:'CA HSC §113948' },
      { id:'ws10', label:'MSDS/SDS sheets accessible for all chemicals',        critical:false, ref:'CA Labor Code' },
    ],
  },
  monthly_compliance: {
    label:       'Monthly compliance review',
    frequency:   'monthly',
    items: [
      { id:'mc1',  label:'Health permit current and posted',                    critical:true,  ref:'CA HSC §114387' },
      { id:'mc2',  label:'Business license current',                            critical:true,  ref:'Local ordinance' },
      { id:'mc3',  label:'Workers comp certificate current',                    critical:true,  ref:'CA Labor Code §3700' },
      { id:'mc4',  label:'Wage notices posted in English and Spanish',          critical:true,  ref:'CA Labor Code §1183.5' },
      { id:'mc5',  label:'IWC Wage Order posted',                               critical:true,  ref:'IWC Wage Order' },
      { id:'mc6',  label:'OSHA 300 log updated',                                critical:true,  ref:'CA CCR Title 8' },
      { id:'mc7',  label:'Liquor license current and posted (if applicable)',    critical:true,  ref:'CA ABC' },
      { id:'mc8',  label:'Food Safety Manager cert on file (per location)',      critical:true,  ref:'CA HSC §113947.1' },
      { id:'mc9',  label:'Harassment prevention training records current',      critical:true,  ref:'CA AB1825' },
      { id:'mc10', label:'Paid sick leave accrual reviewed (min 40hrs/yr)',     critical:true,  ref:'CA SB616' },
    ],
  },
};

// ── Ensure tables ─────────────────────────────────────────────────────────────
const ensureTables = once('agent6', async function() {
  const stmts = [`
    CREATE TABLE IF NOT EXISTS compliance_certifications (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      employee_id     UUID,
      employee_name   VARCHAR(200),
      employee_role   VARCHAR(100),
      cert_key        VARCHAR(50) NOT NULL,
      cert_label      VARCHAR(200),
      issued_date     DATE,
      expiry_date     DATE NOT NULL,
      cert_number     VARCHAR(100),
      issuer          VARCHAR(200),
      notes           TEXT,
      active          BOOLEAN NOT NULL DEFAULT true,
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS compliance_checklists (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID NOT NULL,
      checklist_key   VARCHAR(50) NOT NULL,
      checklist_label VARCHAR(200),
      frequency       VARCHAR(20),
      completed_date  DATE NOT NULL,
      completed_by    UUID,
      completed_name  VARCHAR(200),
      score           INTEGER,
      total_items     INTEGER,
      critical_fails  INTEGER DEFAULT 0,
      items           JSONB NOT NULL DEFAULT '[]',
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS compliance_documents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      category        VARCHAR(50) NOT NULL,
      title           VARCHAR(300) NOT NULL,
      description     TEXT,
      file_url        TEXT,
      file_name       VARCHAR(300),
      version         INTEGER NOT NULL DEFAULT 1,
      status          VARCHAR(30) NOT NULL DEFAULT 'active',
      expiry_date     DATE,
      alert_days      INTEGER DEFAULT 90,
      metadata        JSONB DEFAULT '{}',
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS compliance_document_versions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      document_id     UUID NOT NULL,
      version         INTEGER NOT NULL,
      file_url        TEXT,
      file_name       VARCHAR(300),
      changed_by      UUID,
      changed_by_name VARCHAR(200),
      change_notes    TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS compliance_alerts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      alert_type      VARCHAR(50) NOT NULL,
      severity        VARCHAR(20) NOT NULL DEFAULT 'warning',
      title           VARCHAR(300) NOT NULL,
      description     TEXT,
      due_date        DATE,
      reference_id    UUID,
      reference_type  VARCHAR(50),
      resolved        BOOLEAN NOT NULL DEFAULT false,
      resolved_at     TIMESTAMPTZ,
      resolved_by     UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ];
  for (const sql of stmts) await adminQuery(sql).catch(e => console.error('[agent6] table error:', e.message));
});

// ── Certifications ────────────────────────────────────────────────────────────
async function getCertifications(tenantId, { locationId, certKey, expiringSoon } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1 AND active=true';
  const params = [tenantId]; let i = 2;
  if (locationId)    { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (certKey)       { where += ` AND cert_key=$${i++}`; params.push(certKey); }
  if (expiringSoon)  { where += ` AND expiry_date <= CURRENT_DATE + interval '90 days'`; }

  const r = await adminQuery(`
    SELECT *,
      expiry_date - CURRENT_DATE as days_until_expiry,
      CASE
        WHEN expiry_date < CURRENT_DATE THEN 'expired'
        WHEN expiry_date <= CURRENT_DATE + interval '30 days' THEN 'critical'
        WHEN expiry_date <= CURRENT_DATE + interval '90 days' THEN 'warning'
        ELSE 'valid'
      END as status
    FROM compliance_certifications
    WHERE ${where}
    ORDER BY expiry_date ASC
  `, params);
  return r.rows;
}

async function addCertification(tenantId, data) {
  await ensureTables();
  const { locationId, employeeId, employeeName, employeeRole, certKey, certLabel,
          issuedDate, expiryDate, certNumber, issuer, notes, createdBy } = data;

  const cert = CA_CERTIFICATIONS.find(c => c.key === certKey);
  const r = await adminQuery(`
    INSERT INTO compliance_certifications
      (tenant_id, location_id, employee_id, employee_name, employee_role,
       cert_key, cert_label, issued_date, expiry_date, cert_number, issuer, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [tenantId, locationId||null, employeeId||null, employeeName,
      employeeRole||null, certKey, certLabel||cert?.label||certKey,
      issuedDate||null, expiryDate, certNumber||null, issuer||null, notes||null, createdBy||null]);

  // Auto-create alert if expiring soon
  const daysUntil = Math.floor((new Date(expiryDate) - new Date()) / (1000*60*60*24));
  const warningDays = cert?.warning_days || 90;
  if (daysUntil <= warningDays) {
    await createAlert(tenantId, {
      locationId, alertType:'cert_expiry', severity: daysUntil < 0 ? 'critical' : daysUntil < 30 ? 'urgent' : 'warning',
      title: `${certLabel||cert?.label||certKey} expiring soon — ${employeeName}`,
      description: `Expires ${expiryDate}. ${cert?.authority || ''}`,
      dueDate: expiryDate, referenceId: r.rows[0].id, referenceType: 'certification',
    });
  }

  return r.rows[0];
}

async function updateCertification(tenantId, certId, data) {
  const allowed = ['expiry_date','cert_number','issuer','notes','active'];
  const updates = [], values = []; let i = 1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status:400 });
  values.push(certId, tenantId);
  const r = await adminQuery(
    `UPDATE compliance_certifications SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

// ── Checklists ────────────────────────────────────────────────────────────────
async function getChecklistTemplates() {
  return CHECKLIST_TEMPLATES;
}

async function submitChecklist(tenantId, data) {
  await ensureTables();
  const { locationId, checklistKey, completedDate, completedBy, completedName, items, notes } = data;

  const template = CHECKLIST_TEMPLATES[checklistKey];
  if (!template) throw Object.assign(new Error('Unknown checklist type'), { status:400 });

  const completedItems = items || [];
  const totalItems    = completedItems.length;
  const criticalFails = completedItems.filter(it => !it.passed && it.critical).length;
  const passedItems   = completedItems.filter(it => it.passed).length;
  const score         = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

  const r = await adminQuery(`
    INSERT INTO compliance_checklists
      (tenant_id, location_id, checklist_key, checklist_label, frequency,
       completed_date, completed_by, completed_name, score, total_items, critical_fails, items, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [tenantId, locationId, checklistKey, template.label, template.frequency,
      completedDate || new Date().toISOString().slice(0,10),
      completedBy||null, completedName||null, score, totalItems, criticalFails,
      JSON.stringify(completedItems), notes||null]);

  // Create alert for critical failures
  if (criticalFails > 0) {
    const failedItems = completedItems.filter(it => !it.passed && it.critical);
    await createAlert(tenantId, {
      locationId, alertType:'checklist_fail', severity:'critical',
      title: `${criticalFails} critical failure${criticalFails>1?'s':''} — ${template.label}`,
      description: failedItems.map(it => it.label).join(', '),
      dueDate: completedDate || new Date().toISOString().slice(0,10),
      referenceId: r.rows[0].id, referenceType: 'checklist',
    });
  }

  return r.rows[0];
}

async function getChecklists(tenantId, { locationId, checklistKey, limit=30 } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId)   { where += ` AND location_id=$${i++}`; params.push(locationId); }
  if (checklistKey) { where += ` AND checklist_key=$${i++}`; params.push(checklistKey); }
  params.push(limit);
  const r = await adminQuery(
    `SELECT * FROM compliance_checklists WHERE ${where} ORDER BY completed_date DESC LIMIT $${i}`,
    params
  );
  return r.rows;
}

// ── Documents ─────────────────────────────────────────────────────────────────
const DOC_CATEGORIES = [
  { key:'lease',         label:'Lease agreements',       alert_days: 90 },
  { key:'operating',     label:'Operating agreements',   alert_days: 30 },
  { key:'permit',        label:'Permits & licenses',     alert_days: 60 },
  { key:'insurance',     label:'Insurance certificates', alert_days: 60 },
  { key:'vendor',        label:'Vendor contracts',       alert_days: 30 },
  { key:'hr',            label:'HR forms & policies',    alert_days: 0  },
  { key:'health',        label:'Health inspections',     alert_days: 0  },
  { key:'other',         label:'Other documents',        alert_days: 0  },
];

// Map stored 'internal:<fileId>' markers to short-lived signed URLs
function signInternalUrls(tenantId, rows) {
  const { signFileUrl } = require('./files');
  return rows.map(r => (r.file_url && r.file_url.startsWith('internal:'))
    ? { ...r, file_url: signFileUrl(r.file_url.slice(9), tenantId), file_storage: 'uploaded' }
    : r);
}

async function getDocuments(tenantId, { locationId, category, status } = {}) {
  await ensureTables();
  let where = 'd.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ` AND (d.location_id=$${i++} OR d.location_id IS NULL)`; params.push(locationId); }
  if (category)   { where += ` AND d.category=$${i++}`; params.push(category); }
  if (status)     { where += ` AND d.status=$${i++}`; params.push(status); }

  const r = await adminQuery(`
    SELECT d.*,
      CASE
        WHEN d.expiry_date IS NULL THEN 'no_expiry'
        WHEN d.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN d.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'critical'
        WHEN d.expiry_date <= CURRENT_DATE + (d.alert_days || ' days')::interval THEN 'warning'
        ELSE 'valid'
      END as expiry_status,
      d.expiry_date - CURRENT_DATE as days_until_expiry
    FROM compliance_documents d
    WHERE ${where}
    ORDER BY
      CASE WHEN d.expiry_date IS NULL THEN 1 ELSE 0 END,
      d.expiry_date ASC,
      d.created_at DESC
  `, params);
  return signInternalUrls(tenantId, r.rows);
}

async function addDocument(tenantId, data) {
  await ensureTables();
  const { locationId, category, title, description, fileUrl, fileName,
          expiryDate, alertDays, metadata, createdBy } = data;

  const catConfig = DOC_CATEGORIES.find(c => c.key === category) || {};
  const r = await adminQuery(`
    INSERT INTO compliance_documents
      (tenant_id, location_id, category, title, description, file_url, file_name,
       expiry_date, alert_days, metadata, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [tenantId, locationId||null, category, title, description||null, fileUrl||null,
      fileName||null, expiryDate||null, alertDays ?? catConfig.alert_days ?? 30,
      JSON.stringify(metadata||{}), createdBy||null]);

  const doc = r.rows[0];

  // Create initial version record
  await adminQuery(`
    INSERT INTO compliance_document_versions
      (tenant_id, document_id, version, file_url, file_name, changed_by_name, change_notes)
    VALUES ($1,$2,1,$3,$4,'System','Initial upload')
  `, [tenantId, doc.id, fileUrl||null, fileName||null]);

  // Create expiry alert if applicable
  if (expiryDate) {
    const alertDaysToUse = alertDays ?? catConfig.alert_days ?? 30;
    const daysUntil = Math.floor((new Date(expiryDate) - new Date()) / (1000*60*60*24));
    if (daysUntil <= alertDaysToUse) {
      await createAlert(tenantId, {
        locationId, alertType:'doc_expiry', severity: daysUntil < 0 ? 'critical' : daysUntil < 30 ? 'urgent' : 'warning',
        title: `${title} ${daysUntil < 0 ? 'has expired' : 'expiring in ' + daysUntil + ' days'}`,
        description: `Category: ${category}. Expiry: ${expiryDate}`,
        dueDate: expiryDate, referenceId: doc.id, referenceType: 'document',
      });
    }
  }

  return doc;
}

async function updateDocument(tenantId, docId, data, changedByName = 'Staff') {
  await ensureTables();
  const allowed = ['title','description','file_url','file_name','expiry_date','alert_days','status','metadata'];
  const updates = [], values = []; let i = 1;
  for (const [k,v] of Object.entries(data)) {
    if (allowed.includes(k)) { updates.push(`${k}=$${i++}`); values.push(v); }
  }
  if (!updates.length) throw Object.assign(new Error('Nothing to update'), { status:400 });

  // Bump version if file changed
  if (data.file_url || data.file_name) {
    const current = await adminQuery('SELECT version FROM compliance_documents WHERE id=$1', [docId]);
    const newVersion = (current.rows[0]?.version || 1) + 1;
    updates.push(`version=$${i++}`);
    values.push(newVersion);
    await adminQuery(`
      INSERT INTO compliance_document_versions
        (tenant_id, document_id, version, file_url, file_name, changed_by_name, change_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [tenantId, docId, newVersion, data.file_url||null, data.file_name||null, changedByName, data.change_notes||'Updated']);
  }

  values.push(docId, tenantId);
  const r = await adminQuery(
    `UPDATE compliance_documents SET ${updates.join(',')}, updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function getDocumentVersions(tenantId, docId) {
  const r = await adminQuery(
    'SELECT * FROM compliance_document_versions WHERE tenant_id=$1 AND document_id=$2 ORDER BY version DESC',
    [tenantId, docId]
  );
  return signInternalUrls(tenantId, r.rows);
}

// ── Alerts ────────────────────────────────────────────────────────────────────
async function createAlert(tenantId, { locationId, alertType, severity, title, description, dueDate, referenceId, referenceType }) {
  // Deduplicate — don't create duplicate alerts for same reference
  if (referenceId) {
    const exists = await adminQuery(
      'SELECT id FROM compliance_alerts WHERE tenant_id=$1 AND reference_id=$2 AND resolved=false LIMIT 1',
      [tenantId, referenceId]
    );
    if (exists.rows.length) return exists.rows[0];
  }
  const r = await adminQuery(`
    INSERT INTO compliance_alerts
      (tenant_id, location_id, alert_type, severity, title, description, due_date, reference_id, reference_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [tenantId, locationId||null, alertType, severity, title, description||null,
      dueDate||null, referenceId||null, referenceType||null]);
  return r.rows[0];
}

async function getAlerts(tenantId, { locationId, resolved = false, severity } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1 AND resolved=$2'; const params = [tenantId, resolved]; let i = 3;
  if (locationId) { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (severity)   { where += ` AND severity=$${i++}`; params.push(severity); }
  const r = await adminQuery(
    `SELECT * FROM compliance_alerts WHERE ${where} ORDER BY severity='critical' DESC, due_date ASC NULLS LAST, created_at DESC`,
    params
  );
  return r.rows;
}

async function resolveAlert(tenantId, alertId, resolvedBy) {
  const r = await adminQuery(
    'UPDATE compliance_alerts SET resolved=true, resolved_at=now(), resolved_by=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *',
    [resolvedBy||null, alertId, tenantId]
  );
  return r.rows[0];
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getSummary(tenantId, locationId) {
  await ensureTables();
  const params = [tenantId];
  const locWhere = locationId ? ' AND (location_id=$2 OR location_id IS NULL)' : '';
  if (locationId) params.push(locationId);

  const [certs, alerts, checklists, docs] = await Promise.all([
    adminQuery(`
      SELECT
        COUNT(*) FILTER (WHERE status='valid') as valid,
        COUNT(*) FILTER (WHERE status='warning') as warning,
        COUNT(*) FILTER (WHERE status='critical' OR status='expired') as critical
      FROM (
        SELECT CASE
          WHEN expiry_date < CURRENT_DATE THEN 'expired'
          WHEN expiry_date <= CURRENT_DATE + interval '30 days' THEN 'critical'
          WHEN expiry_date <= CURRENT_DATE + interval '90 days' THEN 'warning'
          ELSE 'valid'
        END as status
        FROM compliance_certifications
        WHERE tenant_id=$1${locWhere.replace('location_id', 'location_id')} AND active=true
      ) s
    `, params),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE severity='critical') as critical, COUNT(*) FILTER (WHERE severity='urgent') as urgent, COUNT(*) FILTER (WHERE severity='warning') as warning FROM compliance_alerts WHERE tenant_id=$1${locWhere} AND resolved=false`, params),
    adminQuery(`SELECT COUNT(*) as this_week FROM compliance_checklists WHERE tenant_id=$1${locWhere} AND completed_date >= CURRENT_DATE - interval '7 days'`, params),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired, COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '90 days') as expiring_soon FROM compliance_documents WHERE tenant_id=$1${locWhere} AND expiry_date IS NOT NULL AND status='active'`, params),
  ]);

  // Auto-generate expiry alerts for certs
  await generateExpiryAlerts(tenantId, locationId);

  return {
    certifications:  certs.rows[0],
    alerts:          alerts.rows[0],
    checklists:      checklists.rows[0],
    documents:       docs.rows[0],
    ca_requirements: CA_CERTIFICATIONS,
  };
}

async function generateExpiryAlerts(tenantId, locationId) {
  // Find certs expiring within 90 days — create alerts if not already exist
  const expiring = await adminQuery(`
    SELECT * FROM compliance_certifications
    WHERE tenant_id=$1 AND active=true
      AND expiry_date <= CURRENT_DATE + interval '90 days'
  `, [tenantId]);

  for (const cert of expiring.rows) {
    const daysUntil = Math.floor((new Date(cert.expiry_date) - new Date()) / (1000*60*60*24));
    await createAlert(tenantId, {
      locationId: cert.location_id, alertType:'cert_expiry',
      severity: daysUntil < 0 ? 'critical' : daysUntil < 30 ? 'urgent' : 'warning',
      title: `${cert.cert_label || cert.cert_key} — ${cert.employee_name}`,
      description: `${daysUntil < 0 ? 'Expired' : 'Expires in ' + daysUntil + ' days'} (${cert.expiry_date})`,
      dueDate: cert.expiry_date, referenceId: cert.id, referenceType: 'certification',
    }).catch(() => {});
  }
}

module.exports = {
  AGENT_ID, ensureTables, CA_CERTIFICATIONS, CHECKLIST_TEMPLATES, DOC_CATEGORIES,
  getCertifications, addCertification, updateCertification,
  getChecklistTemplates, submitChecklist, getChecklists,
  getDocuments, addDocument, updateDocument, getDocumentVersions,
  getAlerts, resolveAlert, createAlert,
  getSummary,
};
