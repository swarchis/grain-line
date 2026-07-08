// ─── Admin routes — user management & RBAC ───────────────────────────────────
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { adminQuery, queryForTenant } = require('@restaurantos/db');
const { requireRole, signToken } = require('../middleware/auth');

// All admin routes require owner or manager role
router.use(requireRole('owner', 'manager'));

// Ensure agent_permissions column exists
async function ensureColumns() {
  await adminQuery(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS agent_permissions JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true
  `).catch(() => {});
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    await ensureColumns();
    const result = await queryForTenant(req.tenantId, `
      SELECT
        u.id, u.email, u.name, u.role, u.active,
        u.location_ids, u.agent_permissions,
        u.created_at, u.last_login_at,
        ARRAY_AGG(DISTINCT l.name) FILTER (WHERE l.name IS NOT NULL) as location_names
      FROM users u
      LEFT JOIN locations l ON l.id = ANY(u.location_ids::uuid[])
      WHERE u.tenant_id = $1
      GROUP BY u.id, u.email, u.name, u.role, u.active, u.location_ids, u.agent_permissions, u.created_at, u.last_login_at
      ORDER BY u.created_at ASC
    `, [req.tenantId]);
    res.json({ ok: true, data: result.rows });
  } catch(e) { next(e); }
});

// ── POST /api/admin/users — invite a new user ────────────────────────────────
router.post('/users', requireRole('owner'), async (req, res, next) => {
  try {
    await ensureColumns();
    const { email, name, role = 'staff', locationIds = [], agentPermissions = {}, password } = req.body;
    if (!email || !name) return res.status(400).json({ ok: false, error: 'email and name required', code: 400 });

    const tempPassword = password || Math.random().toString(36).slice(-10) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const userId = uuidv4();

    await queryForTenant(req.tenantId, `
      INSERT INTO users (id, tenant_id, email, name, password_hash, role, location_ids, agent_permissions, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
    `, [userId, req.tenantId, email.toLowerCase(), name, passwordHash, role, locationIds, JSON.stringify(agentPermissions)]);

    res.status(201).json({ ok: true, data: { id: userId, email, name, role, locationIds, agentPermissions, tempPassword } });
  } catch(e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Email already exists', code: 409 });
    next(e);
  }
});

// ── PATCH /api/admin/users/:userId ───────────────────────────────────────────
router.patch('/users/:userId', async (req, res, next) => {
  try {
    await ensureColumns();
    // Managers cannot edit owners
    const targetResult = await queryForTenant(req.tenantId, 'SELECT role FROM users WHERE id=$1 AND tenant_id=$2', [req.params.userId, req.tenantId]);
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ ok: false, error: 'User not found', code: 404 });
    if (target.role === 'owner' && req.userRole !== 'owner')
      return res.status(403).json({ ok: false, error: 'Cannot edit owner accounts', code: 403 });

    const allowed = ['name', 'role', 'active', 'location_ids', 'agent_permissions'];
    const updates = [], values = []; let i = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        updates.push(`${k} = $${i++}`);
        values.push(k === 'agent_permissions' ? JSON.stringify(v) : v);
      }
    }
    if (req.body.password) {
      updates.push(`password_hash = $${i++}`);
      values.push(await bcrypt.hash(req.body.password, 12));
    }
    if (!updates.length) return res.status(400).json({ ok: false, error: 'Nothing to update', code: 400 });
    values.push(req.params.userId, req.tenantId);

    const result = await queryForTenant(req.tenantId, `
      UPDATE users SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${i} AND tenant_id = $${i+1}
      RETURNING id, email, name, role, active, location_ids, agent_permissions
    `, values);
    res.json({ ok: true, data: result.rows[0] });
  } catch(e) { next(e); }
});

// ── DELETE /api/admin/users/:userId — deactivate (never hard delete) ─────────
router.delete('/users/:userId', requireRole('owner'), async (req, res, next) => {
  try {
    if (req.params.userId === req.userId)
      return res.status(400).json({ ok: false, error: 'Cannot deactivate your own account', code: 400 });
    await queryForTenant(req.tenantId,
      'UPDATE users SET active = false WHERE id = $1 AND tenant_id = $2',
      [req.params.userId, req.tenantId]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// ── GET /api/admin/activity — recent login activity ──────────────────────────
router.get('/activity', async (req, res, next) => {
  try {
    const result = await queryForTenant(req.tenantId, `
      SELECT id, email, name, role, last_login_at, active
      FROM users
      WHERE tenant_id = $1
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 20
    `, [req.tenantId]);
    res.json({ ok: true, data: result.rows });
  } catch(e) { next(e); }
});

module.exports = router;
