import React, { useState, useEffect } from 'react';
import { useAuth } from '../App.jsx';
import { locations as locationsApi, tenants, tenants as tenantsApi, agent8, billing } from '../lib/api.js';
import { AGENT_META } from '@restaurantos/shared';

// ── Brand Profile Editor ──────────────────────────────────────────────────────
function BrandProfileEditor({ loc, onSaved }) {
  const [form, setForm] = useState({
    brand_voice:        loc.brand_voice || '',
    brand_personality:  loc.brand_personality || '',
    brand_colors:       loc.brand_colors || '',
    brand_keywords:     loc.brand_keywords || '',
    brand_avoid:        loc.brand_avoid || '',
    brand_examples:     loc.brand_examples || '',
    instagram_handle:   loc.instagram_handle || '',
    facebook_page_id:   loc.facebook_page_id || '',
    instagram_account_id: loc.instagram_account_id || '',
    dropbox_folder:       loc.dropbox_folder || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const f = (key, label, placeholder, multiline = false, hint = '') => (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label className="form-label">{label}</label>
      {multiline ? (
        <textarea className="form-textarea" rows={3} value={form[key]} onChange={e => setForm(p => ({...p,[key]:e.target.value}))} placeholder={placeholder} style={{ fontSize: 12 }}/>
      ) : (
        <input className="form-input" value={form[key]} onChange={e => setForm(p => ({...p,[key]:e.target.value}))} placeholder={placeholder} style={{ fontSize: 12 }}/>
      )}
      {hint && <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>{hint}</div>}
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await locationsApi.update(loc.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        ✦ Brand voice & identity
      </div>

      {f('brand_voice', 'Brand voice', 'Sophisticated yet approachable. Focuses on craft, spice, and story. Poetic without being pretentious. Never uses the words "delicious" or "amazing".', true,
        'This is the most important field — Claude uses this when writing every caption. Be specific.')}

      {f('brand_personality', 'Brand personality', 'Warm, cosmopolitan, artistic. Like a well-traveled friend who loves food and culture.', false,
        'A few adjectives and a one-line description of the feeling you want to create.')}

      {f('brand_keywords', 'Keywords & themes to use', 'craft, spice, journey, discovery, warmth, community, heritage, modern, bold', false,
        'Comma separated words that should appear naturally in captions.')}

      {f('brand_avoid', 'Words & phrases to NEVER use', 'delicious, amazing, mouth-watering, foodie, come on in, we are open, check us out', false,
        'Comma separated. Claude will actively avoid these.')}

      {f('brand_colors', 'Visual aesthetic / colors', 'Deep jewel tones — saffron, burgundy, emerald. Warm candlelight. Rich textures. Never flat white backgrounds.', false,
        'Helps Claude describe visuals that match your brand in captions.')}

      {f('brand_examples', 'Example captions (paste 2-3 real ones)', `"Where spice meets story — our lamb biryani carries three generations of tradition.\n\nA table set, a story told. Come see what we've been cooking."`, true,
        'Paste your best existing captions so Claude learns your exact tone and style.')}

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 14, marginTop: 20, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        Social accounts
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {f('instagram_handle', 'Instagram handle', '@fitoor_sr')}
        {f('instagram_account_id', 'Instagram Account ID', '17841400000000000', false, 'From Meta Business Manager')}
        {f('facebook_page_id', 'Facebook Page ID', '12345678', false, 'From Meta Business Manager')}
      </div>
      <div style={{ marginTop: 10 }}>
        {f('dropbox_folder', 'Dropbox media folder for bulk posts', '/Fitoor jpg', false, 'The Dropbox folder path Claude pulls images from when generating bulk posts. e.g. /Fitoor jpg or /Photos/Fitoor SR')}
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: 8 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save brand profile'}
      </button>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [locs, setLocs]                     = useState([]);
  const [activeAgents, setActiveAgents]     = useState(user?.activeAgents || []);
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState(null);
  const [selectedLoc, setSelectedLoc]       = useState(null);
  const [brandTab, setBrandTab]             = useState(false);
  const [loyaltyConfig, setLoyaltyConfig]   = useState(null);
  const [savingLoyalty, setSavingLoyalty]   = useState(false);
  const [loyaltySaved, setLoyaltySaved]     = useState(false);
  const [groupName, setGroupName]           = useState(user?.tenantName || '');
  const [plans, setPlans]                   = useState([]);
  const [billingStatus, setBillingStatus]   = useState(null);
  const [savingGroup, setSavingGroup]       = useState(false);

  useEffect(() => {
    locationsApi.list().then(l => { setLocs(l); if (l.length) setSelectedLoc(l[0]); }).catch(() => {});
    agent8.getConfig().then(cfg => setLoyaltyConfig(cfg)).catch(() => {});
    billing.plans().then(p => { if (Array.isArray(p)) setPlans(p); }).catch(() => {});
    billing.status().then(s => { if (s) setBillingStatus(s); }).catch(() => {});
  }, []);

  const showToast = (msg, err = false) => { setToast({msg,err}); setTimeout(() => setToast(null), 3000); };

  const toggleAgent = id => setActiveAgents(p => p.includes(id) ? p.filter(a => a !== id) : [...p, id]);

  const saveAgents = async () => {
    setSaving(true);
    try { await tenants.updateAgents(activeAgents); showToast('Saved'); }
    catch(e) { showToast(e.message, true); }
    finally { setSaving(false); }
  };

  const reloadLocs = () => locationsApi.list().then(l => { setLocs(l); if (selectedLoc) setSelectedLoc(l.find(x => x.id === selectedLoc.id) || l[0]); }).catch(() => {});

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Platform configuration · {user?.tenantName}</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={saveAgents} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>

      <div className="content">

        {/* ── Billing & Plan ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Billing & subscription</span>
            {billingStatus?.subscription_status && (
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:600, background:'#2A2010', color:'#E8A020' }}>
                {billingStatus.subscription_status === 'trialing' ? '14-day trial active' : billingStatus.subscription_status}
              </span>
            )}
          </div>
          <div className="card-body">
            {billingStatus?.plan_name ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, textTransform:'capitalize' }}>{billingStatus.plan_name} plan</div>
                  {billingStatus.trial_ends_at && (
                    <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>
                      Trial ends {new Date(billingStatus.trial_ends_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </div>
                  )}
                </div>
                <button className="btn" onClick={async()=>{
                    try {
                      const d = await billing.portal();
                      window.open(d.url, '_blank');
                    } catch(e) {
                      if (e.message?.includes('NO_CUSTOMER') || e.message?.includes('No billing')) {
                        window.location.href = '/onboarding';
                      } else {
                        alert(e.message);
                      }
                    }
                  }}>
                  Manage billing ↗
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:13, color:'var(--ink-3)' }}>No active subscription — 14-day free trial available</div>
                <a href="/onboarding" className="btn btn-primary">Start free trial →</a>
              </div>
            )}
          </div>
        </div>

        {/* ── Plan configuration (owner only) ── */}
        {user?.role === 'owner' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Plan tiers configuration</span>
            <span style={{ fontSize:11, color:'var(--ink-3)' }}>Set in Railway environment variables</span>
          </div>
          <div className="card-body">
            <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:12, lineHeight:1.6 }}>
              To change plan names or prices, update these Railway variables and redeploy:
            </div>
            <div style={{ background:'var(--bg-3)', borderRadius:'var(--r-sm)', padding:'12px 14px', fontFamily:'var(--mono)', fontSize:11, lineHeight:2, color:'var(--ink-2)' }}>
              {['PLAN_NAME_APPETIZER','PLAN_NAME_ENTREE','PLAN_NAME_BUFFET','STRIPE_PRICE_APPETIZER','STRIPE_PRICE_ENTREE','STRIPE_PRICE_BUFFET'].map(k=>(
                <div key={k}><span style={{ color:'var(--gold)' }}>{k}</span> = <span style={{ color:'var(--ink-3)' }}>set in Railway Variables</span></div>
              ))}
            </div>
            {plans.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Current plans</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                  {plans.map(p=>(
                    <div key={p.id} style={{ padding:'12px', background:'var(--bg-3)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'var(--gold)', marginTop:4 }}>${p.amount}<span style={{ fontSize:11, color:'var(--ink-3)', fontFamily:'var(--sans)' }}>/mo</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Loyalty Program ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Loyalty program</span>
            {loyaltySaved && <span style={{ fontSize:11, color:'#3ECF8E' }}>✓ Saved</span>}
          </div>
          <div className="card-body">
            {loyaltyConfig ? (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Program name</label>
                    <input className="form-input" value={loyaltyConfig.program_name||''} onChange={e=>setLoyaltyConfig(c=>({...c,program_name:e.target.value}))} placeholder="e.g. Spice Circle"/>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Tagline</label>
                    <input className="form-input" value={loyaltyConfig.program_tagline||''} onChange={e=>setLoyaltyConfig(c=>({...c,program_tagline:e.target.value}))} placeholder="e.g. Earn points every visit"/>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Accent colour</label>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input type="color" value={loyaltyConfig.accent_color||'#E8A020'} onChange={e=>setLoyaltyConfig(c=>({...c,accent_color:e.target.value}))} style={{ width:40, height:36, borderRadius:4, border:'1px solid var(--border-2)', cursor:'pointer', padding:2 }}/>
                      <input className="form-input" value={loyaltyConfig.accent_color||''} onChange={e=>setLoyaltyConfig(c=>({...c,accent_color:e.target.value}))} placeholder="#E8A020" style={{ flex:1 }}/>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Earn rate (pts per $100)</label>
                    <input className="form-input" type="number" min={1} value={loyaltyConfig.earn_rate||10} onChange={e=>setLoyaltyConfig(c=>({...c,earn_rate:parseInt(e.target.value)}))}/>
                  </div>
                </div>

                <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10, marginTop:8 }}>Tier names</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  {(loyaltyConfig.tiers||[]).map((tier, i) => (
                    <div key={i} className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ color: tier.color }}>{['Tier 1','Tier 2','Tier 3','Tier 4'][i]}</label>
                      <input className="form-input" value={tier.label} onChange={e=>{
                        const tiers = [...(loyaltyConfig.tiers||[])];
                        tiers[i] = {...tiers[i], label: e.target.value};
                        setLoyaltyConfig(c=>({...c, tiers}));
                      }} style={{ fontSize:12 }}/>
                    </div>
                  ))}
                </div>

                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ fontSize:12, color:'var(--ink-3)', flex:1 }}>
                    Member portal: <span style={{ fontFamily:'var(--mono)', color:'var(--ink-2)' }}>{window.location.origin}/member/[member-code]</span>
                  </div>
                  <button className="btn btn-primary" disabled={savingLoyalty} onClick={async()=>{
                    setSavingLoyalty(true);
                    try {
                      await agent8.saveConfig(loyaltyConfig);
                      setLoyaltySaved(true);
                      setTimeout(()=>setLoyaltySaved(false), 3000);
                    } catch(e) { alert(e.message); }
                    finally { setSavingLoyalty(false); }
                  }}>
                    {savingLoyalty ? 'Saving…' : 'Save loyalty config'}
                  </button>
                </div>
              </>
            ) : <div className="spinner"/>}
          </div>
        </div>

        {/* ── Brand profiles ── */}
        <div className="card-raised" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Brand profiles</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Shapes how Claude writes for each restaurant</span>
          </div>
          <div style={{ display: 'flex', minHeight: 500 }}>
            {/* Location sidebar */}
            <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '12px 0' }}>
              {locs.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLoc(loc)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px',
                    background: selectedLoc?.id === loc.id ? 'var(--bg-2)' : 'none',
                    border: 'none', borderLeft: `3px solid ${selectedLoc?.id === loc.id ? 'var(--gold)' : 'transparent'}`,
                    cursor: 'pointer', fontSize: 12, color: selectedLoc?.id === loc.id ? 'var(--gold)' : 'var(--ink2)',
                    fontWeight: selectedLoc?.id === loc.id ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: loc.brand_voice ? '#3ECF8E' : 'var(--border-2)', flexShrink: 0 }}/>
                  {loc.name}
                </button>
              ))}
            </div>
            {/* Brand editor */}
            <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
              {selectedLoc ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontStyle: 'italic' }}>{selectedLoc.name}</h2>
                    {selectedLoc.brand_voice && <span className="tag tag-green">Brand profile set ✓</span>}
                  </div>
                  <BrandProfileEditor loc={selectedLoc} onSaved={reloadLocs}/>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-title">Select a restaurant</div>
                  <div className="empty-state-sub">Pick a restaurant from the left to set up its brand profile</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Active agents ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Active agents</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{activeAgents.length} / 8 enabled</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {Object.entries(AGENT_META).map(([id, meta]) => (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', cursor: 'pointer', border: `1px solid ${activeAgents.includes(id) ? 'var(--border-2)' : 'var(--border)'}` }}>
                  <input type="checkbox" checked={activeAgents.includes(id)} onChange={() => toggleAgent(id)}/>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{meta.name}</span>
                  {id === 'agent_4_reviews' && <span className="tag tag-green" style={{ marginLeft: 'auto' }}>Live</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Locations list ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Locations</span>
          </div>
          <div className="card-body">
            {locs.map(loc => (
              <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{loc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{loc.address}, {loc.city}, {loc.state}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {loc.brand_voice && <span className="tag tag-green">Brand ✓</span>}
                  <button className="btn btn-sm" onClick={() => setSelectedLoc(loc)}>Edit brand</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── API credentials ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span className="card-title">API credentials</span></div>
          <div className="card-body">
            <div className="alert alert-blue" style={{ marginBottom: 12 }}>
              <span>ℹ</span>
              <div>Credentials are stored server-side in Railway Variables — never in the browser.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { name: 'ANTHROPIC_API_KEY',       label: 'Claude AI',           req: true },
                { name: 'DROPBOX_ACCESS_TOKEN',     label: 'Dropbox Media',       req: false },
                { name: 'META_ACCESS_TOKEN',        label: 'Instagram/Facebook',  req: false },
                { name: 'GOOGLE_CLIENT_ID',         label: 'Google GBP API',      req: false },
                { name: 'DATABASE_URL',             label: 'PostgreSQL',          req: true },
                { name: 'JWT_SECRET',               label: 'JWT Secret',          req: true },
              ].map(v => (
                <div key={v.name} style={{ background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink3)', marginBottom: 3 }}>{v.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {v.label} {v.req && <span className="tag tag-red">Required</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Account ── */}
        <div className="card">
          <div className="card-header"><span className="card-title">Account</span></div>
          <div className="card-body">
            <div style={{ marginBottom:16 }}>
              <label className="form-label">Group / company name</label>
              <div style={{ display:'flex', gap:8 }}>
                <input className="form-input" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Pippal Restaurant Group" style={{ fontSize:13 }}/>
                <button className="btn btn-primary" disabled={savingGroup} onClick={async()=>{
                  setSavingGroup(true);
                  try {
                    await tenantsApi.updateName(groupName);
                    // Update localStorage so the new name shows immediately without re-login
                    const stored = localStorage.getItem('ros_user');
                    if (stored) {
                      const u = JSON.parse(stored);
                      u.tenantName = groupName;
                      localStorage.setItem('ros_user', JSON.stringify(u));
                    }
                    window.location.reload();
                  }
                  catch(e) { alert(e.message); }
                  finally { setSavingGroup(false); }
                }}>
                  {savingGroup ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 12 }}>
              {[['Email', user?.email||'—'],['Role', user?.role||'—'],['Plan', user?.plan||'starter']].map(([l,v]) => (
                <React.Fragment key={l}><span style={{ color:'var(--ink3)', fontWeight:500 }}>{l}</span><span>{v}</span></React.Fragment>
              ))}
            </div>
          </div>
        </div>

      </div>

      {toast && <div className="toast" style={{ background: toast.err ? '#E24B4A' : 'var(--ink)' }}>{toast.err ? '⚠' : '✓'} {toast.msg}</div>}
    </>
  );
}
