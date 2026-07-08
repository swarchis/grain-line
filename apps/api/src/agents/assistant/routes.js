'use strict';
const router  = require('express').Router();
const service = require('./service');

// GET /api/assistant/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await service.getSessions(req.tenantId) });
  } catch(e) { next(e); }
});

// POST /api/assistant/sessions
router.post('/sessions', async (req, res, next) => {
  try {
    const session = await service.createSession(req.tenantId, req.body.locationId);
    res.json({ ok: true, data: session });
  } catch(e) { next(e); }
});

// DELETE /api/assistant/sessions/:id
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    await service.deleteSession(req.tenantId, req.params.id);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// GET /api/assistant/sessions/:id/messages
router.get('/sessions/:id/messages', async (req, res, next) => {
  try {
    res.json({ ok: true, data: await service.getMessages(req.tenantId, req.params.id) });
  } catch(e) { next(e); }
});

// POST /api/assistant/chat  — SSE streaming
router.post('/chat', async (req, res, next) => {
  try {
    const { sessionId, message, locationId } = req.body;
    if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId required' });
    if (!message?.trim()) return res.status(400).json({ ok: false, error: 'message required' });

    // Get tenant name for system prompt
    const { adminQuery } = require('@restaurantos/db');
    const t = await adminQuery('SELECT name FROM tenants WHERE id=$1 LIMIT 1', [req.tenantId]);
    const tenantName = t.rows[0]?.name;

    await service.streamChat({
      tenantId:   req.tenantId,
      locationId: locationId || null,
      sessionId,
      userMessage: message.trim(),
      tenantName,
      res,
    });
  } catch(e) {
    if (!res.headersSent) next(e);
    else res.end();
  }
});

module.exports = router;
