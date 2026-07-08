import React, { useState, useEffect } from 'react';

const SECRET = () => localStorage.getItem('super_admin_secret') || '';
const API    = '';

const fmt     = n => n == null ? '—' : Number(n).toLocaleString();
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

function request(path, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-super-admin-secret': SECRET(),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());
}

const STATUS_COLORS = {
  active:     { bg:'#0A2A1A', color:'#3ECF8E' },
  trialing:   { bg:'#2A2010', color:'#E8A020' },
  trial:      { bg:'#1A1A2A', color:'#7B8CDE' },
  past_due:   { bg:'#2A1010', color:'#F26C6C' },
  canceled:   { bg:'#222',    color:'#666' },
};

export default function SuperAdmin() {
  const [secret, setSecret]   = useState(SECRET());
  const [authed, setAuthed]   = useState(false);
  const [stats, setStats]     = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, t] = await Promise.all([
        request('/api/super-admin/stats'),
        request('/api/super-admin/tenants'),
      ]);
      if (!s.ok) throw new Error(s.error);
      setStats(s.data);
      setTenants(t.data || []);
      setAuthed(true);
    } catch(e) { setError(e.message); setAuthed(false); }
    finally { setLoading(false); }
  };

  const handleLogin = () => {
    localStorage.setItem('super_admin_secret', secret);
    load();
  };

  const handleUpdate = async (id, data) => {
    const r = await request(`/api/super-admin/tenants/${id}`, { method:'PATCH', body: data });
    if (r.ok) { setEditing(null); load(); }
    else alert(r.error);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}" and ALL their data? This cannot be undone.`)) return;
    const r = await request(`/api/super-admin/tenants/${id}`, { method:'DELETE', body:{ confirm:'DELETE' } });
    if (r.ok) load();
    else alert(r.error);
  };

  if (!authed) return (
    <div style={{ minHeight:'100vh', background:'#0D0D0D', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ background:'#141414', border:'1px solid #222', borderRadius:12, padding:32, width:360 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:6 }}>Pulse <span style={{ color:'#E8A020' }}>Admin</span></div>
        <div style={{ fontSize:13, color:'#555', marginBottom:24 }}>Super administrator access</div>
        {error && <div style={{ background:'#2A1010', border:'1px solid #F26C6C40', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#F26C6C', marginBottom:16 }}>{error}</div>}
        <input type="password" value={secret} onChange={e=>setSecret(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          placeholder="Super admin secret"
          style={{ display:'block', width:'100%', padding:'10px 14px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none' }}
        />
        <button onClick={handleLogin} disabled={loading}
          style={{ width:'100%', padding:12, background:'#E8A020', color:'#000', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          {loading ? 'Checking…' : 'Access admin panel →'}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#0D0D0D', color:'#F0F0F0', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding:'32px 24px' }}>
      <div style={{ maxWidth:1200, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32 }}>
          <div>
            <div style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.02em' }}>Pulse <span style={{ color:'#E8A020' }}>Admin</span></div>
            <div style={{ fontSize:13, color:'#555', marginTop:3 }}>Table Intelligence LLC — Platform overview</div>
          </div>
          <button onClick={load} style={{ padding:'8px 16px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#888', fontSize:13, cursor:'pointer' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
            {[
              { label:'Total tenants',    val: fmt(stats.tenants.total) },
              { label:'Active / Trialing',val: `${fmt(stats.tenants.active)} / ${fmt(stats.tenants.trialing)}` },
              { label:'New this month',   val: fmt(stats.tenants.new_this_month) },
              { label:'Free trials',      val: fmt(stats.tenants.free_trial) },
              { label:'Total users',      val: fmt(stats.users.total) },
              { label:'Loyalty members',  val: fmt(stats.members.total) },
              { label:'Pts outstanding',  val: fmt(stats.members.outstanding_pts) },
              { label:'Past due',         val: fmt(stats.tenants.past_due), warn: stats.tenants.past_due > 0 },
            ].map((s,i) => (
              <div key={i} style={{ background:'#141414', border:`1px solid ${s.warn?'#F26C6C40':'#222'}`, borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</div>
                <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color: s.warn?'#F26C6C':'#fff' }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tenant table */}
        <div style={{ background:'#141414', border:'1px solid #222', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #222', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:14, fontWeight:600 }}>All tenants ({tenants.length})</div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #1A1A1A' }}>
                  {['Company','Plan','Status','Locations','Members','Users','Created','Actions'].map(h=>(
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const sc = STATUS_COLORS[t.subscription_status] || STATUS_COLORS.trial;
                  return (
                    <tr key={t.id} style={{ borderBottom:'1px solid #1A1A1A' }}>
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ fontWeight:500 }}>{t.name}</div>
                        <div style={{ fontSize:10, color:'#444', fontFamily:'monospace', marginTop:2 }}>{t.id.slice(0,8)}…</div>
                      </td>
                      <td style={{ padding:'12px 16px', fontFamily:'monospace', color:'#E8A020', textTransform:'capitalize' }}>
                        {t.plan_name || t.plan || 'trial'}
                      </td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color }}>
                          {t.subscription_status || 'trial'}
                        </span>
                        {t.trial_ends_at && (
                          <div style={{ fontSize:10, color:'#444', marginTop:3 }}>ends {fmtDate(t.trial_ends_at)}</div>
                        )}
                      </td>
                      <td style={{ padding:'12px 16px', textAlign:'center', fontFamily:'monospace' }}>{t.location_count||0}</td>
                      <td style={{ padding:'12px 16px', textAlign:'center', fontFamily:'monospace' }}>{t.member_count||0}</td>
                      <td style={{ padding:'12px 16px', textAlign:'center', fontFamily:'monospace' }}>{t.user_count||0}</td>
                      <td style={{ padding:'12px 16px', color:'#555', whiteSpace:'nowrap' }}>{fmtDate(t.created_at)}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>setEditing(t)}
                            style={{ padding:'4px 10px', background:'#1A1A1A', border:'1px solid #333', borderRadius:6, color:'#888', fontSize:11, cursor:'pointer' }}>
                            Edit
                          </button>
                          <button onClick={()=>handleDelete(t.id, t.name)}
                            style={{ padding:'4px 10px', background:'#2A1010', border:'1px solid #F26C6C30', borderRadius:6, color:'#F26C6C', fontSize:11, cursor:'pointer' }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <EditTenantModal tenant={editing} onClose={()=>setEditing(null)} onSave={handleUpdate}/>
      )}
    </div>
  );
}

function EditTenantModal({ tenant, onClose, onSave }) {
  const [form, setForm] = useState({
    plan_name:           tenant.plan_name || 'appetizer',
    subscription_status: tenant.subscription_status || 'trial',
    trial_ends_at:       tenant.trial_ends_at?.slice(0,10) || '',
  });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div style={{ background:'#141414', border:'1px solid #333', borderRadius:12, padding:28, width:420 }}>
        <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>Edit: {tenant.name}</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Plan</div>
          <select value={form.plan_name} onChange={e=>setForm(p=>({...p,plan_name:e.target.value}))}
            style={{ width:'100%', padding:'10px 14px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:13 }}>
            {['appetizer','entree','buffet'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Subscription status</div>
          <select value={form.subscription_status} onChange={e=>setForm(p=>({...p,subscription_status:e.target.value}))}
            style={{ width:'100%', padding:'10px 14px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:13 }}>
            {['trial','trialing','active','past_due','canceled'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Trial ends</div>
          <input type="date" value={form.trial_ends_at} onChange={e=>setForm(p=>({...p,trial_ends_at:e.target.value}))}
            style={{ width:'100%', padding:'10px 14px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:13, boxSizing:'border-box' }}/>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #333', borderRadius:8, color:'#666', cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>onSave(tenant.id, form)} style={{ flex:1, padding:11, background:'#E8A020', border:'none', borderRadius:8, color:'#000', fontWeight:600, cursor:'pointer' }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}
