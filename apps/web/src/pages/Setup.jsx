import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../App.jsx';
import { integrations, pos } from '../lib/api.js';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export default function Setup() {
  const { user } = useAuth();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBizForm, setShowBizForm] = useState(false);
  const [toast, setToast]     = useState(null);
  const [provisioning, setProvisioning] = useState(false);
  const [posStatus, setPosStatus]       = useState(null);
  const [posBusy, setPosBusy]           = useState(false);
  const [showToastImport, setShowToastImport] = useState(false);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),4000); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([integrations.setupStatus(), pos.status().catch(()=>null)])
      .then(([s, p]) => { setStatus(s); setPosStatus(p); })
      .catch(e => showToast(e.message, true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleProvisionSms = async () => {
    setProvisioning(true);
    try {
      const r = await integrations.provisionTwilio(user?.tenantName);
      showToast(r.phoneNumber ? `Your texting number ${r.phoneNumber} is being registered` : r.message || 'SMS setup started');
      load();
    } catch(e) {
      if (e.message?.includes('Business info')) {
        setShowBizForm(true);
        showToast('First, tell us about your business', true);
      } else {
        showToast(e.message, true);
      }
    } finally { setProvisioning(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pos') === 'square_connected') { showToast('Square connected! Syncing your sales…'); pos.squareSync(90).then(r=>{showToast(`Imported ${r.ordersProcessed} orders`); load();}).catch(e=>showToast(e.message,true)); window.history.replaceState({},'','/setup'); }
    if (params.get('social')?.endsWith('_connected')) { showToast(params.get('social').replace('_connected','') + ' connected!'); load(); window.history.replaceState({},'','/setup'); }
    if (params.get('social')?.endsWith('_error')) { showToast(params.get('msg')||'Connection failed', true); window.history.replaceState({},'','/setup'); }
    if (params.get('pos') === 'square_error') { showToast(params.get('msg')||'Square connection failed', true); window.history.replaceState({},'','/setup'); }
  }, []);

  const handleSendInvite = async (which) => {
    const label = which === 'instagram' ? 'Instagram' : which === 'facebook' ? 'Facebook Page' : 'Google Business';
    const email = window.prompt(`Who manages the ${label} account?\nEnter their email — we'll send them a secure authorization link (valid 7 days):`);
    if (!email) return;
    try {
      const { social } = await import('../lib/api.js');
      const r = await social.sendInvite(which, email.trim());
      if (r.emailed) showToast(`Connect link emailed to ${email.trim()}`);
      else { await navigator.clipboard.writeText(r.url).catch(()=>{}); showToast('Email not configured — link copied to clipboard, send it to them yourself'); }
    } catch(e) { showToast(e.message, true); }
  };

  const handleSocialConnect = async (which) => {
    setPosBusy(true);
    try {
      const { social } = await import('../lib/api.js');
      const r = which === 'instagram' ? await social.metaConnect()
              : which === 'facebook'  ? await social.fbConnect()
              : await social.googleConnect();
      window.location.href = r.url;
    } catch(e) { showToast(e.message, true); setPosBusy(false); }
  };

  const handleSquareConnect = async () => {
    setPosBusy(true);
    try { const r = await pos.squareConnect(); window.location.href = r.url; }
    catch(e) { showToast(e.message, true); setPosBusy(false); }
  };
  const handleSquareSync = async () => {
    setPosBusy(true);
    try { const r = await pos.squareSync(30); showToast(`Synced ${r.ordersProcessed} orders into ${r.weekBucketsWritten} weeks`); }
    catch(e) { showToast(e.message, true); }
    finally { setPosBusy(false); }
  };
  const handleToastSync = async () => {
    setPosBusy(true);
    try { const r = await pos.toastSync(30); showToast(`Synced ${r.ordersProcessed} checks into ${r.weekBucketsWritten} weeks`); }
    catch(e) { showToast(e.message, true); }
    finally { setPosBusy(false); }
  };

  const STEPS = status ? [
    {
      id: 'business',
      icon: '🏢',
      title: 'Tell us about your business',
      desc: 'Legal name, EIN, and address — needed to register your texting number with carriers.',
      done: status.businessInfo,
      statusLabel: status.businessInfo ? 'Complete' : null,
      action: () => setShowBizForm(true),
      actionLabel: status.businessInfo ? 'Edit' : 'Fill in',
    },
    {
      id: 'sms',
      icon: '💬',
      title: 'Set up text messaging',
      desc: status.sms === 'pending_10dlc'
        ? `Your number ${status.smsNumber || ''} is being registered with carriers (5-10 business days). You can send test texts to yourself meanwhile.`
        : 'We\'ll get you a dedicated texting number and handle the carrier registration for you.',
      done: status.sms === 'active',
      pending: status.sms === 'pending_10dlc' || status.sms === 'provisioning',
      error: status.sms === 'error',
      statusLabel: status.sms === 'active' ? status.smsNumber
        : status.sms === 'pending_10dlc' ? 'Registering…'
        : status.sms === 'provisioning' ? 'Setting up…'
        : status.sms === 'error' ? 'Needs attention' : null,
      action: handleProvisionSms,
      actionLabel: status.sms === 'error' ? 'Retry' : 'Set up',
      disabled: !status.businessInfo || provisioning,
      disabledHint: !status.businessInfo ? 'Complete business info first' : null,
    },
    {
      id: 'pos',
      icon: '🧾',
      title: 'Connect your POS',
      desc: posStatus?.square?.status === 'active'
        ? `Square connected${posStatus.square.lastSync ? ' · last synced ' + new Date(posStatus.square.lastSync).toLocaleDateString() : ''}. Your sales flow into Business Health & KPIs automatically.`
        : posStatus?.toast?.status === 'configured'
        ? `Toast configured for ${posStatus.toast.locationCount} location(s). Sales sync into Business Health & KPIs.`
        : 'Connect Square with one click, or use Toast. Your sales fill the Financial KPI dashboards automatically — no more weekly data entry.',
      done: posStatus?.square?.status === 'active' || posStatus?.toast?.status === 'configured',
      statusLabel: posStatus?.square?.status === 'active' ? 'Square connected'
        : posStatus?.toast?.status === 'configured' ? 'Toast configured' : null,
      customActions: true,
    },
    {
      id: 'contacts',
      icon: '👥',
      title: 'Import your guest list',
      desc: 'Export your guests from OpenTable, Resy, Tock or Toast and import them for newsletters and texts.',
      done: status.contactsImported,
      statusLabel: status.contactsImported ? `${status.contactCount} contacts` : null,
      href: '/marketing',
      actionLabel: 'Go to import',
    },
    {
      id: 'staff',
      icon: '🧑‍🍳',
      title: 'Add your team',
      desc: 'Add staff for scheduling, the staff app, and team messaging.',
      done: status.staffAdded,
      statusLabel: status.staffAdded ? `${status.staffCount} team members` : null,
      href: '/labor',
      actionLabel: 'Add team',
    },
    {
      id: 'bank',
      icon: '🏦',
      title: 'Connect your bank',
      desc: 'Securely connect via Plaid so Cash Flow & Profitability updates automatically. Coming soon — contact us to enable.',
      done: status.bank === 'active',
      comingSoon: status.bank === 'not_connected',
    },
    {
      id: 'google',
      icon: '⭐',
      title: 'Connect Google Business Profile',
      desc: status.googleBusiness === 'active'
        ? 'Connected — reviews and Google posts flow through Pulse.'
        : 'One click — pull your Google reviews into Pulse and publish updates straight to your profile.',
      done: status.googleBusiness === 'active',
      statusLabel: status.googleBusiness === 'active' ? 'Connected' : null,
      action: () => handleSocialConnect('google'),
      actionLabel: 'Connect',
      invite: 'google',
    },
    {
      id: 'facebook',
      icon: '👍',
      title: 'Connect Facebook Page',
      desc: status.facebook === 'active'
        ? 'Connected — posts can cross-publish to your Page.'
        : 'Connect your restaurant Facebook Page so Instagram posts can cross-publish there in one click.',
      done: status.facebook === 'active',
      statusLabel: status.facebook === 'active' ? 'Connected' : null,
      action: () => handleSocialConnect('facebook'),
      actionLabel: 'Connect',
      invite: 'facebook',
    },
    {
      id: 'instagram',
      icon: '📸',
      title: 'Connect Instagram',
      desc: status.instagram === 'active'
        ? 'Connected — Pulse can read your posts, insights, and publish for you.'
        : 'Connect your Instagram business account to read performance and publish AI-drafted posts directly.',
      done: status.instagram === 'active',
      statusLabel: status.instagram === 'active' ? 'Connected' : null,
      action: () => handleSocialConnect('instagram'),
      actionLabel: 'Connect',
      invite: 'instagram',
    },
  ] : [];

  const doneCount = STEPS.filter(s => s.done).length;

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Setup</h1>
          <div className="page-sub">Get your restaurant fully connected — each step is optional and you can come back anytime</div>
        </div>
      </div>
      <div className="content" style={{maxWidth:760}}>
        {loading ? <div className="spinner" style={{margin:'60px auto'}}/> : (
          <>
            {/* Progress */}
            <div style={{marginBottom:24}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <span style={{fontSize:13, fontWeight:600}}>{doneCount} of {STEPS.length} complete</span>
                <span style={{fontSize:12, color:'var(--ink-3)'}}>{Math.round(doneCount/STEPS.length*100)}%</span>
              </div>
              <div style={{height:6, background:'var(--bg-2)', borderRadius:3, overflow:'hidden'}}>
                <div style={{height:'100%', width:`${doneCount/STEPS.length*100}%`, background:'var(--gold)', borderRadius:3, transition:'width .4s'}}/>
              </div>
            </div>

            {/* Steps */}
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              {STEPS.map(step => (
                <div key={step.id} style={{
                  display:'flex', gap:16, alignItems:'flex-start', padding:'18px 20px',
                  background:'var(--bg-2)', border:`1px solid ${step.error?'#E24B4A40':'var(--border)'}`,
                  borderRadius:12, opacity: step.comingSoon ? 0.55 : 1,
                }}>
                  <div style={{fontSize:26, flexShrink:0, width:36, textAlign:'center'}}>
                    {step.done ? '✅' : step.pending ? '⏳' : step.icon}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                      <span style={{fontSize:14, fontWeight:600}}>{step.title}</span>
                      {step.statusLabel && (
                        <span style={{fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:600,
                          background: step.done ? 'rgba(62,207,142,.12)' : step.error ? 'rgba(226,75,74,.12)' : 'rgba(232,160,32,.12)',
                          color: step.done ? '#3ECF8E' : step.error ? '#E24B4A' : '#E8A020'}}>
                          {step.statusLabel}
                        </span>
                      )}
                      {step.comingSoon && <span style={{fontSize:10, padding:'2px 8px', borderRadius:10, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink-3)'}}>Coming soon</span>}
                    </div>
                    <div style={{fontSize:12.5, color:'var(--ink-3)', lineHeight:1.6}}>{step.desc}</div>
                    {step.disabledHint && <div style={{fontSize:11, color:'#E8A020', marginTop:4}}>↑ {step.disabledHint}</div>}
                    {step.invite && !step.done && (
                      <button onClick={()=>handleSendInvite(step.invite)} style={{background:'none', border:'none', padding:0, marginTop:6, fontSize:11.5, color:'var(--gold)', cursor:'pointer', textDecoration:'underline'}}>
                        Someone else manages this account? Email them a connect link →
                      </button>
                    )}
                  </div>
                  {step.customActions && (
                    <div style={{display:'flex', flexDirection:'column', gap:6, flexShrink:0}}>
                      {posStatus?.square?.status === 'active' ? (
                        <button className="btn btn-sm" onClick={handleSquareSync} disabled={posBusy}>{posBusy?'Syncing…':'⟳ Sync now'}</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={handleSquareConnect} disabled={posBusy}>Connect Square</button>
                      )}
                      {posStatus?.toast?.status === 'configured' ? (
                        <button className="btn btn-sm" onClick={handleToastSync} disabled={posBusy}>⟳ Sync Toast</button>
                      ) : (
                        <button className="btn btn-sm" onClick={()=>setShowToastImport(true)}>Toast CSV import</button>
                      )}
                    </div>
                  )}
                  {!step.customActions && !step.comingSoon && !step.done && (
                    step.href ? (
                      <a href={step.href} className="btn btn-sm" style={{flexShrink:0, textDecoration:'none'}}>{step.actionLabel}</a>
                    ) : step.action ? (
                      <button className="btn btn-primary btn-sm" style={{flexShrink:0}} onClick={step.action} disabled={step.disabled}>
                        {provisioning && step.id==='sms' ? 'Setting up…' : step.actionLabel}
                      </button>
                    ) : null
                  )}
                  {!step.customActions && step.done && step.action && (
                    <button className="btn btn-sm" style={{flexShrink:0}} onClick={step.action}>{step.actionLabel}</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{marginTop:24, padding:'14px 18px', background:'var(--bg)', borderRadius:10, fontSize:12.5, color:'var(--ink-3)', lineHeight:1.7}}>
              💡 <strong style={{color:'var(--ink-2)'}}>Have historical data?</strong> Email us your sales or payroll spreadsheets and we'll import everything for you within 48 hours — no formatting needed.
            </div>
          </>
        )}

        {showToastImport && <ToastImportModal onClose={()=>setShowToastImport(false)} showToast={showToast} onDone={()=>{setShowToastImport(false); load();}}/>}
        {showBizForm && <BusinessInfoModal onClose={()=>setShowBizForm(false)} onSaved={()=>{setShowBizForm(false); showToast('Business info saved'); load();}} showToast={showToast}/>}
        {toast && <div className="toast" style={{background:toast.err?'#E24B4A':'var(--ink)'}}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
      </div>
    </div>
  );
}

function BusinessInfoModal({ onClose, onSaved, showToast }) {
  const [form, setForm]     = useState({
    legalName:'', ein:'', businessType:'LLC',
    addressStreet:'', addressCity:'', addressState:'CA', addressZip:'',
    website:'', contactName:'', contactEmail:'', contactPhone:'',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    integrations.businessInfo().then(info => {
      if (info) setForm({
        legalName: info.legal_name||'', ein: info.ein||'', businessType: info.business_type||'LLC',
        addressStreet: info.address_street||'', addressCity: info.address_city||'',
        addressState: info.address_state||'CA', addressZip: info.address_zip||'',
        website: info.website||'', contactName: info.contact_name||'',
        contactEmail: info.contact_email||'', contactPhone: info.contact_phone||'',
      });
    }).catch(()=>{}).finally(()=>setLoaded(true));
  }, []);

  const handleSave = async () => {
    if (!form.legalName.trim()) return showToast('Legal business name required', true);
    if (!/^\d{2}-?\d{7}$/.test(form.ein.replace(/\s/g,''))) return showToast('EIN should be 9 digits (XX-XXXXXXX)', true);
    setSaving(true);
    try {
      await integrations.saveBusinessInfo(form);
      onSaved();
    } catch(e) { showToast(e.message, true); setSaving(false); }
  };

  if (!loaded) return null;

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60, overflowY:'auto', padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', border:'1px solid var(--border)', padding:24, maxHeight:'90vh', overflowY:'auto'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
          <div style={{fontFamily:'var(--serif)', fontSize:18, fontWeight:700}}>About your business</div>
          <button onClick={onClose} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{fontSize:12, color:'var(--ink-3)', marginBottom:18, lineHeight:1.6}}>
          This is used to register your texting number with US carriers (required by law for business SMS). It's the same info on your business license.
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <div className="form-group" style={{gridColumn:'1/-1', marginBottom:0}}>
            <label className="form-label">Legal business name *</label>
            <input className="form-input" value={form.legalName} onChange={e=>f('legalName',e.target.value)} placeholder="e.g. Rivaaz Hospitality Group LLC"/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">EIN (tax ID) *</label>
            <input className="form-input" value={form.ein} onChange={e=>f('ein',e.target.value)} placeholder="12-3456789" style={{fontFamily:'var(--mono)'}}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Business type</label>
            <select className="form-select" value={form.businessType} onChange={e=>f('businessType',e.target.value)}>
              {['LLC','Corporation','Partnership','Sole Proprietorship','Non-profit'].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{gridColumn:'1/-1', marginBottom:0}}>
            <label className="form-label">Street address *</label>
            <input className="form-input" value={form.addressStreet} onChange={e=>f('addressStreet',e.target.value)} placeholder="333 Brannan St"/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">City *</label>
            <input className="form-input" value={form.addressCity} onChange={e=>f('addressCity',e.target.value)} placeholder="San Francisco"/>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">State *</label>
              <select className="form-select" value={form.addressState} onChange={e=>f('addressState',e.target.value)}>
                {US_STATES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">ZIP *</label>
              <input className="form-input" value={form.addressZip} onChange={e=>f('addressZip',e.target.value)} placeholder="94107"/>
            </div>
          </div>
          <div className="form-group" style={{gridColumn:'1/-1', marginBottom:0}}>
            <label className="form-label">Website</label>
            <input className="form-input" value={form.website} onChange={e=>f('website',e.target.value)} placeholder="https://yourrestaurant.com"/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Contact name *</label>
            <input className="form-input" value={form.contactName} onChange={e=>f('contactName',e.target.value)}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Contact phone</label>
            <input className="form-input" value={form.contactPhone} onChange={e=>f('contactPhone',e.target.value)} placeholder="+1 415 555 1234"/>
          </div>
          <div className="form-group" style={{gridColumn:'1/-1', marginBottom:0}}>
            <label className="form-label">Contact email * <span style={{fontWeight:400, color:'var(--ink-3)'}}>(guest replies to newsletters go here)</span></label>
            <input className="form-input" type="email" value={form.contactEmail} onChange={e=>f('contactEmail',e.target.value)}/>
          </div>
        </div>

        <div style={{display:'flex', gap:8, marginTop:20}}>
          <button className="btn" style={{flex:1, justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2, justifyContent:'center'}} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save business info'}
          </button>
        </div>
      </div>
    </div>
  );
}


function ToastImportModal({ onClose, onDone, showToast }) {
  const [locs, setLocs]       = useState([]);
  const [locationId, setLocationId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy]       = useState(false);
  const fileRef = React.useRef(null);

  useEffect(() => {
    pos.locations().then(l => { const arr = Array.isArray(l)?l:[]; setLocs(arr); if (arr.length) setLocationId(arr[0].id); }).catch(()=>{});
  }, []);

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim() || !locationId) return;
    setBusy(true);
    try {
      const r = await pos.toastImport(locationId, csvText);
      showToast(`Imported ${r.rowsProcessed} days into ${r.weeksWritten} weeks`);
      onDone();
    } catch(e) { showToast(e.message, true); setBusy(false); }
  };

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:480, maxWidth:'95vw', border:'1px solid var(--border)', padding:24}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontFamily:'var(--serif)', fontSize:17, fontWeight:700}}>Import Toast sales</div>
          <button onClick={onClose} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{fontSize:12, color:'var(--ink-3)', marginBottom:16, lineHeight:1.7}}>
          In Toast: <strong style={{color:'var(--ink-2)'}}>Reports → Sales → Sales Summary</strong>, pick a date range, export CSV. Upload it here — daily sales roll into your weekly KPIs automatically.
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <select className="form-select" value={locationId} onChange={e=>setLocationId(e.target.value)}>
            {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{display:'none'}}/>
        <button className="btn" onClick={()=>fileRef.current?.click()} style={{marginBottom:10}}>📂 Choose CSV file</button>
        {csvText && <div style={{fontSize:11, color:'#3ECF8E', marginBottom:10}}>✓ File loaded ({csvText.split('\n').length} rows)</div>}
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button className="btn" style={{flex:1, justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2, justifyContent:'center'}} onClick={handleImport} disabled={busy||!csvText.trim()}>
            {busy?'Importing…':'Import sales'}
          </button>
        </div>
      </div>
    </div>
  );
}
