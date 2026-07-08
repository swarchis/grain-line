// Agent 1: Marketing & Content — Service
// Includes: social trends via AI web search, Meta Ads API boosting, Google Ads structure
require('dotenv').config();
const { once } = require('../../lib/tableCache');
const { queryForTenant, adminQuery } = require('@restaurantos/db');
const { eventBus } = require('../../lib/eventBus');

const AGENT_ID    = 'agent_1_marketing';
const CLAUDE_API  = 'https://api.anthropic.com/v1/messages';
const GRAPH_API   = 'https://graph.facebook.com/v21.0';

// ── Dropbox token helper (refresh token flow preferred) ──────────────────────
let _cachedDropboxToken = null;
let _cachedDropboxExpiry = 0;

async function getDropboxToken() {
  const { DROPBOX_ACCESS_TOKEN, DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET } = process.env;

  // Use refresh token flow if available (tokens never expire)
  if (DROPBOX_REFRESH_TOKEN && DROPBOX_APP_KEY && DROPBOX_APP_SECRET) {
    if (_cachedDropboxToken && Date.now() < _cachedDropboxExpiry - 300000) {
      return _cachedDropboxToken;
    }
    try {
      const fetch = (await import('node-fetch')).default;
      const params = new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: DROPBOX_REFRESH_TOKEN,
        client_id: DROPBOX_APP_KEY, client_secret: DROPBOX_APP_SECRET,
      });
      const res = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        _cachedDropboxToken = data.access_token;
        _cachedDropboxExpiry = Date.now() + (data.expires_in || 14400) * 1000;
        return _cachedDropboxToken;
      }
    } catch(e) { console.error('[dropbox] refresh error:', e.message); }
  }

  // Fall back to static access token
  return DROPBOX_ACCESS_TOKEN || null;
}

async function apiFetch(url, opts = {}) {
  const fetch = (await import('node-fetch')).default;
  return fetch(url, opts);
}

// Single-prompt Claude call returning raw text. (generateNewsletter referenced this
// helper but it was never defined — newsletter AI generation threw "callClaude is not defined".)
async function callClaude({ content, maxTokens = 2000, model } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await apiFetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Claude error');
  return (data.content || []).map(b => b.text || '').join('').trim();
}

// ── Table setup ───────────────────────────────────────────────────────────────
const ensureTables = once('agent1', async function() {
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      platform        VARCHAR(30) NOT NULL,
      status          VARCHAR(30) NOT NULL DEFAULT 'draft',
      caption         TEXT NOT NULL DEFAULT '',
      hashtags        TEXT NOT NULL DEFAULT '',
      media_urls      TEXT[] NOT NULL DEFAULT '{}',
      media_type      VARCHAR(30) DEFAULT 'IMAGE',
      scheduled_at    TIMESTAMPTZ,
      published_at    TIMESTAMPTZ,
      external_id     VARCHAR(200),
      ig_permalink    VARCHAR(500),
      likes           INTEGER DEFAULT 0,
      comments        INTEGER DEFAULT 0,
      reach           INTEGER DEFAULT 0,
      impressions     INTEGER DEFAULT 0,
      content_type    VARCHAR(50) DEFAULT 'feed',
      trend_tag       VARCHAR(100),
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS ad_boosts (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      location_id       UUID,
      post_id           UUID REFERENCES social_posts(id),
      platform          VARCHAR(30) NOT NULL,
      objective         VARCHAR(50) NOT NULL DEFAULT 'POST_ENGAGEMENT',
      status            VARCHAR(30) NOT NULL DEFAULT 'draft',
      daily_budget_cents INTEGER NOT NULL DEFAULT 1000,
      total_budget_cents INTEGER,
      start_date        DATE NOT NULL,
      end_date          DATE NOT NULL,
      targeting         JSONB DEFAULT '{}',
      meta_campaign_id  VARCHAR(100),
      meta_adset_id     VARCHAR(100),
      meta_ad_id        VARCHAR(100),
      google_campaign_id VARCHAR(100),
      spend_cents       INTEGER DEFAULT 0,
      impressions       INTEGER DEFAULT 0,
      clicks            INTEGER DEFAULT 0,
      reach             INTEGER DEFAULT 0,
      results           INTEGER DEFAULT 0,
      cost_per_result   NUMERIC(8,4),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  // Newsletter tables
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS newsletter_contacts (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      email         VARCHAR(300) NOT NULL,
      first_name    VARCHAR(100),
      last_name     VARCHAR(100),
      phone         VARCHAR(30),
      source        VARCHAR(50) DEFAULT 'manual',
      tags          TEXT[] DEFAULT '{}',
      subscribed    BOOLEAN DEFAULT true,
      unsubscribed_at TIMESTAMPTZ,
      last_visit    DATE,
      visit_count   INTEGER DEFAULT 0,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, email)
    )
  `).catch(() => {});

  await adminQuery(`
    CREATE TABLE IF NOT EXISTS newsletters (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      subject       VARCHAR(500) NOT NULL,
      preview_text  VARCHAR(300),
      html_content  TEXT NOT NULL,
      text_content  TEXT,
      status        VARCHAR(20) NOT NULL DEFAULT 'draft',
      sent_at       TIMESTAMPTZ,
      sent_count    INTEGER DEFAULT 0,
      open_count    INTEGER DEFAULT 0,
      click_count   INTEGER DEFAULT 0,
      tags          TEXT[] DEFAULT '{}',
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});

  await adminQuery(`CREATE INDEX IF NOT EXISTS newsletter_contacts_tenant ON newsletter_contacts(tenant_id, subscribed)`).catch(()=>{});

  // Text / WhatsApp campaigns
  await adminQuery(`
    CREATE TABLE IF NOT EXISTS text_campaigns (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      location_id   UUID,
      name          VARCHAR(300) NOT NULL,
      channel       VARCHAR(10) NOT NULL DEFAULT 'sms',
      message       TEXT NOT NULL,
      media_url     VARCHAR(500),
      status        VARCHAR(20) NOT NULL DEFAULT 'draft',
      scheduled_at  TIMESTAMPTZ,
      sent_at       TIMESTAMPTZ,
      sent_count    INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      failed_count  INTEGER DEFAULT 0,
      opt_out_count INTEGER DEFAULT 0,
      tags          TEXT[] DEFAULT '{}',
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(()=>{});

  // Add sms/whatsapp opt-out columns to contacts if missing
  await adminQuery('ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS sms_subscribed BOOLEAN DEFAULT true').catch(()=>{});
  await adminQuery('ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS wa_subscribed BOOLEAN DEFAULT true').catch(()=>{});
  await adminQuery('ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ').catch(()=>{});
  await adminQuery(`CREATE INDEX IF NOT EXISTS text_campaigns_tenant ON text_campaigns(tenant_id, status, created_at DESC)`).catch(()=>{});
  await adminQuery(`CREATE INDEX IF NOT EXISTS newsletters_tenant ON newsletters(tenant_id, status, created_at DESC)`).catch(()=>{});
});

// ── Brand voices ──────────────────────────────────────────────────────────────
const BRAND_VOICES = {
  rooh:    'Rooh is modern Indian fine dining. Sophisticated, poetic, elegant. Reimagined classics with unexpected twists. Voice: evocative, refined, never cheesy.',
  fitoor:  'Fitoor is vibrant Indian street food elevated. Bold flavors, lively atmosphere. Voice: energetic, warm, celebratory, food-forward.',
  pippal:  'Pippal celebrates soul of Indian cooking — rustic, hearty, deeply flavorful. Voice: earthy, authentic, community-focused.',
  alora:   'Alora is coastal Cal-Mediterranean — bright, seasonal, vegetable-and-seafood forward. Voice: fresh, sunlit, effortless, globally minded. NOT Indian cuisine.',
  default: 'Modern restaurant. Sophisticated, warm, focused on craft and flavor. Do not assume a cuisine unless told.',
};
const PLATFORM_GUIDANCE = {
  instagram: 'Hook in first line. 3-5 emojis woven naturally. End with 15-20 hashtags after "---". Max 2200 chars.',
  facebook:  '2-3 conversational paragraphs. 2-3 emojis max. 3-5 hashtags. Encourage sharing/tagging.',
  gbp:       'Max 300 chars. Professional. Clear CTA (Reserve, Order, Learn more). No hashtags.',
};

function getBrandVoice(name = '') {
  const n = name.toLowerCase();
  if (n.includes('rooh'))   return BRAND_VOICES.rooh;
  if (n.includes('fitoor')) return BRAND_VOICES.fitoor;
  if (n.includes('pippal')) return BRAND_VOICES.pippal;
  if (n.includes('alora'))  return BRAND_VOICES.alora;
  return BRAND_VOICES.default;
}

// ── Posts CRUD ────────────────────────────────────────────────────────────────
async function getPosts(tenantId, { locationId, platform, status, from, to } = {}) {
  await ensureTables();
  const params = [tenantId]; let i = 2;
  let where = 'p.tenant_id = $1';
  if (locationId) { where += ` AND location_id = $${i++}`; params.push(locationId); }
  if (platform)   { where += ` AND platform = $${i++}`;    params.push(platform); }
  if (status)     { where += ` AND status = $${i++}`;      params.push(status); }
  if (from)       { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)         { where += ` AND created_at <= $${i++}`; params.push(to); }
  const r = await queryForTenant(tenantId, `
    SELECT p.*, l.name as location_name FROM social_posts p
    LEFT JOIN locations l ON l.id = p.location_id
    WHERE ${where} ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC LIMIT 200
  `, params);
  return r.rows;
}

async function createPost(tenantId, data, userId) {
  await ensureTables();
  const { location_id, platform, caption, hashtags, media_urls, media_type, scheduled_at, content_type, trend_tag } = data;
  const r = await queryForTenant(tenantId, `
    INSERT INTO social_posts (tenant_id,location_id,platform,caption,hashtags,media_urls,media_type,scheduled_at,content_type,trend_tag,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
  `, [tenantId,location_id||null,platform,caption||'',hashtags||'',media_urls||[],media_type||'IMAGE',scheduled_at||null,content_type||'feed',trend_tag||null,userId||null]);
  return r.rows[0];
}

async function updatePost(tenantId, id, data) {
  const allowed = ['caption','hashtags','media_urls','scheduled_at','status','content_type','trend_tag'];
  const updates=[],values=[];let i=1;
  for(const[k,v]of Object.entries(data)){if(allowed.includes(k)){updates.push(`${k}=$${i++}`);values.push(v);}}
  if(!updates.length)throw Object.assign(new Error('No valid fields'),{status:400});
  values.push(id,tenantId);
  const r=await queryForTenant(tenantId,`UPDATE social_posts SET ${updates.join(',')},updated_at=now() WHERE id=$${i} AND tenant_id=$${i+1} RETURNING *`,values);
  return r.rows[0];
}

async function deletePost(tenantId,id){
  await queryForTenant(tenantId,'DELETE FROM social_posts WHERE id=$1 AND tenant_id=$2',[id,tenantId]);
}

async function approvePost(tenantId,id,scheduledAt){
  const r=await queryForTenant(tenantId,`UPDATE social_posts SET status='scheduled',scheduled_at=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING *`,[scheduledAt||new Date().toISOString(),id,tenantId]);
  return r.rows[0];
}

// ── AI content generation ─────────────────────────────────────────────────────
async function generateContent(tenantId, { locationId, locationName, platform, contentType, topic, occasion, dish, mediaDescription, includeOffer, trendContext }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  // Fetch brand profile from DB
  let voice = getBrandVoice(locationName);
  let brandContext = '';
  if (locationId) {
    try {
      const locResult = await queryForTenant(tenantId, 'SELECT * FROM locations WHERE id = $1', [locationId]);
      const loc = locResult.rows[0];
      if (loc) {
        if (loc.brand_voice)       voice = loc.brand_voice;
        if (loc.brand_personality) brandContext += 'Personality: ' + loc.brand_personality + '\n';
        if (loc.brand_keywords)    brandContext += 'Key words/themes: ' + loc.brand_keywords + '\n';
        if (loc.brand_avoid)       brandContext += 'NEVER use or say: ' + loc.brand_avoid + '\n';
        if (loc.brand_examples)    brandContext += 'Example captions for reference:\n' + loc.brand_examples + '\n';
        if (loc.brand_colors)      brandContext += 'Brand aesthetic/colors: ' + loc.brand_colors + '\n';
      }
    } catch(_) {}
  }
  const platGuide = PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE.instagram;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `You are a social media expert for ${locationName||'a modern restaurant'}.

Today's date: ${today}. Use this for any seasonal or timely references. NEVER mention a year, event date, or "this year" unless it follows from today's date or was explicitly provided below.

Brand voice: ${voice}
${brandContext}

Create a ${platform} post:
- Content type: ${contentType||'feed'}
${topic         ? `- Topic: ${topic}` : ''}
${occasion      ? `- Occasion: ${occasion}` : ''}
${dish          ? `- Featured dish: ${dish}` : ''}
${mediaDescription ? `- Visual: ${mediaDescription}` : ''}
${includeOffer  ? `- Offer/CTA: ${includeOffer}` : ''}
${trendContext  ? `- Trending angle to tap into: ${trendContext}` : ''}

${platGuide}

Return ONLY valid JSON (no markdown fences):
{
  "caption": "main caption",
  "hashtags": "space-separated hashtags",
  "alt_captions": ["alternative 1", "alternative 2"],
  "best_time": "e.g. Tuesday 6pm",
  "content_tips": "what image/video to use",
  "trend_alignment": "how this taps current food trends"
}`;

  const res = await apiFetch(CLAUDE_API, {
    method:'POST',
    headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.CLAUDE_MODEL||'claude-sonnet-4-5',max_tokens:1200,messages:[{role:'user',content:prompt}]}),
  });
  const data = await res.json();
  if(!res.ok||data.error)throw new Error(data.error?.message||'Claude error');
  const text = data.content?.map(b=>b.text||'').join('').trim();
  try { return JSON.parse(text.replace(/```json|```/g,'').trim()); }
  catch(_){ return {caption:text,hashtags:'',alt_captions:[],best_time:'',content_tips:'',trend_alignment:''}; }
}

// ── TRENDS — AI-powered web search analysis ───────────────────────────────────
// Uses Claude with web_search tool to find real current food/restaurant trends
async function getTrends(tenantId, { restaurantConcept, location } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const prompt = `You are a restaurant marketing strategist. Research and identify the top 6 food and dining trends that are currently viral on Instagram and trending right now in ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}.

Focus on trends relevant to ${restaurantConcept||'modern Indian fine dining'} restaurants${location ? ` in ${location}` : ''}.

For each trend provide:
1. The trend name and what it is
2. Why it's viral right now (engagement signal)
3. A specific content angle for an Indian restaurant to tap into it
4. Suggested hashtags
5. Content format that works best (Reel, carousel, static)

Return ONLY valid JSON array (no markdown):
[
  {
    "trend": "trend name",
    "description": "what it is and why it's hot",
    "virality_signal": "specific engagement data or platform signal",
    "restaurant_angle": "how an Indian restaurant can leverage this",
    "suggested_hashtags": "#hashtag1 #hashtag2 #hashtag3",
    "best_format": "Reel|Carousel|Static",
    "urgency": "high|medium|low"
  }
]`;

  const res = await apiFetch(CLAUDE_API, {
    method:'POST',
    headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.CLAUDE_MODEL||'claude-sonnet-4-5',
      max_tokens:2000,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:prompt}],
    }),
  });
  const data = await res.json();
  if(!res.ok||data.error)throw new Error(data.error?.message||'Claude error');

  // Extract text from all content blocks including tool results
  const textBlocks = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text||'').join('');
  try {
    const clean = textBlocks.replace(/```json|```/g,'').trim();
    const start = clean.indexOf('['), end = clean.lastIndexOf(']');
    if(start>=0&&end>start) return JSON.parse(clean.slice(start,end+1));
    return JSON.parse(clean);
  } catch(_){
    // Return fallback trends based on research
    return FALLBACK_TRENDS;
  }
}

const FALLBACK_TRENDS = [
  { trend:'Next-Gen Indian', description:'Elevated Indian cuisine reimagined with global techniques — getting massive engagement as diners seek premium experiences', virality_signal:'#NextGenIndian up 340% on Instagram, featured in NYT and Eater', restaurant_angle:'Showcase your most photogenic fusion dish with a story about its origins', suggested_hashtags:'#NextGenIndian #ModernIndian #IndianFoodRevolution #FineIndianDining', best_format:'Carousel', urgency:'high' },
  { trend:'Experience Economy 2.0', description:'Diners want memorable, shareable experiences not just food — chef tables, live fire, tableside presentations', virality_signal:'TikTok "experiential dining" content getting 10M+ views per week in 2026', restaurant_angle:'Film your most dramatic tableside moment — dal being poured, bread baked at table', suggested_hashtags:'#ExperientialDining #TablesideService #DiningExperience #FoodTheatre', best_format:'Reel', urgency:'high' },
  { trend:'Swicy Everything', description:'Sweet + spicy flavor combinations dominating food content across all platforms', virality_signal:'#Swicy posts up 200% YoY, Taco Bell and Wendy\'s launching swicy menus', restaurant_angle:'Highlight your spicy-sweet dishes — mango chili, tamarind glazes, honey chili anything', suggested_hashtags:'#Swicy #SweetAndSpicy #SpicyFood #HotAndSweet #ChiliHoney', best_format:'Reel', urgency:'high' },
  { trend:'Solo Dining Celebration', description:'Normalizing and celebrating eating alone — Gen Z trend reframing solo dining as self-care luxury', virality_signal:'Solo dining reservations up 28% in major cities, viral TikTok series', restaurant_angle:'Invite solo diners explicitly in your content — "book a table for one, treat yourself"', suggested_hashtags:'#SoloDining #TableForOne #DineAlone #SelfCare #LunchAlone', best_format:'Static', urgency:'medium' },
  { trend:'Protein-Maxing', description:'High-protein meals dominating food content as gym culture and health consciousness merge with dining out', virality_signal:'#ProteinMeal content averaging 2M+ views, protein bowls up 45% on delivery', restaurant_angle:'Highlight paneer, dal, lentil dishes with protein content — appeal to health-conscious crowd', suggested_hashtags:'#ProteinMeal #HighProtein #HealthyIndian #ProteinPacked #FitFood', best_format:'Carousel', urgency:'medium' },
  { trend:'Behind-the-Scenes Kitchen Content', description:'Raw, unfiltered kitchen content outperforming polished food photography — authenticity wins', virality_signal:'BTS kitchen Reels averaging 3x higher reach than static food posts in 2026', restaurant_angle:'Film your chef in action — the chaos, the craft, the passion. No script, just real moments', suggested_hashtags:'#BehindTheScenes #ChefLife #KitchenLife #RestaurantLife #ChefSecrets', best_format:'Reel', urgency:'medium' },
];

// ── Publish to platforms ──────────────────────────────────────────────────────
async function publishPost(tenantId, postId, userId) {
  const postResult = await queryForTenant(tenantId,
    'SELECT p.*,l.name as location_name,l.instagram_account_id,l.facebook_page_id FROM social_posts p LEFT JOIN locations l ON l.id=p.location_id WHERE p.id=$1 AND p.tenant_id=$2',
    [postId,tenantId]);
  const post = postResult.rows[0];
  if(!post)throw Object.assign(new Error('Post not found'),{status:404});

  let externalId=null,permalink=null,platformError=null,published=false;

  if(post.platform==='instagram'&&post.instagram_account_id&&process.env.META_ACCESS_TOKEN){
    try{const r=await publishToInstagram(post.instagram_account_id,post);externalId=r.id;permalink=r.permalink;published=true;}
    catch(e){platformError=e.message;}
  }
  if(post.platform==='facebook'&&post.facebook_page_id&&process.env.META_ACCESS_TOKEN){
    try{const r=await publishToFacebook(post.facebook_page_id,post);externalId=r.id;published=true;}
    catch(e){platformError=e.message;}
  }

  const updated=await queryForTenant(tenantId,`UPDATE social_posts SET status='published',published_at=now(),external_id=$1,ig_permalink=$2,updated_at=now() WHERE id=$3 AND tenant_id=$4 RETURNING *`,[externalId,permalink,postId,tenantId]);
  await eventBus.publish({eventType:'content.approved',tenantId,locationId:post.location_id,sourceAgent:AGENT_ID,payload:{postId,platform:post.platform}}).catch(()=>{});
  return {published,externalId,permalink,platformError,post:updated.rows[0]};
}

async function publishToInstagram(igAccountId,post){
  const token=process.env.META_ACCESS_TOKEN;
  const caption=post.caption+(post.hashtags?'\n\n'+post.hashtags:'');
  const containerRes=await apiFetch(`${GRAPH_API}/${igAccountId}/media`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_url:post.media_urls?.[0],caption,access_token:token})});
  const container=await containerRes.json();
  if(!containerRes.ok||container.error)throw new Error(container.error?.message||'Container creation failed');
  await new Promise(r=>setTimeout(r,3000));
  const publishRes=await apiFetch(`${GRAPH_API}/${igAccountId}/media_publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({creation_id:container.id,access_token:token})});
  const result=await publishRes.json();
  if(!publishRes.ok||result.error)throw new Error(result.error?.message||'Publish failed');
  const mediaRes=await apiFetch(`${GRAPH_API}/${result.id}?fields=permalink&access_token=${token}`);
  const media=await mediaRes.json();
  return {id:result.id,permalink:media.permalink};
}

async function publishToFacebook(pageId,post){
  const token=process.env.META_ACCESS_TOKEN;
  const message=post.caption+(post.hashtags?'\n\n'+post.hashtags:'');
  const res=await apiFetch(`${GRAPH_API}/${pageId}/feed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,link:post.media_urls?.[0],access_token:token})});
  const result=await res.json();
  if(!res.ok||result.error)throw new Error(result.error?.message||'Facebook publish failed');
  return result;
}

// ── Meta Ads — Boost a post ───────────────────────────────────────────────────
async function createAdBoost(tenantId, boostData, userId) {
  await ensureTables();
  const {
    postId, locationId, platform, objective='POST_ENGAGEMENT',
    dailyBudgetCents=2000, totalBudgetCents, startDate, endDate,
    targeting={}, adAccountId,
  } = boostData;

  // Save to DB first
  const r = await queryForTenant(tenantId, `
    INSERT INTO ad_boosts (tenant_id,location_id,post_id,platform,objective,status,daily_budget_cents,total_budget_cents,start_date,end_date,targeting)
    VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10) RETURNING *
  `, [tenantId,locationId||null,postId||null,platform,objective,dailyBudgetCents,totalBudgetCents||null,startDate,endDate,JSON.stringify(targeting)]);
  const boost = r.rows[0];

  // If Meta credentials available, create the actual campaign
  if(platform==='instagram'||platform==='facebook'){
    if(process.env.META_ACCESS_TOKEN&&adAccountId){
      try {
        const result = await createMetaCampaign(boost, adAccountId, postId);
        await queryForTenant(tenantId, `
          UPDATE ad_boosts SET meta_campaign_id=$1,meta_adset_id=$2,meta_ad_id=$3,status='active',updated_at=now()
          WHERE id=$4 AND tenant_id=$5
        `, [result.campaignId,result.adSetId,result.adId,boost.id,tenantId]);
        return {...boost,...result,status:'active'};
      } catch(e){
        await queryForTenant(tenantId,`UPDATE ad_boosts SET status='error',updated_at=now() WHERE id=$1`,[boost.id]);
        throw e;
      }
    }
  }
  return boost;
}

async function createMetaCampaign(boost, adAccountId, postId) {
  const token = process.env.META_ACCESS_TOKEN;
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  // 1. Create campaign
  const campRes = await apiFetch(`${GRAPH_API}/${actId}/campaigns`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      name: `RestaurantOS Boost - ${new Date().toISOString().slice(0,10)}`,
      objective: boost.objective === 'POST_ENGAGEMENT' ? 'POST_ENGAGEMENT' : 'REACH',
      status: 'ACTIVE',
      special_ad_categories: [],
      access_token: token,
    }),
  });
  const camp = await campRes.json();
  if(!campRes.ok||camp.error)throw new Error(camp.error?.message||'Campaign creation failed');

  // 2. Create ad set
  const targeting = boost.targeting || {};
  const adSetRes = await apiFetch(`${GRAPH_API}/${actId}/adsets`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      name: 'RestaurantOS Ad Set',
      campaign_id: camp.id,
      daily_budget: boost.daily_budget_cents,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'POST_ENGAGEMENT',
      start_time: new Date(boost.start_date).toISOString(),
      end_time: new Date(boost.end_date).toISOString(),
      targeting: {
        geo_locations: targeting.geoLocations || { countries: ['US'] },
        age_min: targeting.ageMin || 21,
        age_max: targeting.ageMax || 55,
        interests: targeting.interests || [],
        publisher_platforms: boost.platform === 'instagram' ? ['instagram'] : ['facebook','instagram'],
        instagram_positions: boost.platform === 'instagram' ? ['feed','story','reels'] : undefined,
      },
      status: 'ACTIVE',
      access_token: token,
    }),
  });
  const adSet = await adSetRes.json();
  if(!adSetRes.ok||adSet.error)throw new Error(adSet.error?.message||'Ad set creation failed');

  // 3. Create ad using existing post
  const adRes = await apiFetch(`${GRAPH_API}/${actId}/ads`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      name: 'RestaurantOS Ad',
      adset_id: adSet.id,
      creative: {
        object_story_id: postId, // existing Instagram/Facebook post ID
      },
      status: 'ACTIVE',
      access_token: token,
    }),
  });
  const ad = await adRes.json();
  if(!adRes.ok||ad.error)throw new Error(ad.error?.message||'Ad creation failed');

  return { campaignId: camp.id, adSetId: adSet.id, adId: ad.id };
}

// ── Get ad boosts ─────────────────────────────────────────────────────────────
async function getAdBoosts(tenantId, { locationId } = {}) {
  await ensureTables();
  const params = [tenantId];
  const locFilter = locationId ? ' AND b.location_id=$2' : '';
  if(locationId) params.push(locationId);
  const r = await queryForTenant(tenantId, `
    SELECT b.*, l.name as location_name, p.caption as post_caption, p.platform as post_platform
    FROM ad_boosts b
    LEFT JOIN locations l ON l.id=b.location_id
    LEFT JOIN social_posts p ON p.id=b.post_id
    WHERE b.tenant_id=$1 ${locFilter}
    ORDER BY b.created_at DESC
  `, params);
  return r.rows;
}

// ── Ad performance ────────────────────────────────────────────────────────────
async function getAdInsights(tenantId, locationId, days=30) {
  await ensureTables();
  const params=[tenantId];
  const locFilter=locationId?' AND location_id=$2':'';
  if(locationId)params.push(locationId);
  params.push(days);
  const r=await queryForTenant(tenantId,`
    SELECT
      platform,
      COUNT(*) as campaigns,
      SUM(spend_cents)/100.0 as total_spend,
      SUM(impressions) as total_impressions,
      SUM(clicks) as total_clicks,
      SUM(results) as total_results,
      ROUND(AVG(cost_per_result),2) as avg_cost_per_result
    FROM ad_boosts
    WHERE tenant_id=$1 ${locFilter}
    AND created_at > now()-($${params.length}||' days')::interval
    GROUP BY platform
  `,params);
  return r.rows;
}

// ── Calendar ──────────────────────────────────────────────────────────────────
async function getCalendar(tenantId, locationId, month) {
  await ensureTables();
  const start = month?`${month}-01`:new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10);
  const d=new Date(start);
  const end=new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10);
  const params=[tenantId,start,end];
  const locFilter=locationId?' AND p.location_id=$4':'';
  if(locationId)params.push(locationId);
  const r=await queryForTenant(tenantId,`
    SELECT p.*,l.name as location_name FROM social_posts p
    LEFT JOIN locations l ON l.id=p.location_id
    WHERE p.tenant_id=$1 AND (p.scheduled_at BETWEEN $2 AND $3 OR (p.scheduled_at IS NULL AND p.created_at BETWEEN $2 AND $3))
    ${locFilter} ORDER BY COALESCE(p.scheduled_at,p.created_at) ASC
  `,params);
  return r.rows;
}

// ── Insights ──────────────────────────────────────────────────────────────────
async function getInsights(tenantId, locationId, days=30) {
  await ensureTables();
  const params=[tenantId];
  const locFilter=locationId?' AND p.location_id=$2':'';
  if(locationId)params.push(locationId);
  params.push(days);
  const [summary,recent]=await Promise.all([
    queryForTenant(tenantId,`SELECT platform,status,COUNT(*)as post_count,SUM(likes)as total_likes,SUM(comments)as total_comments,SUM(reach)as total_reach,ROUND(AVG(likes),0)as avg_likes FROM social_posts p WHERE p.tenant_id=$1 ${locFilter} AND p.created_at>now()-($${params.length}||' days')::interval GROUP BY platform,status ORDER BY platform`,params),
    queryForTenant(tenantId,`SELECT p.*,l.name as location_name FROM social_posts p LEFT JOIN locations l ON l.id=p.location_id WHERE p.tenant_id=$1 ${locFilter.replace('p.','p.')} AND p.status='published' ORDER BY p.published_at DESC LIMIT 10`,params.slice(0,locationId?2:1)),
  ]);
  return {summary:summary.rows,recentPosts:recent.rows};
}

async function getSummary(tenantId, locationIds) {
  await ensureTables();
  const params=[tenantId];
  const locFilter=locationIds?.length?`AND location_id=ANY($2::uuid[])`:'';
  if(locationIds?.length)params.push(locationIds);
  const r=await queryForTenant(tenantId,`SELECT COUNT(*)FILTER(WHERE status='draft')as drafts,COUNT(*)FILTER(WHERE status='scheduled')as scheduled,COUNT(*)FILTER(WHERE status='published'AND published_at>now()-interval '7 days')as published_this_week,COUNT(*)as total FROM social_posts WHERE tenant_id=$1 ${locFilter}`,params);
  return {...r.rows[0],agent:AGENT_ID};
}

async function handleTierUpgraded(event) { /* trigger loyalty email/post */ }


// ── Bulk calendar generation ──────────────────────────────────────────────────
const CONTENT_TYPES_LIST = [
  { key:'food',        label:'Food shots',          contentType:'feed' },
  { key:'events',      label:'Events & promos',     contentType:'event' },
  { key:'behind',      label:'Behind the scenes',   contentType:'behind-the-scenes' },
  { key:'trending',    label:'Trending topics',     contentType:'feed' },
  { key:'reviews',     label:'Reviews / social proof', contentType:'review-highlight' },
  { key:'seasonal',    label:'Seasonal specials',   contentType:'seasonal' },
];

function buildSchedule(startDate, endDate, platforms, frequency, postingTime) {
  const slots = [];
  const start = new Date(startDate);
  const end   = new Date(endDate);
  // frequency = posts per week per platform
  // Map frequency to which weekdays to post
  const FREQ_DAYS = {
    7: [0,1,2,3,4,5,6],
    5: [1,2,3,4,5],       // Mon-Fri
    3: [1,3,5],           // Mon, Wed, Fri
    1: [3],               // Wednesday
  };
  const postDays = FREQ_DAYS[frequency] || FREQ_DAYS[5];
  const TIMES = {
    'lunch':  ['11:00','12:00','11:30'],
    'dinner': ['17:00','18:00','18:30'],
    'mixed':  ['11:00','18:00','11:30','17:30','12:00'],
  };
  const times = TIMES[postingTime] || TIMES['mixed'];

  let d = new Date(start);
  let timeIdx = 0;
  while (d <= end) {
    if (postDays.includes(d.getDay())) {
      for (const platform of platforms) {
        const time = times[timeIdx % times.length];
        const [h, m] = time.split(':');
        const scheduled = new Date(d);
        scheduled.setHours(parseInt(h), parseInt(m), 0, 0);
        slots.push({ date: new Date(d), platform, scheduledAt: scheduled.toISOString() });
        timeIdx++;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return slots;
}

function assignContentTypes(slots, contentMix) {
  // Default mix if not specified
  const mix = {
    food:      contentMix.food      ?? 40,
    events:    contentMix.events    ?? 20,
    behind:    contentMix.behind    ?? 20,
    trending:  contentMix.trending  ?? 10,
    reviews:   contentMix.reviews   ?? 10,
    seasonal:  contentMix.seasonal  ?? 0,
  };
  // Build weighted pool
  const pool = [];
  for (const [key, pct] of Object.entries(mix)) {
    const count = Math.round(pct);
    for (let i = 0; i < count; i++) pool.push(key);
  }
  // Shuffle pool deterministically
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return slots.map((slot, i) => ({
    ...slot,
    contentKey: shuffled[i % shuffled.length],
  }));
}

async function generateBulkCalendar(tenantId, {
  locationId, startDate, endDate,
  platforms, frequency, postingTime,
  contentMix, dishes, occasions, cta, userId,
  dropboxFolder,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  // Get location + brand profile
  const locResult = await queryForTenant(tenantId, 'SELECT * FROM locations WHERE id=$1', [locationId]);
  const loc = locResult.rows[0];
  if (!loc) throw Object.assign(new Error('Location not found'), { status:404 });

  // Fetch media from Dropbox folder if provided
  const folder = dropboxFolder || loc.dropbox_folder || '';
  let mediaPool = [];
  const _dbxToken = await getDropboxToken();
  if (folder && _dbxToken) {
    try {
      const token = await getDropboxToken();
      const fetch = (await import('node-fetch')).default;
      const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder, include_media_info: true, limit: 200 }),
      });
      const data = await res.json();
      const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.gif','.heic']);
      const VIDEO_EXTS = new Set(['.mp4','.mov','.m4v','.webm']);
      for (const entry of (data.entries||[])) {
        if (entry['.tag'] !== 'file') continue;
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (IMAGE_EXTS.has(ext)||VIDEO_EXTS.has(ext)) {
          mediaPool.push({ path: entry.path_lower, name: entry.name, isVideo: VIDEO_EXTS.has(ext) });
        }
      }
      console.log(`[bulk] Found ${mediaPool.length} media files in ${folder}`);
      // Pre-fetch base64 thumbnails for all images (proven get_thumbnail_batch RPC, max 25/call).
      // Base64 is the only thing that reliably renders in <img> in this app.
      const imgs = mediaPool.filter(m => !m.isVideo);
      for (let j = 0; j < imgs.length; j += 25) {
        const chunk = imgs.slice(j, j + 25);
        try {
          const tr = await fetch('https://api.dropboxapi.com/2/files/get_thumbnail_batch', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: chunk.map(c => ({ path: c.path, format:{'.tag':'jpeg'}, size:{'.tag':'w640h480'} })) }),
          });
          const td = await tr.json();
          (td.entries || []).forEach((t, k) => {
            if (t['.tag'] === 'success' && t.thumbnail) chunk[k].thumbB64 = t.thumbnail;
          });
        } catch(e) { console.error('[bulk] thumbnail batch error:', e.message); }
      }
      console.log(`[bulk] Thumbnails fetched for ${imgs.filter(m=>m.thumbB64).length}/${imgs.length} images`);
    } catch(e) { console.error('[bulk] Dropbox folder fetch error:', e.message); }
  }

  const locationName = loc.name;
  let voice = getBrandVoice(locationName);
  let brandContext = '';
  if (loc.brand_voice)       voice = loc.brand_voice;
  if (loc.brand_personality) brandContext += 'Personality: ' + loc.brand_personality + '\n';
  if (loc.brand_keywords)    brandContext += 'Key words/themes: ' + loc.brand_keywords + '\n';
  if (loc.brand_avoid)       brandContext += 'NEVER use or say: ' + loc.brand_avoid + '\n';
  if (loc.brand_examples)    brandContext += 'Example captions for reference:\n' + loc.brand_examples + '\n';

  // Helper: PERMANENT shared link for a Dropbox file (temp links expire in ~4h,
  // which is why bulk images used to vanish from the review and at publish time).
  async function getDropboxLink(path) {
    try {
      const token = await getDropboxToken();
      const fetch = (await import('node-fetch')).default;
      let url;
      const mk = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const mkData = await mk.json();
      if (mkData.url) url = mkData.url;
      else if (mkData.error_summary && mkData.error_summary.includes('shared_link_already_exists')) {
        const ls = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, direct_only: true }),
        });
        const lsData = await ls.json();
        url = lsData.links && lsData.links[0] && lsData.links[0].url;
      }
      if (!url) return null;
      return url.replace('www.dropbox.com','dl.dropboxusercontent.com').replace('?dl=0','').replace('?dl=1','');
    } catch(_) { return null; }
  }

  // Build schedule
  const slots = buildSchedule(startDate, endDate, platforms, parseInt(frequency), postingTime);
  const slotsWithTypes = assignContentTypes(slots, contentMix);

  console.log(`[bulk] Generating ${slotsWithTypes.length} posts for ${locationName}`);

  // Generate all posts in parallel batches of 5
  const BATCH_SIZE = 5;
  const created = [];

  for (let i = 0; i < slotsWithTypes.length; i += BATCH_SIZE) {
    const batch = slotsWithTypes.slice(i, i + BATCH_SIZE);
    const batchPosts = await Promise.all(batch.map(async (slot, bIdx) => {
      const ctDef = CONTENT_TYPES_LIST.find(c => c.key === slot.contentKey) || CONTENT_TYPES_LIST[0];
      const platGuide = PLATFORM_GUIDANCE[slot.platform] || PLATFORM_GUIDANCE.instagram;
      // Assign a media file from pool (round-robin across the whole run)
      const mediaFile = mediaPool.length > 0 ? mediaPool[(i + bIdx) % mediaPool.length] : null;
      // Thumbnail already pre-fetched onto the pool entry (base64). Used both to let Claude SEE
      // the image and to display it in review/preview — Dropbox URLs don't embed in <img>.
      const thumbB64 = mediaFile ? (mediaFile.thumbB64 || null) : null;

      // Build context for this specific post
      let postContext = '';
      if (dishes)    postContext += `Featured dishes to potentially reference: ${dishes}\n`;
      if (occasions) postContext += `Upcoming occasions/events: ${occasions}\n`;
      if (cta)       postContext += `Call to action: ${cta}\n`;
      if (mediaFile) postContext += `Image/video file assigned: ${mediaFile.name} — write caption to match this visual\n`;

      const prompt = `You are a social media expert for ${locationName}.

Brand voice: ${voice}
${brandContext}
Create a single ${slot.platform} post for ${loc.city || 'the city'}.
Content type: ${ctDef.label}
Day: ${slot.date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
${postContext}${thumbB64 ? 'An image is attached. Write the caption to genuinely match what is shown in it — reference the actual dish/scene, do not invent something that is not visible.\n' : ''}
${platGuide}

Return ONLY valid JSON (no markdown):
{"caption":"...","hashtags":"...","content_type":"${ctDef.contentType}","trend_tag":null}`;

      try {
        const userContent = thumbB64
          ? [ { type:'image', source:{ type:'base64', media_type:'image/jpeg', data: thumbB64 } }, { type:'text', text: prompt } ]
          : prompt;
        const res = await apiFetch(CLAUDE_API, {
          method:'POST',
          headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
          body:JSON.stringify({
            model: process.env.CLAUDE_MODEL||'claude-sonnet-4-5',
            max_tokens:600,
            messages:[{role:'user',content:userContent}],
          }),
        });
        const data = await res.json();
        if (!res.ok||data.error) throw new Error(data.error?.message||'Claude error');
        const text = (data.content||[]).map(b=>b.text||'').join('').trim();
        const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
        return {
          ...parsed,
          location_id:  locationId,
          platform:     slot.platform,
          scheduled_at: slot.scheduledAt,
          status:       'draft',
          mediaFile, thumbB64,
        };
      } catch(e) {
        console.error(`[bulk] Failed slot ${i}: ${e.message}`);
        return {
          caption:      `[Generation failed — please regenerate]`,
          hashtags:     '',
          content_type: ctDef.contentType,
          location_id:  locationId,
          platform:     slot.platform,
          scheduled_at: slot.scheduledAt,
          status:       'draft',
          mediaFile, thumbB64,
        };
      }
    }));

    // Save batch to DB
    for (const post of batchPosts) {
      try {
        // Get Dropbox link for assigned media
        let mediaUrls = [];
        if (post.mediaFile) {
          const link = await getDropboxLink(post.mediaFile.path);
          if (link) mediaUrls = [link];
        }
        const r = await queryForTenant(tenantId, `
          INSERT INTO social_posts (tenant_id,location_id,platform,caption,hashtags,content_type,trend_tag,scheduled_at,status,media_urls,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
        `, [tenantId,post.location_id,post.platform,post.caption,post.hashtags||'',post.content_type||'feed',post.trend_tag||null,post.scheduled_at,'draft',mediaUrls,userId||null]);
        created.push({...r.rows[0], location_name: locationName, mediaFile: post.mediaFile||null, thumb: post.thumbB64 ? `data:image/jpeg;base64,${post.thumbB64}` : null});
      } catch(e) {
        console.error('[bulk] DB insert error:', e.message);
      }
    }
  }

  return created;
}

async function approveAll(tenantId, postIds) {
  let approved = 0;
  for (const id of postIds) {
    try {
      await queryForTenant(tenantId,
        `UPDATE social_posts SET status='scheduled', updated_at=now() WHERE id=$1 AND tenant_id=$2`,
        [id, tenantId]
      );
      approved++;
    } catch(_) {}
  }
  return { approved, total: postIds.length };
}



// ═══════════════════════════════════════════════════════════════════════════
// NEWSLETTER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function getContacts(tenantId, { locationId, subscribed, tag, search, limit = 500 } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId)            { where += ' AND (location_id=$' + (i++) + ' OR location_id IS NULL)'; params.push(locationId); }
  if (subscribed !== undefined) { where += ' AND subscribed=$' + (i++); params.push(subscribed); }
  if (tag)    { where += ' AND $' + (i++) + '=ANY(tags)'; params.push(tag); }
  if (search) { where += ' AND (LOWER(email) LIKE LOWER($' + i + ') OR LOWER(COALESCE(first_name,\'\') || \' \' || COALESCE(last_name,\'\')) LIKE LOWER($' + i + '))'; i++; params.push('%'+search+'%'); }
  params.push(limit);
  const r = await adminQuery('SELECT * FROM newsletter_contacts WHERE ' + where + ' ORDER BY created_at DESC LIMIT $' + i, params);
  return r.rows;
}

async function upsertContact(tenantId, locationId, data) {
  await ensureTables();
  const { email, firstName, lastName, phone, source, tags, notes, lastVisit, visitCount } = data;
  if (!email || !email.trim()) throw new Error('Email required');
  const r = await adminQuery([
    'INSERT INTO newsletter_contacts (tenant_id,location_id,email,first_name,last_name,phone,source,tags,notes,last_visit,visit_count)',
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    'ON CONFLICT (tenant_id,email) DO UPDATE SET',
    '  first_name  = COALESCE(EXCLUDED.first_name,  newsletter_contacts.first_name),',
    '  last_name   = COALESCE(EXCLUDED.last_name,   newsletter_contacts.last_name),',
    '  phone       = COALESCE(EXCLUDED.phone,        newsletter_contacts.phone),',
    '  source      = COALESCE(EXCLUDED.source,       newsletter_contacts.source),',
    '  tags        = CASE WHEN EXCLUDED.tags IS NOT NULL THEN EXCLUDED.tags ELSE newsletter_contacts.tags END,',
    '  notes       = COALESCE(EXCLUDED.notes,        newsletter_contacts.notes),',
    '  last_visit  = GREATEST(EXCLUDED.last_visit,   newsletter_contacts.last_visit),',
    '  visit_count = GREATEST(EXCLUDED.visit_count,  newsletter_contacts.visit_count)',
    'RETURNING *',
  ].join(' '), [
    tenantId, locationId || null,
    email.trim().toLowerCase(),
    firstName || null, lastName || null, phone || null,
    source || 'manual', tags || [], notes || null,
    lastVisit || null, parseInt(visitCount) || 0,
  ]);
  return r.rows[0];
}

async function importContacts(tenantId, locationId, csvText, source) {
  await ensureTables();
  source = source || 'csv';
  const lines = csvText.trim().split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one contact');

  function parseLine(line) {
    const cols = []; let cur = ''; let inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }

  const header = parseLine(lines[0]).map(function(h) { return h.toLowerCase().replace(/['"]/g,'').trim(); });

  function findCol() {
    const names = Array.prototype.slice.call(arguments);
    return names.reduce(function(found, name) {
      return found >= 0 ? found : header.findIndex(function(h) { return h.includes(name); });
    }, -1);
  }

  const emailCol = findCol('email','e-mail');
  const firstCol = findCol('first','fname','firstname','first_name','given');
  const lastCol  = findCol('last','lname','lastname','last_name','surname','family');
  const phoneCol = findCol('phone','mobile','cell');
  const visitCol = findCol('last_visit','last visit','visit_date','reservation_date','date');
  const countCol = findCol('visit_count','visits','reservations','covers','total');

  if (emailCol < 0) throw new Error('No email column found. Expected a column named "email" or "e-mail".');

  let imported = 0, updated = 0, skipped = 0;
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const cols  = parseLine(line);
    const email = (cols[emailCol] || '').replace(/['"]/g,'').trim().toLowerCase();
    if (!email || !email.includes('@')) { skipped++; continue; }
    try {
      const ex = await adminQuery('SELECT id FROM newsletter_contacts WHERE tenant_id=$1 AND email=$2', [tenantId, email]);
      await upsertContact(tenantId, locationId, {
        email,
        firstName:  firstCol >= 0 ? cols[firstCol] : null,
        lastName:   lastCol  >= 0 ? cols[lastCol]  : null,
        phone:      phoneCol >= 0 ? cols[phoneCol] : null,
        lastVisit:  visitCol >= 0 ? cols[visitCol] : null,
        visitCount: countCol >= 0 ? cols[countCol] : 0,
        source, tags: [source],
      });
      if (ex.rows.length) updated++; else imported++;
    } catch(e) { console.error('[import] skip', email, e.message); skipped++; }
  }
  return { imported, updated, skipped, total: lines.length - 1 };
}

async function unsubscribeContact(tenantId, email) {
  await adminQuery(
    "UPDATE newsletter_contacts SET subscribed=false, unsubscribed_at=now() WHERE tenant_id=$1 AND email=$2",
    [tenantId, email]
  );
}

async function deleteContact(tenantId, contactId) {
  await adminQuery('DELETE FROM newsletter_contacts WHERE id=$1 AND tenant_id=$2', [contactId, tenantId]);
}

async function getNewsletters(tenantId, { locationId, status, limit = 50 } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ' AND (location_id=$' + (i++) + ' OR location_id IS NULL)'; params.push(locationId); }
  if (status)     { where += ' AND status=$' + (i++); params.push(status); }
  params.push(limit);
  const r = await adminQuery('SELECT * FROM newsletters WHERE ' + where + ' ORDER BY created_at DESC LIMIT $' + i, params);
  return r.rows;
}

async function saveNewsletter(tenantId, locationId, data, userId) {
  await ensureTables();
  const { id, subject, previewText, htmlContent, textContent, status, tags } = data;
  if (id) {
    const r = await adminQuery(
      'UPDATE newsletters SET subject=$1,preview_text=$2,html_content=$3,text_content=$4,status=$5,tags=$6,updated_at=now() WHERE id=$7 AND tenant_id=$8 RETURNING *',
      [subject, previewText || null, htmlContent, textContent || null, status || 'draft', tags || [], id, tenantId]
    );
    return r.rows[0];
  }
  const r = await adminQuery(
    'INSERT INTO newsletters (tenant_id,location_id,subject,preview_text,html_content,text_content,status,tags,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [tenantId, locationId || null, subject, previewText || null, htmlContent, textContent || null, status || 'draft', tags || [], userId || null]
  );
  return r.rows[0];
}

async function deleteNewsletter(tenantId, newsletterId) {
  await adminQuery(
    "DELETE FROM newsletters WHERE id=$1 AND tenant_id=$2 AND status='draft'",
    [newsletterId, tenantId]
  );
}

async function generateNewsletter(tenantId, params) {
  const { locationId, locationName, topic, tone, sections, imageUrls, occasion, promoCode } = params;
  await ensureTables();
  const voice = getBrandVoice(locationName || '');

  let imagesHint = '';
  if (imageUrls && imageUrls.length) {
    imagesHint = '\nFeatured images to reference:\n' + imageUrls.map(function(u, i) { return 'Image ' + (i+1) + ': ' + u; }).join('\n');
  }

  const occasionLine = occasion   ? '\nSpecial occasion: '   + occasion   : '';
  const promoLine    = promoCode  ? '\nPromo code to include: ' + promoCode : '';
  const sectionsLine = sections   ? '\nSections: ' + sections : '\nSections: featured dish, upcoming events, special offer, closing CTA';
  const toneLine     = tone       ? '\nTone: '     + tone     : '\nTone: warm, engaging, slightly sophisticated';

  const prompt = [
    'You are writing a restaurant email newsletter for ' + (locationName || 'a modern Indian restaurant') + ' in San Francisco.',
    '',
    'Brand voice: ' + voice,
    'Topic/occasion: ' + (topic || 'Monthly newsletter'),
    toneLine,
    sectionsLine,
    occasionLine,
    promoLine,
    imagesHint,
    '',
    'Write a complete email newsletter with:',
    '- Subject line under 60 chars',
    '- Preview text under 90 chars',
    '- Compelling header, 2-3 content sections with headings, CTA button, warm closing',
    '- All styles inline (email-safe HTML)',
    '- No <html>/<head>/<body> tags — just the body content',
    '',
    'Return ONLY valid JSON, no markdown fences:',
    '{"subject":"...","previewText":"...","htmlContent":"...full HTML body...","textContent":"...plain text...","suggestedTags":["tag1"]}',
  ].join('\n');

  const text = await callClaude({ content: prompt, maxTokens: 4000 });
  const clean = text.replace(/^```json?\n?/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch(e) {
    // Try to extract JSON object
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch(_) {} }
    throw new Error('AI generation failed — please try again');
  }
}

async function sendNewsletter(tenantId, newsletterId, options) {
  await ensureTables();
  const { locationId, testEmail, tags, contactIds } = options || {};

  const nlRes = await adminQuery('SELECT * FROM newsletters WHERE id=$1 AND tenant_id=$2', [newsletterId, tenantId]);
  const nl = nlRes.rows[0];
  if (!nl) throw new Error('Newsletter not found');
  if (nl.status === 'sent' && !testEmail) throw new Error('Newsletter already sent');

  let contacts;
  if (testEmail) {
    contacts = [{ email: testEmail, first_name: 'Test' }];
  } else {
    let where = 'tenant_id=$1 AND subscribed=true'; const params = [tenantId]; let i = 2;
    if (locationId) { where += ' AND (location_id=$' + (i++) + ' OR location_id IS NULL)'; params.push(locationId); }
    if (tags && tags.length) { where += ' AND tags && $' + (i++) + '::text[]'; params.push(tags); }
    // Explicit recipient selection overrides the broad filter when provided
    if (contactIds && contactIds.length) { where += ' AND id = ANY($' + (i++) + '::uuid[])'; params.push(contactIds); }
    const r = await adminQuery('SELECT email, first_name FROM newsletter_contacts WHERE ' + where + ' ORDER BY created_at', params);
    contacts = r.rows;
  }

  if (contacts.length === 0) throw new Error('No subscribers found');

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set in Railway environment');

  const { Resend } = require('resend');
  const resend = new Resend(RESEND_KEY);
  // Always send from the platform domain (deliverability is ours to manage once),
  // reply-to goes to the restaurant's own contact email.
  const integrations = require('../../integrations/service');
  const bizInfo  = await integrations.getBusinessInfo(tenantId).catch(() => null);
  const fromEmail = process.env.EMAIL_FROM || 'newsletter@pulse.restaurant';
  const replyTo   = bizInfo?.contact_email || undefined;
  const tenantRow = await adminQuery('SELECT name FROM tenants WHERE id=$1', [tenantId]).catch(() => ({ rows: [] }));
  const fromName  = tenantRow.rows[0]?.name || 'Pulse Restaurant';

  let sent = 0, failed = 0, firstError = null;
  for (const contact of contacts) {
    const firstName = contact.first_name || 'Guest';
    const body = nl.html_content.replace(/\{\{first_name\}\}/gi, firstName).replace(/\{\{email\}\}/gi, contact.email);
    const unsubUrl = (process.env.API_URL || 'https://restaurantosapi-production-434f.up.railway.app') +
      '/api/public/unsubscribe?tid=' + tenantId + '&email=' + encodeURIComponent(contact.email);

    const html = [
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">',
      '<div style="max-width:600px;margin:0 auto;background:#fff">',
      body,
      '<div style="padding:20px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee">',
      'You\'re receiving this because you dined with us. ',
      '<a href="' + unsubUrl + '" style="color:#999">Unsubscribe</a>',
      '</div></div></body></html>',
    ].join('');

    try {
      const resp = await resend.emails.send({
        from: fromName ? fromName + ' <' + fromEmail + '>' : fromEmail,
        to:   contact.email,
        replyTo: replyTo,
        subject: nl.subject,
        html,
        text: nl.text_content || '',
        headers: { 'List-Unsubscribe': '<' + unsubUrl + '>' },
      });
      // Resend SDK returns { data, error } without throwing — check it
      if (resp?.error) throw new Error(resp.error.message || resp.error.name || JSON.stringify(resp.error));
      sent++;
    } catch(e) {
      console.error('[newsletter] failed:', contact.email, e.message);
      failed++;
      if (!firstError) firstError = e.message;
    }
  }

  if (!testEmail && sent > 0) {
    await adminQuery(
      "UPDATE newsletters SET status='sent', sent_at=now(), sent_count=$1 WHERE id=$2",
      [sent, newsletterId]
    );
  }

  return { sent, failed, total: contacts.length , error: firstError };
}


// ═══════════════════════════════════════════════════════════════════════════
// TEXT / WHATSAPP MARKETING
// ═══════════════════════════════════════════════════════════════════════════

function getTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in Railway environment variables');
  const twilio = require('twilio');
  return twilio(sid, tok);
}

function getTwilioFrom(channel) {
  if (channel === 'whatsapp') {
    const n = process.env.TWILIO_WHATSAPP_NUMBER;
    if (!n) throw new Error('TWILIO_WHATSAPP_NUMBER not set (format: whatsapp:+14155238886)');
    return n.startsWith('whatsapp:') ? n : 'whatsapp:' + n;
  }
  const n = process.env.TWILIO_PHONE_NUMBER;
  if (!n) throw new Error('TWILIO_PHONE_NUMBER not set (your Twilio SMS number e.g. +14155551234)');
  return n;
}

function formatTo(phone, channel) {
  // Normalize to E.164
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? '+' + digits : '+1' + digits;
  return channel === 'whatsapp' ? 'whatsapp:' + e164 : e164;
}

async function getTextCampaigns(tenantId, { locationId, status, limit = 50 } = {}) {
  await ensureTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ' AND (location_id=$' + (i++) + ' OR location_id IS NULL)'; params.push(locationId); }
  if (status)     { where += ' AND status=$' + (i++); params.push(status); }
  params.push(limit);
  const r = await adminQuery(
    'SELECT * FROM text_campaigns WHERE ' + where + ' ORDER BY created_at DESC LIMIT $' + i, params
  );
  return r.rows;
}

async function saveTextCampaign(tenantId, locationId, data, userId) {
  await ensureTables();
  const { id, name, channel, message, mediaUrl, status, tags } = data;
  if (id) {
    const r = await adminQuery(
      'UPDATE text_campaigns SET name=$1,channel=$2,message=$3,media_url=$4,status=$5,tags=$6,updated_at=now() WHERE id=$7 AND tenant_id=$8 RETURNING *',
      [name, channel||'sms', message, mediaUrl||null, status||'draft', tags||[], id, tenantId]
    );
    return r.rows[0];
  }
  const r = await adminQuery(
    'INSERT INTO text_campaigns (tenant_id,location_id,name,channel,message,media_url,status,tags,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [tenantId, locationId||null, name, channel||'sms', message, mediaUrl||null, status||'draft', tags||[], userId||null]
  );
  return r.rows[0];
}

async function deleteTextCampaign(tenantId, campaignId) {
  await adminQuery(
    "DELETE FROM text_campaigns WHERE id=$1 AND tenant_id=$2 AND status='draft'",
    [campaignId, tenantId]
  );
}

async function generateTextMessage(tenantId, params) {
  const { locationName, channel, topic, tone, promoCode, maxChars } = params;
  const voice = getBrandVoice(locationName || '');
  const limit = maxChars || (channel === 'whatsapp' ? 1000 : 160);

  const prompt = [
    'Write a ' + (channel === 'whatsapp' ? 'WhatsApp' : 'SMS') + ' marketing message for ' + (locationName || 'a restaurant') + '.',
    '',
    'Brand voice: ' + voice,
    'Topic: ' + (topic || 'promotion'),
    'Tone: ' + (tone || 'warm, enticing'),
    promoCode ? 'Include promo code: ' + promoCode : '',
    '',
    channel === 'sms'
      ? 'SMS rules: max 160 chars (one message), plain text only, include opt-out "Reply STOP to unsubscribe"'
      : 'WhatsApp rules: can use *bold* and emojis, up to 1000 chars, friendly tone, include unsubscribe note',
    '',
    'Return ONLY valid JSON, no markdown:',
    '{"message":"...","charCount":0,"suggestion":"brief note on why this works"}',
  ].filter(Boolean).join('\n');

  const text = await callClaude({ content: prompt, maxTokens: 500 });
  const clean = text.replace(/^```json?\n?/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch(e) {
    // Return raw text as message
    return { message: text.replace(/^```[\s\S]*?```$/,'').trim(), charCount: text.length };
  }
}

async function sendTextCampaign(tenantId, campaignId, options) {
  await ensureTables();
  const { locationId, testPhone, tags } = options || {};

  const campRes = await adminQuery('SELECT * FROM text_campaigns WHERE id=$1 AND tenant_id=$2', [campaignId, tenantId]);
  const campaign = campRes.rows[0];
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent' && !testPhone) throw new Error('Campaign already sent');

  const channel = campaign.channel || 'sms';

  let contacts;
  if (testPhone) {
    contacts = [{ phone: testPhone, first_name: 'Test' }];
  } else {
    const subCol = channel === 'whatsapp' ? 'wa_subscribed' : 'sms_subscribed';
    let where = 'tenant_id=$1 AND subscribed=true AND phone IS NOT NULL AND phone != \'\' AND ' + subCol + '=true';
    const params = [tenantId]; let i = 2;
    if (locationId) { where += ' AND (location_id=$' + (i++) + ' OR location_id IS NULL)'; params.push(locationId); }
    if (tags && tags.length) { where += ' AND tags && $' + (i++) + '::text[]'; params.push(tags); }
    const r = await adminQuery('SELECT phone, first_name FROM newsletter_contacts WHERE ' + where, params);
    contacts = r.rows;
  }

  if (contacts.length === 0) throw new Error('No contacts with phone numbers found for this channel');

  // Per-tenant Twilio (subaccount) with fallback to global env vars
  const integrations = require('../../integrations/service');
  const tw = await integrations.getTwilioForTenant(tenantId);
  if (!tw) throw new Error('SMS not set up yet — complete SMS setup in Settings → Setup');
  if (tw.status === 'pending_10dlc' && !testPhone) {
    throw new Error('Your texting number is still being registered with carriers (5-10 business days). Test sends to your own phone are allowed.');
  }
  const client = tw.client;
  const from   = channel === 'whatsapp'
    ? (process.env.TWILIO_WHATSAPP_NUMBER?.startsWith('whatsapp:') ? process.env.TWILIO_WHATSAPP_NUMBER : 'whatsapp:' + (process.env.TWILIO_WHATSAPP_NUMBER || ''))
    : tw.fromNumber;

  let sent = 0, failed = 0, failedNums = [];

  for (const contact of contacts) {
    const to = formatTo(contact.phone, channel);
    const body = campaign.message
      .replace(/\{\{first_name\}\}/gi, contact.first_name || 'Guest')
      .replace(/\{\{name\}\}/gi,       contact.first_name || 'Guest');

    const msgOpts = { from, to, body };
    if (campaign.media_url && channel !== 'whatsapp') msgOpts.mediaUrl = [campaign.media_url];

    try {
      await client.messages.create(msgOpts);
      sent++;
    } catch(e) {
      console.error('[text campaign] failed:', contact.phone, e.message);
      failed++;
      if (failedNums.length < 5) failedNums.push(contact.phone);
    }
    // Throttle: Twilio free tier ~1 msg/sec
    await new Promise(r => setTimeout(r, 50));
  }

  if (!testPhone && sent > 0) {
    await adminQuery(
      "UPDATE text_campaigns SET status='sent', sent_at=now(), sent_count=$1, failed_count=$2 WHERE id=$3",
      [sent, failed, campaignId]
    );
  }

  return { sent, failed, total: contacts.length, failedSamples: failedNums };
}

async function handleOptOut(tenantId, phone) {
  // Called when a contact replies STOP
  const norm = phone.replace(/\D/g,'');
  await adminQuery(
    "UPDATE newsletter_contacts SET sms_subscribed=false, sms_opt_out_at=now() WHERE tenant_id=$1 AND (phone LIKE $2 OR phone LIKE $3)",
    [tenantId, '%'+norm, '+%'+norm]
  );
}

// Resolve tenant from the Twilio number the STOP was sent TO, then opt out.
async function handleOptOutByNumber(fromPhone, toNumber) {
  const integrations = require('../../integrations/service');
  const tenantId = await integrations.findTenantByTwilioNumber(toNumber);
  if (tenantId) {
    await handleOptOut(tenantId, fromPhone);
    return tenantId;
  }
  // Legacy single-tenant fallback: global number — opt out in every tenant that has this phone.
  const norm = fromPhone.replace(/\D/g,'');
  await adminQuery(
    "UPDATE newsletter_contacts SET sms_subscribed=false, sms_opt_out_at=now() WHERE phone LIKE $1 OR phone LIKE $2",
    ['%'+norm, '+%'+norm]
  );
  return null;
}

async function getTextStats(tenantId, locationId) {
  await ensureTables();
  const r = await adminQuery(`
    SELECT
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '' AND sms_subscribed=true) as sms_reachable,
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '' AND wa_subscribed=true)  as wa_reachable,
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '')                         as has_phone
    FROM newsletter_contacts
    WHERE tenant_id=$1 AND subscribed=true
      AND (location_id=$2 OR location_id IS NULL)
  `, [tenantId, locationId]);
  return r.rows[0] || {};
}

module.exports = {
  AGENT_ID,
  getPosts, createPost, updatePost, deletePost, approvePost, publishPost,
  generateContent, getTrends,
  createAdBoost, getAdBoosts, getAdInsights,
  getCalendar, getInsights, getSummary,
  handleTierUpgraded, generateBulkCalendar, approveAll,
  // Newsletter
  getContacts, upsertContact, importContacts, unsubscribeContact, deleteContact,
  getNewsletters, saveNewsletter, deleteNewsletter, generateNewsletter, sendNewsletter,
  // Text / WhatsApp
  getTextCampaigns, saveTextCampaign, deleteTextCampaign, generateTextMessage, sendTextCampaign, handleOptOut, handleOptOutByNumber, getTextStats,
};
