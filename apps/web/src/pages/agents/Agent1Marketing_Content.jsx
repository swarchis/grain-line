import TextMarketingTab from './TextMarketingTab.jsx';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import NewsletterTab, { ImportContacts } from './NewsletterTab.jsx';
import React, { useState, useEffect, useCallback } from 'react';
import { agent1, media, locations as locationsApi, social } from '../../lib/api.js';
import { useAuth } from '../../App.jsx';

// Ads & boosting hidden until the Meta Marketing API integration ships (post-GA).
// Flip to true to bring back the tab and all Boost buttons.
const SHOW_ADS = false;

const PLATFORMS = [
  { key:'instagram', label:'Instagram', color:'#E1306C', icon:'📸' },
  { key:'facebook',  label:'Facebook',  color:'#1877F2', icon:'👍' },
  { key:'gbp',       label:'Google Business', color:'#4285F4', icon:'🗺️' },
];
const CONTENT_TYPES = ['feed','story','reel','event','offer','seasonal','behind-the-scenes','new-dish','review-highlight'];
const STATUS_COLORS = { draft:'var(--ink3)', scheduled:'var(--blue)', published:'var(--green)', failed:'var(--red)' };
const URGENCY_COLORS = { high:'var(--red)', medium:'var(--amber)', low:'var(--green)' };

function PlatformBadge({ platform }) {
  const p = PLATFORMS.find(x=>x.key===platform)||PLATFORMS[0];
  return <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:p.color+'18', color:p.color, textTransform:'uppercase', letterSpacing:'.05em' }}>{p.icon} {p.label}</span>;
}

// ── Generate modal ─────────────────────────────────────────────────────────────
function GenerateModal({ locations, onClose, onCreated, initialTrend, initialMedia = [], defaultLocationId }) {
  const [form, setForm] = useState({ locationId:defaultLocationId||locations[0]?.id||'', platform:'instagram', contentType:'feed', topic:initialTrend?.restaurant_angle||'', occasion:'', dish:'', mediaDescription: initialMedia.map(a=>a.alt_text||a.cloudinary_id?.split('/').pop()||'').filter(Boolean).join(', '), includeOffer:'', trendContext:initialTrend?.trend||'' });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState(0);
  const [media, setMedia] = useState(initialMedia);
  const [pickMedia, setPickMedia] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const locationName = locations.find(l=>l.id===form.locationId)?.name||'';

  const handleGenerate = async () => {
    setGenerating(true); setResult(null);
    try { setResult(await agent1.generatePost({...form, locationName})); setSelectedCaption(0); }
    catch(e) { alert(e.message); }
    finally { setGenerating(false); }
  };

  const handleSave = async (status='draft') => {
    if(!result) return;
    setSaving(true);
    try {
      const captions = [result.caption,...(result.alt_captions||[])];
      await agent1.createPost({
        location_id:form.locationId, platform:form.platform,
        caption:captions[selectedCaption]||result.caption,
        hashtags:result.hashtags||'',
        content_type:form.contentType,
        trend_tag:form.trendContext||null,
        media_urls: media.map(a => a.secure_url),
        status,
      });
      onCreated(); onClose();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const captions = result ? [result.caption,...(result.alt_captions||[])] : [];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:40, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:660, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:22, fontStyle:'italic' }}>✦ Generate content</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px', maxHeight:'80vh', overflowY:'auto' }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)' }}>Media {media.length > 0 ? `· ${media.length}` : '(optional)'}</div>
              <button type="button" className="btn btn-sm" onClick={()=>setPickMedia(true)}>📁 {media.length ? 'Change media' : 'Add media'}</button>
              {media.length > 0 && <button type="button" className="btn btn-sm" style={{ color:'var(--red)' }} onClick={()=>{setMedia([]);setForm(f=>({...f,mediaDescription:''}));}}>Remove</button>}
            </div>
            {media.length > 0 ? (
              <>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {media.map((a,i) => (
                    <div key={i} style={{ position:'relative', width:72, height:72, borderRadius:'var(--r-sm)', overflow:'hidden', border:'1px solid var(--border)' }}>
                      <img src={a.thumbnail_url||a.secure_url} alt={a.alt_text||''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      {a.resource_type==='video' && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.4)', fontSize:16 }}>▶</div>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'var(--ink3)', marginTop:6 }}>These will be referenced in the generated caption and media description field</div>
              </>
            ) : (
              <div style={{ fontSize:11, color:'var(--ink3)' }}>Attach photos or videos from Dropbox, or generate a caption first and add media after.</div>
            )}
          </div>
          {initialTrend && (
            <div className="alert alert-gold" style={{ marginBottom:14 }}>
              <span>🔥</span>
              <div><strong>Trending: {initialTrend.trend}</strong> — {initialTrend.restaurant_angle}</div>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Restaurant</label>
              <select className="form-select" value={form.locationId} onChange={e=>setForm(f=>({...f,locationId:e.target.value}))}>
                {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Platform</label>
              <select className="form-select" value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>
                {PLATFORMS.map(p=><option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Content type</label>
              <select className="form-select" value={form.contentType} onChange={e=>setForm(f=>({...f,contentType:e.target.value}))}>
                {CONTENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Featured dish (optional)</label>
              <input className="form-input" value={form.dish} onChange={e=>setForm(f=>({...f,dish:e.target.value}))} placeholder="Butter chicken, biryani…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Topic / theme</label>
              <input className="form-input" value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))} placeholder="Weekend brunch, happy hour…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Occasion</label>
              <input className="form-input" value={form.occasion} onChange={e=>setForm(f=>({...f,occasion:e.target.value}))} placeholder="Valentine's, Diwali…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
              <label className="form-label">Visual description (optional)</label>
              <input className="form-input" value={form.mediaDescription} onChange={e=>setForm(f=>({...f,mediaDescription:e.target.value}))} placeholder="Overhead shot of dal makhani in copper bowl…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Offer / CTA</label>
              <input className="form-input" value={form.includeOffer} onChange={e=>setForm(f=>({...f,includeOffer:e.target.value}))} placeholder="Book via OpenTable, 20% off…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Trending angle to tap into</label>
              <input className="form-input" value={form.trendContext} onChange={e=>setForm(f=>({...f,trendContext:e.target.value}))} placeholder="Next-Gen Indian, Swicy, Experience dining…"/>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginBottom:20 }} onClick={handleGenerate} disabled={generating}>
            {generating ? '✦ Generating…' : '✦ Generate with Claude AI'}
          </button>
          {result && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:12 }}>✦ Generated captions — pick one</div>
              {captions.map((cap,i) => (
                <div key={i} onClick={()=>setSelectedCaption(i)} style={{ background:selectedCaption===i?'var(--gold-bg)':'var(--bg)', border:`1px solid ${selectedCaption===i?'var(--gold-border)':'var(--border)'}`, borderRadius:'var(--r-sm)', padding:'12px 14px', marginBottom:8, cursor:'pointer' }}>
                  <div style={{ fontSize:11, fontWeight:600, color:selectedCaption===i?'var(--gold)':'var(--ink3)', marginBottom:6, fontFamily:'var(--mono)' }}>{i===0?'Primary':(`Alternative ${i}`)} {selectedCaption===i&&'✓'}</div>
                  <p style={{ fontSize:12, color:'var(--ink2)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{cap}</p>
                </div>
              ))}
              {result.hashtags && (
                <div style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:5 }}>Hashtags</div>
                  <p style={{ fontSize:11, color:'var(--blue)', lineHeight:1.8 }}>{result.hashtags}</p>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  {label:'Best time',    val:result.best_time},
                  {label:'Visual tip',   val:result.content_tips},
                  {label:'Trend angle',  val:result.trend_alignment},
                ].filter(x=>x.val).map((x,i) => (
                  <div key={i} style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'10px 12px' }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:4 }}>{x.label}</div>
                    <div style={{ fontSize:11, color:'var(--ink)' }}>{x.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" style={{ justifyContent:'center' }} onClick={()=>setShowPreview(true)} disabled={saving}>👁 Preview</button>
                <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={()=>handleSave('draft')} disabled={saving}>Save as draft</button>
                <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={()=>handleSave('scheduled')} disabled={saving}>Approve & schedule</button>
                <button className="btn" style={{ justifyContent:'center', color:'var(--red)' }} onClick={onClose} disabled={saving}>Discard</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {pickMedia && <MediaPickerModal
        onPick={assets=>{ setMedia(assets); setForm(f=>({...f, mediaDescription: assets.map(a=>a.alt_text||a.cloudinary_id?.split('/').pop()||'').filter(Boolean).join(', ') || f.mediaDescription })); setPickMedia(false); }}
        onClose={()=>setPickMedia(false)}
      />}
      {showPreview && result && <PostPreviewModal
        post={{ platform: form.platform, caption: captions[selectedCaption]||result.caption, hashtags: result.hashtags||'', thumb: media[0]?.thumbnail_url||null, media_urls: media.map(a=>a.secure_url), status:'draft' }}
        locationName={locationName}
        onClose={()=>setShowPreview(false)}
        onChangeImage={()=>{ setShowPreview(false); setPickMedia(true); }}
      />}
    </div>
  );
}

// ── Boost modal ────────────────────────────────────────────────────────────────
function BoostModal({ post, locations, onClose, onCreated }) {
  const today = new Date().toISOString().slice(0,10);
  const nextWeek = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const [form, setForm] = useState({
    locationId: post?.location_id||locations[0]?.id||'',
    platform: post?.platform||'instagram',
    objective: 'POST_ENGAGEMENT',
    dailyBudgetCents: 2000,
    startDate: today,
    endDate: nextWeek,
    ageMin: 21, ageMax: 55,
    targetRadius: 10,
    interests: '',
    adAccountId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const totalBudget = Math.round(form.dailyBudgetCents * (new Date(form.endDate) - new Date(form.startDate)) / 86400000 / 100);

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      await agent1.createAdBoost({
        postId: post?.id||null,
        locationId: form.locationId,
        platform: form.platform,
        objective: form.objective,
        dailyBudgetCents: form.dailyBudgetCents,
        startDate: form.startDate,
        endDate: form.endDate,
        adAccountId: form.adAccountId,
        targeting: { ageMin: form.ageMin, ageMax: form.ageMax, interests: form.interests.split(',').map(x=>x.trim()).filter(Boolean) },
      });
      onCreated(); onClose();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic' }}>🚀 Boost / Create Ad</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px' }}>
          {post && (
            <div style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:16, fontSize:12 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}><PlatformBadge platform={post.platform}/><span style={{ color:'var(--ink3)' }}>Boosting this post</span></div>
              <p style={{ color:'var(--ink2)', lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{post.caption}</p>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Platform</label>
              <select className="form-select" value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>
                <option value="instagram">📸 Instagram</option>
                <option value="facebook">👍 Facebook</option>
                <option value="both">Both platforms</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Objective</label>
              <select className="form-select" value={form.objective} onChange={e=>setForm(f=>({...f,objective:e.target.value}))}>
                <option value="POST_ENGAGEMENT">Post engagement</option>
                <option value="REACH">Maximize reach</option>
                <option value="TRAFFIC">Website traffic</option>
                <option value="LEAD_GENERATION">Lead generation</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Daily budget</label>
              <select className="form-select" value={form.dailyBudgetCents} onChange={e=>setForm(f=>({...f,dailyBudgetCents:parseInt(e.target.value)}))}>
                {[500,1000,2000,5000,10000,20000].map(v => <option key={v} value={v}>${(v/100).toFixed(0)}/day</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Duration</label>
              <select className="form-select" onChange={e=>{const days=parseInt(e.target.value);setForm(f=>({...f,endDate:new Date(Date.now()+days*86400000).toISOString().slice(0,10)}))}}>
                {[3,5,7,14,30].map(d=><option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Age range</label>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input className="form-input" type="number" value={form.ageMin} onChange={e=>setForm(f=>({...f,ageMin:parseInt(e.target.value)}))} style={{ width:70 }}/>
                <span style={{ color:'var(--ink3)' }}>–</span>
                <input className="form-input" type="number" value={form.ageMax} onChange={e=>setForm(f=>({...f,ageMax:parseInt(e.target.value)}))} style={{ width:70 }}/>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Total estimated spend</label>
              <div style={{ padding:'9px 12px', background:'var(--gold-bg)', borderRadius:'var(--r-sm)', fontFamily:'var(--mono)', fontSize:16, fontWeight:600, color:'var(--gold)' }}>
                ${totalBudget.toFixed(0)}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
              <label className="form-label">Interests (comma separated, optional)</label>
              <input className="form-input" value={form.interests} onChange={e=>setForm(f=>({...f,interests:e.target.value}))} placeholder="Indian food, Fine dining, Foodie, Date night…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
              <label className="form-label">Meta Ad Account ID (from Business Manager)</label>
              <input className="form-input" value={form.adAccountId} onChange={e=>setForm(f=>({...f,adAccountId:e.target.value}))} placeholder="act_1234567890 or 1234567890" style={{ fontFamily:'var(--mono)' }}/>
              <div style={{ fontSize:10, color:'var(--ink3)', marginTop:3 }}>Found in Meta Business Manager → Ad Accounts. Required for auto-publishing. Leave blank to save as draft.</div>
            </div>
          </div>

          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          {!form.adAccountId && (
            <div className="alert alert-blue" style={{ marginTop:12 }}>
              <span>ℹ</span>
              <div>Without an Ad Account ID, this saves as a draft. You can then set up the boost manually in <strong>Meta Ads Manager</strong> using the saved campaign settings.</div>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : form.adAccountId ? '🚀 Launch boost' : 'Save boost draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostPreviewModal({ post, locationName, onClose, onChangeImage }) {
  if (!post) return null;
  const img = post.thumb || post._thumb || post.media_urls?.[0] || null;
  const name = locationName || post.location_name || '';
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:120, paddingTop:40, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'var(--r-lg)', width:380, maxWidth:'94vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderBottom:'1px solid #eee' }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)', flexShrink:0 }}/>
          <div style={{ fontSize:13, fontWeight:600, color:'#222' }}>{name}</div>
          <div style={{ marginLeft:'auto' }}><PlatformBadge platform={post.platform}/></div>
        </div>
        <div style={{ width:'100%', aspectRatio:'1/1', background:'#f4f4f4', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {img ? (
            <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          ) : (
            <div style={{ textAlign:'center', color:'#bbb', fontSize:13 }}><div style={{ fontSize:30 }}>🖼️</div>No image assigned</div>
          )}
        </div>
        <div style={{ padding:'10px 12px 16px' }}>
          <div style={{ display:'flex', gap:14, fontSize:20, marginBottom:8 }}><span>♡</span><span>💬</span><span>➤</span></div>
          <div style={{ fontSize:13, color:'#222', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
            <span style={{ fontWeight:600 }}>{name}</span> {post.caption}
          </div>
          {post.hashtags && <div style={{ fontSize:13, color:'#385185', marginTop:4, lineHeight:1.5 }}>{post.hashtags}</div>}
          <div style={{ fontSize:10, color:'#999', marginTop:8, textTransform:'uppercase', letterSpacing:'.04em' }}>
            {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('en-US',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}) : (post.status||'Draft')}
          </div>
        </div>
        <div style={{ padding:'10px 12px', borderTop:'1px solid #eee', display:'flex', gap:8, background:'var(--card-raised)' }}>
          {onChangeImage && <button className="btn btn-sm" onClick={onChangeImage}>Change image</button>}
          <button className="btn btn-sm" style={{ marginLeft:'auto' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, onPublish, onApprove, onDelete, onBoost, onEdit, onPreview }) {
  const [copying, setCopying] = useState(false);
  const fullCaption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
  const handleCopy = async () => { await navigator.clipboard.writeText(fullCaption); setCopying(true); setTimeout(()=>setCopying(false),2000); };

  return (
    <div className="card" style={{ marginBottom:10, borderLeft:`3px solid ${STATUS_COLORS[post.status]||'var(--border)'}` }}>
      <div style={{ padding:'12px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <PlatformBadge platform={post.platform}/>
          <span style={{ fontSize:11, color:'var(--ink3)' }}>{post.location_name}</span>
          {post.trend_tag && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'var(--red-bg)', color:'var(--red)', fontWeight:700 }}>🔥 {post.trend_tag}</span>}
          <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[post.status], marginLeft:'auto', textTransform:'uppercase', letterSpacing:'.06em' }}>{post.status}</span>
          {post.scheduled_at && <span style={{ fontSize:10, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{new Date(post.scheduled_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>}
        </div>
        <p style={{ fontSize:12, color:'var(--ink2)', lineHeight:1.7, marginBottom:6, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{post.caption}</p>
        {post.hashtags && <p style={{ fontSize:11, color:'var(--blue)', lineHeight:1.6, marginBottom:8, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{post.hashtags}</p>}
        {post.status==='published'&&(post.likes>0||post.reach>0)&&(
          <div style={{ display:'flex', gap:16, padding:'8px 0', borderTop:'1px solid var(--border)', marginBottom:8 }}>
            {[{label:'❤️ Likes',val:post.likes},{label:'💬 Comments',val:post.comments},{label:'👁 Reach',val:post.reach}].map(m=>(
              <div key={m.label}><div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:500 }}>{m.val?.toLocaleString()||'—'}</div><div style={{ fontSize:10, color:'var(--ink3)' }}>{m.label}</div></div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="btn btn-sm" onClick={handleCopy}>{copying?'✓ Copied!':'📋 Copy'}</button>
          <button className="btn btn-sm" onClick={()=>onPreview(post)}>👁 Preview</button>
          {post.status!=='published'&&<button className="btn btn-sm" onClick={()=>onEdit(post)}>✏️ Edit</button>}
          {post.status==='draft'&&<button className="btn btn-sm" onClick={()=>onApprove(post)} style={{ background:'var(--blue-bg)', borderColor:'rgba(30,77,140,.2)', color:'var(--blue)' }}>✓ Approve</button>}
          {post.status==='scheduled'&&<button className="btn btn-sm btn-primary" onClick={()=>onPublish(post)}>Publish now</button>}
          {onBoost&&(post.status==='published'||post.status==='scheduled')&&(
            <button className="btn btn-sm" onClick={()=>onBoost(post)} style={{ background:'var(--gold-bg)', borderColor:'var(--gold-border)', color:'var(--gold)' }}>🚀 Boost</button>
          )}
          {post.ig_permalink&&<a href={post.ig_permalink} target="_blank" rel="noreferrer" className="btn btn-sm">View ↗</a>}
          <div style={{ flex:1 }}/>
          <button className="btn btn-sm btn-danger" onClick={()=>onDelete(post.id)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Trend card ────────────────────────────────────────────────────────────────
function TrendCard({ trend, onCreatePost }) {
  return (
    <div className="card" style={{ marginBottom:12, borderLeft:`3px solid ${URGENCY_COLORS[trend.urgency]||'var(--border)'}` }}>
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontWeight:600, fontSize:14, color:'var(--ink)' }}>{trend.trend}</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:URGENCY_COLORS[trend.urgency]+'18', color:URGENCY_COLORS[trend.urgency], fontWeight:700, textTransform:'uppercase' }}>
                {trend.urgency === 'high' ? '🔥 Hot' : trend.urgency === 'medium' ? '↑ Rising' : 'Steady'}
              </span>
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:'var(--bg2)', color:'var(--ink3)', fontWeight:500 }}>{trend.best_format}</span>
            </div>
            <p style={{ fontSize:12, color:'var(--ink3)', lineHeight:1.6 }}>{trend.virality_signal}</p>
          </div>
        </div>
        <p style={{ fontSize:12, color:'var(--ink2)', lineHeight:1.7, marginBottom:10 }}>{trend.description}</p>
        <div style={{ background:'var(--gold-bg)', border:'1px solid var(--gold-border)', borderRadius:'var(--r-sm)', padding:'10px 12px', marginBottom:10 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.07em', fontFamily:'var(--mono)', marginBottom:4 }}>Your angle</div>
          <p style={{ fontSize:12, color:'var(--ink)', lineHeight:1.6 }}>{trend.restaurant_angle}</p>
        </div>
        <div style={{ fontSize:11, color:'var(--blue)', marginBottom:12, lineHeight:1.8 }}>{trend.suggested_hashtags}</div>
        <button className="btn btn-primary btn-sm" onClick={() => onCreatePost(trend)}>
          ✦ Create post from this trend
        </button>
      </div>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────
function CalendarView({ posts, onDayClick }) {
  const today = new Date();
  const year=today.getFullYear(), month=today.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const postsByDate={};
  posts.forEach(p=>{ const d=(p.scheduled_at||p.created_at)?.slice(0,10); if(d){if(!postsByDate[d])postsByDate[d]=[];postsByDate[d].push(p);} });
  const platColors={instagram:'#E1306C',facebook:'#1877F2',gbp:'#4285F4',google:'#4285F4'};
  return (
    <div className="card-raised">
      <div className="card-header">
        <span className="card-title">{today.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span>
        <div style={{ display:'flex', gap:10 }}>
          {PLATFORMS.map(p=><span key={p.key} style={{ fontSize:11, display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:p.color, display:'inline-block' }}/>{p.label}</span>)}
        </div>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:6 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} style={{ fontSize:10, fontWeight:600, color:'var(--ink3)', textAlign:'center', textTransform:'uppercase', letterSpacing:'.06em' }}>{d}</div>)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
          {Array.from({length:firstDay},(_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>{
            const day=i+1;
            const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayPosts=postsByDate[dateStr]||[];
            const isToday=day===today.getDate();
            return (
              <div key={day} onClick={()=>onDayClick(dateStr,dayPosts)} style={{ minHeight:60, borderRadius:6, padding:'4px 6px', cursor:'pointer', background:isToday?'var(--gold-bg)':dayPosts.length?'var(--bg)':'transparent', border:`1px solid ${isToday?'var(--gold-border)':dayPosts.length?'var(--border)':'transparent'}` }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg2)'} onMouseLeave={e=>e.currentTarget.style.background=isToday?'var(--gold-bg)':dayPosts.length?'var(--bg)':'transparent'}>
                <div style={{ fontSize:11, fontWeight:isToday?700:400, color:isToday?'var(--gold)':'var(--ink2)', marginBottom:4 }}>{day}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
                  {dayPosts.slice(0,6).map((p,pi)=><div key={pi} style={{ width:7, height:7, borderRadius:'50%', background:platColors[p.platform]||'var(--ink3)', opacity:p.status==='draft'?0.4:1 }} title={`${p.platform}: ${p.caption?.slice(0,30)}`}/>)}
                  {dayPosts.length>6&&<div style={{ fontSize:8, color:'var(--ink3)' }}>+{dayPosts.length-6}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ── Dropbox Media Library ─────────────────────────────────────────────────────
function MediaLibrary({ pickMode = false, onPick, onClose }) {
  const [path, setPath]         = useState('');
  const [history, setHistory]   = useState([]);
  const [contents, setContents] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [searching, setSearching]= useState(false);
  const [searchQ, setSearchQ]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [linkLoading, setLinkLoading] = useState({});
  const [error, setError]       = useState('');

  const loadPath = async (p = '') => {
    setLoading(true); setError(''); setSearchResults(null); setSearchQ('');
    try {
      const data = await media.browse(p);
      setContents(data);
      setPath(p);
    } catch(e) {
      if (e.message?.includes('expired') || e.message?.includes('TOKEN_EXPIRED') || e.message?.includes('401')) {
        setError('TOKEN_EXPIRED');
      } else {
        setError(e.message);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPath(''); }, []);

  const navigateTo = (folder) => {
    setHistory(h => [...h, path]);
    loadPath(folder.path);
  };

  const goBack = () => {
    const prev = history[history.length - 1] ?? '';
    setHistory(h => h.slice(0, -1));
    loadPath(prev);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQ.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const data = await media.search(searchQ.trim(), path);
      setSearchResults(data.files || []);
    } catch(e) { setError(e.message); }
    finally { setSearching(false); }
  };

  // Get a usable direct URL for a file (needed before using in post/Instagram)
  const getFileLink = async (file) => {
    setLinkLoading(l => ({ ...l, [file.path]: true }));
    try {
      const data = await media.getLink(file.path);
      return { ...file, secure_url: data.url, alt_text: file.name };
    } catch(e) {
      // Fallback to shared link
      try {
        const data = await media.sharedLink(file.path);
        return { ...file, secure_url: data.url, alt_text: file.name };
      } catch(_) { throw e; }
    } finally {
      setLinkLoading(l => ({ ...l, [file.path]: false }));
    }
  };

  const handlePick = async (file) => {
    try {
      const withLink = await getFileLink(file);
      if (pickMode && onPick) { onPick([withLink]); return; }
      setSelected(s => s.find(x => x.path === file.path)
        ? s.filter(x => x.path !== file.path)
        : [...s, withLink]);
    } catch(e) { setError('Could not get link: ' + e.message); }
  };

  const handleUseSelected = () => {
    if (onPick) onPick(selected);
    if (onClose) onClose();
  };

  const formatBytes = (b) => !b ? '' : b < 1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/1024/1024).toFixed(1)}MB`;
  const isSelected = (file) => selected.find(x => x.path === file.path);

  const displayFiles = searchResults ?? contents?.files ?? [];
  const displayFolders = searchResults ? [] : (contents?.folders ?? []);
  const breadcrumbs = path ? path.split('/').filter(Boolean) : [];
  const noDropbox = error?.includes('DROPBOX_ACCESS_TOKEN');

  return (
    <div style={{ display:'flex', flexDirection:'column', height: pickMode ? '70vh' : 'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          {!pickMode && <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic', marginBottom:3 }}>Media library</h2>}
          <div style={{ fontSize:11, color:'var(--ink3)' }}>Browsing your Dropbox · {contents?.total ?? 0} items</div>
        </div>
        {selected.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={handleUseSelected}>
            Use {selected.length} file{selected.length > 1 ? 's' : ''} →
          </button>
        )}
      </div>

      {/* Dropbox setup notice */}
      {noDropbox && (
        <div className="alert alert-gold" style={{ marginBottom:14 }}>
          <span>📦</span>
          <div>
            <strong>Connect your Dropbox in 2 minutes:</strong>
            <ol style={{ marginTop:6, marginLeft:16, fontSize:11, lineHeight:2 }}>
              <li>Go to <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" style={{ color:'var(--gold)' }}>dropbox.com/developers/apps</a> → Create app</li>
              <li>Choose <strong>Scoped access</strong> → <strong>Full Dropbox</strong> → name it "Pulse"</li>
              <li>Permissions tab → enable: <code>files.content.read</code>, <code>sharing.write</code></li>
              <li>Settings tab → Generated access token → copy it</li>
              <li>Railway → API service → Variables → add <code>DROPBOX_ACCESS_TOKEN</code></li>
            </ol>
          </div>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input
          className="form-input"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Search photos & videos in Dropbox…"
          style={{ flex:1, fontSize:12 }}
        />
        <button className="btn btn-sm" type="submit" disabled={searching}>{searching ? '…' : '🔍'}</button>
        {searchResults && <button className="btn btn-sm" type="button" onClick={() => { setSearchResults(null); setSearchQ(''); }}>✕ Clear</button>}
      </form>

      {/* Breadcrumb nav */}
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:12, flexWrap:'wrap' }}>
        {history.length > 0 && (
          <button className="btn btn-sm" onClick={goBack} style={{ padding:'3px 8px' }}>← Back</button>
        )}
        <button className="btn btn-sm" onClick={() => { setHistory([]); loadPath(''); }} style={{ padding:'3px 8px', color: !path ? 'var(--gold)' : undefined }}>
          📦 Dropbox
        </button>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <span style={{ color:'var(--ink4)', fontSize:11 }}>/</span>
            <span style={{ fontSize:11, color: i === breadcrumbs.length-1 ? 'var(--ink)' : 'var(--ink3)', fontWeight: i === breadcrumbs.length-1 ? 500 : 400 }}>
              {crumb}
            </span>
          </React.Fragment>
        ))}
        <button className="btn btn-sm" onClick={() => loadPath(path)} style={{ marginLeft:'auto', padding:'3px 8px' }}>↻</button>
      </div>

      {error === 'TOKEN_EXPIRED' && (
        <div className="alert alert-red" style={{ marginBottom:12 }}>
          <span>⚠</span>
          <div>
            <strong>Dropbox token expired.</strong> Generate a new one:
            <ol style={{ marginTop:6, marginLeft:16, fontSize:11, lineHeight:2 }}>
              <li>Go to <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" style={{ color:'var(--red)' }}>dropbox.com/developers/apps</a> → click your <strong>resos</strong> app</li>
              <li>Settings tab → OAuth 2 → set <strong>Access token expiration</strong> to <strong>No expiration</strong></li>
              <li>Click <strong>Generate</strong> → copy the token</li>
              <li>Railway → Variables → update <code>DROPBOX_ACCESS_TOKEN</code> → redeploy</li>
            </ol>
          </div>
        </div>
      )}
      {error && error !== 'TOKEN_EXPIRED' && !noDropbox && (
        <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>
      )}

      {/* Content */}
      {loading ? (
        <div className="spinner" style={{ margin:'40px auto' }}/>
      ) : (
        <div style={{ flex:1, overflowY:'auto' }}>
          {/* Folders */}
          {displayFolders.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:8 }}>Folders</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:8 }}>
                {displayFolders.map(folder => (
                  <div key={folder.path} onClick={() => navigateTo(folder)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', cursor:'pointer', transition:'all .12s' }} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    <span style={{ fontSize:18 }}>📁</span>
                    <span style={{ fontSize:11, color:'var(--ink2)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{folder.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files grid */}
          {displayFiles.length > 0 ? (
            <div>
              {searchResults && <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:10 }}>{displayFiles.length} results for "{searchQ}"</div>}
              {!searchResults && <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:8 }}>Photos & videos</div>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:10 }}>
                {displayFiles.map(file => {
                  const sel = isSelected(file);
                  const isVid = file.resource_type === 'video';
                  const loading = linkLoading[file.path];
                  return (
                    <div key={file.path} onClick={() => !loading && handlePick(file)} style={{ position:'relative', borderRadius:'var(--r-sm)', overflow:'hidden', border:`2px solid ${sel?'var(--gold)':'var(--border)'}`, cursor: loading ? 'wait' : 'pointer', background:'var(--bg)', aspectRatio:'1', transition:'all .12s' }} onMouseEnter={e=>{ if(!sel) e.currentTarget.style.borderColor='var(--border2)'; }} onMouseLeave={e=>{ if(!sel) e.currentTarget.style.borderColor='var(--border)'; }}>
                      {/* Thumbnail or placeholder */}
                      {file.thumbnail_url ? (
                        <img src={file.thumbnail_url} alt={file.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                      ) : (
                        <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, background:'var(--bg2)' }}>
                          <span style={{ fontSize:28 }}>{isVid ? '🎬' : '🖼️'}</span>
                          <span style={{ fontSize:9, color:'var(--ink3)', textAlign:'center', padding:'0 6px', lineHeight:1.4 }}>{file.name.slice(file.name.lastIndexOf('.')+1).toUpperCase()}</span>
                        </div>
                      )}

                      {/* Loading overlay */}
                      {loading && (
                        <div style={{ position:'absolute', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <div className="spinner" style={{ margin:0, width:16, height:16, borderWidth:2 }}/>
                        </div>
                      )}

                      {/* Selected check */}
                      {sel && (
                        <div style={{ position:'absolute', top:5, right:5, width:22, height:22, borderRadius:'50%', background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#fff', fontWeight:700, boxShadow:'0 1px 4px rgba(0,0,0,.3)' }}>✓</div>
                      )}

                      {/* Video badge */}
                      {isVid && (
                        <div style={{ position:'absolute', top:5, left:5, background:'rgba(0,0,0,.6)', color:'#fff', fontSize:9, padding:'2px 5px', borderRadius:3, fontWeight:600 }}>▶ VIDEO</div>
                      )}

                      {/* Filename + size at bottom */}
                      <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'linear-gradient(transparent,rgba(28,21,16,.8))', padding:'12px 6px 5px', fontSize:9, color:'#fff', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {file.name}
                        {file.size && <span style={{ opacity:.7, marginLeft:4 }}>{formatBytes(file.size)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !loading && !noDropbox && (
            <div className="empty-state" style={{ padding:'40px 0' }}>
              <div className="empty-state-icon">{searchResults ? '🔍' : '📷'}</div>
              <div className="empty-state-title">{searchResults ? 'No results' : 'No photos or videos here'}</div>
              <div className="empty-state-sub">{searchResults ? `No media files matching "${searchQ}"` : 'Navigate to a folder with your restaurant photos and videos'}</div>
            </div>
          )}
        </div>
      )}

      {/* Selected bar */}
      {selected.length > 0 && (
        <div style={{ marginTop:12, padding:'10px 14px', background:'var(--ink)', borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:4, flex:1 }}>
            {selected.slice(0,5).map((f,i) => (
              <div key={i} style={{ width:32, height:32, borderRadius:4, overflow:'hidden', border:'1px solid rgba(255,255,255,.2)', flexShrink:0 }}>
                {f.thumbnail_url ? <img src={f.thumbnail_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🖼</div>}
              </div>
            ))}
            <span style={{ fontSize:11, color:'rgba(255,255,255,.7)', alignSelf:'center', marginLeft:4 }}>{selected.length} selected</span>
          </div>
          <button className="btn btn-sm" style={{ background:'rgba(255,255,255,.1)', borderColor:'rgba(255,255,255,.2)', color:'#fff' }} onClick={() => setSelected([])}>Clear</button>
          <button className="btn btn-sm btn-primary" onClick={handleUseSelected}>Use in post →</button>
        </div>
      )}
    </div>
  );
}

// ── Media Picker Modal ────────────────────────────────────────────────────────
function MediaPickerModal({ onPick, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:100, paddingTop:40, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:820, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>📁 Pick from Dropbox</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px 20px' }}>
          <MediaLibrary pickMode={true} onPick={files => { onPick(files); onClose(); }} onClose={onClose}/>
        </div>
      </div>
    </div>
  );
}



// ── Folder Browser (folder-only navigator for bulk media source) ──────────────
function FolderBrowser({ onSelect, onClose }) {
  const [path, setPath]       = useState('');
  const [history, setHistory] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = async (p = '') => {
    setLoading(true); setError('');
    try {
      const data = await media.browse(p);
      setFolders(data.folders || []);
      setPath(p);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(''); }, []);

  const navigate = (folder) => { setHistory(h=>[...h,path]); load(folder.path); };
  const goBack = () => { const prev=history[history.length-1]??''; setHistory(h=>h.slice(0,-1)); load(prev); };

  const breadcrumbs = path ? path.split('/').filter(Boolean) : [];

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {history.length > 0 && <button className="btn btn-sm" onClick={goBack}>← Back</button>}
        <button className="btn btn-sm" onClick={()=>{setHistory([]);load('');}} style={{ color:!path?'var(--gold)':undefined }}>📦 Dropbox</button>
        {breadcrumbs.map((c,i) => (
          <React.Fragment key={i}>
            <span style={{ color:'var(--ink4)', fontSize:11 }}>/</span>
            <span style={{ fontSize:11, color: i===breadcrumbs.length-1?'var(--ink)':'var(--ink3)', fontWeight: i===breadcrumbs.length-1?500:400 }}>{c}</span>
          </React.Fragment>
        ))}
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom:10 }}><span>⚠</span>{error}</div>}

      {loading ? <div className="spinner" style={{ margin:'20px auto' }}/> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:8, marginBottom:16 }}>
          {folders.map(folder => (
            <div key={folder.path} onClick={()=>navigate(folder)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', cursor:'pointer' }} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <span style={{ fontSize:18 }}>📁</span>
              <span style={{ fontSize:11, color:'var(--ink2)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{folder.name}</span>
            </div>
          ))}
          {folders.length === 0 && <div style={{ fontSize:12, color:'var(--ink3)', fontStyle:'italic', gridColumn:'1/-1' }}>No subfolders here</div>}
        </div>
      )}

      <div style={{ display:'flex', gap:8, padding:'14px 0 0', borderTop:'1px solid var(--border)' }}>
        <div style={{ flex:1, fontSize:12, color:'var(--ink3)' }}>
          Current: <span style={{ fontFamily:'var(--mono)', color:'var(--ink)', fontWeight:500 }}>{path || '/ (Dropbox root)'}</span>
        </div>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSelect(path)}>
          Use this folder ✓
        </button>
      </div>
    </div>
  );
}

// ── Bulk Calendar Generator ───────────────────────────────────────────────────
const CONTENT_TYPES_BULK = [
  { key:'food',      label:'Food shots',           default:40 },
  { key:'events',    label:'Events & promos',       default:20 },
  { key:'behind',    label:'Behind the scenes',     default:20 },
  { key:'trending',  label:'Trending topics',       default:10 },
  { key:'reviews',   label:'Reviews / social proof',default:10 },
  { key:'seasonal',  label:'Seasonal specials',     default:0  },
];

function BulkCalendarModal({ locations, currentLocationId, onClose, onCreated }) {
  const today = new Date();
  const nextMonth = new Date(today); nextMonth.setMonth(nextMonth.getMonth()+1);
  const fmt = d => d.toISOString().slice(0,10);

  const [step, setStep]           = useState(1); // 1=config, 2=review
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [swapMediaId, setSwapMediaId] = useState(null);
  const [previewPost, setPreviewPost] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generated, setGenerated] = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [error, setError]         = useState('');
  const [progress, setProgress]   = useState('');

  const [form, setForm] = useState({
    locationId:  currentLocationId || locations[0]?.id || '',
    dropboxFolder: '',
    startDate:   fmt(today),
    endDate:     fmt(nextMonth),
    platforms:   ['instagram','facebook'],
    frequency:   5,
    postingTime: 'mixed',
    contentMix:  Object.fromEntries(CONTENT_TYPES_BULK.map(t => [t.key, t.default])),
    dishes:      '',
    occasions:   '',
    cta:         '',
  });

  const setF = (key, val) => setForm(f => ({...f, [key]:val}));

  const togglePlatform = (p) => setF('platforms',
    form.platforms.includes(p) ? form.platforms.filter(x=>x!==p) : [...form.platforms, p]
  );

  const setMix = (key, val) => setF('contentMix', {...form.contentMix, [key]: parseInt(val)||0});

  const totalMix = Object.values(form.contentMix).reduce((a,b)=>a+b,0);

  // Estimate post count
  const days = Math.max(0, Math.round((new Date(form.endDate)-new Date(form.startDate))/(86400000)));
  const weeks = Math.ceil(days/7);
  const estPosts = weeks * form.frequency * form.platforms.length;

  const handleGenerate = async () => {
    if (!form.locationId) return setError('Please select a restaurant');
    if (!form.platforms.length) return setError('Select at least one platform');
    if (totalMix === 0) return setError('Content mix must add up to more than 0');
    setGenerating(true); setError('');
    setProgress('Claude is writing your posts… this takes about 30-60 seconds for a full month');
    try {
      const data = await agent1.generateBulk({...form, dropboxFolder: form.dropboxFolder});
      setGenerated(data.posts || []);
      setSelected(new Set((data.posts||[]).map(p=>p.id)));
      setStep(2);
    } catch(e) { setError(e.message); }
    finally { setGenerating(false); setProgress(''); }
  };

  const handleApproveAll = async () => {
    setApproving(true);
    try {
      await agent1.approveAllPosts([...selected]);
      onCreated([...selected].length);
      onClose();
    } catch(e) { setError(e.message); }
    finally { setApproving(false); }
  };

  const handleApproveSelected = async () => {
    setApproving(true);
    try {
      await agent1.approveAllPosts([...selected]);
      // Discard everything that wasn't approved so it doesn't linger as a draft
      const unapproved = generated.filter(p => !selected.has(p.id)).map(p => p.id);
      if (unapproved.length) await Promise.all(unapproved.map(id => agent1.deletePost(id).catch(()=>null)));
      onCreated([...selected].length);
      onClose();
    } catch(e) { setError(e.message); }
    finally { setApproving(false); }
  };

  const [discarding, setDiscarding] = useState(false);

  const handleDiscardOne = async (id) => {
    try {
      await agent1.deletePost(id);
      setGenerated(g => g.filter(p => p.id !== id));
      setSelected(sel => { const n = new Set(sel); n.delete(id); return n; });
    } catch(e) { setError('Could not discard: ' + e.message); }
  };

  const handleDiscardAll = async () => {
    if (!window.confirm(`Discard all ${generated.length} generated posts? They will not be saved.`)) return;
    setDiscarding(true);
    try {
      await Promise.all(generated.map(p => agent1.deletePost(p.id).catch(()=>null)));
      onCreated(0); onClose();
    } catch(e) { setError(e.message); setDiscarding(false); }
  };

  // Closing without approving discards the un-approved remainder so nothing lingers as a draft.
  const handleCloseReview = async () => {
    if (step === 2 && generated.length > 0) {
      if (!window.confirm('Discard the generated posts you have not approved? Nothing will be saved unless you approve it.')) return;
      try { await Promise.all(generated.map(p => agent1.deletePost(p.id).catch(()=>null))); } catch(_) {}
    }
    onClose();
  };

  const handleEditSave = async (post) => {
    try {
      await agent1.updatePost(post.id, { caption: editCaption });
      setGenerated(g => g.map(p => p.id===post.id ? {...p, caption:editCaption} : p));
      setEditingId(null);
    } catch(e) { setError(e.message); }
  };

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const locationName = locations.find(l=>l.id===form.locationId)?.name || '';
  const selectedLoc = locations.find(l=>l.id===form.locationId);
  // Auto-populate dropbox folder from location profile
  React.useEffect(() => {
    if (selectedLoc?.dropbox_folder && !form.dropboxFolder) {
      setF('dropboxFolder', selectedLoc.dropbox_folder);
    }
  }, [form.locationId]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:32, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:720, maxWidth:'96vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:22, fontStyle:'italic' }}>
              {step===1 ? '✦ Bulk content calendar' : `Review ${generated.length} generated posts`}
            </h2>
            {step===1 && <div style={{ fontSize:11, color:'var(--ink3)', marginTop:3 }}>Generate a full month of posts in one go</div>}
          </div>
          <button onClick={handleCloseReview} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>

        {/* ── STEP 1: Config ── */}
        {step===1 && (
          <div style={{ padding:'20px 22px', maxHeight:'80vh', overflowY:'auto' }}>
            {/* Restaurant + dates */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:12 }}>Restaurant & dates</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Restaurant</label>
                <select className="form-select" value={form.locationId} onChange={e=>setF('locationId',e.target.value)}>
                  {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Start date</label>
                <input className="form-input" type="date" value={form.startDate} onChange={e=>setF('startDate',e.target.value)}/>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">End date</label>
                <input className="form-input" type="date" value={form.endDate} onChange={e=>setF('endDate',e.target.value)}/>
              </div>
            </div>

            {/* Platforms + frequency */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:12 }}>Schedule</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Platforms</label>
                <div style={{ display:'flex', gap:8, marginTop:4 }}>
                  {PLATFORMS.map(p => (
                    <label key={p.key} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:12, padding:'6px 10px', borderRadius:'var(--r-sm)', background: form.platforms.includes(p.key)?'var(--gold-bg)':'var(--bg)', border:`1px solid ${form.platforms.includes(p.key)?'var(--gold-border)':'var(--border)'}` }}>
                      <input type="checkbox" checked={form.platforms.includes(p.key)} onChange={()=>togglePlatform(p.key)} style={{ marginRight:2 }}/>
                      {p.icon}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Posts per week (per platform)</label>
                <select className="form-select" value={form.frequency} onChange={e=>setF('frequency',parseInt(e.target.value))}>
                  <option value={7}>Daily (7×)</option>
                  <option value={5}>5× per week</option>
                  <option value={3}>3× per week</option>
                  <option value={1}>Weekly</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Posting time</label>
                <select className="form-select" value={form.postingTime} onChange={e=>setF('postingTime',e.target.value)}>
                  <option value="lunch">Lunch (11am–1pm)</option>
                  <option value="dinner">Dinner (5pm–7pm)</option>
                  <option value="mixed">Mixed (AI picks best)</option>
                </select>
              </div>
            </div>

            {/* Content mix */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)' }}>Content mix</div>
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color: totalMix===100?'var(--green)':totalMix>100?'var(--red)':'var(--amber)' }}>
                {totalMix}% / 100% {totalMix===100?'✓':totalMix>100?'(over)':'(adjust)'}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
              {CONTENT_TYPES_BULK.map(t => (
                <div key={t.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)' }}>
                  <span style={{ flex:1, fontSize:12, fontWeight:500, color:'var(--ink2)' }}>{t.label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={form.contentMix[t.key]}
                      onChange={e=>setMix(t.key,e.target.value)}
                      style={{ width:80 }}
                    />
                    <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:500, color:'var(--ink)', width:36, textAlign:'right' }}>
                      {form.contentMix[t.key]}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Dropbox folder */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:12 }}>Media source</div>
            <div style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'12px 14px', marginBottom:20, border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <label className="form-label">Dropbox folder to pull images from</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="form-input" value={form.dropboxFolder} onChange={e=>setF('dropboxFolder',e.target.value)} placeholder="/Fitoor jpg or /Photos/Fitoor SR" style={{ fontSize:12, flex:1 }}/>
                    <button className="btn btn-sm" onClick={()=>setShowFolderPicker(true)} type="button">📁 Browse</button>
                  </div>
                  <div style={{ fontSize:10, color:'var(--ink3)', marginTop:4 }}>
                    {form.dropboxFolder
                      ? `✓ Images from ${form.dropboxFolder} will be auto-distributed across posts`
                      : 'Optional — posts will be generated without images if left empty. You can assign images in the review step.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Context */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:12 }}>Context (optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Key dishes to feature</label>
                <input className="form-input" value={form.dishes} onChange={e=>setF('dishes',e.target.value)} placeholder="Butter chicken, biryani, dal makhani…" style={{ fontSize:12 }}/>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Upcoming events / occasions</label>
                <input className="form-input" value={form.occasions} onChange={e=>setF('occasions',e.target.value)} placeholder="Father's Day June 15, summer menu launch…" style={{ fontSize:12 }}/>
              </div>
              <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
                <label className="form-label">Offer / CTA to weave in</label>
                <input className="form-input" value={form.cta} onChange={e=>setF('cta',e.target.value)} placeholder="Reserve via OpenTable, happy hour 4-6pm Mon-Fri…" style={{ fontSize:12 }}/>
              </div>
            </div>

            {error && <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>}
            {progress && (
              <div className="alert alert-gold" style={{ marginBottom:12 }}>
                <div className="spinner" style={{ width:14, height:14, borderWidth:2, margin:0, flexShrink:0 }}/>
                {progress}
              </div>
            )}

            {/* Estimate + generate */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--gold-bg)', borderRadius:'var(--r-sm)', marginBottom:16, border:'1px solid var(--gold-border)' }}>
              <div>
                <span style={{ fontFamily:'var(--mono)', fontSize:20, fontWeight:500, color:'var(--gold)' }}>{estPosts}</span>
                <span style={{ fontSize:12, color:'var(--ink3)', marginLeft:8 }}>
                  posts · {weeks} week{weeks!==1?'s':''} · {form.platforms.length} platform{form.platforms.length!==1?'s':''} · {form.frequency}×/week
                </span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', fontSize:14, padding:'12px 20px' }} onClick={handleGenerate} disabled={generating||!form.platforms.length}>
              {generating ? '✦ Generating… (this takes ~30-60s)' : `✦ Generate ${estPosts} posts for ${locationName}`}
            </button>
          </div>
        )}

        {/* ── STEP 2: Review ── */}
        {step===2 && (
          <div style={{ display:'flex', flexDirection:'column', maxHeight:'85vh' }}>
            {/* Sticky action bar */}
            <div style={{ padding:'12px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, background:'var(--card-raised)', flexShrink:0 }}>
              <div style={{ flex:1, fontSize:12, color:'var(--ink3)' }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:500, color:'var(--ink)' }}>{selected.size}</span> of {generated.length} selected
              </div>
              <button className="btn btn-sm" onClick={()=>setSelected(new Set(generated.map(p=>p.id)))}>Select all</button>
              <button className="btn btn-sm" onClick={()=>setSelected(new Set())}>Deselect all</button>
              <button className="btn btn-sm" onClick={()=>setStep(1)}>← Reconfigure</button>
              <button className="btn btn-sm" style={{ color:'var(--red)' }} onClick={handleDiscardAll} disabled={discarding||approving}>
                {discarding ? 'Discarding…' : 'Discard all'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApproveSelected}
                disabled={approving||selected.size===0}
              >
                {approving ? 'Scheduling…' : `✓ Approve & schedule ${selected.size} posts`}
              </button>
            </div>

            {error && <div className="alert alert-red" style={{ margin:'12px 22px 0' }}><span>⚠</span>{error}</div>}

            {/* Post list */}
            <div style={{ overflowY:'auto', flex:1, padding:'12px 22px' }}>
              {generated.map((post, idx) => {
                const isSel = selected.has(post.id);
                const isEditing = editingId===post.id;
                return (
                  <div key={post.id} style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={()=>toggleSelect(post.id)}
                      style={{ marginTop:4, flexShrink:0, width:16, height:16, cursor:'pointer' }}
                    />
                    {/* Date + platform */}
                    <div style={{ width:80, flexShrink:0 }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--ink3)' }}>
                        {post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                      </div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--ink4)', marginTop:1 }}>
                        {post.scheduled_at ? new Date(post.scheduled_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : ''}
                      </div>
                      <div style={{ marginTop:4 }}><PlatformBadge platform={post.platform}/></div>
                    </div>
                    {/* Media thumbnail */}
                    <div style={{ width:84, height:84, flexShrink:0, borderRadius:'var(--r-sm)', overflow:'hidden', border:'1px solid var(--border)', background:'var(--bg2)', position:'relative', cursor:'pointer' }} onClick={()=>setSwapMediaId(post.id)} title="Click to swap image">
                      {(post.thumb || post._thumb || post.media_urls?.[0]) ? (
                        <img src={post.thumb || post._thumb || post.media_urls[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{ e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='flex'); }}/>
                      ) : null}
                      <div style={{ width:'100%', height:'100%', display: (post.thumb || post._thumb || post.media_urls?.[0]) ? 'none' : 'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexDirection:'column', gap:2, color:'var(--ink4)' }}>
                        <span>🖼️</span><span style={{ fontSize:8 }}>add</span>
                      </div>
                      <div style={{ position:'absolute', left:0, right:0, bottom:0, background:'rgba(0,0,0,.55)', textAlign:'center', fontSize:9, color:'#fff', fontWeight:600, padding:'2px 0', opacity:0, transition:'opacity .12s' }} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                        swap
                      </div>
                    </div>
                    {/* Caption */}
                    <div style={{ flex:1 }}>
                      {isEditing ? (
                        <div>
                          <textarea
                            className="form-textarea"
                            value={editCaption}
                            onChange={e=>setEditCaption(e.target.value)}
                            rows={4}
                            style={{ fontSize:12, marginBottom:6 }}
                          />
                          <div style={{ display:'flex', gap:6 }}>
                            <button className="btn btn-sm btn-primary" onClick={()=>handleEditSave(post)}>Save</button>
                            <button className="btn btn-sm" onClick={()=>setEditingId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize:12, color:'var(--ink2)', lineHeight:1.7 }}>{post.caption}</p>
                          {post.hashtags && <p style={{ fontSize:11, color:'var(--blue)', marginTop:4, lineHeight:1.6 }}>{post.hashtags}</p>}
                        </div>
                      )}
                    </div>
                    {/* Preview + Edit buttons */}
                    {!isEditing && (
                      <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                        <button className="btn btn-sm" onClick={()=>setPreviewPost(post)}>Preview</button>
                        <button className="btn btn-sm" onClick={()=>{setEditingId(post.id);setEditCaption(post.caption);}}>Edit</button>
                        <button className="btn btn-sm" style={{ color:'var(--red)' }} title="Discard this post" onClick={()=>handleDiscardOne(post.id)}>Discard</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Folder picker modal */}
        {showFolderPicker && (
          <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:70, paddingTop:40, overflowY:'auto' }}>
            <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:820, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
              <div style={{ padding:'14px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h3 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>📁 Select media folder</h3>
                <button onClick={()=>setShowFolderPicker(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
              </div>
              <div style={{ padding:'12px 20px', background:'var(--gold-bg)', borderBottom:'1px solid var(--border)' }}>
                <p style={{ fontSize:12, color:'var(--ink2)' }}>Browse to the folder containing your restaurant photos. Click <strong>"Use this folder"</strong> when you're in the right place.</p>
              </div>
              <div style={{ padding:'16px 20px 20px' }}>
                <FolderBrowser onSelect={(path)=>{ setF('dropboxFolder', path); setShowFolderPicker(false); }} onClose={()=>setShowFolderPicker(false)}/>
              </div>
            </div>
          </div>
        )}

        {/* Swap image modal */}
        {swapMediaId && (
          <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:70, paddingTop:40, overflowY:'auto' }}>
            <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:820, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
              <div style={{ padding:'14px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h3 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>🖼️ Swap image for this post</h3>
                <button onClick={()=>setSwapMediaId(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
              </div>
              <div style={{ padding:'16px 20px 20px' }}>
                <MediaLibrary pickMode={true} onPick={async (assets)=>{
                  if (!assets[0]) return;
                  try {
                    const linkData = await media.sharedLink(assets[0].path);
                    await agent1.updatePost(swapMediaId, { media_urls: [linkData.url] });
                    setGenerated(g => g.map(p => p.id===swapMediaId ? {...p, media_urls:[linkData.url], thumb:assets[0].thumbnail_url, _thumb:assets[0].thumbnail_url} : p));
                    setSwapMediaId(null);
                  } catch(e) { setError('Could not swap: ' + e.message); }
                }} onClose={()=>setSwapMediaId(null)}/>
              </div>
            </div>
          </div>
        )}

        {/* Instagram-style preview (shared component) */}
        {previewPost && <PostPreviewModal post={previewPost} locationName={locationName}
          onClose={()=>setPreviewPost(null)}
          onChangeImage={()=>{ setSwapMediaId(previewPost.id); setPreviewPost(null); }}/>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Agent1Marketing() {
  const { location:selectedLocationId, setLocation } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allLocations, setAllLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateTrend, setGenerateTrend] = useState(null);
  const [showBoost, setShowBoost] = useState(null);
  const [showBulk, setShowBulk]             = useState(false);
  // Phase 2: the tab lives in the URL (/marketing/:tab)
  const { tab: _urlTab } = useParams();
  const _nav = useNavigate();
  const _navLoc = useLocation();
  const activeTab = _urlTab || 'calendar';
  const setActiveTab = (t) => _nav('/marketing/' + t);
  useEffect(() => { // backcompat: old ?tab= links redirect to the path form
    const t = new URLSearchParams(_navLoc.search).get('tab');
    if (t) _nav('/marketing/' + t, { replace: true });
  }, [_navLoc.search]);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState(null);
  const [insights, setInsights] = useState(null);
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [ads, setAds] = useState([]);
  const [adInsights, setAdInsights] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [mediaAssets, setMediaAssets]  = useState([]);
  const [pendingMediaForPost, setPendingMediaForPost] = useState(null);

  const showToast = (msg,err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    locationsApi.list().then(locs=>{
      setAllLocations(locs);
      const active=selectedLocationId?locs.find(l=>l.id===selectedLocationId):null;
      setCurrentLocation(active||null);
    }).catch(()=>{});
  }, [selectedLocationId]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params={};
      if(currentLocation)params.locationId=currentLocation.id;
      if(filterPlatform)params.platform=filterPlatform;
      if(filterStatus)params.status=filterStatus;
      const data=await agent1.posts(params);
      setPosts(Array.isArray(data)?data:[]);
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  }, [currentLocation,filterPlatform,filterStatus]);

  const loadTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const concept = currentLocation?.name||'modern Indian restaurant';
      const data = await agent1.getTrends({ restaurantConcept:concept, location:'San Francisco Bay Area' });
      setTrends(Array.isArray(data)?data:[]);
    } catch(e){ console.error(e); }
    finally{ setTrendsLoading(false); }
  }, [currentLocation]);

  const loadAds = useCallback(async () => {
    try {
      const [adsData, insightsData] = await Promise.all([
        agent1.getAdBoosts({ locationId:currentLocation?.id }),
        agent1.getAdInsights({ locationId:currentLocation?.id, days:30 }),
      ]);
      setAds(Array.isArray(adsData)?adsData:[]);
      setAdInsights(Array.isArray(insightsData)?insightsData:[]);
    } catch(e){ console.error(e); }
  }, [currentLocation]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { if(activeTab==='trends')loadTrends(); }, [activeTab,loadTrends]);
  useEffect(() => { if(activeTab==='ads')loadAds(); }, [activeTab,loadAds]);
  useEffect(() => { if(activeTab==='insights')agent1.insights(currentLocation?.id,30).then(setInsights).catch(()=>{}); }, [activeTab,currentLocation]);

  const [igPublishPost, setIgPublishPost] = useState(null); // post awaiting image pick
  const [composePost, setComposePost] = useState(null); // false=closed, 'new'=write own, or a post object = edit
  const [queuePreview, setQueuePreview] = useState(null); // saved-post preview

  const handlePublish = async(post)=>{
    try{
      if (post.platform === 'instagram') {
        const st = await social.status().catch(()=>null);
        if (st?.instagram?.status !== 'active') { showToast('Connect Instagram first (Setup page or 📸 Instagram tab)', true); return; }
        setIgPublishPost(post); // opens the media picker
      } else {
        const r = await agent1.publishPost(post.id);
        r.platformError ? showToast(`Saved. Platform: ${r.platformError}`, true) : showToast('Published!');
        await loadPosts();
      }
    }catch(e){showToast(e.message,true);}
  };

  const doIgPublish = async (post, imageUrl) => {
    setIgPublishPost(null);
    if (!imageUrl) { showToast('That file has no public link — try another image', true); return; }
    showToast('Publishing to Instagram…');
    try {
      const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
      const r = await social.igPublish({ imageUrl, caption });
      await agent1.publishPost(post.id).catch(()=>{});
      showToast('✓ Live on Instagram' + (r.account ? ' as @' + r.account : ''));
      // Cross-post to Facebook Page if connected
      try {
        const st = await social.status();
        if (st?.facebook?.status === 'active' && window.confirm('Also post this to your Facebook Page?')) {
          const fr = await social.fbPublish({ imageUrl, message: caption });
          showToast('✓ Also on Facebook (' + (fr.page || 'Page') + ')');
        }
      } catch(e) { showToast('Facebook cross-post failed: ' + e.message, true); }
      if (r.permalink) window.open(r.permalink, '_blank');
      await loadPosts();
    } catch(e) { showToast(e.message, true); }
  };
  const handleApprove = async(post)=>{ try{ await agent1.approvePost(post.id,new Date(Date.now()+3600000).toISOString()); showToast('Approved & scheduled'); await loadPosts(); }catch(e){showToast(e.message,true);} };
  const handleDelete = async(id)=>{ if(!confirm('Delete?'))return; try{ await agent1.deletePost(id); showToast('Deleted'); await loadPosts(); }catch(e){showToast(e.message,true);} };

  const statusCounts={draft:posts.filter(p=>p.status==='draft').length,scheduled:posts.filter(p=>p.status==='scheduled').length,published:posts.filter(p=>p.status==='published').length};

  const tabs=[
    {key:'calendar', label:'Content calendar'},
    {key:'media',    label:'📁 Media library'},
    {key:'trends',   label:'🔥 Trends based Post Generation'},
    {key:'queue',    label:'Post queue'},
    {key:'insights', label:'📊 Social Media Insights'},
    {key:'newsletter',label:'✉️ Newsletter'},
    {key:'text',      label:'📲 Text & WhatsApp'},
    ...(SHOW_ADS ? [{key:'ads', label:'🚀 Ads & boosts'}] : []),
  ];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div style={{ flexBasis:'100%', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:3 }}>Business Growth &amp; Marketing <span style={{ color:'var(--gold)' }}>▸ {((tabs.find(t=>t.key===activeTab)||{}).label||activeTab).replace(/^[^A-Za-z]+/,'')}</span></div>
          <h1 className="page-title">Business Growth & Marketing</h1>
          <div className="page-sub">{statusCounts.draft} drafts · {statusCounts.scheduled} scheduled · {statusCounts.published} published</div>
        </div>
        <div className="topbar-right">
          {allLocations.length > 0 && (
            <span className="btn" style={{ cursor:'default', opacity:.9 }} title="Change restaurant from the sidebar">📍 {currentLocation?.name || 'All restaurants'}</span>
          )}
        </div>
      </div>


      <div className="content">
        {/* ── QUEUE ── */}
        {activeTab==='queue'&&(
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              {[
                {label:'Drafts',val:statusCounts.draft,color:'var(--ink3)'},
                {label:'Scheduled',val:statusCounts.scheduled,color:'var(--blue)'},
                {label:'Published this week',val:posts.filter(p=>p.status==='published'&&new Date(p.published_at)>new Date(Date.now()-7*86400000)).length,color:'var(--green)'},
                {label:'Total posts',val:posts.length,color:'var(--ink)'},
              ].map((s,i)=>(
                <div key={i} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color:s.color, fontSize:28 }}>{s.val}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--ink3)' }}>Filter:</span>
              {['',...PLATFORMS.map(p=>p.key)].map(p=>(
                <button key={p||'all'} className="btn btn-sm" style={filterPlatform===p?{background:'var(--ink)',color:'var(--card)',borderColor:'var(--ink)'}:{}} onClick={()=>setFilterPlatform(p)}>
                  {p?PLATFORMS.find(x=>x.key===p)?.label:'All platforms'}
                </button>
              ))}
              <div style={{ width:1, height:16, background:'var(--border2)', margin:'0 4px' }}/>
              {['','draft','scheduled','published'].map(s=>(
                <button key={s||'all'} className="btn btn-sm" style={filterStatus===s?{background:'var(--ink)',color:'var(--card)',borderColor:'var(--ink)'}:{}} onClick={()=>setFilterStatus(s)}>
                  {s||'All status'}
                </button>
              ))}
            </div>
            {loading?<div className="spinner"/>:posts.length===0?(
              <div className="empty-state">
                <div className="empty-state-icon">📱</div>
                <div className="empty-state-title">No posts yet</div>
                <div className="empty-state-sub" style={{ marginBottom:16 }}>Check the 🔥 Trends tab to find what's viral right now, then generate posts with Claude AI</div>
                <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
                  <button className="btn" onClick={()=>setActiveTab('trends')}>🔥 See trends</button>
                  <button className="btn btn-primary" onClick={()=>setShowGenerate(true)}>✦ Generate post</button>
                </div>
              </div>
            ):(
              posts.map(p=><PostCard key={p.id} post={p} onPublish={handlePublish} onApprove={handleApprove} onDelete={handleDelete} onBoost={SHOW_ADS ? (post=>setShowBoost(post)) : undefined} onEdit={post=>setComposePost(post)} onPreview={post=>setQueuePreview(post)}/>)
            )}
          </>
        )}

        {/* ── TRENDS ── */}
        {activeTab==='trends'&&(
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic', marginBottom:4 }}>What's trending right now</h2>
                <p style={{ fontSize:12, color:'var(--ink3)' }}>Claude researches current viral food content on Instagram — updated on demand</p>
              </div>
              <button className="btn btn-primary" onClick={loadTrends} disabled={trendsLoading}>
                {trendsLoading?'🔍 Researching…':'↻ Refresh trends'}
              </button>
            </div>
            {trendsLoading?(
              <div>
                <div className="spinner"/>
                <p style={{ textAlign:'center', fontSize:12, color:'var(--ink3)', marginTop:-20 }}>Claude is searching the web for current food trends…</p>
              </div>
            ):trends.length===0?(
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">Click "Refresh trends" to load</div>
                <div className="empty-state-sub">Claude will search the web for what's trending in food and restaurant content right now</div>
              </div>
            ):(
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {trends.map((t,i)=>(
                  <TrendCard key={i} trend={t} onCreatePost={trend=>{ setGenerateTrend(trend); setShowGenerate(true); }}/>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CALENDAR ── */}
        {activeTab==='calendar'&&(
          <>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:0, fontSize:12, color:'var(--ink3)' }}>
              {statusCounts.draft} drafts · {statusCounts.scheduled} scheduled · {statusCounts.published} published
            </div>
            <button className="btn btn-sm" onClick={loadPosts} title="Refresh">↻</button>
            <button className="btn btn-sm" onClick={()=>setShowBulk(true)}>📅 Bulk calendar</button>
            <button className="btn btn-sm" onClick={()=>setComposePost('new')}>✍️ Write post</button>
            <button className="btn btn-sm btn-primary" onClick={()=>{setGenerateTrend(null);setMediaAssets([]);setShowGenerate(true);}}>✦ Generate content</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
            <CalendarView posts={posts} onDayClick={(date,dayPosts)=>setSelectedDay({date,posts:dayPosts})}/>
            <div>
              <div className="card-raised">
                <div className="card-header"><span className="card-title">{selectedDay?selectedDay.date:'Select a day'}</span></div>
                <div className="card-body">
                  {!selectedDay?<p style={{ fontSize:12, color:'var(--ink3)', fontStyle:'italic' }}>Click a day to see posts</p>
                  :selectedDay.posts.length===0?(
                    <div style={{ textAlign:'center', padding:'20px 0' }}>
                      <p style={{ fontSize:12, color:'var(--ink3)', marginBottom:12 }}>No posts scheduled</p>
                      <button className="btn btn-sm btn-primary" onClick={()=>setShowGenerate(true)}>+ Create post</button>
                    </div>
                  ):(
                    selectedDay.posts.map((p,i)=>(
                      <div key={i} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5 }}><PlatformBadge platform={p.platform}/><span style={{ fontSize:10, color:STATUS_COLORS[p.status] }}>{p.status}</span></div>
                        <p style={{ fontSize:12, color:'var(--ink2)', lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.caption}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="card-raised" style={{ marginTop:14 }}>
                <div className="card-header"><span className="card-title">Daily cadence guide</span></div>
                <div className="card-body">
                  {[{time:'11am–12pm',platform:'instagram',tip:'Lunch — food shots'},{time:'5–7pm',platform:'facebook',tip:'Dinner announcements'},{time:'Weekly',platform:'gbp',tip:'Event / offer post'}].map((g,i)=>(
                    <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center' }}>
                      <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--ink3)', width:70, flexShrink:0 }}>{g.time}</span>
                      <PlatformBadge platform={g.platform}/>
                      <span style={{ fontSize:11, color:'var(--ink2)' }}>{g.tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {/* ── ADS & BOOSTS ── */}
        {activeTab==='ads'&&(
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic', marginBottom:4 }}>Ads & post boosts</h2>
                <p style={{ fontSize:12, color:'var(--ink3)' }}>Boost published posts or create new ad campaigns on Instagram and Facebook</p>
              </div>
              <button className="btn btn-primary" onClick={()=>setShowBoost({})}>🚀 Create ad campaign</button>
            </div>

            <div className="alert alert-blue" style={{ marginBottom:16 }}>
              <span>ℹ</span>
              <div>
                <strong>Setup required:</strong> To auto-launch ads, add <code>META_ACCESS_TOKEN</code> and your Meta Ad Account ID in Railway Variables. Until then, use <strong>Save boost draft</strong> to record budget/targeting settings and set them up manually in Meta Ads Manager.
                <br/>
                <strong>Google Ads:</strong> Requires Google Ads API developer token — contact us to wire that up when ready.
              </div>
            </div>

            {/* Ad performance summary */}
            {adInsights.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
                {[
                  {label:'Total spend',val:'$'+adInsights.reduce((s,r)=>s+(parseFloat(r.total_spend)||0),0).toFixed(0),color:'var(--ink)'},
                  {label:'Total impressions',val:adInsights.reduce((s,r)=>s+(parseInt(r.total_impressions)||0),0).toLocaleString(),color:'var(--blue)'},
                  {label:'Total clicks',val:adInsights.reduce((s,r)=>s+(parseInt(r.total_clicks)||0),0).toLocaleString(),color:'var(--green)'},
                  {label:'Active campaigns',val:ads.filter(a=>a.status==='active').length,color:'var(--gold)'},
                ].map((s,i)=>(
                  <div key={i} className="stat-card">
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ color:s.color, fontSize:22 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Boostable posts */}
            <div className="card-raised" style={{ marginBottom:14 }}>
              <div className="card-header"><span className="card-title">Published posts — boost these</span></div>
              <div className="card-body">
                {posts.filter(p=>p.status==='published').length===0?(
                  <p style={{ fontSize:12, color:'var(--ink3)', fontStyle:'italic' }}>Publish some posts first, then boost the best performers</p>
                ):(
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {posts.filter(p=>p.status==='published').slice(0,5).map(p=>(
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <PlatformBadge platform={p.platform}/>
                        <span style={{ fontSize:11, color:'var(--ink3)', width:80, flexShrink:0 }}>{p.location_name}</span>
                        <p style={{ fontSize:12, color:'var(--ink2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.caption}</p>
                        <div style={{ display:'flex', gap:6, fontSize:11, color:'var(--ink3)', flexShrink:0 }}>
                          {p.likes>0&&<span>❤️{p.likes}</span>}
                          {p.reach>0&&<span>👁{p.reach}</span>}
                        </div>
                        {SHOW_ADS && <button className="btn btn-sm" onClick={()=>setShowBoost(p)} style={{ background:'var(--gold-bg)', borderColor:'var(--gold-border)', color:'var(--gold)', flexShrink:0 }}>🚀 Boost</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Existing boosts */}
            {ads.length > 0 && (
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Ad campaigns</span></div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:'var(--bg)' }}>{['Platform','Status','Budget/day','Start','End','Spend','Impressions','Clicks','Results'].map(h=><th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {ads.map((a,i)=>(
                        <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={{ padding:'9px 14px' }}><PlatformBadge platform={a.platform}/></td>
                          <td style={{ padding:'9px 14px', color:a.status==='active'?'var(--green)':a.status==='error'?'var(--red)':'var(--ink3)', fontWeight:500, fontSize:11 }}>{a.status}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>${(a.daily_budget_cents/100).toFixed(0)}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{a.start_date?.slice(0,10)}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{a.end_date?.slice(0,10)}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>${(a.spend_cents/100).toFixed(2)}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{a.impressions?.toLocaleString()||'—'}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{a.clicks?.toLocaleString()||'—'}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{a.results?.toLocaleString()||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MEDIA LIBRARY ── */}
        {activeTab==='media'&&(
          <MediaLibrary
            onPick={assets => { setMediaAssets(assets); setActiveTab('queue'); setShowGenerate(true); }}
          />
        )}

        {/* ── INSIGHTS ── */}
        {activeTab==='insights'&&(
          <>
            <LiveIgPerformance/>
            {!insights?<div className="spinner"/>:(
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                  {PLATFORMS.map(platform=>{
                    const data=insights.summary?.filter(s=>s.platform===platform.key)||[];
                    const published=data.find(s=>s.status==='published');
                    return(
                      <div key={platform.key} className="stat-card" style={{ borderLeft:`3px solid ${platform.color}` }}>
                        <div className="stat-label">{platform.icon} {platform.label}</div>
                        <div className="stat-value" style={{ fontSize:24, color:platform.color }}>{published?.post_count||0}</div>
                        <div className="stat-delta delta-muted">posts published</div>
                        {published?.total_likes>0&&<div style={{ marginTop:8, fontSize:11, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{Number(published.total_likes).toLocaleString()} likes · {Number(published.avg_likes).toLocaleString()} avg</div>}
                      </div>
                    );
                  })}
                </div>
                {insights.recentPosts?.length>0&&(
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Recent post performance</span></div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead><tr style={{ background:'var(--bg)' }}>{['Published','Platform','Restaurant','Caption','Likes','Comments','Reach'].map(h=><th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {insights.recentPosts.map((p,i)=>(
                            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{p.published_at?new Date(p.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</td>
                              <td style={{ padding:'9px 14px' }}><PlatformBadge platform={p.platform}/></td>
                              <td style={{ padding:'9px 14px', fontSize:11 }}>{p.location_name}</td>
                              <td style={{ padding:'9px 14px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--ink2)' }}>{p.caption}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{p.likes?.toLocaleString()||'—'}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{p.comments?.toLocaleString()||'—'}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{p.reach?.toLocaleString()||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {activeTab==='newsletter' && (
          <NewsletterTab location={currentLocation}/>
        )}
        {activeTab==='text' && (
          <TextMarketingTab location={currentLocation}/>
        )}
      </div>

      {queuePreview && <PostPreviewModal post={queuePreview} onClose={()=>setQueuePreview(null)} onChangeImage={()=>{ const pp=queuePreview; setQueuePreview(null); setComposePost(pp); }}/>}
      {composePost && <ComposePostModal
        post={composePost === 'new' ? null : composePost}
        locations={allLocations}
        onClose={() => setComposePost(null)}
        onSaved={async () => { setComposePost(null); showToast('Saved'); await loadPosts(); }}
      />}
      {igPublishPost && <MediaPickerModal
        onPick={files => doIgPublish(igPublishPost, files?.[0]?.secure_url)}
        onClose={() => setIgPublishPost(null)}
      />}
      {showGenerate&&<GenerateModal
        locations={allLocations.length>0?allLocations:[{id:'',name:'Restaurant'}]}
        defaultLocationId={currentLocation?.id}
        onClose={()=>{setShowGenerate(false);setGenerateTrend(null);setMediaAssets([]);}}
        onCreated={()=>{loadPosts();showToast('Post saved to queue');}}
        initialTrend={generateTrend}
        initialMedia={mediaAssets}
      />}
      {/* Folder picker inside BulkCalendarModal - rendered via portal-style inside */}
      {showBulk&&<BulkCalendarModal
        locations={allLocations}
        currentLocationId={currentLocation?.id}
        onClose={()=>setShowBulk(false)}
        onCreated={(count)=>{ setShowBulk(false); loadPosts(); showToast(`${count} posts scheduled!`); }}
      />}
      {showBoost&&<BoostModal post={showBoost?.id?showBoost:null} locations={allLocations} onClose={()=>setShowBoost(null)} onCreated={()=>{loadAds();showToast('Ad boost created');}}/>}
      {toast&&<div className="toast" style={{ background:toast.err?'var(--red)':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </>
  );
}


// ── Live Instagram performance (real account data) ─────────────────────────────
function LiveIgPerformance() {
  const [live, setLive] = useState(undefined); // undefined=loading, null=not connected
  useEffect(() => {
    (async () => {
      try {
        const st = await social.status();
        if (st?.instagram?.status !== 'active') { setLive(null); return; }
        const [ins, med] = await Promise.all([social.igInsights(), social.igMedia()]);
        setLive({ ins, med });
      } catch(e) { setLive(null); }
    })();
  }, []);
  if (live === undefined) return <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:14 }}>📸 Loading live Instagram data…</div>;
  if (!live) return null;
  const reach30 = live.ins?.metrics?.find(m=>m.name==='reach')?.total_value?.value;
  const views30 = live.ins?.metrics?.find(m=>m.name==='profile_views')?.total_value?.value;
  return (
    <div className="card" style={{ padding:'16px 20px', marginBottom:20, borderLeft:'3px solid #E1306C' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:700 }}>📸 Live from Instagram</span>
        <span style={{ fontSize:11, color:'var(--ink3)' }}>@{live.ins?.account}</span>
        <span style={{ fontSize:9, padding:'1px 7px', borderRadius:10, background:'rgba(62,207,142,.12)', color:'#3ECF8E', fontWeight:700, marginLeft:'auto' }}>REAL DATA</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
        {[{l:'Followers',v:live.ins?.followers},{l:'Posts',v:live.ins?.mediaCount},{l:'Reach (30d)',v:reach30},{l:'Profile views (30d)',v:views30}].map((s,i)=>(
          <div key={i}><div style={{ fontFamily:'var(--mono)', fontSize:17, fontWeight:700 }}>{s.v!=null?Number(s.v).toLocaleString():'—'}</div><div style={{ fontSize:10, color:'var(--ink3)' }}>{s.l}</div></div>
        ))}
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead><tr>{['Posted','Caption','❤️','💬',''].map(h=><th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:10, color:'var(--ink3)', textTransform:'uppercase', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
        <tbody>
          {(live.med?.media||[]).slice(0,8).map((m,i)=>(
            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
              <td style={{ padding:'6px 10px', fontFamily:'var(--mono)', fontSize:11, color:'var(--ink3)', whiteSpace:'nowrap' }}>{m.timestamp?new Date(m.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</td>
              <td style={{ padding:'6px 10px', maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.caption||'—'}</td>
              <td style={{ padding:'6px 10px', fontFamily:'var(--mono)' }}>{m.like_count??'—'}</td>
              <td style={{ padding:'6px 10px', fontFamily:'var(--mono)' }}>{m.comments_count??'—'}</td>
              <td style={{ padding:'6px 10px' }}><a href={m.permalink} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--gold)' }}>View ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ── Compose / edit post (manual content) ───────────────────────────────────────
function ComposePostModal({ post, locations, onClose, onSaved }) {
  const isEdit = !!post;
  const [form, setForm] = useState({
    platform:    post?.platform || 'instagram',
    locationId:  post?.location_id || locations?.[0]?.id || '',
    caption:     post?.caption || '',
    hashtags:    post?.hashtags || '',
    scheduledAt: post?.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0,16) : '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [media, setMedia] = useState(
    (post?.media_urls || []).map(u => ({ secure_url: u, thumbnail_url: u }))
  );
  const [pickMedia, setPickMedia] = useState(false);
  const f = (k,v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.caption.trim()) { setErr('Caption required'); return; }
    setSaving(true); setErr(null);
    try {
      const scheduled_at = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null;
      if (isEdit) {
        // Backend only allows these fields on update (platform/location are fixed)
        await agent1.updatePost(post.id, {
          caption: form.caption, hashtags: form.hashtags,
          media_urls: media.map(a => a.secure_url),
          scheduled_at,
          status: scheduled_at ? 'scheduled' : post.status,
        });
      } else {
        await agent1.createPost({
          platform: form.platform, location_id: form.locationId || null,
          caption: form.caption, hashtags: form.hashtags,
          media_urls: media.map(a => a.secure_url),
          media_type: media.some(a => a.resource_type === 'video') ? 'VIDEO' : 'IMAGE',
          scheduled_at,
        });
      }
      onSaved();
    } catch(e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--card-raised, var(--bg-2))', borderRadius:'var(--r-lg)', width:560, maxWidth:'95vw', border:'1px solid var(--border)', padding:24, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>{isEdit ? '✏️ Edit post' : '✍️ Write a post'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Platform</label>
            <select className="form-select" value={form.platform} onChange={e=>f('platform',e.target.value)} disabled={isEdit}>
              {PLATFORMS.map(p=><option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Restaurant</label>
            <select className="form-select" value={form.locationId} onChange={e=>f('locationId',e.target.value)} disabled={isEdit}>
              {(locations||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Caption</label>
          <textarea className="form-input" rows={6} value={form.caption} onChange={e=>f('caption',e.target.value)}
            placeholder="Write your post…" style={{ resize:'vertical', lineHeight:1.7 }}/>
          <div style={{ fontSize:10, color:'var(--ink3)', textAlign:'right', marginTop:2 }}>{form.caption.length} chars</div>
        </div>
        <div className="form-group">
          <label className="form-label">Hashtags <span style={{ fontWeight:400, color:'var(--ink3)' }}>(optional)</span></label>
          <input className="form-input" value={form.hashtags} onChange={e=>f('hashtags',e.target.value)} placeholder="#sanfrancisco #indianfood"/>
        </div>
        <div className="form-group">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <label className="form-label" style={{ marginBottom:0 }}>Media {media.length > 0 ? `· ${media.length}` : '(optional)'}</label>
            <button type="button" className="btn btn-sm" onClick={()=>setPickMedia(true)}>📁 {media.length ? 'Change media' : 'Add media'}</button>
            {media.length > 0 && <button type="button" className="btn btn-sm" style={{ color:'var(--red)' }} onClick={()=>setMedia([])}>Remove</button>}
          </div>
          {media.length > 0 ? (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {media.map((a,i) => (
                <div key={i} style={{ position:'relative', width:72, height:72, borderRadius:'var(--r-sm)', overflow:'hidden', border:'1px solid var(--border)' }}>
                  <img src={a.thumbnail_url||a.secure_url} alt={a.alt_text||''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  {a.resource_type==='video' && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.4)', fontSize:16 }}>▶</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:11, color:'var(--ink3)' }}>Instagram posts need an image or video to publish.</div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Schedule <span style={{ fontWeight:400, color:'var(--ink3)' }}>(leave empty to keep as draft)</span></label>
          <input className="form-input" type="datetime-local" value={form.scheduledAt} onChange={e=>f('scheduledAt',e.target.value)}/>
        </div>
        {err && <div style={{ fontSize:12, color:'#E24B4A', marginBottom:8 }}>⚠ {err}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSave} disabled={saving||!form.caption.trim()}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create post'}
          </button>
        </div>
      </div>
      {pickMedia && <MediaPickerModal
        onPick={assets=>{ setMedia(assets); setPickMedia(false); }}
        onClose={()=>setPickMedia(false)}
      />}
    </div>
  );
}
