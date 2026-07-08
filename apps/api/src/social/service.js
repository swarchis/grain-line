'use strict';
// ─── Social: Instagram (Meta Graph API) + Google Business Profile ────────────
// OAuth flows store tokens in tenant_integrations ('meta', 'google_business').
// Read: IG media + insights, GBP locations/reviews. Post: IG images, GBP local posts.
const jwt = require('jsonwebtoken');
const { adminQuery } = require('@restaurantos/db');
const integrations   = require('../integrations/service');

const API_URL = process.env.API_URL || 'https://restaurantosapi-production-434f.up.railway.app';
const FB = 'https://graph.facebook.com/v21.0';
async function http(url, opts = {}) {
  const fetch = (await import('node-fetch')).default;
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const e = (data.error && typeof data.error === 'object') ? data.error : null;
    let msg = e?.message || data.error_description || data.error || `HTTP ${r.status}`;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    // Meta's "API access blocked" = the app (not the token) is the problem.
    if (/api access blocked/i.test(msg)) {
      msg = 'Meta blocked this app\u2019s API access. Check developers.facebook.com \u2192 your app: (1) app in Development Mode? The IG account\u2019s owner needs a role on the app (or switch the app Live), (2) instagram_business_* permissions need Advanced Access \u2014 App Review + business verification, (3) any restriction/Data Use Checkup alert on the dashboard.';
    }
    if (e?.code) msg += ` [meta code ${e.code}${e.error_subcode ? '.' + e.error_subcode : ''}${e.fbtrace_id ? ' \u00B7 trace ' + e.fbtrace_id : ''}]`;
    const err = new Error(msg);
    err.metaCode = e?.code; err.metaSubcode = e?.error_subcode; err.fbtrace = e?.fbtrace_id;
    throw err;
  }
  return data;
}
const signState = (tenantId) => jwt.sign({ tenantId, t: Date.now() }, process.env.JWT_SECRET, { expiresIn: '15m' });
const verifyState = (s) => jwt.verify(s, process.env.JWT_SECRET); // {tenantId, inv?}

// ── Connect invites: email a secure link to whoever owns the accounts ─────────
async function createConnectInvite(tenantId, provider, email) {
  if (!['instagram', 'google', 'facebook'].includes(provider)) throw new Error('provider must be instagram, facebook, or google');
  const token = jwt.sign({ tenantId, provider, invite: true }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const url = `${API_URL}/api/social/connect/${provider}?invite=${encodeURIComponent(token)}`;
  let emailed = false;
  if (email && process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    const tenant = await adminQuery('SELECT name FROM tenants WHERE id=$1', [tenantId]).catch(() => ({ rows: [] }));
    const tName = tenant.rows[0]?.name || 'your restaurant';
    const PLATFORM = process.env.PLATFORM_NAME || 'Table Intelligence';
    const LABEL = provider === 'instagram' ? 'Instagram'
                : provider === 'facebook'  ? 'Facebook Page'
                : 'Google Business Profile';
    const WHERE = provider === 'instagram' ? "the device where you're logged into the restaurant's Instagram account"
                : provider === 'facebook'  ? "the device where you're logged into the Facebook account that is an admin of the restaurant's Page"
                : "the device where you're logged into the Google account that manages the Business Profile";
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM || 'connect@pulse.restaurant',
      to: email,
      subject: `Action needed: authorize ${PLATFORM} to access ${LABEL} for ${tName}`,
      html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px">
        <h2>Authorize ${PLATFORM} — ${LABEL}</h2>
        <p>${tName} uses ${PLATFORM} to manage its marketing. To finish setup, click below <strong>from ${WHERE}</strong> and approve access.</p>
        <p style="margin:24px 0"><a href="${url}" style="background:#b8741a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Authorize now</a></p>
        <p style="color:#888;font-size:12px">This link works for 7 days and can only create the connection — it grants no access to ${PLATFORM} itself, and nothing is ever posted without ${tName}'s action.</p></div>`,
    });
    emailed = true;
  }
  return { url, emailed };
}

// Invite link click → verify, then bounce straight into the provider OAuth dialog
function inviteRedirectUrl(provider, inviteToken) {
  const p = jwt.verify(inviteToken, process.env.JWT_SECRET);
  if (!p.invite || p.provider !== provider) throw new Error('Invalid or expired link — ask for a new one');
  const state = jwt.sign({ tenantId: p.tenantId, inv: 1 }, process.env.JWT_SECRET, { expiresIn: '15m' });
  if (provider === 'instagram') return buildIgAuthUrl(state);
  if (provider === 'facebook') {
    const scopes = 'pages_show_list,pages_manage_posts,pages_read_engagement';
    return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/facebook/callback')}&scope=${scopes}&state=${encodeURIComponent(state)}`;
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/google/callback')}&response_type=code&scope=${encodeURIComponent(GOOG_SCOPE)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
}

// ════ INSTAGRAM (Meta) ═══════════════════════════════════════════════════════
// Instagram Business Login — direct instagram.com OAuth, NO Facebook Page required.
// Uses the "Instagram" product's own App ID/Secret (IG_APP_ID / IG_APP_SECRET).
function buildIgAuthUrl(state) {
  const appId = process.env.IG_APP_ID;
  if (!appId) throw new Error('IG_APP_ID not configured — add the Instagram product in your Meta app and copy its Instagram App ID');
  const scopes = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights';
  return `https://www.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/meta/callback')}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
}
function metaConnectUrl(tenantId) { return buildIgAuthUrl(signState(tenantId)); }

async function metaCallback(code, state) {
  const sp = verifyState(state); const tenantId = sp.tenantId;
  const fetch = (await import('node-fetch')).default;
  // 1) code -> short-lived token (form-encoded, api.instagram.com)
  const r1 = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.IG_APP_ID, client_secret: process.env.IG_APP_SECRET,
      grant_type: 'authorization_code', redirect_uri: API_URL + '/api/social/meta/callback', code }),
  });
  const t1 = await r1.json();
  if (!t1.access_token) throw new Error('Instagram token exchange failed: ' + (t1.error_message || JSON.stringify(t1.error || t1)));
  // 2) short-lived -> long-lived (60 days)
  const t2 = await http(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.IG_APP_SECRET}&access_token=${t1.access_token}`);
  const token = t2.access_token || t1.access_token;
  // 3) profile
  const me = await http(`https://graph.instagram.com/v21.0/me?fields=user_id,username,followers_count,media_count&access_token=${token}`);
  await integrations.setIntegration(tenantId, 'meta', {
    status: 'active',
    credentials: { type: 'ig_login', accessToken: token, igUserId: me.user_id || t1.user_id, igUsername: me.username, expiresAt: new Date(Date.now() + (t2.expires_in || 5184000) * 1000).toISOString() },
    config: { accounts: [{ igUsername: me.username, igId: String(me.user_id || t1.user_id) }], connectedAt: new Date().toISOString() },
  });
  return { tenantId, fromInvite: !!sp.inv };
}

async function getIg(tenantId) {
  const integ = await integrations.getIntegration(tenantId, 'meta');
  const c = integ?.credentials;
  if (!c?.accessToken) throw new Error('Instagram not connected');
  // Long-lived IG tokens last 60 days and are NOT auto-renewed — refresh when
  // within 15 days of expiry (refresh requires the token to be >24h old, which
  // it always is by then). On failure, keep using the old token until it dies.
  const msLeft = c.expiresAt ? (new Date(c.expiresAt) - Date.now()) : Infinity;
  if (msLeft < 15 * 86400e3) {
    try {
      const t = await http(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${c.accessToken}`);
      if (t.access_token) {
        c.accessToken = t.access_token;
        c.expiresAt = new Date(Date.now() + (t.expires_in || 5184000) * 1000).toISOString();
        await integrations.setIntegration(tenantId, 'meta', { status: 'active', credentials: c, config: integ.config });
      }
    } catch (e) {
      if (msLeft <= 0) throw new Error('Instagram token expired and refresh failed \u2014 reconnect Instagram from the Setup page. (' + e.message + ')');
    }
  }
  return { igId: c.igUserId, igUsername: c.igUsername, token: c.accessToken };
}
const IG = 'https://graph.instagram.com/v21.0';

async function igMedia(tenantId, { limit = 12 } = {}) {
  const a = await getIg(tenantId);
  const d = await http(`${IG}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${a.token}`);
  return { account: a.igUsername, media: d.data || [] };
}

async function igInsights(tenantId) {
  const a = await getIg(tenantId);
  const prof = await http(`${IG}/me?fields=followers_count,media_count&access_token=${a.token}`);
  const m = await http(`${IG}/me/insights?metric=reach,profile_views,accounts_engaged&period=day&metric_type=total_value&since=${Math.floor(Date.now()/1000) - 30*86400}&access_token=${a.token}`).catch(() => ({ data: [] }));
  return { account: a.igUsername, followers: prof.followers_count, mediaCount: prof.media_count, metrics: m.data || [] };
}

async function igPublish(tenantId, { imageUrl, caption }) {
  if (!imageUrl) throw new Error('imageUrl required (must be publicly reachable)');
  const a = await getIg(tenantId);
  const container = await http(`${IG}/${a.igId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption: caption || '', access_token: a.token }),
  });
  for (let i = 0; i < 10; i++) {
    const st = await http(`${IG}/${container.id}?fields=status_code&access_token=${a.token}`);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR') throw new Error('Instagram rejected the media (check the image URL is public JPG/PNG)');
    await new Promise(r => setTimeout(r, 1500));
  }
  const pub = await http(`${IG}/${a.igId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: a.token }),
  });
  const perma = await http(`${IG}/${pub.id}?fields=permalink&access_token=${a.token}`).catch(() => ({}));
  return { postId: pub.id, permalink: perma.permalink, account: a.igUsername };
}


// ════ FACEBOOK PAGES (cross-posting) ════════════════════════════════════════
function facebookConnectUrl(tenantId) {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error('META_APP_ID not configured');
  const scopes = 'pages_show_list,pages_manage_posts,pages_read_engagement';
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/facebook/callback')}&scope=${scopes}&state=${encodeURIComponent(signState(tenantId))}`;
}

async function facebookCallback(code, state) {
  const sp = verifyState(state); const tenantId = sp.tenantId;
  const tok = await http(`${FB}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/facebook/callback')}&code=${code}`);
  const ll = await http(`${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${tok.access_token}`);
  const pages = await http(`${FB}/me/accounts?fields=id,name,access_token&access_token=${ll.access_token}`);
  if (!(pages.data || []).length) throw new Error('No Facebook Pages found on this account — make sure you are an admin of the restaurant Page');
  await integrations.setIntegration(tenantId, 'facebook', {
    status: 'active',
    credentials: { pages: pages.data.map(p => ({ pageId: p.id, pageName: p.name, pageToken: p.access_token })) },
    config: { pages: pages.data.map(p => ({ pageId: p.id, pageName: p.name })), connectedAt: new Date().toISOString() },
  });
  return { tenantId, fromInvite: !!sp.inv };
}

// Publish a photo post to a Page (defaults to the first connected Page)
async function fbPublish(tenantId, { pageId, imageUrl, message }) {
  if (!imageUrl) throw new Error('imageUrl required');
  const integ = await integrations.getIntegration(tenantId, 'facebook');
  const pages = integ?.credentials?.pages || [];
  if (!pages.length) throw new Error('Facebook Page not connected');
  const page = pageId ? (pages.find(p => p.pageId === pageId) || pages[0]) : pages[0];
  const d = await http(`${FB}/${page.pageId}/photos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption: message || '', access_token: page.pageToken }),
  });
  return { postId: d.post_id || d.id, page: page.pageName,
           permalink: d.post_id ? `https://www.facebook.com/${d.post_id}` : undefined };
}

// ════ GOOGLE BUSINESS PROFILE ════════════════════════════════════════════════
const GOOG_SCOPE = 'https://www.googleapis.com/auth/business.manage';

function googleConnectUrl(tenantId) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${cid}&redirect_uri=${encodeURIComponent(API_URL + '/api/social/google/callback')}&response_type=code&scope=${encodeURIComponent(GOOG_SCOPE)}&access_type=offline&prompt=consent&state=${encodeURIComponent(signState(tenantId))}`;
}

async function googleCallback(code, state) {
  const sp = verifyState(state); const tenantId = sp.tenantId;
  const tok = await http('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: API_URL + '/api/social/google/callback', grant_type: 'authorization_code' }),
  });
  if (!tok.refresh_token) throw new Error('Google did not return a refresh token — disconnect the app at myaccount.google.com/permissions and reconnect');
  // list accounts + locations
  const accounts = await http('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: { Authorization: 'Bearer ' + tok.access_token } });
  const acctName = accounts.accounts?.[0]?.name; // "accounts/123"
  let gLocations = [];
  if (acctName) {
    const locs = await http(`https://mybusinessbusinessinformation.googleapis.com/v1/${acctName}/locations?readMask=name,title,storefrontAddress&pageSize=50`, { headers: { Authorization: 'Bearer ' + tok.access_token } }).catch(() => ({ locations: [] }));
    gLocations = (locs.locations || []).map(l => ({ name: l.name, title: l.title }));
  }
  await integrations.setIntegration(tenantId, 'google_business', {
    status: 'active',
    credentials: { refreshToken: tok.refresh_token },
    config: { account: acctName, locations: gLocations, connectedAt: new Date().toISOString() },
  });
  return { tenantId, fromInvite: !!sp.inv };
}

async function googleAccessToken(tenantId) {
  const integ = await integrations.getIntegration(tenantId, 'google_business');
  if (!integ?.credentials?.refreshToken) throw new Error('Google Business Profile not connected');
  const tok = await http('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: integ.credentials.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  return { token: tok.access_token, config: integ.config };
}

async function gbpLocations(tenantId) {
  const { config } = await googleAccessToken(tenantId);
  return config?.locations || [];
}

// Create a "What's New" local post (optionally with image + CTA)
async function gbpPost(tenantId, { locationName, summary, imageUrl, ctaUrl }) {
  if (!locationName || !summary) throw new Error('locationName and summary required');
  const { token, config } = await googleAccessToken(tenantId);
  const acct = config?.account; // accounts/123
  const body = {
    languageCode: 'en-US', topicType: 'STANDARD', summary,
    ...(imageUrl ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }] } : {}),
    ...(ctaUrl ? { callToAction: { actionType: 'LEARN_MORE', url: ctaUrl } } : {}),
  };
  // localPosts is on the legacy v4 surface: accounts/{a}/locations/{l}/localPosts
  const locId = locationName.split('/').pop();
  const d = await http(`https://mybusiness.googleapis.com/v4/${acct}/locations/${locId}/localPosts`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { postName: d.name, state: d.state, searchUrl: d.searchUrl };
}

// Reviews (read) — feeds the Reviews agent later
async function gbpReviews(tenantId, { locationName, limit = 20 } = {}) {
  const { token, config } = await googleAccessToken(tenantId);
  const acct = config?.account;
  const loc = locationName || config?.locations?.[0]?.name;
  if (!loc) throw new Error('No GBP locations found');
  const locId = loc.split('/').pop();
  const d = await http(`https://mybusiness.googleapis.com/v4/${acct}/locations/${locId}/reviews?pageSize=${limit}`, { headers: { Authorization: 'Bearer ' + token } });
  return { averageRating: d.averageRating, totalReviewCount: d.totalReviewCount, reviews: (d.reviews || []).map(r => ({ reviewer: r.reviewer?.displayName, starRating: r.starRating, comment: r.comment, createTime: r.createTime, reply: r.reviewReply?.comment })) };
}

async function socialStatus(tenantId) {
  const [meta, goog, fb] = await Promise.all([
    integrations.getIntegration(tenantId, 'meta'),
    integrations.getIntegration(tenantId, 'google_business'),
    integrations.getIntegration(tenantId, 'facebook'),
  ]);
  return {
    instagram: { status: meta?.status || 'not_connected', accounts: meta?.config?.accounts || [] },
    google:    { status: goog?.status || 'not_connected', locations: goog?.config?.locations || [] },
    facebook:  { status: fb?.status || 'not_connected', pages: fb?.config?.pages || [] },
  };
}

module.exports = { createConnectInvite, inviteRedirectUrl, metaConnectUrl, metaCallback,
  facebookConnectUrl, facebookCallback, fbPublish, igMedia, igInsights, igPublish,
  googleConnectUrl, googleCallback, gbpLocations, gbpPost, gbpReviews, socialStatus };
