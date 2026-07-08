// Agent 1: Media Library — Dropbox REST API
// Supports both short-lived access tokens AND refresh token flow
const router = require('express').Router();

const DBX_API     = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';
const DBX_AUTH    = 'https://api.dropbox.com/oauth2/token';
const IMAGE_EXTS  = new Set(['.jpg','.jpeg','.png','.webp','.gif','.heic','.avif']);
const VIDEO_EXTS  = new Set(['.mp4','.mov','.m4v','.avi','.webm']);

// Cache the current access token when using refresh token flow
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Option 1: direct access token (may expire)
  if (process.env.DROPBOX_ACCESS_TOKEN) return process.env.DROPBOX_ACCESS_TOKEN;

  // Option 2: refresh token flow (never expires)
  const { DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET } = process.env;
  if (!DROPBOX_REFRESH_TOKEN || !DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    throw Object.assign(
      new Error('Dropbox not configured. Add DROPBOX_ACCESS_TOKEN or (DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET) to Railway Variables.'),
      { status: 503, code: 'NO_TOKEN' }
    );
  }

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) return cachedToken;

  // Exchange refresh token for new access token
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(DBX_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: DROPBOX_REFRESH_TOKEN,
      client_id:     DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw Object.assign(new Error(`Failed to refresh Dropbox token: ${data.error_description || data.error || JSON.stringify(data)}`), { status: 401, code: 'TOKEN_REFRESH_FAILED' });
  }
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

async function dbxFetch(endpoint, body, isContent = false) {
  const fetch  = (await import('node-fetch')).default;
  const token  = await getAccessToken();
  const base   = isContent ? DBX_CONTENT : DBX_API;
  const res    = await fetch(`${base}${endpoint}`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(_) {
    if (res.status === 401) throw Object.assign(new Error('Dropbox token expired. Please regenerate your access token in Railway Variables.'), { status: 401, code: 'TOKEN_EXPIRED' });
    throw Object.assign(new Error(`Dropbox error (${res.status}): ${text.slice(0, 200)}`), { status: 502 });
  }
  if (!res.ok) {
    const msg = data?.error_summary || data?.error?.['.tag'] || JSON.stringify(data);
    if (res.status === 401) throw Object.assign(new Error(`Dropbox auth failed: ${msg}`), { status: 401, code: 'TOKEN_EXPIRED' });
    throw Object.assign(new Error(`Dropbox: ${msg}`), { status: res.status });
  }
  return data;
}

function resourceType(name = '') {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

function formatEntry(entry, thumbUrl = null) {
  return {
    id:            entry.id,
    name:          entry.name,
    path:          entry.path_lower,
    path_display:  entry.path_display,
    resource_type: entry['.tag'] === 'folder' ? 'folder' : resourceType(entry.name),
    tag:           entry['.tag'],
    size:          entry.size || null,
    modified:      entry.client_modified || entry.server_modified || null,
    thumbnail_url: thumbUrl || null,
    secure_url:    null,
  };
}

// GET /api/agent-1/media?path=/Restaurant Photos
router.get('/', async (req, res, next) => {
  try {
    const path = req.query.path || '';
    const result = await dbxFetch('/files/list_folder', {
      path, include_media_info: true, include_deleted: false, limit: 200,
    });

    const folders = [], media = [];
    for (const entry of result.entries) {
      if (entry['.tag'] === 'folder') folders.push(formatEntry(entry));
      else if (entry['.tag'] === 'file' && resourceType(entry.name)) media.push(formatEntry(entry));
    }

    // Batch thumbnails for images
    const imgEntries = media.filter(m => m.resource_type === 'image').slice(0, 25);
    if (imgEntries.length > 0) {
      try {
        const thumbData = await dbxFetch('/files/get_thumbnail_batch', {
          entries: imgEntries.map(e => ({ path: e.path, format: { '.tag': 'jpeg' }, size: { '.tag': 'w480h320' } })),
        }, true);
        (thumbData.entries || []).forEach((t, i) => {
          if (t['.tag'] === 'success' && t.thumbnail) imgEntries[i].thumbnail_url = `data:image/jpeg;base64,${t.thumbnail}`;
        });
      } catch(_) {}
    }

    res.json({ ok: true, data: { path: path || '/', has_more: result.has_more || false, folders: folders.sort((a,b) => a.name.localeCompare(b.name)), files: media.sort((a,b) => (b.modified||'').localeCompare(a.modified||'')), total: folders.length + media.length } });
  } catch(e) {
    if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED' || e.code === 'TOKEN_REFRESH_FAILED')
      return res.status(e.status).json({ ok: false, error: e.message, code: e.code });
    next(e);
  }
});

// GET /api/agent-1/media/search?q=burger
router.get('/search', async (req, res, next) => {
  try {
    const { q, path = '' } = req.query;
    if (!q) return res.json({ ok: true, data: { files: [] } });
    const result = await dbxFetch('/files/search_v2', { query: q, options: { path: path||undefined, file_extensions: ['jpg','jpeg','png','webp','gif','mp4','mov','heic'], max_results: 50 } });
    const files = (result.matches||[]).map(m => m.metadata?.metadata).filter(f => f && resourceType(f.name)).map(f => formatEntry(f));
    res.json({ ok: true, data: { files } });
  } catch(e) { next(e); }
});

// POST /api/agent-1/media/link
router.post('/link', async (req, res, next) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ ok: false, error: 'path required' });
    const result = await dbxFetch('/files/get_temporary_link', { path });
    res.json({ ok: true, data: { path, url: result.link, metadata: result.metadata } });
  } catch(e) { next(e); }
});

// POST /api/agent-1/media/shared-link
router.post('/shared-link', async (req, res, next) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ ok: false, error: 'path required' });
    let url;
    try {
      const r = await dbxFetch('/sharing/create_shared_link_with_settings', { path });
      url = r.url;
    } catch(e) {
      if (e.message?.includes('shared_link_already_exists')) {
        const r = await dbxFetch('/sharing/list_shared_links', { path, direct_only: true });
        url = r.links?.[0]?.url;
      } else throw e;
    }
    const directUrl = url?.replace('www.dropbox.com','dl.dropboxusercontent.com').replace('?dl=0','').replace('?dl=1','') || url;
    res.json({ ok: true, data: { path, url: directUrl, shared_url: url } });
  } catch(e) { next(e); }
});

module.exports = router;
