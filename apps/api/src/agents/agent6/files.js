'use strict';
// ─── Compliance document files: direct uploads stored in Postgres ────────────
// Mirrors the agent-10 training-video pattern (BYTEA + signed public stream).
// Mount AFTER auth:    app.use('/api/agent-6/files', require('./agents/agent6/files'));
// PUBLIC stream route BEFORE auth: app.get('/api/public/compliance-file/:id', require('./agents/agent6/files').streamFile);
const express = require('express');
const jwt     = require('jsonwebtoken');
const { adminQuery } = require('@restaurantos/db');

const router = express.Router();
const MAX_MB = 25;

// PDFs, images, Office docs, plain text — no executables/scripts
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(plain|csv))$/i;

let _ready = false;
async function ensureTable() {
  if (_ready) return;
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS compliance_files (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL,
      file_name   VARCHAR(300) NOT NULL,
      mime        VARCHAR(120) NOT NULL,
      size_bytes  INTEGER NOT NULL,
      data        BYTEA NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch(() => {});
  await adminQuery('CREATE INDEX IF NOT EXISTS compliance_files_tenant ON compliance_files(tenant_id)').catch(() => {});
  _ready = true;
}

// Signed, time-limited public URL for a stored file (4h, re-issued on every list)
function signFileUrl(fileId, tenantId) {
  const t = jwt.sign({ fid: fileId, tid: tenantId }, process.env.JWT_SECRET, { expiresIn: '4h' });
  return `/api/public/compliance-file/${fileId}?t=${t}`;
}

// Direct upload: JSON { fileName, mime, dataBase64 } — 25MB raw cap
router.post('/upload', express.json({ limit: '40mb' }), async (req, res, next) => {
  try {
    await ensureTable();
    const { fileName, mime, dataBase64 } = req.body;
    if (!fileName || !dataBase64) return res.status(400).json({ ok: false, error: 'fileName and dataBase64 required' });
    if (!ALLOWED_MIME.test(mime || '')) return res.status(400).json({ ok: false, error: 'Unsupported file type — use PDF, image, Office, or text files' });
    const buf = Buffer.from(dataBase64, 'base64');
    if (!buf.length) return res.status(400).json({ ok: false, error: 'Empty file' });
    if (buf.length > MAX_MB * 1024 * 1024) return res.status(400).json({ ok: false, error: `File too large — keep it under ${MAX_MB}MB (or paste a Dropbox/Drive link instead)` });
    const r = await adminQuery(
      `INSERT INTO compliance_files (tenant_id, file_name, mime, size_bytes, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, file_name, mime, size_bytes, created_at`,
      [req.tenantId, String(fileName).slice(0, 300), mime, buf.length, buf]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await ensureTable();
    await adminQuery('DELETE FROM compliance_files WHERE tenant_id=$1 AND id=$2', [req.tenantId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PUBLIC stream handler (mount before auth): verifies signed token from query
async function streamFile(req, res) {
  try {
    const payload = jwt.verify(req.query.t || '', process.env.JWT_SECRET);
    if (payload.fid !== req.params.id) return res.status(403).end();
    const r = await adminQuery(
      'SELECT file_name, mime, data FROM compliance_files WHERE id=$1 AND tenant_id=$2',
      [req.params.id, payload.tid]);
    if (!r.rows.length || !r.rows[0].data) return res.status(404).end();
    const f = r.rows[0];
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', f.data.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.file_name)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(f.data);
  } catch (e) { res.status(403).end(); }
}

module.exports = router;
module.exports.streamFile  = streamFile;
module.exports.signFileUrl = signFileUrl;
