'use strict';
const router  = require('express').Router();
const s = require('./service');
const h = fn => async (req, res) => { try { res.json({ ok: true, data: await fn(req) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } };

router.post('/invite',            h(req => s.createConnectInvite(req.tenantId, req.body.provider, req.body.email)));
router.get ('/status',            h(req => s.socialStatus(req.tenantId)));
router.get ('/meta/connect-url',  h(req => ({ url: s.metaConnectUrl(req.tenantId) })));
router.get ('/instagram/media',   h(req => s.igMedia(req.tenantId, { igId: req.query.igId, limit: parseInt(req.query.limit) || 12 })));
router.get ('/instagram/insights',h(req => s.igInsights(req.tenantId, { igId: req.query.igId })));
router.post('/instagram/publish', h(req => s.igPublish(req.tenantId, req.body)));
router.get ('/facebook/connect-url', h(req => ({ url: s.facebookConnectUrl(req.tenantId) })));
router.post('/facebook/publish',     h(req => s.fbPublish(req.tenantId, req.body)));
router.get ('/google/connect-url',h(req => ({ url: s.googleConnectUrl(req.tenantId) })));
router.get ('/google/locations',  h(req => s.gbpLocations(req.tenantId)));
router.post('/google/post',       h(req => s.gbpPost(req.tenantId, req.body)));
router.get ('/google/reviews',    h(req => s.gbpReviews(req.tenantId, { locationName: req.query.locationName })));
module.exports = router;
