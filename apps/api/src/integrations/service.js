'use strict';
const crypto = require('crypto');
const { adminQuery } = require('@restaurantos/db');

// ── Encryption helpers ─────────────────────────────────────────────────────────
// Uses AES-256-GCM. Set INTEGRATIONS_ENCRYPTION_KEY in Railway (any long random string).
function getKey() {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-key-change-me';
  return crypto.createHash('sha256').update(secret).digest();
}
function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc.toString('hex');
}
function decrypt(stored) {
  if (!stored) return null;
  try {
    const [ivH, tagH, dataH] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) { return null; }
}

// ── Schema ─────────────────────────────────────────────────────────────────────
let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS tenant_integrations (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      provider      VARCHAR(50) NOT NULL,
      status        VARCHAR(30) NOT NULL DEFAULT 'not_connected',
      credentials   TEXT,
      config        JSONB DEFAULT '{}',
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, provider)
    )
  `).catch(() => {});
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS tenant_business_info (
      tenant_id        UUID PRIMARY KEY,
      legal_name       VARCHAR(300),
      ein              VARCHAR(20),
      business_type    VARCHAR(50) DEFAULT 'LLC',
      address_street   VARCHAR(300),
      address_city     VARCHAR(100),
      address_state    VARCHAR(10),
      address_zip      VARCHAR(15),
      website          VARCHAR(300),
      contact_name     VARCHAR(200),
      contact_email    VARCHAR(300),
      contact_phone    VARCHAR(30),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  await adminQuery(`CREATE INDEX IF NOT EXISTS tenant_integrations_lookup ON tenant_integrations(tenant_id, provider)`).catch(() => {});
  _ready = true;
}

// ── Generic integration CRUD ───────────────────────────────────────────────────
async function getIntegration(tenantId, provider) {
  await ensureTables();
  const r = await adminQuery('SELECT * FROM tenant_integrations WHERE tenant_id=$1 AND provider=$2', [tenantId, provider]);
  const row = r.rows[0];
  if (!row) return null;
  return { ...row, credentials: row.credentials ? JSON.parse(decrypt(row.credentials) || '{}') : {} };
}

async function setIntegration(tenantId, provider, { status, credentials, config, errorMessage } = {}) {
  await ensureTables();
  const existing = await getIntegration(tenantId, provider);
  const newCreds = credentials !== undefined
    ? encrypt(JSON.stringify({ ...(existing?.credentials || {}), ...credentials }))
    : undefined;
  const r = await adminQuery(`
    INSERT INTO tenant_integrations (tenant_id, provider, status, credentials, config, error_message)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (tenant_id, provider) DO UPDATE SET
      status        = COALESCE($3, tenant_integrations.status),
      credentials   = COALESCE($4, tenant_integrations.credentials),
      config        = COALESCE($5, tenant_integrations.config),
      error_message = $6,
      updated_at    = now()
    RETURNING id, tenant_id, provider, status, config, error_message`,
    [tenantId, provider, status || null, newCreds ?? null, config ? JSON.stringify(config) : null, errorMessage || null]
  );
  return r.rows[0];
}

// Public status list — never returns credentials
async function getIntegrationStatuses(tenantId) {
  await ensureTables();
  const r = await adminQuery(
    'SELECT provider, status, config, error_message, updated_at FROM tenant_integrations WHERE tenant_id=$1',
    [tenantId]
  );
  const map = {};
  r.rows.forEach(row => { map[row.provider] = row; });
  return map;
}

// ── Business info (for 10DLC etc) ──────────────────────────────────────────────
async function getBusinessInfo(tenantId) {
  await ensureTables();
  const r = await adminQuery('SELECT * FROM tenant_business_info WHERE tenant_id=$1', [tenantId]);
  return r.rows[0] || null;
}

async function saveBusinessInfo(tenantId, info) {
  await ensureTables();
  const { legalName, ein, businessType, addressStreet, addressCity, addressState, addressZip,
          website, contactName, contactEmail, contactPhone } = info;
  const r = await adminQuery(`
    INSERT INTO tenant_business_info
      (tenant_id, legal_name, ein, business_type, address_street, address_city, address_state,
       address_zip, website, contact_name, contact_email, contact_phone)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (tenant_id) DO UPDATE SET
      legal_name=$2, ein=$3, business_type=$4, address_street=$5, address_city=$6,
      address_state=$7, address_zip=$8, website=$9, contact_name=$10, contact_email=$11,
      contact_phone=$12, updated_at=now()
    RETURNING *`,
    [tenantId, legalName, ein, businessType||'LLC', addressStreet, addressCity, addressState,
     addressZip, website, contactName, contactEmail, contactPhone]
  );
  return r.rows[0];
}

// ── Twilio per-tenant provisioning ─────────────────────────────────────────────
function getMasterTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error('Master TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured');
  return require('twilio')(sid, tok);
}

// Kicks off full provisioning: subaccount → buy number → submit 10DLC.
// Designed to be called once from onboarding after business info is saved.
async function provisionTwilioForTenant(tenantId, tenantName) {
  await ensureTables();
  const info = await getBusinessInfo(tenantId);
  if (!info || !info.legal_name || !info.ein) {
    throw new Error('Business info (legal name + EIN) required before SMS setup');
  }

  const existing = await getIntegration(tenantId, 'twilio');
  if (existing?.status === 'active' || existing?.status === 'pending_10dlc') {
    return { status: existing.status, message: 'Already provisioned' };
  }

  await setIntegration(tenantId, 'twilio', { status: 'provisioning' });

  try {
    const master = getMasterTwilio();

    // 1. Create subaccount
    const sub = await master.api.v2010.accounts.create({ friendlyName: `pulse-${tenantName||tenantId}`.slice(0, 60) });
    const subClient = require('twilio')(sub.sid, sub.authToken);

    // 2. Buy a local number (area code from business address state if possible)
    const numbers = await subClient.availablePhoneNumbers('US').local.list({ smsEnabled: true, limit: 1 });
    if (!numbers.length) throw new Error('No phone numbers available');
    const purchased = await subClient.incomingPhoneNumbers.create({
      phoneNumber: numbers[0].phoneNumber,
      smsUrl: `${process.env.API_URL || 'https://restaurantosapi-production-434f.up.railway.app'}/api/twilio/inbound`,
      smsMethod: 'POST',
    });

    await setIntegration(tenantId, 'twilio', {
      status: 'pending_10dlc',
      credentials: { subaccountSid: sub.sid, subaccountToken: sub.authToken },
      config: { phoneNumber: purchased.phoneNumber, numberSid: purchased.sid },
    });

    // 3. 10DLC registration is submitted via Twilio TrustHub — this is a multi-step
    // API flow (customer profile → brand → campaign). Submit asynchronously; status
    // stays 'pending_10dlc' until the carrier approves (checked via webhook or poll).
    // NOTE: TrustHub API calls are stubbed behind this flag until your master account
    // has an approved primary profile (a one-time manual step in Twilio Console).
    if (process.env.TWILIO_TRUSTHUB_ENABLED === 'true') {
      // Full TrustHub flow would go here (see Twilio docs: ISV starter brand registration)
    }

    return { status: 'pending_10dlc', phoneNumber: purchased.phoneNumber };
  } catch (e) {
    await setIntegration(tenantId, 'twilio', { status: 'error', errorMessage: e.message });
    throw e;
  }
}

// Returns a Twilio client + from-number for a tenant. Falls back to global env
// vars (your current single-tenant setup) so nothing breaks during migration.
async function getTwilioForTenant(tenantId) {
  const integ = await getIntegration(tenantId, 'twilio');
  if (integ?.credentials?.subaccountSid && integ?.config?.phoneNumber) {
    return {
      client: require('twilio')(integ.credentials.subaccountSid, integ.credentials.subaccountToken),
      fromNumber: integ.config.phoneNumber,
      status: integ.status,
    };
  }
  // Fallback: global env (current behavior)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_PHONE_NUMBER) {
    return {
      client: require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN),
      fromNumber: process.env.TWILIO_PHONE_NUMBER,
      status: 'active',
    };
  }
  return null;
}

// Resolve which tenant owns a Twilio number (for inbound STOP webhooks)
async function findTenantByTwilioNumber(toNumber) {
  await ensureTables();
  const norm = String(toNumber || '').replace('whatsapp:', '').trim();
  const r = await adminQuery(
    `SELECT tenant_id FROM tenant_integrations WHERE provider='twilio' AND config->>'phoneNumber'=$1 LIMIT 1`,
    [norm]
  );
  if (r.rows[0]) return r.rows[0].tenant_id;
  // Fallback: if using the single global number, opt out across all tenants is wrong;
  // instead return null and let the caller use the legacy single-tenant path.
  return null;
}

// ── Setup checklist status ─────────────────────────────────────────────────────
async function getSetupStatus(tenantId) {
  await ensureTables();
  const [integrations, bizInfo] = await Promise.all([
    getIntegrationStatuses(tenantId),
    getBusinessInfo(tenantId),
  ]);
  const contactsRes = await adminQuery(
    `SELECT COUNT(*)::int AS n FROM newsletter_contacts WHERE tenant_id=$1`, [tenantId]
  ).catch(() => ({ rows: [{ n: 0 }] }));
  const staffRes = await adminQuery(
    `SELECT COUNT(*)::int AS n FROM employees WHERE tenant_id=$1`, [tenantId]
  ).catch(() => ({ rows: [{ n: 0 }] }));

  return {
    businessInfo: !!(bizInfo?.legal_name && bizInfo?.ein),
    sms:          integrations.twilio?.status || 'not_connected',
    smsNumber:    integrations.twilio?.config?.phoneNumber || null,
    bank:         integrations.plaid?.status || 'not_connected',
    googleBusiness: integrations.google_business?.status || 'not_connected',
    instagram:    integrations.meta?.status || 'not_connected',
    facebook:     integrations.facebook?.status || 'not_connected',
    contactsImported: (contactsRes.rows[0]?.n || 0) > 0,
    contactCount: contactsRes.rows[0]?.n || 0,
    staffAdded:   (staffRes.rows[0]?.n || 0) > 0,
    staffCount:   staffRes.rows[0]?.n || 0,
  };
}

module.exports = {
  ensureTables, getIntegration, setIntegration, getIntegrationStatuses,
  getBusinessInfo, saveBusinessInfo,
  provisionTwilioForTenant, getTwilioForTenant, findTenantByTwilioNumber,
  getSetupStatus, encrypt, decrypt,
};
