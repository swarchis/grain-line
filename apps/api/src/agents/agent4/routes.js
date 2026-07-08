// ─── Agent 4: Reviews & Employee Performance — Routes ────────────────────────
const router  = require('express').Router();
const service = require('./service');

router.get('/status', (_, res) => res.json({ ok:true, agent:'agent_4', name:'Reviews & Employee Performance', status:'active' }));

router.get('/reviews', async (req, res, next) => {
  try {
    const { locationId, status, platform, rating, limit=50, offset=0 } = req.query;
    const data = await service.getReviews(req.tenantId, { locationId, locationIds: req.locationIds, status, platform, rating: rating?parseInt(rating):null, limit: parseInt(limit), offset: parseInt(offset) });
    res.json({ ok:true, data });
  } catch(e) { next(e); }
});

router.post('/reviews/fetch', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.fetchFromPlatforms(req.tenantId, req.body.locationId, req.userId) }); }
  catch(e) { next(e); }
});

router.get('/reviews/:id', async (req, res, next) => {
  try {
    const r = await service.getReviewById(req.tenantId, req.params.id);
    if (!r) return res.status(404).json({ ok:false, error:'Not found', code:404 });
    res.json({ ok:true, data:r });
  } catch(e) { next(e); }
});

router.post('/reviews/:id/generate', async (req, res, next) => {
  try { res.json({ ok:true, data: { draft: await service.generateDraft(req.tenantId, req.params.id) } }); }
  catch(e) { next(e); }
});

router.post('/reviews/generate-batch', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.generateBatch(req.tenantId, req.body.locationId) }); }
  catch(e) { next(e); }
});

router.put('/reviews/:id/response', async (req, res, next) => {
  try {
    if (!req.body.draft) return res.status(400).json({ ok:false, error:'draft required', code:400 });
    res.json({ ok:true, data: await service.saveDraft(req.tenantId, req.params.id, req.body.draft) });
  } catch(e) { next(e); }
});

router.post('/reviews/:id/post', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.postResponse(req.tenantId, req.params.id, req.userId) }); }
  catch(e) { next(e); }
});

router.delete('/reviews/:id/response', async (req, res, next) => {
  try { await service.dismissReview(req.tenantId, req.params.id); res.json({ ok:true, data:{ dismissed:true } }); }
  catch(e) { next(e); }
});

router.get('/analytics', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.getAnalytics(req.tenantId, req.query.locationId, parseInt(req.query.days||30)) }); }
  catch(e) { next(e); }
});

router.get('/employees', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.getEmployeeScores(req.tenantId, req.query.locationId) }); }
  catch(e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try { res.json({ ok:true, data: await service.getSummary(req.tenantId, req.locationIds) }); }
  catch(e) { next(e); }
});

module.exports = router;
