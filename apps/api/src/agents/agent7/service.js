// ─── Agent 7: Local SEO & GBP ────────────────────────────────────────────────
'use strict';
const { adminQuery }          = require('@restaurantos/db');
const { callClaude, parseJSON } = require('../../lib/claude');

const AGENT_ID = 'agent_7_seo';

// ── Ensure tables ─────────────────────────────────────────────────────────────
let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await adminQuery(`ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS seo_description   TEXT,
    ADD COLUMN IF NOT EXISTS seo_categories    TEXT,
    ADD COLUMN IF NOT EXISTS seo_attributes    TEXT,
    ADD COLUMN IF NOT EXISTS seo_score         INTEGER,
    ADD COLUMN IF NOT EXISTS seo_score_updated TIMESTAMPTZ
  `).catch(() => {});
  await adminQuery(`CREATE TABLE IF NOT EXISTS seo_keywords (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    location_id UUID NOT NULL,
    keyword     VARCHAR(300) NOT NULL,
    volume      VARCHAR(50),
    difficulty  VARCHAR(20),
    ranking     VARCHAR(50),
    source      VARCHAR(50) DEFAULT 'manual',
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
  )`).catch(() => {});
  await adminQuery(`CREATE TABLE IF NOT EXISTS seo_citations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    location_id   UUID NOT NULL,
    platform      VARCHAR(100) NOT NULL,
    status        VARCHAR(30)  NOT NULL DEFAULT 'unclaimed',
    profile_url   TEXT,
    rating        NUMERIC(3,1),
    review_count  INTEGER,
    last_checked  TIMESTAMPTZ DEFAULT now(),
    notes         TEXT,
    UNIQUE(tenant_id, location_id, platform)
  )`).catch(() => {});
  await adminQuery(`CREATE INDEX IF NOT EXISTS seo_keywords_loc ON seo_keywords(tenant_id, location_id)`).catch(() => {});
  // Website URL on locations
  await adminQuery(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS website_url TEXT`).catch(() => {});
  // Audit history
  await adminQuery(`CREATE TABLE IF NOT EXISTS seo_audits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    location_id UUID NOT NULL,
    website_url TEXT NOT NULL,
    score       INTEGER,
    checks      JSONB NOT NULL DEFAULT '[]',
    summary     TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
  )`).catch(() => {});
  await adminQuery(`CREATE INDEX IF NOT EXISTS seo_audits_loc ON seo_audits(tenant_id, location_id, created_at DESC)`).catch(() => {});
  _ready = true;
}

// ── SEO Health Score ──────────────────────────────────────────────────────────
function calcSeoScore(data) {
  let score = 0;
  const issues = [];
  const wins   = [];

  // Google rating (30 pts)
  const gRating = parseFloat(data.avg_google_rating || 0);
  if      (gRating >= 4.5) { score += 30; wins.push(`Google rating ${gRating} ★ — excellent`); }
  else if (gRating >= 4.0) { score += 20; issues.push(`Google rating ${gRating} — aim for 4.5+`); }
  else if (gRating >= 3.5) { score += 10; issues.push(`Google rating ${gRating} — needs urgent attention`); }
  else if (gRating  > 0  ) { score +=  0; issues.push(`Google rating ${gRating} — critical, affecting rankings`); }

  // Review velocity (20 pts)
  const recentReviews = parseInt(data.reviews_last_30d || 0);
  if      (recentReviews >= 10) { score += 20; wins.push(`${recentReviews} reviews in last 30 days — strong velocity`); }
  else if (recentReviews >= 5 ) { score += 12; issues.push(`${recentReviews} new reviews this month — aim for 10+`); }
  else if (recentReviews >= 1 ) { score +=  5; issues.push(`Only ${recentReviews} new review(s) this month — needs more`); }
  else                          { score +=  0; issues.push('No new reviews in 30 days — review generation needed'); }

  // Response rate (20 pts)
  const total    = parseInt(data.total_reviews   || 0);
  const responded = parseInt(data.responded_reviews || 0);
  const respRate = total > 0 ? responded / total : 0;
  if      (respRate >= 0.9) { score += 20; wins.push(`${Math.round(respRate*100)}% review response rate — excellent`); }
  else if (respRate >= 0.7) { score += 12; issues.push(`${Math.round(respRate*100)}% response rate — aim for 90%+`); }
  else if (respRate >= 0.5) { score +=  6; issues.push(`${Math.round(respRate*100)}% response rate — low`); }
  else                      { score +=  0; issues.push(`${Math.round(respRate*100)}% response rate — critical gap`); }

  // GBP posts (15 pts)
  const recentPosts = parseInt(data.posts_last_30d || 0);
  if      (recentPosts >= 4) { score += 15; wins.push(`${recentPosts} GBP posts this month — active listing`); }
  else if (recentPosts >= 2) { score += 10; issues.push(`${recentPosts} GBP posts this month — aim for weekly`); }
  else if (recentPosts >= 1) { score +=  5; issues.push(`Only ${recentPosts} GBP post this month — post weekly`); }
  else                       { score +=  0; issues.push('No GBP posts in 30 days — listing looks inactive'); }

  // Keywords configured (15 pts)
  const keywords = parseInt(data.active_keywords || 0);
  if      (keywords >= 10) { score += 15; wins.push(`${keywords} tracked keywords configured`); }
  else if (keywords >= 5 ) { score += 10; issues.push(`${keywords} keywords tracked — add more`); }
  else if (keywords >= 1 ) { score +=  5; issues.push(`Only ${keywords} keyword(s) — expand your list`); }
  else                     { score +=  0; issues.push('No keywords configured — set up keyword tracking'); }

  return { score: Math.min(100, score), issues, wins,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D' };
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getSummary(tenantId, locationId) {
  await ensureTables();
  const loc = locationId || null;
  const locW = loc ? ' AND location_id=$2' : '';
  const locP = (b) => loc ? [...b, loc] : b;

  const [reviews, posts, keywords, ratingTrend] = await Promise.all([
    adminQuery(`SELECT
      COUNT(*) as total_reviews,
      COUNT(*) FILTER(WHERE review_date > now()-interval '30 days') as reviews_last_30d,
      ROUND(AVG(rating) FILTER(WHERE platform='google'),1) as avg_google_rating,
      ROUND(AVG(rating) FILTER(WHERE platform='yelp'),1) as avg_yelp_rating,
      COUNT(*) FILTER(WHERE status='responded' OR response_draft IS NOT NULL) as responded_reviews,
      COUNT(*) FILTER(WHERE status='pending') as pending_response
      FROM reviews WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}`,
      locP([tenantId])),
    adminQuery(`SELECT COUNT(*) as total_posts,
      COUNT(*) FILTER(WHERE created_at > now()-interval '30 days') as posts_last_30d,
      COUNT(*) FILTER(WHERE status='published') as published
      FROM gbp_posts WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}`,
      locP([tenantId])),
    adminQuery(`SELECT COUNT(*) as active_keywords FROM seo_keywords
      WHERE tenant_id=$1 ${loc?'AND location_id=$2':''} AND active=true`,
      locP([tenantId])),
    adminQuery(`SELECT week_start,
      rating_google, rating_yelp
      FROM weekly_kpi WHERE tenant_id=$1 ${loc?'AND location_id=$2':''}
      ORDER BY week_start DESC LIMIT 8`,
      locP([tenantId])),
  ]);

  const data = {
    ...reviews.rows[0],
    ...posts.rows[0],
    ...keywords.rows[0],
  };
  const health = calcSeoScore(data);

  return { data, health, ratingTrend: ratingTrend.rows };
}

// ── GBP Posts ─────────────────────────────────────────────────────────────────
async function getPosts(tenantId, locationId, { status, limit = 20 } = {}) {
  await ensureTables();
  const params = [tenantId];
  let where = 'tenant_id=$1';
  if (locationId) { where += ' AND location_id=$2'; params.push(locationId); }
  if (status)     { where += ` AND status=$${params.length+1}`; params.push(status); }
  params.push(limit);
  const r = await adminQuery(
    `SELECT * FROM gbp_posts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params);
  return r.rows;
}

async function upsertPost(tenantId, data) {
  await ensureTables();
  const { id, locationId, type, content, ctaType, status, externalId, publishedAt } = data;
  if (id) {
    const r = await adminQuery(
      `UPDATE gbp_posts SET type=$1, content=$2, cta_type=$3, status=$4, external_id=$5, published_at=$6, updated_at=now()
       WHERE id=$7 AND tenant_id=$8 RETURNING *`,
      [type||'STANDARD', content, ctaType||null, status||'draft', externalId||null,
       publishedAt||null, id, tenantId]);
    return r.rows[0];
  }
  const r = await adminQuery(
    `INSERT INTO gbp_posts (tenant_id, location_id, type, content, cta_type, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, locationId, type||'STANDARD', content, ctaType||null, status||'draft']);
  return r.rows[0];
}

async function deletePost(tenantId, postId) {
  await adminQuery('DELETE FROM gbp_posts WHERE id=$1 AND tenant_id=$2', [postId, tenantId]);
  return { ok: true };
}

// ── AI generate GBP post ──────────────────────────────────────────────────────
async function generatePost(tenantId, locationId, { type = 'STANDARD', topic, tone } = {}) {
  const loc = await adminQuery(
    'SELECT name, city, state, brand_keywords, brand_voice, brand_personality FROM locations WHERE id=$1 AND tenant_id=$2',
    [locationId, tenantId]);
  const l = loc.rows[0] || {};

  const recentReviews = await adminQuery(
    `SELECT text, rating FROM reviews WHERE tenant_id=$1 AND location_id=$2
     AND review_date > now()-interval '14 days' ORDER BY rating DESC LIMIT 3`,
    [tenantId, locationId]);

  const prompt = `You are writing a Google Business Profile post for ${l.name || 'a restaurant'} in ${l.city||'San Francisco'}, ${l.state||'CA'}.

Post type: ${type} (STANDARD=general update, EVENT=happening, OFFER=promotion/deal)
Topic/focus: ${topic || 'general restaurant update'}
Tone: ${tone || l.brand_voice || 'warm, sophisticated, inviting'}
Brand keywords: ${l.brand_keywords || 'Indian cuisine, fine dining, cocktails'}

${recentReviews.rows.length ? `Recent guest praise to weave in:\n${recentReviews.rows.map(r=>`"${r.text.slice(0,100)}"`).join('\n')}` : ''}

Write a Google Business Profile post (max 1500 chars). Rules:
- Start with a hook (question, bold statement, or emoji)
- Include 1-2 relevant emojis naturally
- End with a clear call to action (Reserve now / Order online / Visit us / Call us)
- Do NOT use hashtags (GBP doesn't support them)
- Sound like a real person, not corporate marketing

Return ONLY a JSON object:
{"content":"<the full post text>","cta_type":"BOOK|ORDER|SHOP|CALL|SIGN_UP|LEARN_MORE","suggested_topic":"<1 line description>"}`;

  const text = await callClaude({ content: prompt, maxTokens: 600 });
  return parseJSON(text);
}

// ── Keywords ──────────────────────────────────────────────────────────────────
async function getKeywords(tenantId, locationId) {
  await ensureTables();
  const r = await adminQuery(
    `SELECT * FROM seo_keywords WHERE tenant_id=$1 AND (location_id=$2 OR location_id IS NULL) AND active=true ORDER BY created_at`,
    [tenantId, locationId]);
  return r.rows;
}

async function addKeyword(tenantId, locationId, keyword, meta = {}) {
  await ensureTables();
  const r = await adminQuery(
    `INSERT INTO seo_keywords (tenant_id, location_id, keyword, volume, difficulty, source)
     VALUES ($1,$2,$3,$4,$5,'manual') ON CONFLICT DO NOTHING RETURNING *`,
    [tenantId, locationId, keyword.trim(), meta.volume||null, meta.difficulty||null]);
  return r.rows[0];
}

async function deleteKeyword(tenantId, keywordId) {
  await adminQuery(`UPDATE seo_keywords SET active=false WHERE id=$1 AND tenant_id=$2`, [keywordId, tenantId]);
}

async function generateKeywords(tenantId, locationId) {
  const loc = await adminQuery(
    'SELECT name, city, state, brand_keywords FROM locations WHERE id=$1 LIMIT 1', [locationId]);
  const l = loc.rows[0] || {};

  const existing = await adminQuery(
    'SELECT keyword FROM seo_keywords WHERE tenant_id=$1 AND location_id=$2 AND active=true', [tenantId, locationId]);
  const existingList = existing.rows.map(r => r.keyword);

  const prompt = `Generate local SEO keywords for ${l.name||'a restaurant'} in ${l.city||'San Francisco'}, CA.
Cuisine: Indian fine dining, craft cocktails
Existing keywords (don't duplicate): ${existingList.join(', ') || 'none'}

Generate 15 high-value local SEO keywords covering:
- Restaurant type + location combos ("Indian restaurant San Francisco")
- Dish/cuisine searches ("butter chicken SoMa", "cocktail bar SOMA")
- Occasion searches ("anniversary dinner SF", "private dining San Francisco")
- Near me variants
- Competitor-adjacent terms

Return ONLY a JSON array:
[{"keyword":"string","volume":"high|medium|low","difficulty":"easy|medium|hard"}]`;

  const text = await callClaude({ content: prompt, maxTokens: 800 });
  return parseJSON(text);
}

// ── Citations ─────────────────────────────────────────────────────────────────
async function getCitations(tenantId, locationId) {
  await ensureTables();

  // Seed default platforms if none exist
  const existing = await adminQuery(
    'SELECT platform FROM seo_citations WHERE tenant_id=$1 AND location_id=$2', [tenantId, locationId]);

  if (existing.rows.length === 0) {
    const defaults = [
      { platform:'Google Business Profile', status:'claimed' },
      { platform:'Yelp',                    status:'claimed' },
      { platform:'TripAdvisor',              status:'unclaimed' },
      { platform:'OpenTable',               status:'unclaimed' },
      { platform:'Resy',                    status:'unclaimed' },
      { platform:'Foursquare',              status:'unclaimed' },
      { platform:'Apple Maps',              status:'unclaimed' },
      { platform:'Bing Places',             status:'unclaimed' },
    ];
    for (const d of defaults) {
      await adminQuery(
        `INSERT INTO seo_citations (tenant_id, location_id, platform, status)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [tenantId, locationId, d.platform, d.status]).catch(()=>{});
    }
  }

  const r = await adminQuery(
    'SELECT * FROM seo_citations WHERE tenant_id=$1 AND location_id=$2 ORDER BY platform',
    [tenantId, locationId]);
  return r.rows;
}

async function updateCitation(tenantId, locationId, platform, data) {
  await ensureTables();
  const { status, profileUrl, rating, reviewCount, notes } = data;
  await adminQuery(
    `INSERT INTO seo_citations (tenant_id, location_id, platform, status, profile_url, rating, review_count, notes, last_checked)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (tenant_id, location_id, platform)
     DO UPDATE SET status=$4, profile_url=$5, rating=$6, review_count=$7, notes=$8, last_checked=now()`,
    [tenantId, locationId, platform, status||'unclaimed', profileUrl||null, rating||null, reviewCount||null, notes||null]);
  return { ok: true };
}

// ── AI SEO recommendations ─────────────────────────────────────────────────────
async function getRecommendations(tenantId, locationId) {
  const [summary, citations, keywords] = await Promise.all([
    getSummary(tenantId, locationId),
    getCitations(tenantId, locationId),
    getKeywords(tenantId, locationId),
  ]);

  const unclaimed = citations.filter(c => c.status === 'unclaimed').map(c => c.platform);
  const s = summary.data;

  const prompt = `You are a local SEO expert for ${summary.data.name || 'an Indian fine dining restaurant'} in San Francisco.

Current SEO metrics:
- Google rating: ${s.avg_google_rating || 'unknown'} | Yelp: ${s.avg_yelp_rating || 'unknown'}
- Total reviews: ${s.total_reviews} | Last 30 days: ${s.reviews_last_30d}
- Review response rate: ${s.total_reviews > 0 ? Math.round(parseInt(s.responded_reviews)/parseInt(s.total_reviews)*100) : 0}%
- GBP posts last 30 days: ${s.posts_last_30d}
- SEO score: ${summary.health.score}/100 (${summary.health.grade})
- Active keywords tracked: ${s.active_keywords}
- Unclaimed listings: ${unclaimed.join(', ') || 'none'}

Issues flagged: ${summary.health.issues.join('; ') || 'none'}

Generate 5 specific, actionable SEO recommendations prioritized by impact.
Return ONLY a JSON array:
[{
  "title": "short title",
  "priority": "critical|high|medium|low",
  "category": "reviews|gbp_posts|citations|keywords|content",
  "action": "2-3 sentence specific action",
  "impact": "expected outcome",
  "effort": "15 min|1 hour|half day|ongoing"
}]`;

  const text = await callClaude({ content: prompt, maxTokens: 1000 });
  return parseJSON(text);
}


// ── Website SEO ───────────────────────────────────────────────────────────────
async function getWebsiteUrl(tenantId, locationId) {
  const r = await adminQuery(
    'SELECT website_url, name, city, state FROM locations WHERE id=$1 AND tenant_id=$2 LIMIT 1',
    [locationId, tenantId]);
  return r.rows[0] || {};
}

async function saveWebsiteUrl(tenantId, locationId, url) {
  await adminQuery('UPDATE locations SET website_url=$1 WHERE id=$2 AND tenant_id=$3', [url, locationId, tenantId]);
  return { ok: true };
}

async function getLastAudit(tenantId, locationId) {
  const r = await adminQuery(
    'SELECT * FROM seo_audits WHERE tenant_id=$1 AND location_id=$2 ORDER BY created_at DESC LIMIT 1',
    [tenantId, locationId]);
  return r.rows[0] || null;
}

async function runWebsiteAudit(tenantId, locationId, websiteUrl) {
  await ensureTables();

  // Fetch the website HTML
  let html = '';
  let fetchError = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseSEO/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      html = await res.text();
      // Truncate to keep Claude prompt manageable
      html = html.slice(0, 30000);
    } else {
      fetchError = `HTTP ${res.status}`;
    }
  } catch(e) {
    fetchError = e.message;
  }

  // Get business info for NAP consistency check
  const loc = await adminQuery(
    'SELECT name, address, city, state, zip, phone, brand_keywords, google_place_id FROM locations WHERE id=$1 LIMIT 1',
    [locationId]);
  const l = loc.rows[0] || {};

  const prompt = `You are an expert local SEO auditor. Analyse this restaurant website for SEO quality.

Restaurant: ${l.name || 'Unknown'} | ${l.address || ''}, ${l.city || ''}, ${l.state || ''}
Phone: ${l.phone || 'unknown'}
Target keywords: ${l.brand_keywords || 'Indian restaurant, fine dining, cocktails'}
Website URL: ${websiteUrl}
${fetchError ? `NOTE: Could not fetch website (${fetchError}). Audit what you can from the URL itself.` : ''}

${html ? `WEBSITE HTML (truncated to 30k chars):
${html}` : ''}

Audit this website across these SEO checks. For each check return a status and specific finding:

1. Title tag — is it present, under 60 chars, includes restaurant name + location?
2. Meta description — present, 120-160 chars, includes call to action?
3. H1 tag — present, unique, contains primary keyword?
4. Local keyword usage — do page headings/content mention city, neighbourhood, cuisine type?
5. NAP consistency — does the page show Name/Address/Phone matching: ${l.name}, ${l.address || 'unknown'}, ${l.phone || 'unknown'}?
6. Schema markup — is there LocalBusiness, Restaurant, or Menu schema.org JSON-LD?
7. Mobile meta viewport — is viewport meta tag present?
8. Page load signals — any obvious performance issues (huge unoptimised images, blocking scripts)?
9. Internal linking — are key pages (menu, reservations, contact) linked from homepage?
10. Google Maps / embed — is there an embedded map or Google Maps link?
11. Online reservation link — is there a link to OpenTable/Resy/Tock or booking form?
12. SSL/HTTPS — is the URL using HTTPS?

Return ONLY a JSON object (no markdown):
{
  "score": <0-100 integer>,
  "summary": "<2-3 sentence overall assessment>",
  "checks": [
    {
      "id": "title_tag",
      "label": "Title Tag",
      "status": "pass|warning|fail",
      "finding": "<specific finding — what was found or missing>",
      "fix": "<specific fix if status is warning or fail, null if pass>",
      "priority": "critical|high|medium|low"
    }
  ]
}`;

  const text = await callClaude({ content: prompt, maxTokens: 2000, timeoutMs: 45000 });
  const result = parseJSON(text);

  // Save audit
  const saved = await adminQuery(
    `INSERT INTO seo_audits (tenant_id, location_id, website_url, score, checks, summary)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, locationId, websiteUrl, result.score || 0,
     JSON.stringify(result.checks || []), result.summary || '']);

  return { ...result, id: saved.rows[0].id, created_at: saved.rows[0].created_at };
}

module.exports = {
  AGENT_ID, ensureTables,
  getSummary, getPosts, upsertPost, deletePost, generatePost,
  getKeywords, addKeyword, deleteKeyword, generateKeywords,
  getCitations, updateCitation,
  getRecommendations,
  getWebsiteUrl, saveWebsiteUrl, getLastAudit, runWebsiteAudit,
};
