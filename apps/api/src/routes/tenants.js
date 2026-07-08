const router = require('express').Router();
const { queryForTenant } = require('@restaurantos/db');
const { requireRole } = require('../middleware/auth');

router.get('/me', async (req, res, next) => {
  try {
    const { adminQuery } = require('@restaurantos/db');
    const result = await adminQuery('SELECT id, name, plan, active_agents, created_at FROM tenants WHERE id = $1', [req.tenantId]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Tenant not found', code: 404 });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/me/agents', requireRole('owner'), async (req, res, next) => {
  try {
    const { activeAgents } = req.body;
    const { adminQuery } = require('@restaurantos/db');
    const result = await adminQuery('UPDATE tenants SET active_agents = $1 WHERE id = $2 RETURNING *', [activeAgents, req.tenantId]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) { next(err); }
});


// PATCH /api/tenants/name — update group name
router.patch('/name', requireRole('owner'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required', code: 400 });
    const { adminQuery } = require('@restaurantos/db');
    await adminQuery('UPDATE tenants SET name=$1 WHERE id=$2', [name.trim(), req.tenantId]);
    res.json({ ok: true, data: { name: name.trim() } });
  } catch(e) { next(e); }
});

module.exports = router;
