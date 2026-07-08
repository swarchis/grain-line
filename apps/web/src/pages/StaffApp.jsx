import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── Staff PWA — mobile-first, no sidebar ─────────────────────────────────────
const STAFF_TOKEN_KEY = 'pulse_staff_token';
const STAFF_EMP_KEY   = 'pulse_staff_employee';
const API_BASE        = '/api/agent-9/staff';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

async function staffRequest(path, opts = {}, token) {
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data.data;
}

// ── Main Staff App ─────────────────────────────────────────────────────────────
export default function StaffApp() {
  const [token, setToken]       = useState(() => localStorage.getItem(STAFF_TOKEN_KEY));
  const [employee, setEmployee] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STAFF_EMP_KEY) || 'null'); } catch { return null; }
  });
  const [tab, setTab] = useState('schedule');

  const login = (tok, emp) => {
    localStorage.setItem(STAFF_TOKEN_KEY, tok);
    localStorage.setItem(STAFF_EMP_KEY, JSON.stringify(emp));
    setToken(tok); setEmployee(emp);
  };

  const logout = () => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    localStorage.removeItem(STAFF_EMP_KEY);
    setToken(null); setEmployee(null);
  };

  if (!token || !employee) {
    return <StaffLogin onLogin={login} />;
  }

  const req = (path, opts) => staffRequest(path, opts, token);

  const TABS = [
    { id:'schedule', icon:'📅', label:'My Shifts' },
    { id:'messages', icon:'💬', label:'Messages' },
    { id:'team',     icon:'👥', label:'Team' },
    { id:'account',  icon:'👤', label:'Me' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)', maxWidth:480, margin:'0 auto', position:'relative' }}>
      {/* Header */}
      <div style={{ background:'var(--bg-2)', borderBottom:'1px solid var(--border)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Pulse Staff</div>
          <div style={{ fontSize:11, color:'var(--ink-3)' }}>Hi {employee.firstName} 👋</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#000' }}>
            {(employee.firstName||'?')[0].toUpperCase()}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
        {tab==='schedule' && <MySchedule req={req} employee={employee} />}
        {tab==='messages' && <StaffMessages req={req} employee={employee} />}
        {tab==='team'     && <MyTeam req={req} employee={employee} />}
        {tab==='account'  && <MyAccount employee={employee} req={req} onLogout={logout} />}
      </div>

      {/* Bottom nav */}
      <div style={{ display:'flex', borderTop:'1px solid var(--border)', background:'var(--bg-2)', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom,0px)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:'10px 0', background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <span style={{ fontSize:20 }}>{t.icon}</span>
            <span style={{ fontSize:10, color:tab===t.id?'var(--gold)':'var(--ink-3)', fontWeight:tab===t.id?700:400 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────────
function StaffLogin({ onLogin }) {
  const [pin, setPin]             = useState('');
  const [tenantId, setTenantId]   = useState('');
  const [locationId, setLocationId] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Try to pre-fill from URL params (manager can send staff a link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('t')) setTenantId(params.get('t'));
    if (params.get('l')) setLocationId(params.get('l'));
  }, []);

  const handleSubmit = async () => {
    if (pin.length < 4) return setError('Enter your 4-6 digit PIN');
    if (!tenantId || !locationId) return setError('Missing restaurant info — use the link your manager sent');
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/agent-9/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, locationId, pin }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      onLogin(data.data.token, data.data.employee);
    } catch(e) { setError(e.message); setLoading(false); }
  };

  const handleKey = (digit) => {
    if (digit === '⌫') { setPin(p => p.slice(0,-1)); return; }
    if (pin.length >= 6) return;
    setPin(p => p + digit);
  };

  useEffect(() => {
    if (pin.length >= 4 && tenantId && locationId) handleSubmit();
  }, [pin]);

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ fontFamily:'var(--serif)', fontSize:28, fontWeight:700, marginBottom:6 }}>Pulse Staff</div>
      <div style={{ fontSize:13, color:'var(--ink-3)', marginBottom:32 }}>Enter your PIN to sign in</div>

      {/* PIN display */}
      <div style={{ display:'flex', gap:12, marginBottom:32 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:pin.length>i?'var(--gold)':'var(--border)', transition:'background .2s' }}/>
        ))}
      </div>

      {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:16, textAlign:'center' }}>{error}</div>}

      {/* Manual config if no URL params */}
      {(!tenantId || !locationId) && (
        <div style={{ width:'100%', maxWidth:320, marginBottom:20 }}>
          <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:8, textAlign:'center' }}>
            Ask your manager for the staff login link, or enter restaurant details:
          </div>
          <input placeholder="Restaurant ID (from manager)" value={tenantId} onChange={e=>setTenantId(e.target.value)}
            style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-2)', color:'var(--ink)', fontSize:13, marginBottom:8, boxSizing:'border-box' }}/>
          <input placeholder="Location ID (from manager)" value={locationId} onChange={e=>setLocationId(e.target.value)}
            style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-2)', color:'var(--ink)', fontSize:13, boxSizing:'border-box' }}/>
        </div>
      )}

      {/* PIN pad */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, width:'100%', maxWidth:260 }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d,i) => (
          d === '' ? <div key={i}/> : (
            <button key={d} onClick={() => handleKey(d)} disabled={loading}
              style={{ padding:'18px 0', fontSize:22, fontWeight:600, borderRadius:12, border:'1px solid var(--border)', background:'var(--bg-2)', color:'var(--ink)', cursor:'pointer', transition:'background .1s' }}
              onMouseDown={e=>e.currentTarget.style.background='var(--bg-3)'}
              onMouseUp={e=>e.currentTarget.style.background='var(--bg-2)'}>
              {loading && d==='⌫' ? '…' : d}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

// ── My Schedule ────────────────────────────────────────────────────────────────
function MySchedule({ req }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    req('/my-shifts').then(s => { setShifts(Array.isArray(s)?s:[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{padding:40,textAlign:'center'}}><div className="spinner"/></div>;

  // Group by week
  const byWeek = {};
  shifts.forEach(sh => {
    const wk = sh.week_start || sh.shift_date?.slice(0,7);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(sh);
  });

  // Find next upcoming shift
  const today = new Date().toISOString().slice(0,10);
  const nextShift = shifts.find(s => s.shift_date >= today);

  return (
    <div style={{ padding:'16px' }}>
      {/* Next shift hero */}
      {nextShift && (
        <div style={{ background:'linear-gradient(135deg,#1a1a0a,#2a2010)', border:'1px solid var(--gold-border)', borderRadius:14, padding:'20px', marginBottom:20 }}>
          <div style={{ fontSize:11, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>Next shift</div>
          <div style={{ fontFamily:'var(--serif)', fontSize:22, fontWeight:700, color:'var(--gold)', marginBottom:4 }}>
            {new Date(nextShift.shift_date+'T12:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
          </div>
          <div style={{ fontSize:18, color:'#fff', fontWeight:600, marginBottom:6 }}>
            {fmtTime(nextShift.start_time)} – {fmtTime(nextShift.end_time)}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.6)' }}>{nextShift.position || 'See manager for role'}</div>
          {nextShift.notes && <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:8, fontStyle:'italic' }}>📝 {nextShift.notes}</div>}
        </div>
      )}

      {shifts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
          <div style={{ fontWeight:600, fontSize:16, marginBottom:6 }}>No published shifts yet</div>
          <div style={{ fontSize:13, color:'var(--ink-3)' }}>Your schedule will appear here once your manager publishes it</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>
            All upcoming shifts
          </div>
          {Object.keys(byWeek).sort().map(wk => (
            <div key={wk} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:8, fontWeight:600 }}>
                Week of {new Date(wk+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
              </div>
              {byWeek[wk].map((sh,i) => {
                const d    = new Date(sh.shift_date+'T12:00');
                const isPast = sh.shift_date < today;
                const isToday = sh.shift_date === today;
                return (
                  <div key={i} style={{ display:'flex', gap:14, padding:'12px 14px', background:isToday?'rgba(184,116,26,.08)':'var(--bg-2)', border:`1px solid ${isToday?'var(--gold-border)':'var(--border)'}`, borderRadius:10, marginBottom:8, opacity:isPast?0.5:1 }}>
                    <div style={{ textAlign:'center', minWidth:40 }}>
                      <div style={{ fontSize:10, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase' }}>{DAY_NAMES[d.getDay()]}</div>
                      <div style={{ fontSize:22, fontWeight:700, color:isToday?'var(--gold)':'var(--ink)', lineHeight:1 }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:isToday?'var(--gold)':'var(--ink)' }}>
                        {fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}
                      </div>
                      <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>{sh.position || 'No role'}</div>
                      {sh.notes && <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:4, fontStyle:'italic' }}>📝 {sh.notes}</div>}
                    </div>
                    {isToday && <div style={{ fontSize:11, padding:'3px 8px', background:'var(--gold)', color:'#000', borderRadius:20, fontWeight:700, alignSelf:'flex-start', whiteSpace:'nowrap' }}>Today</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Messages ───────────────────────────────────────────────────────────────────
const CHANNELS = [
  { id:'all_staff',  label:'📢 All Staff' },
  { id:'foh',        label:'🍽 FOH' },
  { id:'boh',        label:'🍳 BOH' },
  { id:'general',    label:'💬 General' },
];

function StaffMessages({ req, employee }) {
  const [channel, setChannel] = useState('all_staff');
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const msgEndRef = useRef(null);

  const loadMsgs = useCallback(() => {
    req(`/messages?channel=${channel}&locationId=${employee.locationId}`)
      .then(m => { setMessages(Array.isArray(m)?m:[]); setTimeout(()=>msgEndRef.current?.scrollIntoView({behavior:'smooth'}),100); })
      .catch(()=>{});
  }, [channel, employee.locationId]);

  useEffect(() => { loadMsgs(); }, [loadMsgs]);

  const send = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      const msg = await req('/messages', {
        method: 'POST',
        body: JSON.stringify({
          locationId: employee.locationId,
          channel,
          senderName: `${employee.firstName} ${employee.lastName||''}`.trim(),
          senderRole: employee.position || 'staff',
          content: input.trim(),
        }),
      });
      setMessages(m => [...m, msg]);
      setInput('');
      setTimeout(() => msgEndRef.current?.scrollIntoView({behavior:'smooth'}), 50);
    } catch(e) {} finally { setSending(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 130px)' }}>
      {/* Channel tabs */}
      <div style={{ display:'flex', gap:4, padding:'10px 14px', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
        {CHANNELS.map(ch => (
          <button key={ch.id} onClick={()=>setChannel(ch.id)} style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${channel===ch.id?'var(--gold)':'var(--border)'}`, background:channel===ch.id?'var(--gold-bg)':'transparent', color:channel===ch.id?'var(--gold)':'var(--ink-3)', fontSize:12, fontWeight:channel===ch.id?600:400, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            {ch.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:4 }}>
        {messages.length===0 && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-3)', flexDirection:'column', gap:8 }}>
            <span style={{ fontSize:32 }}>💬</span>
            <span style={{ fontSize:14 }}>No messages yet</span>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender_name === `${employee.firstName} ${employee.lastName||''}`.trim();
          const showDate = i===0 || new Date(messages[i-1].created_at).toDateString()!==new Date(msg.created_at).toDateString();
          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div style={{ textAlign:'center', margin:'8px 0 4px', fontSize:10, color:'var(--ink-3)' }}>
                  {new Date(msg.created_at).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}
                </div>
              )}
              {msg.msg_type==='announcement' && (
                <div style={{ background:'rgba(184,116,26,.1)', border:'1px solid var(--gold-border)', borderRadius:10, padding:'10px 12px', margin:'4px 0' }}>
                  <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>📢 Announcement from {msg.sender_name}</div>
                  <div style={{ fontSize:13, color:'var(--ink)' }}>{msg.content}</div>
                  <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:4 }}>{new Date(msg.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
                </div>
              )}
              {msg.msg_type!=='announcement' && (
                <div style={{ display:'flex', flexDirection:isMe?'row-reverse':'row', gap:8, alignItems:'flex-end' }}>
                  {!isMe && (
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {(msg.sender_name||'?')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ maxWidth:'72%' }}>
                    {!isMe && <div style={{ fontSize:10, color:'var(--ink-3)', marginBottom:2, marginLeft:4 }}>{msg.sender_name}</div>}
                    <div style={{ background:isMe?'var(--gold)':'var(--bg-2)', color:isMe?'#000':'var(--ink)', borderRadius:isMe?'16px 16px 4px 16px':'16px 16px 16px 4px', padding:'9px 13px', fontSize:14, lineHeight:1.4, border:isMe?'none':'1px solid var(--border)' }}>
                      {msg.content}
                    </div>
                    <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:2, textAlign:isMe?'right':'left', marginLeft:isMe?0:4, marginRight:isMe?4:0 }}>
                      {new Date(msg.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={msgEndRef}/>
      </div>

      {/* Input */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', background:'var(--bg-2)', display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} }} placeholder="Message your team…" rows={1} style={{ flex:1, padding:'9px 13px', borderRadius:20, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--ink)', fontSize:14, resize:'none', lineHeight:1.4, outline:'none', fontFamily:'inherit' }}/>
        <button onClick={send} disabled={sending||!input.trim()} style={{ width:40, height:40, borderRadius:'50%', background:'var(--gold)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, opacity:input.trim()?1:0.4 }}>
          ↑
        </button>
      </div>
    </div>
  );
}

// ── Team ───────────────────────────────────────────────────────────────────────
function MyTeam({ req, employee }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    req(`/my-team?locationId=${employee.locationId}`)
      .then(t => { setTeam(Array.isArray(t)?t:[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const byDept = {};
  team.forEach(m => {
    const d = m.department || 'other';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(m);
  });

  const DEPT_LABELS = { foh:'Front of House', boh:'Back of House', management:'Management', other:'Other' };

  return (
    <div style={{ padding:16 }}>
      <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Your team ({team.length})</div>
      {loading ? <div className="spinner" style={{margin:'40px auto'}}/> : (
        Object.keys(byDept).map(dept => (
          <div key={dept} style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>{DEPT_LABELS[dept]||dept}</div>
            {byDept[dept].map((m,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-2)', borderRadius:10, marginBottom:6, border:'1px solid var(--border)' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#4A90D9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {(m.first_name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{m.first_name} {m.last_name}</div>
                  <div style={{ fontSize:12, color:'var(--ink-3)' }}>{m.position}</div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ── Account ────────────────────────────────────────────────────────────────────
function MyAccount({ employee, req, onLogout }) {
  const [pin, setPin]       = useState('');
  const [pin2, setPin2]     = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  const handleSetPin = async () => {
    if (pin.length < 4) return setMsg('PIN must be at least 4 digits');
    if (pin !== pin2) return setMsg('PINs do not match');
    setSaving(true); setMsg('');
    try {
      await req('/set-pin', { method:'POST', body: JSON.stringify({ pin }) });
      setMsg('✓ PIN updated successfully');
      setPin(''); setPin2('');
    } catch(e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding:16 }}>
      <div style={{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:14, padding:20, marginBottom:20, display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'#000' }}>
          {(employee.firstName||'?')[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:18 }}>{employee.firstName} {employee.lastName}</div>
          <div style={{ fontSize:13, color:'var(--ink-3)', marginTop:2 }}>{employee.position}</div>
        </div>
      </div>

      <div style={{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:14, padding:20, marginBottom:20 }}>
        <div style={{ fontWeight:700, marginBottom:4 }}>Change PIN</div>
        <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:14 }}>Update your login PIN (4-6 digits)</div>
        <input type="password" inputMode="numeric" maxLength={6} placeholder="New PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--ink)', fontSize:16, letterSpacing:6, marginBottom:10, boxSizing:'border-box', fontFamily:'monospace' }}/>
        <input type="password" inputMode="numeric" maxLength={6} placeholder="Confirm PIN" value={pin2} onChange={e=>setPin2(e.target.value.replace(/\D/g,''))}
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--ink)', fontSize:16, letterSpacing:6, marginBottom:12, boxSizing:'border-box', fontFamily:'monospace' }}/>
        {msg && <div style={{ fontSize:12, color:msg.startsWith('✓')?'var(--green)':'var(--red)', marginBottom:10 }}>{msg}</div>}
        <button onClick={handleSetPin} disabled={saving||pin.length<4||pin!==pin2} style={{ width:'100%', padding:'12px', borderRadius:8, background:'var(--gold)', border:'none', color:'#000', fontWeight:700, fontSize:15, cursor:'pointer', opacity:pin.length>=4&&pin===pin2?1:0.5 }}>
          {saving?'Saving…':'Update PIN'}
        </button>
      </div>

      <button onClick={onLogout} style={{ width:'100%', padding:'14px', borderRadius:10, background:'transparent', border:'1px solid var(--border)', color:'var(--ink-3)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
        Sign out
      </button>
    </div>
  );
}
