import React, { useState, useEffect, useCallback } from 'react';
import { agent6, locations as locationsApi } from '../../lib/api.js';

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const fmtDays = n => {
  if (n == null) return '—';
  if (n < 0)    return `${Math.abs(n)}d overdue`;
  if (n === 0)  return 'Today';
  return `${n}d`;
};

const SEVERITY_STYLES = {
  critical: { bg:'#2A1010', color:'#F26C6C', label:'Critical' },
  urgent:   { bg:'#2A1A10', color:'#E8A020', label:'Urgent' },
  warning:  { bg:'#1A1A2A', color:'#7B8CDE', label:'Warning' },
  info:     { bg:'#1A2A2A', color:'#3ECF8E', label:'Info' },
};

const EXPIRY_STYLES = {
  expired:  { bg:'#2A1010', color:'#F26C6C' },
  critical: { bg:'#2A1A10', color:'#E8A020' },
  warning:  { bg:'#1A1A2A', color:'#7B8CDE' },
  valid:    { bg:'#0A2A1A', color:'#3ECF8E' },
  no_expiry:{ bg:'#1A1A1A', color:'#666' },
};

function StatusBadge({ status, label }) {
  const s = EXPIRY_STYLES[status] || EXPIRY_STYLES.valid;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:s.bg, color:s.color }}>{label || status}</span>;
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:s.bg, color:s.color }}>{s.label}</span>;
}

export default function Agent6Training_Compliance() {
  const [tab, setTab]                   = useState('overview');
  const [locations, setLocations]       = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [summary, setSummary]           = useState(null);
  const [certs, setCerts]               = useState([]);
  const [checklists, setChecklists]     = useState([]);
  const [documents, setDocuments]       = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState(null);
  const [showAddCert, setShowAddCert]   = useState(false);
  const [showChecklist, setShowChecklist] = useState(null);
  const [showAddDoc, setShowAddDoc]     = useState(false);
  const [docCategory, setDocCategory]   = useState('all');

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  const loadAll = useCallback(async (locationId) => {
    setLoading(true);
    const locId = locationId || currentLocation?.id;
    try {
      const [s, c, ch, d, a, r] = await Promise.all([
        agent6.summary(locId),
        agent6.certifications(locId ? {locationId:locId} : {}),
        agent6.checklists(locId ? {locationId:locId} : {}),
        agent6.documents(locId ? {locationId:locId} : {}),
        agent6.alerts(locId ? {locationId:locId} : {}),
        agent6.requirements(),
      ]);
      setSummary(s);
      setCerts(c || []);
      setChecklists(ch || []);
      setDocuments(d || []);
      setAlerts(a || []);
      setRequirements(r);
    } catch(e) { showToast('Failed to load compliance data', true); }
    finally { setLoading(false); }
  }, [currentLocation]);

  useEffect(() => {
    locationsApi.list().then(locs => {
      setLocations(locs || []);
      if (locs?.length) { setCurrentLocation(locs[0]); loadAll(locs[0].id); }
      else loadAll();
    }).catch(() => loadAll());
  }, []);

  const handleLocationChange = (loc) => { setCurrentLocation(loc); loadAll(loc?.id); };
  const handleResolveAlert = async (id) => {
    await agent6.resolveAlert(id);
    setAlerts(a => a.filter(x => x.id !== id));
    showToast('Alert resolved');
  };

  const tabs = [
    { id:'overview',    label:'Overview' },
    { id:'certs',       label:`Certifications ${certs.filter(c=>c.status==='critical'||c.status==='expired').length > 0 ? '⚠' : ''}` },
    { id:'checklists',  label:'Checklists' },
    { id:'documents',   label:'Documents' },
    { id:'alerts',      label:`Alerts ${alerts.filter(a=>a.severity==='critical').length > 0 ? `(${alerts.length})` : ''}` },
  ];

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Compliance & Governance</h1>
          <div className="page-sub">California compliance & governance · {currentLocation?.name || 'All locations'}</div>
        </div>
        <div className="topbar-right">
          <select className="form-select" style={{ fontSize:12 }} value={currentLocation?.id||''} onChange={e=>handleLocationChange(locations.find(l=>l.id===e.target.value)||null)}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {tab==='certs'      && <button className="btn btn-primary" onClick={()=>setShowAddCert(true)}>+ Add cert</button>}
          {tab==='documents'  && <button className="btn btn-primary" onClick={()=>setShowAddDoc(true)}>+ Add document</button>}
          {tab==='checklists'  && <button className="btn btn-primary" onClick={()=>setShowChecklist('select')}>+ Run checklist</button>}
        </div>
      </div>

      <div className="content">
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'8px 16px', background:'none', border:'none', borderBottom:`2px solid ${tab===t.id?'var(--gold)':'transparent'}`, color:tab===t.id?'var(--gold)':'var(--ink-3)', fontSize:13, cursor:'pointer', fontWeight:tab===t.id?600:400, whiteSpace:'nowrap' }}>{t.label}</button>
          ))}
        </div>

        {loading ? <div className="spinner" style={{ margin:'60px auto' }}/> : <>

        {/* OVERVIEW */}
        {tab==='overview' && summary && (
          <div>
            {/* Stat cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
              {[
                { label:'Certs valid',     val:summary.certifications?.valid||0,    color:'#3ECF8E' },
                { label:'Certs expiring',  val:summary.certifications?.warning||0,  color:'#E8A020' },
                { label:'Certs critical',  val:summary.certifications?.critical||0, color:'#F26C6C' },
                { label:'Open alerts',     val:(parseInt(summary.alerts?.critical||0)+parseInt(summary.alerts?.urgent||0)+parseInt(summary.alerts?.warning||0)), color: parseInt(summary.alerts?.critical||0) > 0 ? '#F26C6C' : '#E8A020' },
                { label:'Checklists (7d)', val:summary.checklists?.this_week||0,    color:'var(--ink)' },
                { label:'Docs expiring',   val:summary.documents?.expiring_soon||0, color:'#E8A020' },
                { label:'Docs expired',    val:summary.documents?.expired||0,       color:'#F26C6C' },
                { label:'CA requirements', val:summary.ca_requirements?.length||6,  color:'var(--ink-3)' },
              ].map((s,i) => (
                <div key={i} className="card" style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700, color:s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Active alerts */}
            {alerts.length > 0 && (
              <div className="card" style={{ marginBottom:20 }}>
                <div className="card-header"><span className="card-title">Active alerts</span><span style={{ fontSize:11, color:'var(--ink-3)' }}>{alerts.length} open</span></div>
                <div className="card-body" style={{ padding:0 }}>
                  {alerts.slice(0,5).map(alert => {
                    const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                    return (
                      <div key={alert.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:3, height:36, borderRadius:2, background:s.color, flexShrink:0 }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:500 }}>{alert.title}</div>
                          <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{alert.description}</div>
                        </div>
                        {alert.due_date && <div style={{ fontSize:11, color:s.color, fontFamily:'var(--mono)', flexShrink:0 }}>{fmtDate(alert.due_date)}</div>}
                        <button onClick={()=>handleResolveAlert(alert.id)} className="btn btn-sm">Resolve</button>
                      </div>
                    );
                  })}
                  {alerts.length > 5 && <div style={{ padding:'10px 16px', fontSize:12, color:'var(--ink-3)', textAlign:'center', cursor:'pointer' }} onClick={()=>setTab('alerts')}>View all {alerts.length} alerts →</div>}
                </div>
              </div>
            )}

            {/* CA Requirements reference */}
            <div className="card">
              <div className="card-header"><span className="card-title">California requirements</span><span style={{ fontSize:11, color:'var(--ink-3)' }}>State law</span></div>
              <div className="card-body" style={{ padding:0 }}>
                {(requirements?.certifications || []).map((req,i) => (
                  <div key={i} style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{req.label}</div>
                      <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{req.description}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:11, color:'var(--ink-3)', fontFamily:'var(--mono)' }}>Valid {req.validity_days} days</div>
                      <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{req.authority}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CERTIFICATIONS */}
        {tab==='certs' && (
          <div>
            {certs.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No certifications tracked</div><div className="empty-state-sub">Add employee certifications to track expiry and get alerts</div></div>
            ) : (
              <div className="card">
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Employee','Certification','Location','Issued','Expires','Days left','Status'].map(h=>(
                          <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {certs.map(cert => (
                        <tr key={cert.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 16px' }}>
                            <div style={{ fontWeight:500 }}>{cert.employee_name}</div>
                            <div style={{ fontSize:11, color:'var(--ink-3)' }}>{cert.employee_role}</div>
                          </td>
                          <td style={{ padding:'12px 16px' }}>{cert.cert_label}</td>
                          <td style={{ padding:'12px 16px', fontSize:11, color:'var(--ink-3)' }}>{cert.location_id ? locations.find(l=>l.id===cert.location_id)?.name || '—' : 'All'}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12 }}>{fmtDate(cert.issued_date)}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12 }}>{fmtDate(cert.expiry_date)}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12, color: cert.days_until_expiry < 30 ? '#F26C6C' : cert.days_until_expiry < 90 ? '#E8A020' : 'var(--ink-3)' }}>{fmtDays(cert.days_until_expiry)}</td>
                          <td style={{ padding:'12px 16px' }}><StatusBadge status={cert.status}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHECKLISTS */}
        {tab==='checklists' && (
          <div>
            {/* Checklist type cards */}
            {showChecklist === 'select' && requirements?.checklists && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
                {Object.entries(requirements.checklists).map(([key, tmpl]) => (
                  <div key={key} className="card card-raised" style={{ cursor:'pointer', border:'1px solid var(--border)' }} onClick={()=>setShowChecklist(key)}>
                    <div className="card-body">
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{tmpl.label}</div>
                      <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:8 }}>{tmpl.items?.length} items · {tmpl.frequency}</div>
                      <div style={{ fontSize:11, color:'var(--ink-3)' }}>
                        {tmpl.items?.filter(i=>i.critical).length} critical · {tmpl.items?.filter(i=>!i.critical).length} standard
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent completions */}
            {checklists.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No checklists completed</div><div className="empty-state-sub">Run your first checklist to start tracking compliance</div></div>
            ) : (
              <div className="card">
                <div className="card-header"><span className="card-title">Recent completions</span></div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Date','Checklist','Location','Completed by','Score','Critical fails',''].map(h=>(
                          <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {checklists.map(cl => (
                        <tr key={cl.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12 }}>{fmtDate(cl.completed_date)}</td>
                          <td style={{ padding:'12px 16px', fontWeight:500 }}>{cl.checklist_label}</td>
                          <td style={{ padding:'12px 16px', fontSize:11, color:'var(--ink-3)' }}>{locations.find(l=>l.id===cl.location_id)?.name||'—'}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, color:'var(--ink-3)' }}>{cl.completed_name||'—'}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', color: cl.score < 80 ? '#F26C6C' : cl.score < 95 ? '#E8A020' : '#3ECF8E' }}>{cl.score}%</td>
                          <td style={{ padding:'12px 16px' }}>
                            {cl.critical_fails > 0 ? <span style={{ fontSize:11, fontWeight:600, color:'#F26C6C' }}>{cl.critical_fails} fails</span> : <span style={{ color:'#3ECF8E', fontSize:11 }}>None</span>}
                          </td>
                          <td style={{ padding:'12px 16px' }}><button className="btn btn-sm" onClick={()=>{/* view details */}}>View</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS */}
        {tab==='documents' && (
          <div>
            {/* Category filter */}
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {['all', ...(requirements?.categories||[]).map(c=>c.key)].map(cat => (
                <button key={cat} onClick={()=>setDocCategory(cat)} style={{ padding:'5px 14px', borderRadius:20, fontSize:12, cursor:'pointer', border:`1px solid ${docCategory===cat?'var(--gold)':'var(--border)'}`, background:docCategory===cat?'var(--gold-bg)':'transparent', color:docCategory===cat?'var(--gold)':'var(--ink-3)', fontWeight:docCategory===cat?600:400 }}>
                  {cat==='all'?'All':requirements?.categories?.find(c=>c.key===cat)?.label||cat}
                </button>
              ))}
            </div>

            {documents.filter(d=>docCategory==='all'||d.category===docCategory).length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No documents</div><div className="empty-state-sub">Upload leases, permits, and agreements to track expiry</div></div>
            ) : (
              <div className="card">
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Document','Category','Location','Version','Expires','Status',''].map(h=>(
                          <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {documents.filter(d=>docCategory==='all'||d.category===docCategory).map(doc => (
                        <tr key={doc.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 16px' }}>
                            <div style={{ fontWeight:500 }}>{doc.title}</div>
                            {doc.description && <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{doc.description.slice(0,60)}{doc.description.length>60?'…':''}</div>}
                          </td>
                          <td style={{ padding:'12px 16px', fontSize:11, color:'var(--ink-3)', textTransform:'capitalize' }}>{doc.category}</td>
                          <td style={{ padding:'12px 16px', fontSize:11, color:'var(--ink-3)' }}>{doc.location_id ? locations.find(l=>l.id===doc.location_id)?.name||'—' : 'All'}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12 }}>v{doc.version}</td>
                          <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:12 }}>{fmtDate(doc.expiry_date)}</td>
                          <td style={{ padding:'12px 16px' }}><StatusBadge status={doc.expiry_status}/></td>
                          <td style={{ padding:'12px 16px' }}>
                            <div style={{ display:'flex', gap:6 }}>
                              {doc.file_url && <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">View</a>}
                              <button className="btn btn-sm" onClick={()=>{/* view versions */}}>History</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ALERTS */}
        {tab==='alerts' && (
          <div>
            {alerts.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No active alerts</div><div className="empty-state-sub">All compliance items are up to date</div></div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {alerts.map(alert => {
                  const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                  return (
                    <div key={alert.id} style={{ background:'var(--card)', border:`1px solid ${s.color}30`, borderLeft:`3px solid ${s.color}`, borderRadius:'var(--r-lg)', padding:'14px 16px', display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                          <SeverityBadge severity={alert.severity}/>
                          <span style={{ fontSize:13, fontWeight:500 }}>{alert.title}</span>
                        </div>
                        {alert.description && <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:6 }}>{alert.description}</div>}
                        <div style={{ fontSize:11, color:'#555' }}>
                          {alert.alert_type?.replace(/_/g,' ')} · {alert.due_date ? `Due ${fmtDate(alert.due_date)}` : 'No due date'} · Created {fmtDate(alert.created_at)}
                        </div>
                      </div>
                      <button onClick={()=>handleResolveAlert(alert.id)} className="btn btn-sm" style={{ flexShrink:0 }}>Resolve</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        </>}


      </div>

      {/* Modals */}
      {showAddCert && <AddCertModal locations={locations} requirements={requirements} locationId={currentLocation?.id} onClose={()=>setShowAddCert(false)} onAdded={cert=>{ setCerts(c=>[cert,...c]); setShowAddCert(false); showToast('Certification added'); }}/>}
      {showAddDoc  && <AddDocModal  locations={locations} requirements={requirements} locationId={currentLocation?.id} onClose={()=>setShowAddDoc(false)}  onAdded={doc=>{  setDocuments(d=>[doc,...d]);  setShowAddDoc(false);  showToast('Document added'); }}/>}
      {showChecklist && showChecklist !== 'select' && requirements?.checklists?.[showChecklist] && (
        <ChecklistModal
          templateKey={showChecklist}
          template={requirements.checklists[showChecklist]}
          locations={locations}
          locationId={currentLocation?.id}
          onClose={()=>setShowChecklist(null)}
          onSubmitted={cl=>{ setChecklists(c=>[cl,...c]); setShowChecklist(null); showToast(`Checklist submitted — ${cl.score}% score`); }}
        />
      )}
      {toast && <div className="toast" style={{ background: toast.err ? '#E24B4A' : 'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

// ── Add Certification Modal ────────────────────────────────────────────────────
function AddCertModal({ locations, requirements, locationId, onClose, onAdded }) {
  const [form, setForm] = useState({ employeeName:'', employeeRole:'', certKey:'food_handler', issuedDate:'', expiryDate:'', certNumber:'', issuer:'', locationId: locationId||'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const certDef = (requirements?.certifications||[]).find(c=>c.key===form.certKey);

  // Auto-calculate expiry from issued date
  const handleIssuedChange = (v) => {
    f('issuedDate', v);
    if (v && certDef) {
      const expiry = new Date(v);
      expiry.setDate(expiry.getDate() + certDef.validity_days);
      f('expiryDate', expiry.toISOString().slice(0,10));
    }
  };

  const handleSave = async () => {
    if (!form.employeeName || !form.expiryDate) return setError('Employee name and expiry date required');
    setSaving(true); setError('');
    try {
      const cert = await agent6.addCert(form);
      onAdded(cert);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', border:'1px solid var(--border)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Add certification</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Certification type</label>
              <select className="form-select" value={form.certKey} onChange={e=>f('certKey',e.target.value)}>
                {(requirements?.certifications||[]).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                <option value="other">Other</option>
              </select>
              {certDef && <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:4 }}>{certDef.description} · {certDef.authority}</div>}
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Employee name *</label>
              <input className="form-input" value={form.employeeName} onChange={e=>f('employeeName',e.target.value)} placeholder="Jane Smith"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Role / position</label>
              <input className="form-input" value={form.employeeRole} onChange={e=>f('employeeRole',e.target.value)} placeholder="Line cook"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Location</label>
              <select className="form-select" value={form.locationId} onChange={e=>f('locationId',e.target.value)}>
                <option value="">All locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Certificate number</label>
              <input className="form-input" value={form.certNumber} onChange={e=>f('certNumber',e.target.value)} placeholder="Optional"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Issue date</label>
              <input className="form-input" type="date" value={form.issuedDate} onChange={e=>handleIssuedChange(e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Expiry date *</label>
              <input className="form-input" type="date" value={form.expiryDate} onChange={e=>f('expiryDate',e.target.value)}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Optional notes"/>
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Add certification'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Document Modal ─────────────────────────────────────────────────────────
function AddDocModal({ locations, requirements, locationId, onClose, onAdded }) {
  const [form, setForm] = useState({ title:'', category:'lease', description:'', fileUrl:'', expiryDate:'', alertDays:90, locationId:locationId||'', metadata:{} });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [localFile, setLocalFile] = useState(null);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.title) return setError('Document title required');
    setSaving(true); setError('');
    try {
      let payload = { ...form };
      if (localFile) {
        if (localFile.size > 25 * 1024 * 1024) throw new Error('File too large — keep it under 25MB (or paste a Dropbox/Drive link instead)');
        const dataBase64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = () => rej(new Error('Could not read the file'));
          r.readAsDataURL(localFile);
        });
        const up = await agent6.uploadFile({ fileName: localFile.name, mime: localFile.type || 'application/pdf', dataBase64 });
        payload.fileUrl  = 'internal:' + up.id;
        payload.fileName = localFile.name;
      }
      const doc = await agent6.addDocument(payload);
      onAdded(doc);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', border:'1px solid var(--border)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Add document</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Document title *</label>
              <input className="form-input" value={form.title} onChange={e=>f('title',e.target.value)} placeholder="e.g. Rooh SF Lease Agreement 2024"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e=>f('category',e.target.value)}>
                {(requirements?.categories||[]).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Location</label>
              <select className="form-select" value={form.locationId} onChange={e=>f('locationId',e.target.value)}>
                <option value="">All locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Expiry date</label>
              <input className="form-input" type="date" value={form.expiryDate} onChange={e=>f('expiryDate',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Alert (days before expiry)</label>
              <input className="form-input" type="number" value={form.alertDays} onChange={e=>f('alertDays',parseInt(e.target.value))} min={0}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Upload from your computer</label>
              <input className="form-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                onChange={e=>setLocalFile(e.target.files?.[0] || null)} style={{ padding:8 }}/>
              {localFile && (
                <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
                  <span>📎 {localFile.name} · {(localFile.size/1024/1024).toFixed(1)}MB</span>
                  <button onClick={()=>setLocalFile(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:11, textDecoration:'underline', padding:0 }}>remove</button>
                </div>
              )}
              <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:3 }}>PDF, image, or Office file up to 25MB — stored securely in Pulse</div>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">…or paste a file URL (Dropbox, Google Drive, etc.)</label>
              <input className="form-input" value={form.fileUrl} onChange={e=>f('fileUrl',e.target.value)} placeholder="https://…" disabled={!!localFile}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Description / notes</label>
              <textarea className="form-textarea" rows={2} value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Key terms, voting thresholds, exit clauses…"/>
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Add document'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Modal ────────────────────────────────────────────────────────────
function ChecklistModal({ templateKey, template, locations, locationId, onClose, onSubmitted }) {
  const [items, setItems]     = useState(template.items.map(item => ({ ...item, passed: null, notes:'' })));
  const [completedName, setCompletedName] = useState('');
  const [locId, setLocId]     = useState(locationId || '');
  const [saving, setSaving]   = useState(false);

  const toggle = (idx, passed) => setItems(prev => prev.map((it,i) => i===idx ? {...it, passed} : it));
  const allAnswered = items.every(it => it.passed !== null);
  const critFails   = items.filter(it => it.passed === false && it.critical).length;
  const score       = Math.round((items.filter(it=>it.passed===true).length / items.length) * 100);

  const handleSubmit = async () => {
    if (!locId) return alert('Please select a location');
    setSaving(true);
    try {
      const result = await agent6.submitChecklist({
        locationId: locId, checklistKey: templateKey,
        completedName, items,
      });
      onSubmitted(result);
    } catch(e) { alert(e.message); setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:20, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:620, maxWidth:'96vw', border:'1px solid var(--border)', margin:'0 16px 60px' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>{template.label}</div>
            <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>{template.items.length} items · {critFails > 0 ? <span style={{ color:'#F26C6C' }}>{critFails} critical fails</span> : 'No critical fails'} · {allAnswered ? `${score}% score` : `${items.filter(i=>i.passed!==null).length}/${items.length} answered`}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Location *</label>
            <select className="form-select" value={locId} onChange={e=>setLocId(e.target.value)}>
              <option value="">Select location</option>
              {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Your name</label>
            <input className="form-input" value={completedName} onChange={e=>setCompletedName(e.target.value)} placeholder="Who completed this?"/>
          </div>
        </div>
        <div style={{ maxHeight:'50vh', overflowY:'auto' }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ padding:'12px 22px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, display:'flex', gap:6, alignItems:'center' }}>
                  {item.critical && <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background:'#2A1010', color:'#F26C6C' }}>CRITICAL</span>}
                  {item.label}
                </div>
                <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{item.ref}</div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={()=>toggle(idx,true)}  style={{ padding:'5px 12px', borderRadius:6, fontSize:12, cursor:'pointer', border:`1px solid ${item.passed===true?'#3ECF8E':'var(--border)'}`, background:item.passed===true?'#0A2A1A':'transparent', color:item.passed===true?'#3ECF8E':'var(--ink-3)', fontWeight:item.passed===true?600:400 }}>Pass</button>
                <button onClick={()=>toggle(idx,false)} style={{ padding:'5px 12px', borderRadius:6, fontSize:12, cursor:'pointer', border:`1px solid ${item.passed===false?'#F26C6C':'var(--border)'}`, background:item.passed===false?'#2A1010':'transparent', color:item.passed===false?'#F26C6C':'var(--ink-3)', fontWeight:item.passed===false?600:400 }}>Fail</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:'16px 22px', display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSubmit} disabled={!allAnswered||saving}>
            {saving ? 'Submitting…' : allAnswered ? `Submit — ${score}% score` : `Answer all ${items.length} items to submit`}
          </button>
        </div>
      </div>
    </div>
  );
}