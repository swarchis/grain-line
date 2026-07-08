// ─── Super Admin routes ───────────────────────────────────────────────────────
// Only accessible with SUPER_ADMIN_SECRET header
const router = require('express').Router();
const { adminQuery } = require('@restaurantos/db');

function requireSuperAdmin(req, res, next) {
  const secret = req.headers['x-super-admin-secret'] || req.query.secret;
  if (!process.env.SUPER_ADMIN_SECRET || secret !== process.env.SUPER_ADMIN_SECRET) {
    return res.status(403).json({ ok: false, error: 'Super admin access required' });
  }
  next();
}

router.use(requireSuperAdmin);

// GET /api/super-admin/tenants — all tenants with stats
router.get('/tenants', async (req, res, next) => {
  try {
    const r = await adminQuery(`
      SELECT
        t.id, t.name, t.plan, t.plan_name, t.subscription_status,
        t.trial_ends_at, t.stripe_customer_id, t.stripe_subscription_id,
        t.created_at,
        COUNT(DISTINCT u.id)  as user_count,
        COUNT(DISTINCT l.id)  as location_count,
        COUNT(DISTINCT lm.id) as member_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN locations l ON l.tenant_id = t.id
      LEFT JOIN loyalty_members lm ON lm.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch(e) { next(e); }
});

// GET /api/super-admin/stats — platform-wide stats
router.get('/stats', async (req, res, next) => {
  try {
    const [tenants, users, members, transactions] = await Promise.all([
      adminQuery(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE subscription_status='active') as active,
        COUNT(*) FILTER (WHERE subscription_status='trialing') as trialing,
        COUNT(*) FILTER (WHERE subscription_status='trial') as free_trial,
        COUNT(*) FILTER (WHERE subscription_status='past_due') as past_due,
        COUNT(*) FILTER (WHERE subscription_status='canceled') as canceled,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') as new_this_month
        FROM tenants`),
      adminQuery(`SELECT COUNT(*) as total FROM users`),
      adminQuery(`SELECT COUNT(*) as total, COALESCE(SUM(points_balance),0) as outstanding_pts FROM loyalty_members WHERE active=true`),
      adminQuery(`SELECT COUNT(*) as total, COALESCE(SUM(amount_spent),0) as total_spend FROM loyalty_transactions WHERE type='earn' AND created_at > now() - interval '30 days'`),
    ]);

    res.json({ ok: true, data: {
      tenants:      tenants.rows[0],
      users:        users.rows[0],
      members:      members.rows[0],
      transactions: transactions.rows[0],
    }});
  } catch(e) { next(e); }
});

// PATCH /api/super-admin/tenants/:id — update tenant plan/status
router.patch('/tenants/:id', async (req, res, next) => {
  try {
    const { plan_name, subscription_status, trial_ends_at } = req.body;
    const updates = [], values = []; let i = 1;
    if (plan_name)           { updates.push(`plan_name=$${i++}`);           values.push(plan_name); }
    if (subscription_status) { updates.push(`subscription_status=$${i++}`); values.push(subscription_status); }
    if (trial_ends_at)       { updates.push(`trial_ends_at=$${i++}`);       values.push(trial_ends_at); }
    if (!updates.length) return res.status(400).json({ ok: false, error: 'Nothing to update' });
    values.push(req.params.id);
    const r = await adminQuery(`UPDATE tenants SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, values);
    res.json({ ok: true, data: r.rows[0] });
  } catch(e) { next(e); }
});

// DELETE /api/super-admin/tenants/:id — delete tenant and all data
router.delete('/tenants/:id', async (req, res, next) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE') return res.status(400).json({ ok: false, error: 'Send confirm: "DELETE"' });
    await adminQuery('DELETE FROM tenants WHERE id=$1', [req.params.id]);
    res.json({ ok: true, message: 'Tenant deleted' });
  } catch(e) { next(e); }
});

module.exports = router;
