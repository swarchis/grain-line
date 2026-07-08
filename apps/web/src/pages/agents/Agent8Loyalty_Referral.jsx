import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { agent8, locations as locationsApi } from '../../lib/api.js';
import { useAuth } from '../../App.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const TIER_STYLES = {
  bronze:   { color:'#CD7F32', bg:'rgba(205,127,50,.1)',  label:'Bronze',   icon:'🥉' },
  silver:   { color:'#A8A9AD', bg:'rgba(168,169,173,.1)', label:'Silver',   icon:'🥈' },
  gold:     { color:'#FFD700', bg:'rgba(255,215,0,.1)',   label:'Gold',     icon:'🥇' },
  platinum: { color:'#E8A020', bg:'rgba(232,160,32,.15)', label:'Platinum', icon:'🦚' },
};

const CAMPAIGN_TYPES = [
  { key:'multiplier',  label:'Multiplier',    icon:'✕', desc:'2x–3x points for a period' },
  { key:'bonus',       label:'Bonus Points',  icon:'+', desc:'Festival / event surge' },
  { key:'winback',     label:'Win-Back',      icon:'↩', desc:'Target lapsed members' },
  { key:'tier_push',   label:'Tier Push',     icon:'↑', desc:'Help members reach next tier' },
  { key:'challenge',   label:'Challenge Boost',icon:'🏆',desc:'Boost active challenges' },
  { key:'cross_venue', label:'Cross-Venue',   icon:'◎', desc:'Drive multi-location visits' },
];

const fmt  = n => n == null ? '—' : Number(n).toLocaleString();
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

// ── Tier badge ────────────────────────────────────────────────────────────────
function TierBadge({ tier, small }) {
  const s = TIER_STYLES[tier] || TIER_STYLES.bronze;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding: small ? '1px 7px' : '3px 10px',
      borderRadius:20, fontSize: small ? 10 : 11, fontWeight:600,
      background:s.bg, color:s.color, border:`1px solid ${s.color}40`,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

// ── Member modal ──────────────────────────────────────────────────────────────
function MemberModal({ memberId, onClose, onSave, rewards, locationId }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('overview');
  const [adjustPts, setAdjustPts] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [visitAmount, setVisitAmount] = useState('');
  const [isBirthday, setIsBirthday] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');

  const load = async () => {
    setLoading(true);
    const d = await agent8.getMember(memberId);
    setData(d);
    setLoading(false);
  };
  useEffect(() => { load(); }, [memberId]);

  const handleAdjust = async (pts, reason) => {
    setSaving(true);
    try {
      await agent8.adjustPoints(memberId, { points: parseInt(pts), reason });
      setToast(`${pts > 0 ? '+' : ''}${pts} points applied`);
      setAdjustPts(''); setAdjustReason('');
      await load();
    } catch(e) { setToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleRedeem = async (rewardId) => {
    setSaving(true);
    try {
      await agent8.redeemPoints(memberId, { rewardId, locationId });
      setToast('Reward redeemed!');
      await load();
    } catch(e) { setToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleVisit = async (amountSpent, isBirthday) => {
    setSaving(true);
    try {
      const result = await agent8.recordVisit(memberId, { locationId, amountSpent: parseFloat(amountSpent), isBirthday });
      setToast(`+${result.points_earned} points awarded!`);
      await load();
    } catch(e) { setToast('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const m = data?.member;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:28, overflowY:'auto' }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:700, maxWidth:'96vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ padding:'16px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          {loading ? <div className="spinner" style={{ margin:0, width:20, height:20 }}/> : (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:TIER_STYLES[m?.tier]?.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{TIER_STYLES[m?.tier]?.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700 }}>{m?.name}</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:3 }}>
                    <TierBadge tier={m?.tier} small/>
                    <span style={{ fontSize:11, color:'var(--ink-3)', fontFamily:'var(--mono)' }}>{m?.referral_code}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 22px' }}>
          {['overview','history','rewards','challenges'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'9px 14px', background:'none', border:'none', borderBottom:`2px solid ${tab===t?'var(--gold)':'transparent'}`, fontSize:12, fontWeight:500, color:tab===t?'var(--gold)':'var(--ink-3)', cursor:'pointer', textTransform:'capitalize', marginBottom:-1 }}>{t}</button>
          ))}
        </div>

        <div style={{ padding:'18px 22px', maxHeight:'65vh', overflowY:'auto' }}>
          {loading ? <div className="spinner"/> : !m ? <div>Member not found</div> : (
            <>
              {/* OVERVIEW */}
              {tab==='overview' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                    {[
                      { label:'Points balance', val:fmt(m.points_balance), color:'var(--gold)' },
                      { label:'Lifetime points', val:fmt(m.points_lifetime), color:'var(--ink)' },
                      { label:'Total visits', val:fmt(m.visit_count), color:'var(--green)' },
                    ].map((s,i) => (
                      <div key={i} className="stat-card">
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value" style={{ color:s.color, fontSize:22 }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    <div>
                      <div className="form-label">Email</div>
                      <div style={{ fontSize:13 }}>{m.email || '—'}</div>
                    </div>
                    <div>
                      <div className="form-label">Phone</div>
                      <div style={{ fontSize:13 }}>{m.phone || '—'}</div>
                    </div>
                    <div>
                      <div className="form-label">Member since</div>
                      <div style={{ fontSize:13 }}>{fmtDate(m.created_at)}</div>
                    </div>
                    <div>
                      <div className="form-label">Last visit</div>
                      <div style={{ fontSize:13 }}>{fmtDate(m.last_visit)}</div>
                    </div>
                    {m.preferences && <div style={{ gridColumn:'1/-1' }}>
                      <div className="form-label">Preferences</div>
                      <div style={{ fontSize:13 }}>{m.preferences}</div>
                    </div>}
                    {m.notes && <div style={{ gridColumn:'1/-1' }}>
                      <div className="form-label">Notes</div>
                      <div style={{ fontSize:13 }}>{m.notes}</div>
                    </div>}
                  </div>

                  {/* Manual point adjustment */}
                  <div style={{ padding:'14px', background:'var(--bg-3)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Manual point adjustment</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <input className="form-input" type="number" value={adjustPts} onChange={e=>setAdjustPts(e.target.value)} placeholder="+500 or -200" style={{ width:120, fontSize:12 }}/>
                      <input className="form-input" value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="Reason…" style={{ flex:1, fontSize:12 }}/>
                      <button className="btn btn-primary btn-sm" disabled={!adjustPts||!adjustReason||saving} onClick={()=>handleAdjust(adjustPts, adjustReason)}>Apply</button>
                    </div>
                    {toast && <div style={{ fontSize:11, color:'var(--green)', marginTop:6 }}>{toast}</div>}
                  </div>
                </>
              )}

              {/* HISTORY */}
              {tab==='history' && (
                <div>
                  {!data.transactions.length ? <div style={{ color:'var(--ink-3)', fontSize:13, fontStyle:'italic' }}>No transactions yet</div> : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--bg-3)' }}>
                          {['Date','Type','Reason','Points','Balance'].map(h => (
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.transactions.map((tx,i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', fontSize:11, color:'var(--ink-3)' }}>{fmtDate(tx.created_at)}</td>
                            <td style={{ padding:'8px 12px' }}><span className={`tag tag-${tx.type==='earn'?'green':tx.type==='redeem'?'red':'amber'}`}>{tx.type}</span></td>
                            <td style={{ padding:'8px 12px' }}>{tx.reason}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', fontWeight:500, color:tx.points>0?'var(--green)':'var(--red)' }}>{tx.points>0?'+':''}{tx.points}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)' }}>{fmt(tx.balance_after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* REWARDS */}
              {tab==='rewards' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {rewards.map(r => (
                    <div key={r.id} style={{ padding:'12px 14px', background:'var(--bg-3)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:500 }}>{r.label}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:14, color:'var(--gold)', marginTop:3 }}>{fmt(r.pts)} pts</div>
                      </div>
                      <button className="btn btn-sm btn-primary" disabled={m.points_balance < r.pts || saving} onClick={()=>handleRedeem(r.id)}>
                        {m.points_balance >= r.pts ? 'Redeem' : 'Need pts'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* CHALLENGES */}
              {tab==='challenges' && (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {!data.challenges.length ? <div style={{ color:'var(--ink-3)', fontSize:13, fontStyle:'italic' }}>No challenge progress yet</div> : data.challenges.map((ch,i) => (
                    <div key={i} style={{ padding:'12px 14px', background:'var(--bg-3)', borderRadius:'var(--r-sm)', border:`1px solid ${ch.completed?'var(--green-border)':'var(--border)'}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:18 }}>{ch.emoji}</span>
                        <span style={{ fontSize:12, fontWeight:500, flex:1 }}>{ch.label}</span>
                        {ch.completed && <span className="tag tag-green">✓ Complete</span>}
                        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--gold)' }}>+{fmt(ch.points_reward)} pts</span>
                      </div>
                      <div style={{ background:'var(--bg-2)', borderRadius:4, height:6, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(100, (ch.progress/ch.target)*100)}%`, background:ch.completed?'var(--green)':'var(--gold)', borderRadius:4, transition:'width .4s' }}/>
                      </div>
                      <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:4, fontFamily:'var(--mono)' }}>{ch.progress}/{ch.target}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────
function AddMemberModal({ locationId, onClose, onAdded }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', birthday_month:'', preferences:'', notes:'', referralCode:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.name) return setError('Name is required');
    setSaving(true); setError('');
    try {
      await agent8.createMember({ ...form, locationId });
      onAdded();
      onClose();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:480, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700 }}>🦚 Add loyalty member</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Full name *</label>
              <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Priya Sharma"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e=>f('email',e.target.value)} placeholder="priya@example.com"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="+1 (415) 000-0000"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Birthday month (1-12)</label>
              <input className="form-input" type="number" min={1} max={12} value={form.birthday_month} onChange={e=>f('birthday_month',e.target.value)} placeholder="6"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Referred by code</label>
              <input className="form-input" value={form.referralCode} onChange={e=>f('referralCode',e.target.value)} placeholder="PRIY1234"/>
            </div>
            <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
              <label className="form-label">Preferences</label>
              <input className="form-input" value={form.preferences} onChange={e=>f('preferences',e.target.value)} placeholder="Vegetarian, loves tasting menus…"/>
            </div>
            <div className="form-group" style={{ marginBottom:0, gridColumn:'1/-1' }}>
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="VIP guest, celebrating anniversary…"/>
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Adding…' : '+ Add member (+300 welcome pts)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Campaign Builder ──────────────────────────────────────────────────────────
function CampaignModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ type:'multiplier', name:'', description:'', targetTiers:[], multiplier:2, bonusPoints:'', startDate:'', endDate:'' });
  const [saving, setSaving] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copy, setCopy] = useState(null);
  const [error, setError] = useState('');
  const [savedCampId, setSavedCampId] = useState(null);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const toggleTier = (t) => setForm(p=>({ ...p, targetTiers: p.targetTiers.includes(t) ? p.targetTiers.filter(x=>x!==t) : [...p.targetTiers, t] }));

  const handleSave = async () => {
    if (!form.name) return setError('Name required');
    setSaving(true); setError('');
    try {
      const camp = await agent8.createCampaign(form);
      onCreated(camp);
      onClose();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:32, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:580, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700 }}>New campaign</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          {/* Campaign type */}
          <div className="form-group">
            <label className="form-label">Campaign type</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {CAMPAIGN_TYPES.map(ct => (
                <button key={ct.key} onClick={()=>f('type',ct.key)} style={{ padding:'10px 8px', background:form.type===ct.key?'var(--gold-bg)':'var(--bg-3)', border:`1px solid ${form.type===ct.key?'var(--gold-border)':'var(--border)'}`, borderRadius:'var(--r-sm)', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ fontSize:14, marginBottom:3 }}>{ct.icon}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-2)' }}>{ct.label}</div>
                  <div style={{ fontSize:10, color:'var(--ink-3)' }}>{ct.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Campaign name</label>
              <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Diwali Double Points"/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Celebrate Diwali with 2x points on all dining"/>
            </div>
            {form.type==='multiplier' && <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Multiplier</label>
              <input className="form-input" type="number" min={1.5} max={5} step={0.5} value={form.multiplier} onChange={e=>f('multiplier',e.target.value)}/>
            </div>}
            {form.type==='bonus' && <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Bonus points</label>
              <input className="form-input" type="number" value={form.bonusPoints} onChange={e=>f('bonusPoints',e.target.value)} placeholder="500"/>
            </div>}
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Start date</label>
              <input className="form-input" type="date" value={form.startDate} onChange={e=>f('startDate',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">End date</label>
              <input className="form-input" type="date" value={form.endDate} onChange={e=>f('endDate',e.target.value)}/>
            </div>
          </div>

          {/* Target tiers */}
          <div className="form-group" style={{ marginTop:12 }}>
            <label className="form-label">Target tiers (leave empty for all)</label>
            <div style={{ display:'flex', gap:8 }}>
              {['bronze','silver','gold','platinum'].map(t => (
                <button key={t} onClick={()=>toggleTier(t)} style={{ padding:'6px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:`1px solid ${TIER_STYLES[t].color}40`, background:form.targetTiers.includes(t)?TIER_STYLES[t].bg:'var(--bg-3)', color:TIER_STYLES[t].color }}>
                  {TIER_STYLES[t].icon} {TIER_STYLES[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* AI copy */}
          {copy && (
            <div style={{ background:'var(--bg-3)', borderRadius:'var(--r-sm)', padding:'12px 14px', marginBottom:12, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>AI-generated copy</div>
              <div style={{ fontSize:12, marginBottom:6 }}><strong>Email:</strong> {copy.email?.subject}</div>
              <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:6 }}>{copy.email?.body?.slice(0,120)}…</div>
              <div style={{ fontSize:12, marginBottom:4 }}><strong>SMS:</strong> {copy.sms}</div>
              <div style={{ fontSize:12 }}><strong>Push:</strong> {copy.push?.title} — {copy.push?.body}</div>
            </div>
          )}

          {error && <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn" disabled={generatingCopy} onClick={async()=>{
              if (!form.name) return setError('Name required first');
              setGeneratingCopy(true);
              try {
                // Only create if not already saved this session
                let campId = savedCampId;
                if (!campId) {
                  const camp = await agent8.createCampaign(form);
                  campId = camp.id;
                  setSavedCampId(campId);
                  onCreated(camp);
                }
                const c = await agent8.generateCopy(campId);
                setCopy(c);
              } catch(e) { setError(e.message); }
              finally { setGeneratingCopy(false); }
            }}>
              {generatingCopy ? '✦ Writing copy…' : '✦ Generate AI copy'}
            </button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Launch campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Agent8LoyaltyReferral() {
  const { location: selectedLocationId, setLocation } = useAuth();
  const [allLocations, setAllLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  // Phase 2: the tab lives in the URL (/loyalty/:tab)
  const { tab: _urlTab } = useParams();
  const _nav = useNavigate();
  const _navLoc = useLocation();
  const activeTab = _urlTab || 'members';
  const setActiveTab = (t) => _nav('/loyalty/' + t);
  useEffect(() => { // backcompat: old ?tab= links redirect to the path form
    const t = new URLSearchParams(_navLoc.search).get('tab');
    if (t) _nav('/loyalty/' + t, { replace: true });
  }, [_navLoc.search]);
  const [loading, setLoading]     = useState(true);
  const [summary, setSummary]     = useState(null);
  const [config, setConfig]       = useState(null);
  const [members, setMembers]     = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbMetric, setLbMetric]   = useState('points');
  const [search, setSearch]       = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [editingCampaign, setEditingCampaign]   = useState(null);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

  const handleDeleteChallenge = async (id) => {
    if (!confirm('Delete this challenge? Progress data will also be removed.')) return;
    try {
      await agent8.deleteChallenge(id);
      setChallenges(cs => cs.filter(c => c.id !== id));
      showToast('Challenge deleted');
    } catch(e) { showToast(e.message, true); }
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Delete this campaign?')) return;
    try {
      await agent8.deleteCampaign(id);
      setCampaigns(cs => cs.filter(c => c.id !== id));
      showToast('Campaign deleted');
    } catch(e) { showToast(e.message, true); }
  };

  useEffect(() => {
    locationsApi.list().then(locs => {
      setAllLocations(locs);
      const active = selectedLocationId ? locs.find(l=>l.id===selectedLocationId) : locs[0];
      setCurrentLocation(active||locs[0]||null);
    }).catch(()=>{});
  }, [selectedLocationId]);

  useEffect(() => {
    agent8.getConfig().then(d => setConfig(d)).catch(()=>{});
  }, []);

  const loadAll = useCallback(async () => {
    if (!currentLocation) return;
    setLoading(true);
    const locId = currentLocation.id;
    try {
      const [sum, mems, chal, camps] = await Promise.all([
        agent8.summary(locId).catch(()=>null),
        agent8.members({ locationId:locId, search:search||undefined, tier:tierFilter||undefined }),
        agent8.challenges(),
        agent8.campaigns(),
      ]);
      setSummary(sum);
      setMembers(Array.isArray(mems)?mems:[]);
      setChallenges(Array.isArray(chal)?chal:[]);
      setCampaigns(Array.isArray(camps)?camps:[]);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentLocation, search, tierFilter]);

  const loadLeaderboard = useCallback(async () => {
    if (!currentLocation) return;
    const data = await agent8.leaderboard(lbMetric, 10).catch(()=>[]);
    setLeaderboard(Array.isArray(data)?data:[]);
  }, [currentLocation, lbMetric]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (activeTab==='leaderboard') loadLeaderboard(); }, [activeTab, loadLeaderboard]);

  const tabs = [
    { key:'members',     label:'👥 Members' },
    { key:'leaderboard', label:'🏆 Leaderboard' },
    { key:'challenges',  label:'🎯 Challenges' },
    { key:'campaigns',   label:'📣 Campaigns' },
    { key:'rewards',     label:'🎁 Rewards' },
  ];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div style={{ flexBasis:'100%', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:3 }}>Loyalty &amp; Customer Incentives <span style={{ color:'var(--gold)' }}>▸ {((tabs.find(t=>t.key===activeTab)||{}).label||activeTab).replace(/^[^A-Za-z]+/,'')}</span></div>
          <h1 className="page-title">Rivaaz Spice Circle — {currentLocation?.name||'…'}</h1>
          <div className="page-sub">{summary?.active_members||0} active members · {fmt(summary?.outstanding_points)} pts outstanding</div>
        </div>
        <div className="topbar-right">
          {allLocations.length > 1 && (
            <span className="btn" style={{ cursor:'default', opacity:.9 }} title="Change restaurant from the sidebar">📍 {currentLocation?.name || 'All restaurants'}</span>
          )}
          <button className="btn" onClick={loadAll}>↻</button>
          {activeTab==='members'   && <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add member</button>}
          {activeTab==='challenges' && <button className="btn btn-primary" onClick={()=>setShowNewChallenge(true)}>+ New challenge</button>}
          {activeTab==='campaigns'  && <button className="btn btn-primary" onClick={()=>setShowCampaign(true)}>+ New campaign</button>}
        </div>
      </div>


      <div className="content">
        {/* KPI summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total members',  val:summary?.active_members||0,        color:'var(--ink)' },
            { label:'New this month', val:summary?.new_this_month||0,        color:'var(--green)' },
            { label:'Bronze',         val:summary?.tiers?.bronze||0,         color:'#CD7F32' },
            { label:'Silver',         val:summary?.tiers?.silver||0,         color:'#A8A9AD' },
            { label:'Gold + Plat',    val:(summary?.tiers?.gold||0)+(summary?.tiers?.platinum||0), color:'#FFD700' },
          ].map((s,i) => (
            <div key={i} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color:s.color, fontSize:24 }}>{fmt(s.val)}</div>
            </div>
          ))}
        </div>

        {/* ── MEMBERS ── */}
        {activeTab==='members' && (
          <>
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
              <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email, phone…" style={{ maxWidth:260, fontSize:12 }}/>
              <select className="form-select" value={tierFilter} onChange={e=>setTierFilter(e.target.value)} style={{ maxWidth:140, fontSize:12 }}>
                <option value="">All tiers</option>
                {['bronze','silver','gold','platinum'].map(t=><option key={t} value={t}>{TIER_STYLES[t].label}</option>)}
              </select>
              <button className="btn btn-sm" onClick={loadAll}>↻ Search</button>
              <div style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-3)', fontFamily:'var(--mono)' }}>{members.length} members</div>
            </div>

            {loading ? <div className="spinner"/> : members.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🦚</div>
                <div className="empty-state-title">No members yet</div>
                <div className="empty-state-sub" style={{ marginBottom:16 }}>Add your first Spice Circle member — they get 300 welcome points instantly</div>
                <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add first member</button>
              </div>
            ) : (
              <div className="card-raised">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg-3)' }}>
                      {['Member','Tier','Points','Lifetime','Visits','Last visit','Referral code',''].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}
                        onClick={()=>setSelectedMember(m.id)}>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ fontWeight:500 }}>{m.name}</div>
                          <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:1 }}>{m.email||m.phone||''}</div>
                        </td>
                        <td style={{ padding:'10px 14px' }}><TierBadge tier={m.tier} small/></td>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:500, color:'var(--gold)' }}>{fmt(m.points_balance)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmt(m.points_lifetime)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', textAlign:'center' }}>{m.visit_count||0}</td>
                        <td style={{ padding:'10px 14px', fontSize:11, color:'var(--ink-3)' }}>{fmtDate(m.last_visit)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontSize:11, color:'var(--ink-3)' }}>{m.referral_code}</td>
                        <td style={{ padding:'10px 14px' }}><button className="btn btn-sm" onClick={e=>{e.stopPropagation();setSelectedMember(m.id);}}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {activeTab==='leaderboard' && (
          <>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {['points','visits','referrals'].map(m=>(
                <button key={m} className="btn btn-sm" style={lbMetric===m?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>setLbMetric(m)}>
                  {m==='points'?'🏆 Points':m==='visits'?'🍽️ Visits':'🦚 Referrals'}
                </button>
              ))}
            </div>
            <div className="card-raised">
              {leaderboard.map((m,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                  onClick={()=>setSelectedMember(m.id)}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:i<3?['#FFD700','#A8A9AD','#CD7F32'][i]+'30':'var(--bg-3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:i<3?['#FFD700','#A8A9AD','#CD7F32'][i]:'var(--ink-3)', flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:13 }}>{m.name}</div>
                    <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:1 }}>{m.email||''}</div>
                  </div>
                  <TierBadge tier={m.tier} small/>
                  <div style={{ fontFamily:'var(--mono)', fontSize:16, fontWeight:600, color:'var(--gold)', textAlign:'right', minWidth:80 }}>
                    {lbMetric==='points' ? fmt(m.points_lifetime) : lbMetric==='visits' ? (m.visit_count||0) + ' visits' : (m.referral_count||0) + ' referrals'}
                  </div>
                </div>
              ))}
              {leaderboard.length===0 && !loading && <div style={{ padding:'32px', textAlign:'center', color:'var(--ink-3)', fontStyle:'italic' }}>No data yet</div>}
            </div>
          </>
        )}

        {/* ── CHALLENGES ── */}
        {activeTab==='challenges' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            {challenges.map((ch,i)=>(
              <div key={i} className="card-raised" style={{ padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:28 }}>{ch.emoji}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{ch.label}</div>
                    <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{ch.description}</div>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:11 }}>
                  <span style={{ color:'var(--ink-3)' }}>Enrolled: <strong style={{ color:'var(--ink)' }}>{ch.enrolled_count||0}</strong></span>
                  <span style={{ color:'var(--green)' }}>Completed: <strong>{ch.completed_count||0}</strong></span>
                </div>
                <div style={{ background:'var(--bg-3)', borderRadius:4, height:6, overflow:'hidden', marginBottom:8 }}>
                  <div style={{ height:'100%', width:`${ch.enrolled_count>0?Math.min(100,(ch.completed_count/ch.enrolled_count)*100):0}%`, background:'var(--green)', borderRadius:4 }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, color:'var(--ink-4)' }}>Target: {ch.target} {ch.metric}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--gold)', fontWeight:600 }}>+{fmt(ch.points_reward)} pts</span>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                  <button className="btn btn-sm" style={{ flex:1, justifyContent:'center' }} onClick={()=>setEditingChallenge(ch)}>✏ Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={()=>handleDeleteChallenge(ch.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CAMPAIGNS ── */}
        {activeTab==='campaigns' && (
          <>
            {campaigns.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📣</div>
                <div className="empty-state-title">No campaigns yet</div>
                <div className="empty-state-sub" style={{ marginBottom:16 }}>Launch a multiplier, win-back, or festival bonus campaign. Claude writes the copy for you.</div>
                <button className="btn btn-primary" onClick={()=>setShowCampaign(true)}>+ Create first campaign</button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {campaigns.map((c,i)=>{
                  const ct = CAMPAIGN_TYPES.find(t=>t.key===c.type);
                  return (
                    <div key={i} className="card-raised" style={{ padding:'16px 20px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontSize:24 }}>{ct?.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                          <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{c.description}</div>
                          <div style={{ display:'flex', gap:8, marginTop:6 }}>
                            {(c.target_tiers||[]).map(t=><TierBadge key={t} tier={t} small/>)}
                            {c.start_date && <span style={{ fontSize:10, color:'var(--ink-3)', fontFamily:'var(--mono)' }}>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', color:c.status==='active'?'var(--green)':'var(--ink-3)', padding:'2px 8px', background:c.status==='active'?'var(--green-bg)':'var(--bg-3)', borderRadius:3 }}>{c.status}</span>
                        {c.multiplier && <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600, color:'var(--gold)' }}>{c.multiplier}×</span>}
                        {c.bonus_points && <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600, color:'var(--gold)' }}>+{c.bonus_points}pts</span>}
                        <button className="btn btn-sm" onClick={()=>setEditingCampaign(c)}>✏</button>
                        <button className="btn btn-sm btn-danger" onClick={()=>handleDeleteCampaign(c.id)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── REWARDS ── */}
        {activeTab==='rewards' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
            {(config?.rewards||[]).map((r,i)=>(
              <div key={i} className="card-raised" style={{ padding:'20px' }}>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--ink-3)', marginBottom:8 }}>
                  {r.category==='experience'?'✨ Experience':r.category==='food'?'🍽️ Food':'🍷 Drink'}
                </div>
                <div style={{ fontSize:14, fontWeight:500, marginBottom:12, lineHeight:1.4 }}>{r.label}</div>
                <div style={{ fontFamily:'var(--serif)', fontSize:26, fontWeight:700, color:'var(--gold)', letterSpacing:'-0.02em' }}>{fmt(r.pts)}</div>
                <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:2 }}>Spice Points</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedMember && (
        <MemberModal
          memberId={selectedMember}
          locationId={currentLocation?.id}
          rewards={config?.rewards||[]}
          onClose={()=>setSelectedMember(null)}
          onSave={loadAll}
        />
      )}
      {showAdd && <AddMemberModal locationId={currentLocation?.id} onClose={()=>setShowAdd(false)} onAdded={()=>{loadAll();showToast('Member added — 300 welcome points awarded');}}/>}
      {showCampaign && <CampaignModal onClose={()=>{setShowCampaign(false);loadAll();}} onCreated={(camp)=>{setCampaigns(c=>[camp,...c]);showToast('Campaign created');}}/>}

      {showNewChallenge && (
        <NewChallengeModal
          onClose={()=>setShowNewChallenge(false)}
          onCreated={(ch)=>{
            setChallenges(cs=>[...cs, ch]);
            setShowNewChallenge(false);
            showToast('Challenge created');
          }}
        />
      )}

      {editingChallenge && (
        <EditChallengeModal
          challenge={editingChallenge}
          onClose={()=>setEditingChallenge(null)}
          onSaved={(updated)=>{
            setChallenges(cs=>cs.map(c=>c.id===updated.id?{...c,...updated}:c));
            setEditingChallenge(null);
            showToast('Challenge updated');
          }}
        />
      )}

      {editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          onClose={()=>setEditingCampaign(null)}
          onSaved={(updated)=>{
            setCampaigns(cs=>cs.map(c=>c.id===updated.id?{...c,...updated}:c));
            setEditingCampaign(null);
            showToast('Campaign updated');
          }}
        />
      )}

      {toast && <div className="toast" style={{ background:toast.err?'var(--red)':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </>
  );
}



// ── New Challenge Modal ───────────────────────────────────────────────────────
function NewChallengeModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    label: '', description: '', target: 3, metric: 'visits',
    points_reward: 500, emoji: '', start_date: '', end_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.label.trim()) return setError('Label required');
    setSaving(true); setError('');
    try {
      const ch = await agent8.createChallenge(form);
      onCreated(ch);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:500, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>🎯 New challenge</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Challenge name *</label>
              <input className="form-input" value={form.label} onChange={e=>f('label',e.target.value)} placeholder="e.g. Weekend Warrior"/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="e.g. Dine on 3 weekends this month"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Target</label>
              <input className="form-input" type="number" min={1} value={form.target} onChange={e=>f('target',parseInt(e.target.value))}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Metric</label>
              <select className="form-select" value={form.metric} onChange={e=>f('metric',e.target.value)}>
                {['visits','venues','reviews','referrals','events','dishes'].map(m=>(
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Points reward</label>
              <input className="form-input" type="number" min={0} step={50} value={form.points_reward} onChange={e=>f('points_reward',parseInt(e.target.value))}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Emoji badge</label>
              <input className="form-input" value={form.emoji} onChange={e=>f('emoji',e.target.value)} placeholder="🏆"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Start date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e=>f('start_date',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">End date</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e=>f('end_date',e.target.value)}/>
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving||!form.label.trim()}>
              {saving ? 'Creating…' : '+ Create challenge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Challenge Modal ──────────────────────────────────────────────────────
function EditChallengeModal({ challenge, onClose, onSaved }) {
  const [form, setForm] = useState({
    label:        challenge.label || '',
    description:  challenge.description || '',
    target:       challenge.target || 1,
    metric:       challenge.metric || 'visits',
    points_reward:challenge.points_reward || 0,
    emoji:        challenge.emoji || '',
    active:       challenge.active !== false,
    start_date:   challenge.start_date?.slice(0,10) || '',
    end_date:     challenge.end_date?.slice(0,10) || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const updated = await agent8.updateChallenge(challenge.id, form);
      onSaved(updated);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:500, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>{form.emoji} Edit challenge</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Label</label>
              <input className="form-input" value={form.label} onChange={e=>f('label',e.target.value)}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Target</label>
              <input className="form-input" type="number" min={1} value={form.target} onChange={e=>f('target',parseInt(e.target.value))}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Metric</label>
              <select className="form-select" value={form.metric} onChange={e=>f('metric',e.target.value)}>
                {['visits','venues','reviews','referrals','events','dishes'].map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Points reward</label>
              <input className="form-input" type="number" min={0} value={form.points_reward} onChange={e=>f('points_reward',parseInt(e.target.value))}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Emoji</label>
              <input className="form-input" value={form.emoji} onChange={e=>f('emoji',e.target.value)} placeholder="🔥"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Start date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e=>f('start_date',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">End date</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e=>f('end_date',e.target.value)}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0, display:'flex', alignItems:'center', gap:10 }}>
              <input type="checkbox" id="ch-active" checked={form.active} onChange={e=>f('active',e.target.checked)} style={{ width:16, height:16 }}/>
              <label htmlFor="ch-active" style={{ fontSize:13, cursor:'pointer' }}>Active</label>
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Campaign Modal ───────────────────────────────────────────────────────
function EditCampaignModal({ campaign, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:         campaign.name || '',
    description:  campaign.description || '',
    type:         campaign.type || 'multiplier',
    target_tiers: campaign.target_tiers || [],
    multiplier:   campaign.multiplier || '',
    bonus_points: campaign.bonus_points || '',
    start_date:   campaign.start_date?.slice(0,10) || '',
    end_date:     campaign.end_date?.slice(0,10) || '',
    status:       campaign.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const toggleTier = (t) => setForm(p=>({ ...p, target_tiers: p.target_tiers.includes(t) ? p.target_tiers.filter(x=>x!==t) : [...p.target_tiers, t] }));

  const handleSave = async () => {
    if (!form.name) return setError('Name required');
    setSaving(true); setError('');
    try {
      const updated = await agent8.updateCampaign(campaign.id, form);
      onSaved(updated);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:32, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Edit campaign</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)}/>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e=>f('type',e.target.value)}>
                {CAMPAIGN_TYPES.map(ct=><option key={ct.key} value={ct.key}>{ct.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e=>f('status',e.target.value)}>
                {['draft','active','paused','ended'].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(form.type==='multiplier') && <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Multiplier</label>
              <input className="form-input" type="number" min={1.5} max={5} step={0.5} value={form.multiplier} onChange={e=>f('multiplier',e.target.value)}/>
            </div>}
            {(form.type==='bonus') && <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Bonus points</label>
              <input className="form-input" type="number" value={form.bonus_points} onChange={e=>f('bonus_points',e.target.value)}/>
            </div>}
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Start date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e=>f('start_date',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">End date</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e=>f('end_date',e.target.value)}/>
            </div>
          </div>
          <div className="form-group" style={{ marginTop:12, marginBottom:0 }}>
            <label className="form-label">Target tiers</label>
            <div style={{ display:'flex', gap:8 }}>
              {['bronze','silver','gold','platinum'].map(t=>(
                <button key={t} onClick={()=>toggleTier(t)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:`1px solid ${TIER_STYLES[t].color}40`, background:form.target_tiers.includes(t)?TIER_STYLES[t].bg:'var(--bg-3)', color:TIER_STYLES[t].color }}>
                  {TIER_STYLES[t].icon} {TIER_STYLES[t].label}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="alert alert-red" style={{ marginTop:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
