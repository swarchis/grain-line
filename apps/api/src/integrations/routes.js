'use strict';
const express = require('express');
const router  = express.Router();
const service = require('./service');

// Setup checklist status
router.get('/setup-status', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getSetupStatus(req.tenantId) }); }
  catch (e) { next(e); }
});

// Business info (for 10DLC)
router.get('/business-info', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getBusinessInfo(req.tenantId) }); }
  catch (e) { next(e); }
});
router.post('/business-info', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.saveBusinessInfo(req.tenantId, req.body) }); }
  catch (e) { next(e); }
});

// Integration statuses (no credentials exposed)
router.get('/status', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getIntegrationStatuses(req.tenantId) }); }
  catch (e) { next(e); }
});

// Kick off Twilio SMS provisioning (after business info is saved)
router.post('/twilio/provision', async (req, res, next) => {
  try {
    const result = await service.provisionTwilioForTenant(req.tenantId, req.body.tenantName);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
