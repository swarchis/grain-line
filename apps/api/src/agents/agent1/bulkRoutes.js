// Agent 1: Bulk Calendar Generation
const router  = require('express').Router();
const service = require('./service');

// POST /api/agent-1/bulk/generate
// Generates a full calendar of posts for a date range
router.post('/generate', async (req, res, next) => {
  try {
    const {
      locationId, startDate, endDate,
      platforms, frequency, postingTime,
      contentMix, dishes, occasions, cta, dropboxFolder,
    } = req.body;

    if (!locationId || !startDate || !endDate)
      return res.status(400).json({ ok:false, error:'locationId, startDate, endDate required', code:400 });

    const posts = await service.generateBulkCalendar(req.tenantId, {
      locationId, startDate, endDate,
      platforms:    platforms    || ['instagram','facebook'],
      frequency:    frequency    || 5,
      postingTime:  postingTime  || 'mixed',
      contentMix:   contentMix   || {},
      dishes:       dishes       || '',
      occasions:    occasions    || '',
      cta:          cta          || '',
      dropboxFolder: dropboxFolder || '',
      userId:       req.userId,
    });

    res.json({ ok:true, data:{ posts, count:posts.length } });
  } catch(e) { next(e); }
});

// POST /api/agent-1/bulk/approve-all
// Approve and schedule all draft posts in a batch
router.post('/approve-all', async (req, res, next) => {
  try {
    const { postIds } = req.body;
    if (!postIds?.length) return res.status(400).json({ ok:false, error:'postIds required', code:400 });
    const result = await service.approveAll(req.tenantId, postIds);
    res.json({ ok:true, data:result });
  } catch(e) { next(e); }
});

module.exports = router;
