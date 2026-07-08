const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { queryForTenant, adminQuery } = require('@restaurantos/db');
const { requireRole, requireLocationAccess } = require('../middleware/auth');

// Ensure brand columns exist
async function ensureBrandColumns() {
  await adminQuery(`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS brand_voice        TEXT,
      ADD COLUMN IF NOT EXISTS brand_personality  TEXT,
      ADD COLUMN IF NOT EXISTS brand_colors       TEXT,
      ADD COLUMN IF NOT EXISTS brand_keywords     TEXT,
      ADD COLUMN IF NOT EXISTS brand_avoid        TEXT,
      ADD COLUMN IF NOT EXISTS brand_examples     TEXT,
      ADD COLUMN IF NOT EXISTS instagram_handle   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS facebook_page_id   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS instagram_account_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dropbox_folder       VARCHAR(500)
  `).catch(() => {});
}

// GET /api/locations
router.get('/', async (req, res, next) => {
  try {
    await ensureBrandColumns();
    const result = await queryForTenant(req.tenantId,
      `SELECT * FROM locations WHERE tenant_id = $1
       ${req.locationIds.length ? 'AND id = ANY($2::uuid[])' : ''}
       ORDER BY name`,
      req.locationIds.length ? [req.tenantId, req.locationIds] : [req.tenantId]
    );
    res.json({ ok: true, data: result.rows });
  } catch(e) { next(e); }
});

// GET /api/locations/:locationId
router.get('/:locationId', requireLocationAccess, async (req, res, next) => {
  try {
    await ensureBrandColumns();
    const result = await queryForTenant(req.tenantId,
      'SELECT * FROM locations WHERE tenant_id = $1 AND id = $2',
      [req.tenantId, req.params.locationId]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Location not found', code: 404 });
    res.json({ ok: true, data: result.rows[0] });
  } catch(e) { next(e); }
});

// POST /api/locations
router.post('/', requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { name, address, city, state, zip, phone, timezone } = req.body;
    if (!name || !address || !city || !state)
      return res.status(400).json({ ok: false, error: 'name, address, city, state required', code: 400 });
    const id = uuidv4();
    const result = await queryForTenant(req.tenantId,
      `INSERT INTO locations (id, tenant_id, name, address, city, state, zip, phone, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, req.tenantId, name, address, city, state, zip||'', phone||'', timezone||'America/Los_Angeles']
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch(e) { next(e); }
});

// PATCH /api/locations/:locationId
router.patch('/:locationId', requireRole('owner', 'manager'), requireLocationAccess, async (req, res, next) => {
  try {
    await ensureBrandColumns();
    const allowed = [
      'name','address','city','state','zip','phone','timezone',
      'google_place_id','google_account_id','google_location_id',
      'opentable_id','toast_location_id','yelp_business_id','active',
      // Brand profile fields
      'brand_voice','brand_personality','brand_colors',
      'brand_keywords','brand_avoid','brand_examples',
      'instagram_handle','facebook_page_id','instagram_account_id','dropbox_folder',
    ];
    const updates = [], values = []; let i = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (allowed.includes(key)) { updates.push(`${key} = $${i++}`); values.push(val); }
    }
    if (!updates.length) return res.status(400).json({ ok: false, error: 'No valid fields', code: 400 });
    values.push(req.params.locationId, req.tenantId);
    const result = await queryForTenant(req.tenantId,
      `UPDATE locations SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} AND tenant_id = $${i+1} RETURNING *`,
      values
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Location not found', code: 404 });
    res.json({ ok: true, data: result.rows[0] });
  } catch(e) { next(e); }
});

module.exports = router;
