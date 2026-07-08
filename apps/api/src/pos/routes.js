'use strict';
const express = require('express');
const router  = express.Router();
const service = require('./service');

router.get('/status', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getPosStatus(req.tenantId) }); } catch (e) { next(e); }
});

router.get('/square/connect-url', async (req, res, next) => {
  try { res.json({ ok: true, data: { url: service.squareConnectUrl(req.tenantId) } }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/square/location-map', async (req, res, next) => {
  try { await service.setLocationMap(req.tenantId, 'square', req.body.locationMap || {}); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.post('/square/sync', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.syncSquareSales(req.tenantId, { days: parseInt(req.body.days) || 30 }) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/toast/sync', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.syncToastSales(req.tenantId, { days: parseInt(req.body.days) || 30 }) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/toast/import-csv', async (req, res, next) => {
  try {
    const { locationId, csvText } = req.body;
    if (!locationId || !csvText) return res.status(400).json({ ok: false, error: 'locationId and csvText required' });
    res.json({ ok: true, data: await service.importToastCsv(req.tenantId, locationId, csvText) });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.get('/locations', async (req, res, next) => {
  try { res.json({ ok: true, data: await service.getPulseLocations(req.tenantId) }); } catch (e) { next(e); }
});

module.exports = router;
