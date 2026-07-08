const { queryForTenant } = require('@restaurantos/db');
const { eventBus }       = require('../../lib/eventBus');

const AGENT_ID   = 'agent_4_reviews';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const GBP_BASE   = 'https://mybusiness.googleapis.com/v4';

async function apiFetch(url, opts={}) {
  const fetch = (await import('node-fetch')).default;
  return fetch(url, opts);
}

async function getReviews(tenantId, { locationId, locationIds, status, platform, rating, limit=50, offset=0 }) {
  let where = ['r.tenant_id = $1'];
  const params = [tenantId]; let i = 2;
  if (locationId) { where.push(`r.location_id = $${i++}`); params.push(locationId); }
  else if (locationIds?.length) { where.push(`r.location_id = ANY($${i++}::uuid[])`); params.push(locationIds); }
  if (status) {
    const statuses = String(status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) { where.push(`r.status = $${i++}`); params.push(statuses[0]); }
    else { where.push(`r.status::text = ANY($${i++}::text[])`); params.push(statuses); }
  }
  if (platform) { where.push(`r.platform = $${i++}`); params.push(platform); }
  if (rating)   { where.push(`r.rating = $${i++}`);   params.push(rating); }
  params.push(limit, offset);
  const result = await queryForTenant(tenantId, `
    SELECT r.*, l.name as location_name FROM reviews r
    JOIN locations l ON l.id = r.location_id
    WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN r.urgent=true AND r.status='pending' THEN 0 ELSE 1 END, r.review_date DESC
    LIMIT $${i} OFFSET $${i+1}`, params);
  return result.rows;
}

async function getReviewById(tenantId, id) {
  const r = await queryForTenant(tenantId,
    'SELECT r.*, l.name as location_name FROM reviews r JOIN locations l ON l.id=r.location_id WHERE r.tenant_id=$1 AND r.id=$2',
    [tenantId, id]);
  return r.rows[0] || null;
}

async function upsertReview(tenantId, d) {
  const r = await queryForTenant(tenantId, `
    INSERT INTO reviews (tenant_id,location_id,platform,external_id,external_name,reviewer,reviewer_avatar_url,rating,text,review_date,status,sentiment,sentiment_score,urgent,employee_mentions,response_posted,response_posted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (location_id,platform,external_id) DO UPDATE SET
      text=EXCLUDED.text, updated_at=now()
    RETURNING *`,
    [tenantId,d.locationId,d.platform,d.externalId,d.externalName||'',d.reviewer,d.reviewerAvatarUrl||null,
     d.rating,d.text,d.reviewDate,d.status||'pending',d.sentiment||'neutral',d.sentimentScore||50,
     d.urgent||false,JSON.stringify(d.employeeMentions||[]),d.response||null,d.responsePostedAt||null]);
  return r.rows[0];
}

async function saveDraft(tenantId, id, draft) {
  const r = await queryForTenant(tenantId,
    "UPDATE reviews SET response_draft=$1,status='draft',updated_at=now() WHERE tenant_id=$2 AND id=$3 RETURNING *",
    [draft,tenantId,id]);
  return r.rows[0];
}

async function dismissReview(tenantId, id) {
  await queryForTenant(tenantId,
    "UPDATE reviews SET status='dismissed',updated_at=now() WHERE tenant_id=$1 AND id=$2",
    [tenantId,id]);
}

async function fetchFromPlatforms(tenantId, locationId, userId) {
  const loc = (await queryForTenant(tenantId,'SELECT * FROM locations WHERE tenant_id=$1 AND id=$2',[tenantId,locationId])).rows[0];
  if (!loc) throw Object.assign(new Error('Location not found'),{status:404});
  const results = {google:0,yelp:0,opentable:0,errors:[]};
  const yelpMatched = await autoConfigurePlatformIds(tenantId, loc).catch(()=>null);
  if (yelpMatched) results.yelpMatched = yelpMatched;
  if (!loc.google_location_id) results.errors.push({platform:'google',error:'Connect Google Business Profile in Setup (or no GBP location matched "'+loc.name+'")'});
  if (!loc.yelp_business_id) results.errors.push({platform:'yelp',error:process.env.YELP_API_KEY?'No Yelp business matched — check the location address':'YELP_API_KEY not set in Railway'});
  if (loc.google_account_id && loc.google_location_id) {
    try { const t=await getGoogleToken(tenantId); if(t) results.google=await fetchGoogleReviews(tenantId,locationId,loc,t); }
    catch(e) { results.errors.push({platform:'google',error:e.message}); }
  }
  if (loc.yelp_business_id && process.env.YELP_API_KEY) {
    try { results.yelp=await fetchYelpReviews(tenantId,locationId,loc); }
    catch(e) { results.errors.push({platform:'yelp',error:e.message}); }
  }
  await eventBus.publish({eventType:'review.posted',tenantId,locationId,sourceAgent:AGENT_ID,payload:{newReviews:results.google+results.yelp,locationId}});
  return results;
}

async function fetchGoogleReviews(tenantId,locationId,loc,token) {
  const res = await apiFetch(`${GBP_BASE}/accounts/${loc.google_account_id}/locations/${loc.google_location_id}/reviews?pageSize=50&orderBy=updateTime desc`,{headers:{Authorization:`Bearer ${token}`}});
  if(!res.ok){const e=await res.json();throw new Error(e.error?.message||`HTTP ${res.status}`);}
  const data = await res.json();
  let count=0;
  for(const r of (data.reviews||[])) {
    const rating={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5}[r.starRating]||3;
    await upsertReview(tenantId,{locationId,platform:'google',externalId:r.reviewId,externalName:r.name,reviewer:r.reviewer?.displayName||'Google reviewer',reviewerAvatarUrl:r.reviewer?.profilePhotoUrl,rating,text:r.comment||'',reviewDate:r.createTime,status:r.reviewReply?'responded':'pending',sentiment:rating>=4?'positive':rating<=2?'negative':'neutral',sentimentScore:rating*20,urgent:rating===1,employeeMentions:extractEmployeeMentions(r.comment||''),response:r.reviewReply?.comment||null,responsePostedAt:r.reviewReply?.updateTime||null});
    count++;
  }
  return count;
}

async function fetchYelpReviews(tenantId,locationId,loc) {
  const res = await apiFetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(loc.yelp_business_id)}/reviews?limit=20`,{headers:{Authorization:`Bearer ${process.env.YELP_API_KEY}`}});
  if(!res.ok) throw new Error(`Yelp HTTP ${res.status}`);
  const data = await res.json(); let count=0;
  for(const r of (data.reviews||[])) {
    await upsertReview(tenantId,{locationId,platform:'yelp',externalId:r.id,reviewer:r.user?.name||'Yelp user',rating:r.rating,text:r.text,reviewDate:r.time_created,status:'pending',sentiment:r.rating>=4?'positive':r.rating<=2?'negative':'neutral',sentimentScore:r.rating*20,urgent:r.rating===1,employeeMentions:extractEmployeeMentions(r.text)});
    count++;
  }
  return count;
}

async function generateDraft(tenantId,reviewId) {
  const review = await getReviewById(tenantId,reviewId);
  if(!review) throw Object.assign(new Error('Review not found'),{status:404});
  await queryForTenant(tenantId,"UPDATE reviews SET status='generating',updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,reviewId]);
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if(!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const isCrit=review.rating===1,isNeg=review.rating<=2;
    const empCtx=review.employee_mentions?.length?`Mentioned staff: ${review.employee_mentions.map(e=>`${e.name} (${e.sentiment})`).join(', ')}.`:'';
    const prompt = `Write a response under 80 words to this ${review.rating}-star ${review.platform} review for "${review.location_name||'our restaurant'}".
Reviewer: ${review.reviewer.split(' ')[0]}
Review: "${review.text}"
${empCtx}
${isCrit?'CRITICAL: Apologize sincerely, acknowledge issue, invite them to contact management. Never defensive. Never offer discounts.':''}
${isNeg&&!isCrit?'Acknowledge concerns, apologize, show commitment.':''}
${!isNeg?'Express genuine specific gratitude. Reference something from their review.':''}
Sign as "The ${review.location_name||'Team'}". No emojis. Human tone. ONLY the response text.`;
    const r = await apiFetch(CLAUDE_API,{method:'POST',headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:process.env.CLAUDE_MODEL||'claude-sonnet-4-5',max_tokens:300,messages:[{role:'user',content:prompt}]})});
    const data = await r.json();
    if(!r.ok||data.error) throw new Error(data.error?.message||'Claude error');
    const draft = data.content?.map(b=>b.text||'').join('').trim();
    await saveDraft(tenantId,reviewId,draft);
    return draft;
  } catch(e) {
    // Don't strand the review in 'generating' — put it back where it was
    await queryForTenant(tenantId,"UPDATE reviews SET status=$1,updated_at=now() WHERE tenant_id=$2 AND id=$3",[review.status||'pending',tenantId,reviewId]).catch(()=>{});
    throw e;
  }
}

async function generateBatch(tenantId,locationId) {
  const pending = await getReviews(tenantId,{locationId,locationIds:[],status:'pending,generating',limit:10,offset:0});
  const needsDraft = pending.filter(r=>!r.response_draft);
  const results=[];
  for(const r of needsDraft) {
    try { results.push({reviewId:r.id,ok:true,draft:await generateDraft(tenantId,r.id)}); }
    catch(e) { results.push({reviewId:r.id,ok:false,error:e.message}); }
    await new Promise(res=>setTimeout(res,300));
  }
  return results;
}

async function postResponse(tenantId,reviewId,userId) {
  const review = await getReviewById(tenantId,reviewId);
  if(!review) throw Object.assign(new Error('Review not found'),{status:404});
  if(!review.response_draft) throw Object.assign(new Error('No draft to post'),{status:400});
  let posted=false, platformError=null;
  if(review.platform==='google'&&review.external_name) {
    try {
      const token=await getGoogleToken(tenantId);
      if(token){
        const res=await apiFetch(`${GBP_BASE}/${review.external_name}/reply`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({comment:review.response_draft})});
        if(!res.ok){const e=await res.json();throw new Error(e.error?.message||`HTTP ${res.status}`);}
        posted=true;
      }
    } catch(e){platformError=e.message;}
  }
  await queryForTenant(tenantId,"UPDATE reviews SET status='responded',response_posted=$1,response_posted_at=now(),updated_at=now() WHERE tenant_id=$2 AND id=$3",[review.response_draft,tenantId,reviewId]);
  return {responded:true,postedToPlatform:posted,platformError};
}

async function getAnalytics(tenantId,locationId,days=30) {
  const since=new Date(Date.now()-days*86400000).toISOString();
  let where='tenant_id=$1'; const params=[tenantId]; let i=2;
  if(locationId){where+=` AND location_id=$${i++}`;params.push(locationId);}
  params.push(since);
  const [counts,byPlatform,byRating] = await Promise.all([
    queryForTenant(tenantId,`SELECT COUNT(*)FILTER(WHERE status IN('pending','draft','generating'))as pending,COUNT(*)FILTER(WHERE status='responded')as responded,COUNT(*)as total,ROUND(AVG(rating),1)as avg_rating,COUNT(*)FILTER(WHERE urgent=true AND status IN('pending','draft','generating'))as urgent FROM reviews WHERE ${where} AND review_date>=$${i}`,params),
    queryForTenant(tenantId,`SELECT platform,COUNT(*)as count,ROUND(AVG(rating),1)as avg_rating FROM reviews WHERE ${where} AND review_date>=$${i} GROUP BY platform`,params),
    queryForTenant(tenantId,`SELECT rating,COUNT(*)as count FROM reviews WHERE ${where} AND review_date>=$${i} GROUP BY rating ORDER BY rating DESC`,params),
  ]);
  return {summary:counts.rows[0],byPlatform:byPlatform.rows,byRating:byRating.rows,days};
}

async function getSummary(tenantId,locationIds) {
  const params=[tenantId];
  const locFilter=locationIds?.length?`AND location_id=ANY($2::uuid[])`:'';
  if(locationIds?.length) params.push(locationIds);
  const r=await queryForTenant(tenantId,`SELECT COUNT(*)FILTER(WHERE status IN('pending','draft','generating'))as pending,COUNT(*)as total,ROUND(AVG(rating),1)as avg_rating,COUNT(*)FILTER(WHERE urgent=true AND status IN('pending','draft','generating'))as urgent,COUNT(*)FILTER(WHERE status='responded')as responded FROM reviews WHERE tenant_id=$1 ${locFilter}`,params);
  return {...r.rows[0],agent:AGENT_ID};
}

async function getEmployeeScores(tenantId,locationId) {
  let where='r.tenant_id=$1'; const params=[tenantId];
  if(locationId){where+=' AND r.location_id=$2';params.push(locationId);}
  const r=await queryForTenant(tenantId,`SELECT mention->>'name' as employee_name,COUNT(*)as mention_count,COUNT(*)FILTER(WHERE mention->>'sentiment'='positive')as positive_mentions,COUNT(*)FILTER(WHERE mention->>'sentiment'='negative')as negative_mentions,ROUND(COUNT(*)FILTER(WHERE mention->>'sentiment'='positive')::numeric/NULLIF(COUNT(*),0)*100,0)as sentiment_score FROM reviews r,LATERAL jsonb_array_elements(r.employee_mentions)as mention WHERE ${where} AND review_date>now()-interval '90 days' GROUP BY mention->>'name' ORDER BY mention_count DESC`,params);
  const emp=await queryForTenant(tenantId,`SELECT id,name,role FROM employees WHERE tenant_id=$1${locationId?' AND location_id=$2':''} AND active=true`,locationId?[tenantId,locationId]:[tenantId]);
  return r.rows.map(row=>({...row,employeeId:emp.rows.find(e=>e.name.toLowerCase().includes(row.employee_name.toLowerCase()))?.id||null,trend:row.sentiment_score>=75?'up':row.sentiment_score>=50?'stable':'down'}));
}

function extractEmployeeMentions(text) {
  const names=['Marco','James','Lisa','Maria','David','Sarah','Carlos','Tom','Elena','Kevin','Jessica','Michael','Anna','John','Emma'];
  return names.filter(n=>text.includes(n)).map(n=>{
    const ctx=text.slice(Math.max(0,text.indexOf(n)-40),text.indexOf(n)+60).toLowerCase();
    const pos=['great','amazing','wonderful','excellent','fantastic','helpful','attentive','friendly'].filter(w=>ctx.includes(w)).length;
    const neg=['rude','slow','ignored','unhelpful','terrible','bad','awful'].filter(w=>ctx.includes(w)).length;
    return {name:n,sentiment:pos>neg?'positive':neg>pos?'negative':'neutral'};
  });
}

async function getGoogleToken(tenantId) {
  try {
    const social = require('../../social/service');
    const { token } = await social.googleAccessToken(tenantId);
    return token || null;
  } catch (e) { return process.env.GOOGLE_ACCESS_TOKEN || null; }
}

// ── Auto-configuration: discover platform IDs so Sync works with zero setup ───
let _colsReady = false;
async function ensurePlatformColumns() {
  if (_colsReady) return;
  const { adminQuery } = require('@restaurantos/db');
  await adminQuery("ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_account_id TEXT").catch(()=>{});
  await adminQuery("ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_location_id TEXT").catch(()=>{});
  await adminQuery("ALTER TABLE locations ADD COLUMN IF NOT EXISTS yelp_business_id TEXT").catch(()=>{});
  _colsReady = true;
}

async function autoConfigurePlatformIds(tenantId, loc) {
  await ensurePlatformColumns();
  const updates = {};
  // Google: match our GBP integration's location list by title
  if (!loc.google_location_id) {
    try {
      const social = require('../../social/service');
      const integrations = require('../../integrations/service');
      const integ = await integrations.getIntegration(tenantId, 'google_business');
      const acct = integ?.config?.account; // "accounts/123"
      const gLocs = integ?.config?.locations || [];
      const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const hit = gLocs.find(g => norm(g.title).includes(norm(loc.name)) || norm(loc.name).includes(norm(g.title)));
      if (acct && hit) {
        updates.google_account_id  = acct.split('/')[1];
        updates.google_location_id = hit.name.split('/').pop();
      }
    } catch (e) { /* GBP not connected yet */ }
  }
  // Yelp: business search by name + address
  if (!loc.yelp_business_id && process.env.YELP_API_KEY) {
    const locText = loc.address || loc.city || '';
    if (locText) {
      try {
        const res = await apiFetch('https://api.yelp.com/v3/businesses/search?term=' + encodeURIComponent(loc.name) + '&location=' + encodeURIComponent(locText) + '&limit=1',
          { headers: { Authorization: 'Bearer ' + process.env.YELP_API_KEY } });
        if (res.ok) {
          const d = await res.json();
          if (d.businesses?.[0]) { updates.yelp_business_id = d.businesses[0].id; updates._yelpMatched = d.businesses[0].name; }
        }
      } catch (e) { /* leave unset */ }
    }
  }
  const cols = Object.keys(updates).filter(k => !k.startsWith('_'));
  if (cols.length) {
    const sets = cols.map((c, i) => c + '=$' + (i + 3)).join(', ');
    await queryForTenant(tenantId, 'UPDATE locations SET ' + sets + ' WHERE tenant_id=$1 AND id=$2', [tenantId, loc.id, ...cols.map(c => updates[c])]);
    cols.forEach(c => { loc[c] = updates[c]; });
  }
  return updates._yelpMatched;
}

module.exports = {AGENT_ID,getReviews,getReviewById,upsertReview,saveDraft,dismissReview,fetchFromPlatforms,generateDraft,generateBatch,postResponse,getAnalytics,getSummary,getEmployeeScores};
