// ─── Agent 2: Financial KPI — Routes ─────────────────────────────────────────
const router  = require('express').Router();
const service = require('./service');

router.get('/status', (_, res) => res.json({ ok: true, agent: 'agent_2', name: 'Financial KPI', status: 'active' }));

// GET /api/agent-2/summary
router.get('/summary', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getSummary(req.tenantId, req.locationIds) }); }
  catch(e) { next(e); }
});

// GET /api/agent-2/weekly — get all weekly entries
router.get('/weekly', async (req, res, next) => {
  try {
    const { locationId, limit = 52 } = req.query;
    res.json({ ok: true, data: await service.getWeeklyData(req.tenantId, locationId, parseInt(limit)) });
  } catch(e) { next(e); }
});

// POST /api/agent-2/weekly — create or update a week's entry
router.post('/weekly', async (req, res, next) => {
  try {
    const data = await service.upsertWeeklyData(req.tenantId, req.body, req.userId);
    res.json({ ok: true, data });
  } catch(e) { next(e); }
});

// GET /api/agent-2/kpi — current KPI snapshot with trends
router.get('/kpi', async (req, res, next) => {
  try {
    const { locationId, weeks = 12 } = req.query;
    res.json({ ok: true, data: await service.getKPISnapshot(req.tenantId, locationId, parseInt(weeks)) });
  } catch(e) { next(e); }
});

// GET /api/agent-2/review-trends — pull from reviews table (Agent 4 data)
router.get('/review-trends', async (req, res, next) => {
  try {
    const { locationId, weeks = 12 } = req.query;
    res.json({ ok: true, data: await service.getReviewTrends(req.tenantId, locationId, parseInt(weeks)) });
  } catch(e) { next(e); }
});

// Event handlers (called by event bus)
router.post('/internal/inventory-submitted', async (req, res, next) => {
  try { await service.handleInventorySubmitted(req.body); res.json({ ok: true }); }
  catch(e) { next(e); }
});

module.exports = router;
