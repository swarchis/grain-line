'use strict';
// ─── Training module videos: embeds (YouTube/Loom) + direct uploads ──────────
// Self-contained router. Mount AFTER auth:   app.use('/api/agent-10/videos', require('./agents/agent10/videos'));
// And mount the PUBLIC stream route BEFORE auth (see index.js instructions).
const express = require('express');
const jwt     = require('jsonwebtoken');
const { adminQuery } = require('@restaurantos/db');

const router = express.Router();
const MAX_MB = 25;

let _ready = false;
async function ensureTable() {
  if (_ready) return;
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS training_videos (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL,
      module_id   TEXT NOT NULL,
      title       VARCHAR(300) NOT NULL,
      source_type VARCHAR(20) NOT NULL DEFAULT 'url',
      url         TEXT,
      mime        VARCHAR(80),
      size_bytes  INTEGER,
      video_data  BYTEA,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch(()=>{});
  await adminQuery(`CREATE INDEX IF NOT EXISTS training_videos_mod ON training_videos(tenant_id, module_id)`).catch(()=>{});
  _ready = true;
}

// Normalize YouTube/Loom links into embeddable URLs
function toEmbed(url) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { sourceType: 'youtube', embed: `https://www.youtube.com/embed/${yt[1]}` };
  const loom = url.match(/loom\.com\/share\/([\w]+)/);
  if (loom) return { sourceType: 'loom', embed: `https://www.loom.com/embed/${loom[1]}` };
  return { sourceType: 'url', embed: url };
}


// ── Dropbox: token (per-tenant integration with env fallback) ─────────────────
async function getDropboxToken(tenantId) {
  try {
    const integrations = require('../../integrations/service');
    const integ = await integrations.getIntegration(tenantId, 'dropbox');
    if (integ?.credentials?.accessToken) return integ.credentials.accessToken;
  } catch (e) { /* integrations module optional */ }
  return process.env.DROPBOX_ACCESS_TOKEN || null;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)$/i;

// Browse Dropbox folders for video files
router.get('/dropbox/list', async (req, res) => {
  try {
    const token = await getDropboxToken(req.tenantId);
    if (!token) return res.status(400).json({ ok: false, error: 'Dropbox not connected' });
    const fetch = (await import('node-fetch')).default;
    const r = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: req.query.path || '', recursive: false, limit: 200 }),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ ok: false, error: data.error_summary || 'Dropbox error' });
    const folders = (data.entries || []).filter(e => e['.tag'] === 'folder')
      .map(e => ({ type: 'folder', name: e.name, path: e.path_lower }));
    const videos = (data.entries || []).filter(e => e['.tag'] === 'file' && VIDEO_EXT.test(e.name))
      .map(e => ({ type: 'video', name: e.name, path: e.path_lower, size: e.size }));
    res.json({ ok: true, data: { folders, videos, path: req.query.path || '' } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

async function dropboxTempLink(token, path) {
  const fetch = (await import('node-fetch')).default;
  const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await r.json();
  return data.link || null;
}

// List videos for a module (no blobs)
router.get('/', async (req, res, next) => {
  try {
    await ensureTable();
    const r = await adminQuery(
      `SELECT id, module_id, title, source_type, url, mime, size_bytes, created_at
       FROM training_videos WHERE tenant_id=$1 ${req.query.moduleId ? 'AND module_id=$2' : ''}
       ORDER BY created_at`,
      req.query.moduleId ? [req.tenantId, req.query.moduleId] : [req.tenantId]);
    // Attach a 4h signed playback token for uploads
    let dbxToken = null;
    const withTokens = await Promise.all(r.rows.map(async v => {
      if (v.source_type === 'upload') {
        return { ...v, streamUrl: `/api/public/training-video/${v.id}?t=${jwt.sign({ vid: v.id, tid: req.tenantId }, process.env.JWT_SECRET, { expiresIn: '4h' })}` };
      }
      if (v.source_type === 'dropbox') {
        if (dbxToken === null) dbxToken = (await getDropboxToken(req.tenantId)) || false;
        const link = dbxToken ? await dropboxTempLink(dbxToken, v.url).catch(() => null) : null;
        return { ...v, streamUrl: link };
      }
      return v;
    }));
    res.json({ ok: true, data: withTokens });
  } catch (e) { next(e); }
});

// Add an embed/link video
router.post('/', express.json(), async (req, res, next) => {
  try {
    await ensureTable();
    const { moduleId, title, url, dropboxPath } = req.body;
    if (!moduleId || !title || (!url && !dropboxPath)) return res.status(400).json({ ok: false, error: 'moduleId, title, and url or dropboxPath required' });
    const { sourceType, embed } = dropboxPath
      ? { sourceType: 'dropbox', embed: dropboxPath }
      : toEmbed(url.trim());
    const r = await adminQuery(
      `INSERT INTO training_videos (tenant_id, module_id, title, source_type, url)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, module_id, title, source_type, url, created_at`,
      [req.tenantId, moduleId, title.trim(), sourceType, embed]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// Direct upload: JSON { moduleId, title, mime, dataBase64 } — 25MB raw cap
router.post('/upload', express.json({ limit: '40mb' }), async (req, res, next) => {
  try {
    await ensureTable();
    const { moduleId, title, mime, dataBase64 } = req.body;
    if (!moduleId || !title || !dataBase64) return res.status(400).json({ ok: false, error: 'moduleId, title, dataBase64 required' });
    if (!/^video\//.test(mime || '')) return res.status(400).json({ ok: false, error: 'Only video files allowed' });
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length > MAX_MB * 1024 * 1024) return res.status(400).json({ ok: false, error: `Video too large — keep it under ${MAX_MB}MB (trim or use a YouTube/Loom link)` });
    const r = await adminQuery(
      `INSERT INTO training_videos (tenant_id, module_id, title, source_type, mime, size_bytes, video_data)
       VALUES ($1,$2,$3,'upload',$4,$5,$6) RETURNING id, module_id, title, source_type, mime, size_bytes, created_at`,
      [req.tenantId, moduleId, title.trim(), mime, buf.length, buf]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await adminQuery('DELETE FROM training_videos WHERE tenant_id=$1 AND id=$2', [req.tenantId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PUBLIC stream handler (mount before auth): verifies signed token from query
async function streamVideo(req, res) {
  try {
    const payload = jwt.verify(req.query.t || '', process.env.JWT_SECRET);
    if (payload.vid !== req.params.id) return res.status(403).end();
    const r = await adminQuery(
      'SELECT mime, video_data FROM training_videos WHERE id=$1 AND tenant_id=$2', [req.params.id, payload.tid]);
    if (!r.rows.length || !r.rows[0].video_data) return res.status(404).end();
    const buf = r.rows[0].video_data;
    // Basic range support so seeking works
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const start = parseInt(m[1]), end = m[2] ? parseInt(m[2]) : buf.length - 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${buf.length}`,
        'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
        'Content-Type': r.rows[0].mime || 'video/mp4',
      }).end(buf.subarray(start, end + 1));
    } else {
      res.set({ 'Content-Type': r.rows[0].mime || 'video/mp4', 'Content-Length': buf.length, 'Accept-Ranges': 'bytes' }).end(buf);
    }
  } catch (e) { res.status(403).end(); }
}

module.exports = router;
module.exports.streamVideo = streamVideo;
