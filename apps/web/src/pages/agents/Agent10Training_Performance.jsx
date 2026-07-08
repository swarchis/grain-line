import React, { useState, useEffect, useCallback } from 'react';
import { agent6, locations as locationsApi } from '../../lib/api.js';
import ModuleVideos from '../../components/ModuleVideos.jsx';
import { useAuth } from '../../App.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key:'food',       label:'Food & Recipes',      icon:'🍽️' },
  { key:'beverage',   label:'Beverage & Cocktails', icon:'🍸' },
  { key:'service',    label:'Service Standards',    icon:'🤝' },
  { key:'upselling',  label:'Upselling & Sales',    icon:'💰' },
  { key:'safety',     label:'Safety & Compliance',  icon:'🛡️' },
  { key:'onboarding', label:'Onboarding',           icon:'🚀' },
];

const LEVEL_STYLES = {
  rookie: { color:'#8090A0', icon:'🌱', label:'Rookie',  minPts:0    },
  pro:    { color:'#4A90D9', icon:'⭐', label:'Pro',     minPts:500  },
  expert: { color:'#9B59B6', icon:'💎', label:'Expert',  minPts:1500 },
  elite:  { color:'#E8A020', icon:'🏆', label:'Elite',   minPts:3500 },
  legend: { color:'#E24B4A', icon:'👑', label:'Legend',  minPts:7500 },
};

const BADGE_ICONS = {
  first_lesson:'📚', speed_learner:'⚡', perfect_score:'💯', upsell_star:'🌟',
  top_apc:'💰', challenge_winner:'🥇', streak_7:'🔥', streak_30:'🚀',
  review_hero:'⭐', waste_warrior:'♻️', team_captain:'🤝',
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function Agent10Training_Performance() {
  const [tab, setTab]                       = useState('learning');
  const [locations, setLocations]           = useState([]);
  const [loc, setLoc]                       = useState(null);
  const [loading, setLoading]               = useState(false);
  const [toast, setToast]                   = useState(null);

  // Learning
  const [modules, setModules]               = useState([]);
  const [catFilter, setCatFilter]           = useState('all');
  const [selectedModule, setSelectedModule] = useState(null);
  const [completing, setCompleting]         = useState(false);
  const [empId, setEmpId]                   = useState('');
  const [empName, setEmpName]               = useState('');
  const [coaching, setCoaching]             = useState(null);
  const [coachLoading, setCoachLoading]     = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard]       = useState([]);
  const [lbPeriod, setLbPeriod]             = useState('all_time');

  // Challenges
  const [challenges, setChallenges]         = useState([]);

  // Rewards
  const [rewards, setRewards]               = useState([]);
  const [rewardClaims, setRewardClaims]     = useState([]);

  // Gamification summary
  const [gamSummary, setGamSummary]         = useState(null);

  // Modals
  const [showAddModule, setShowAddModule]       = useState(false);
  const [showAddChallenge, setShowAddChallenge] = useState(false);
  const [showAddReward, setShowAddReward]       = useState(false);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  useEffect(() => {
    locationsApi.list().then(locs => { setLocations(locs||[]); if(locs?.length) setLoc(locs[0]); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!loc?.id) return;
    agent6.gamSummary(loc.id).then(s=>setGamSummary(s)).catch(()=>{});
  }, [loc]);

  useEffect(() => {
    if (!loc?.id) return;
    if (tab==='learning')    agent6.modules({locationId:loc.id}).then(m=>setModules(Array.isArray(m)?m:[])).catch(()=>{});
    if (tab==='leaderboard') agent6.leaderboard({locationId:loc.id, period:lbPeriod}).then(l=>setLeaderboard(Array.isArray(l)?l:[])).catch(()=>{});
    if (tab==='challenges')  agent6.challenges({locationId:loc.id}).then(c=>setChallenges(Array.isArray(c)?c:[])).catch(()=>{});
    if (tab==='rewards')     {
      agent6.rewards().then(r=>setRewards(Array.isArray(r)?r:[])).catch(()=>{});
      agent6.rewardClaims({status:'pending'}).then(r=>setRewardClaims(Array.isArray(r)?r:[])).catch(()=>{});
    }
  }, [tab, loc, lbPeriod]);

  const tabs = [
    { id:'learning',    label:'Learning library' },
    { id:'leaderboard', label:'🏆 Leaderboard' },
    { id:'challenges',  label:'Challenges' },
    { id:'rewards',     label:`Rewards${rewardClaims.length>0?` (${rewardClaims.length})`:''}` },
  ];

  const handleComplete = async (mod) => {
    if (!empId) return alert('Enter employee ID to mark completion');
    setCompleting(true);
    try {
      const r = await agent6.completeModule(mod.id, { employeeId:empId, employeeName:empName, score:100 });
      showToast(`✓ Marked complete — +${r.points_awarded} pts`);
      setSelectedModule(null);
    } catch(e) { showToast(e.message, true); }
    finally { setCompleting(false); }
  };

  const handleCoaching = async () => {
    if (!empId) return alert('Enter employee ID');
    setCoachLoading(true);
    try { const tips = await agent6.coaching({ employeeId:empId, employeeName:empName }); setCoaching(tips); }
    catch(e) { showToast(e.message, true); }
    finally { setCoachLoading(false); }
  };

  const filteredModules = catFilter==='all' ? modules : modules.filter(m=>m.category===catFilter);

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Training & Performance</h1>
          <div className="page-sub">{loc?.name || 'All locations'}</div>
        </div>
        <div className="topbar-right">
          <select className="form-select" style={{ fontSize:12 }} value={loc?.id||''} onChange={e=>setLoc(locations.find(l=>l.id===e.target.value)||null)}>
            {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {tab==='learning'   && <button className="btn btn-primary" onClick={()=>setShowAddModule(true)}>+ Add lesson</button>}
          {tab==='challenges' && <button className="btn btn-primary" onClick={()=>setShowAddChallenge(true)}>+ New challenge</button>}
          {tab==='rewards'    && <button className="btn btn-primary" onClick={()=>setShowAddReward(true)}>+ Add reward</button>}
        </div>
      </div>

      <div className="content">
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
          {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'8px 16px', background:'none', border:'none', borderBottom:`2px solid ${tab===t.id?'var(--gold)':'transparent'}`, color:tab===t.id?'var(--gold)':'var(--ink-3)', fontSize:13, cursor:'pointer', fontWeight:tab===t.id?600:400, whiteSpace:'nowrap' }}>{t.label}</button>)}
        </div>

        {/* ── LEARNING LIBRARY ─────────────────────────────────────────────── */}
        {tab==='learning' && (
          <>
            {selectedModule ? (
              <ModuleDetail mod={selectedModule} empId={empId} empName={empName}
                setEmpId={setEmpId} setEmpName={setEmpName}
                onBack={()=>setSelectedModule(null)} onComplete={handleComplete}
                completing={completing}/>
            ) : (
              <>
                {/* AI Coaching callout */}
                <div style={{ background:'linear-gradient(135deg,#1A1A2A,#0D0D1A)', borderRadius:12, padding:'16px 20px', marginBottom:20, border:'1px solid #333', display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ fontSize:32 }}>🤖</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, marginBottom:3 }}>AI Coaching</div>
                    <div style={{ fontSize:12, color:'var(--ink-3)' }}>Personalized performance tips based on training history and points — upselling, menu knowledge, APC improvement.</div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    <input className="form-input" placeholder="Employee name" value={empName} onChange={e=>setEmpName(e.target.value)} style={{ width:150, fontSize:12 }}/>
                    <input className="form-input" placeholder="Employee ID" value={empId} onChange={e=>setEmpId(e.target.value)} style={{ width:180, fontSize:12 }}/>
                    <button className="btn btn-primary btn-sm" onClick={handleCoaching} disabled={coachLoading}>{coachLoading?'🤖 Thinking…':'Get tips'}</button>
                  </div>
                </div>

                {/* Coaching tips */}
                {coaching && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                    {coaching.map((tip,i)=>(
                      <div key={i} style={{ background:'var(--bg-2)', borderRadius:10, padding:'16px', border:'1px solid var(--border)', borderTop:`3px solid ${tip.impact==='high'?'#E8A020':'#4A90D9'}` }}>
                        <div style={{ fontSize:10, fontWeight:700, color:tip.impact==='high'?'#E8A020':'#4A90D9', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>{tip.category} · {tip.impact} impact</div>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{tip.title}</div>
                        <div style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.6 }}>{tip.tip}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Category filter */}
                <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                  <FilterBtn active={catFilter==='all'} onClick={()=>setCatFilter('all')}>All ({modules.length})</FilterBtn>
                  {CATEGORIES.map(cat=>(
                    <FilterBtn key={cat.key} active={catFilter===cat.key} onClick={()=>setCatFilter(cat.key)}>
                      {cat.icon} {cat.label} {modules.filter(m=>m.category===cat.key).length > 0 && `(${modules.filter(m=>m.category===cat.key).length})`}
                    </FilterBtn>
                  ))}
                </div>

                {filteredModules.length===0 ? (
                  <div className="empty-state">
                    <div className="empty-state-title">No lessons yet</div>
                    <div className="empty-state-sub">Add recipes, procedures, and upsell scripts to build your training library</div>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
                    {filteredModules.map(mod=>(
                      <div key={mod.id} className="card card-raised" style={{ cursor:'pointer', padding:'16px' }} onClick={()=>setSelectedModule(mod)}>
                        <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                          <div style={{ fontSize:28 }}>{CATEGORIES.find(c=>c.key===mod.category)?.icon||'📚'}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:14 }}>{mod.title}</div>
                            <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{CATEGORIES.find(c=>c.key===mod.category)?.label}</div>
                          </div>
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--gold)', fontFamily:'var(--mono)', flexShrink:0 }}>+{mod.points_reward||50}pts</div>
                        </div>
                        {mod.description && <div style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.5, marginBottom:8 }}>{mod.description.slice(0,80)}{mod.description.length>80?'…':''}</div>}
                        <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--ink-3)' }}>
                          {mod.video_url && <span>▶ Video</span>}
                          {mod.content   && <span>📄 Content</span>}
                          <span>~{mod.estimated_minutes||5} min</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── LEADERBOARD ──────────────────────────────────────────────────── */}
        {tab==='leaderboard' && (
          <>
            {/* Summary stats */}
            {gamSummary && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
                {[
                  { label:'Team members',     val:gamSummary.employees?.total||0,      color:'var(--ink)' },
                  { label:'Leveled up',        val:gamSummary.employees?.leveled_up||0, color:'var(--gold)' },
                  { label:'Active challenges', val:gamSummary.challenges?.active||0,    color:'#4A90D9' },
                  { label:'Pending rewards',   val:gamSummary.rewards?.pending||0,      color:'#F26C6C' },
                ].map((s,i)=>(
                  <div key={i} className="card" style={{ padding:'14px 16px' }}>
                    <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700, color:s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Period selector */}
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {[['this_week','This week'],['this_month','This month'],['all_time','All time']].map(([k,l])=>(
                <FilterBtn key={k} active={lbPeriod===k} onClick={()=>setLbPeriod(k)}>{l}</FilterBtn>
              ))}
            </div>

            {leaderboard.length===0 ? (
              <div className="empty-state"><div className="empty-state-title">No data yet</div><div className="empty-state-sub">Complete training modules to earn points and appear here</div></div>
            ) : (
              <>
                {/* Podium */}
                <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:24 }}>
                  {[leaderboard[1], leaderboard[0], leaderboard[2]].filter(Boolean).map((emp, i) => {
                    const isFirst = emp===leaderboard[0];
                    const medal   = isFirst?'🥇':emp===leaderboard[1]?'🥈':'🥉';
                    const ls      = LEVEL_STYLES[emp.level]||LEVEL_STYLES.rookie;
                    return (
                      <div key={emp.employee_id} style={{ textAlign:'center', flex:1, maxWidth:200, background:'var(--bg-2)', borderRadius:12, padding:isFirst?'24px 16px':'16px', border:`2px solid ${isFirst?'var(--gold)':'var(--border)'}`, order:isFirst?1:emp===leaderboard[1]?0:2 }}>
                        <div style={{ fontSize:32, marginBottom:4 }}>{medal}</div>
                        <div style={{ fontSize:16, marginBottom:4 }}>{ls.icon} {emp.employee_name||'—'}</div>
                        <div style={{ fontSize:11, color:ls.color, fontWeight:600, textTransform:'capitalize', marginBottom:8 }}>{emp.level}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:20, fontWeight:700, color:'var(--gold)' }}>{(emp.total_points||0).toLocaleString()}</div>
                        <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:2 }}>total pts</div>
                        {(emp.badges||[]).length>0 && <div style={{ marginTop:8, display:'flex', gap:4, justifyContent:'center' }}>{emp.badges.slice(0,4).map((b,j)=><span key={j} style={{ fontSize:14 }}>{BADGE_ICONS[b]||'🏅'}</span>)}</div>}
                        <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:4 }}>{emp.modules_completed||0} lessons</div>
                      </div>
                    );
                  })}
                </div>

                {/* Full table */}
                <div className="card">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Rank','Name','Level','Total pts','This week','This month','Badges','Lessons'].map(h=>(
                          <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((emp,i)=>{
                        const ls = LEVEL_STYLES[emp.level]||LEVEL_STYLES.rookie;
                        return (
                          <tr key={emp.employee_id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:700, color:i===0?'#E8A020':i===1?'#8090A0':i===2?'#C06040':'var(--ink-3)' }}>#{emp.rank||i+1}</td>
                            <td style={{ padding:'10px 14px', fontWeight:500 }}>{emp.employee_name||'—'}</td>
                            <td style={{ padding:'10px 14px' }}><span style={{ fontSize:12, color:ls.color, fontWeight:600 }}>{ls.icon} {emp.level}</span></td>
                            <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:700, color:'var(--gold)' }}>{(emp.total_points||0).toLocaleString()}</td>
                            <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{(emp.points_this_week||0).toLocaleString()}</td>
                            <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{(emp.points_this_month||0).toLocaleString()}</td>
                            <td style={{ padding:'10px 14px' }}>{(emp.badges||[]).slice(0,4).map((b,j)=><span key={j} style={{ fontSize:14, marginRight:2 }}>{BADGE_ICONS[b]||'🏅'}</span>)}</td>
                            <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', textAlign:'center' }}>{emp.modules_completed||0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── CHALLENGES ───────────────────────────────────────────────────── */}
        {tab==='challenges' && (
          <>
            {challenges.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No active challenges</div>
                <div className="empty-state-sub">Create challenges like "Sell 20 Aparajita Fizz this week" to motivate your team</div>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
                {challenges.map(c=>{
                  const left = Math.ceil((new Date(c.end_date+'T12:00')-new Date())/(1000*60*60*24));
                  const pct  = c.participant_count > 0 ? Math.round((c.completion_count/c.participant_count)*100) : 0;
                  const urgColor = left<=3?'#F26C6C':left<=7?'#E8A020':'#4A90D9';
                  return (
                    <div key={c.id} className="card" style={{ padding:'18px', borderTop:`3px solid ${urgColor}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ fontWeight:600, fontSize:14 }}>{c.title}</div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: left<=3?'#2A1010':left<=7?'#2A2010':'#1A2A3A', color:urgColor, whiteSpace:'nowrap' }}>
                          {left>0?`${left}d left`:'Ended'}
                        </span>
                      </div>
                      {c.description && <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:12, lineHeight:1.5 }}>{c.description}</div>}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                        {[
                          { label:'Target',       val:`${c.target} ${c.metric?.replace(/_/g,' ')}` },
                          { label:'Reward',        val:`${c.points_reward} pts${c.bonus_reward?` + ${c.bonus_reward}`:''}` },
                          { label:'Participants',  val:`${c.participant_count||0} enrolled` },
                          { label:'Completions',   val:`${c.completion_count||0} done` },
                        ].map((s,i)=>(
                          <div key={i}>
                            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:2 }}>{s.label}</div>
                            <div style={{ fontSize:12, fontWeight:500 }}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ height:4, background:'var(--bg)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:'#3ECF8E', borderRadius:2 }}/>
                      </div>
                      <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:4 }}>
                        {pct}% completion · {new Date(c.start_date+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} – {new Date(c.end_date+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── REWARDS ──────────────────────────────────────────────────────── */}
        {tab==='rewards' && (
          <>
            {/* Pending claims */}
            {rewardClaims.length>0 && (
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Pending claims ({rewardClaims.length})</div>
                {rewardClaims.map(claim=>(
                  <div key={claim.id} className="card" style={{ padding:'14px 18px', marginBottom:8, borderLeft:'3px solid #E8A020', display:'flex', gap:12, alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:13 }}>{claim.employee_name} — {claim.reward_title}</div>
                      <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>{claim.reward_type?.replace('_',' ')} · {claim.points_spent} pts{claim.value?` · $${claim.value} value`:''}</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-primary btn-sm" onClick={async()=>{ await agent6.reviewClaim(claim.id,{approved:true}); setRewardClaims(p=>p.filter(x=>x.id!==claim.id)); showToast('Claim approved'); }}>Approve</button>
                      <button className="btn btn-sm" onClick={async()=>{ await agent6.reviewClaim(claim.id,{approved:false}); setRewardClaims(p=>p.filter(x=>x.id!==claim.id)); showToast('Claim declined'); }} style={{ color:'#F26C6C' }}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize:11, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>Rewards catalog</div>
            {rewards.length===0 ? (
              <div className="empty-state"><div className="empty-state-title">No rewards yet</div><div className="empty-state-sub">Add rewards employees can claim — cash bonuses, PTO, gift cards, recognition</div></div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
                {rewards.map(r=>{
                  const icons = { cash:'💵', pto:'🏖️', gift_card:'🎁', recognition:'🌟', other:'🎉' };
                  return (
                    <div key={r.id} className="card" style={{ padding:'18px' }}>
                      <div style={{ fontSize:36, marginBottom:8 }}>{icons[r.reward_type]||'🎉'}</div>
                      <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{r.title}</div>
                      {r.description && <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:10, lineHeight:1.5 }}>{r.description}</div>}
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'var(--gold)' }}>{(r.points_cost||0).toLocaleString()} pts</div>
                        {r.value && <div style={{ fontSize:12, color:'var(--ink-3)' }}>${r.value} value</div>}
                      </div>
                      <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:4, textTransform:'capitalize' }}>{r.reward_type?.replace('_',' ')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showAddModule    && <ModuleModal    locationId={loc?.id} onClose={()=>setShowAddModule(false)}    onSaved={m=>{setModules(p=>[m,...p]);    setShowAddModule(false);    showToast('Lesson added');}}/>}
      {showAddChallenge && <ChallengeModal locationId={loc?.id} onClose={()=>setShowAddChallenge(false)} onSaved={c=>{setChallenges(p=>[c,...p]); setShowAddChallenge(false); showToast('Challenge created');}}/>}
      {showAddReward    && <RewardModal                         onClose={()=>setShowAddReward(false)}    onSaved={r=>{setRewards(p=>[...p,r]);    setShowAddReward(false);    showToast('Reward added');}}/>}
      {toast && <div className="toast" style={{ background:toast.err?'#E24B4A':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

// ── Shared filter button ───────────────────────────────────────────────────────
function FilterBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 14px', borderRadius:20, fontSize:12, cursor:'pointer', border:`1px solid ${active?'var(--gold)':'var(--border)'}`, background:active?'var(--gold-bg)':'transparent', color:active?'var(--gold)':'var(--ink-3)', fontWeight:active?600:400 }}>
      {children}
    </button>
  );
}

// ── Module detail view ────────────────────────────────────────────────────────
function ModuleDetail({ mod, empId, empName, setEmpId, setEmpName, onBack, onComplete, completing }) {
  const cat = CATEGORIES.find(c=>c.key===mod.category);
  const { user } = useAuth();
  const canEditVideos = ['owner','manager'].includes(user?.role);
  return (
    <div>
      <button className="btn btn-sm" onClick={onBack} style={{ marginBottom:16 }}>← Back to library</button>
      <div className="card" style={{ padding:'24px' }}>
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:20 }}>
          <div style={{ fontSize:36 }}>{cat?.icon||'📚'}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'var(--serif)', fontSize:22, fontWeight:700, marginBottom:4 }}>{mod.title}</div>
            <div style={{ display:'flex', gap:12, fontSize:12, color:'var(--ink-3)', flexWrap:'wrap' }}>
              <span style={{ padding:'2px 8px', borderRadius:20, background:'var(--bg-2)', border:'1px solid var(--border)' }}>{cat?.label||mod.category}</span>
              <span>~{mod.estimated_minutes||5} min</span>
              <span style={{ color:'var(--gold)', fontWeight:600 }}>+{mod.points_reward||50} pts on completion</span>
            </div>
          </div>
        </div>
        {mod.description && <div style={{ fontSize:13, color:'var(--ink-3)', marginBottom:16, lineHeight:1.7 }}>{mod.description}</div>}
        {mod.video_url && (
          <div style={{ marginBottom:20 }}>
            <a href={mod.video_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">▶ Watch video</a>
          </div>
        )}
        {mod.content && (
          <div style={{ background:'var(--bg)', borderRadius:8, padding:'16px 20px', marginBottom:20, lineHeight:1.8, fontSize:13, whiteSpace:'pre-wrap', border:'1px solid var(--border)' }}>
            {mod.content}
          </div>
        )}
        <ModuleVideos moduleId={String(mod.id)} canEdit={canEditVideos} />
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:16, marginTop:18 }}>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Mark as completed</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8 }}>
            <input className="form-input" placeholder="Employee name" value={empName} onChange={e=>setEmpName(e.target.value)} style={{ fontSize:12 }}/>
            <input className="form-input" placeholder="Employee ID" value={empId} onChange={e=>setEmpId(e.target.value)} style={{ fontSize:12 }}/>
            <button className="btn btn-primary" onClick={()=>onComplete(mod)} disabled={completing||!empId}>{completing?'Marking…':'Mark complete'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Module Modal ──────────────────────────────────────────────────────────────
function ModuleModal({ locationId, onClose, onSaved }) {
  const [form, setForm] = useState({ title:'', description:'', category:'food', content:'', videoUrl:'', estimatedMinutes:5, pointsReward:50 });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.title) return alert('Title required');
    setSaving(true);
    try { onSaved(await agent6.addModule({...form, locationId})); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <Modal title="Add lesson" onClose={onClose} width={600}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e=>f('title',e.target.value)} placeholder="e.g. Aparajita Fizz — How to make & upsell"/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Category</label>
          <select className="form-select" value={form.category} onChange={e=>f('category',e.target.value)}>
            {CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Duration (min)</label>
          <input className="form-input" type="number" min={1} value={form.estimatedMinutes} onChange={e=>f('estimatedMinutes',parseInt(e.target.value))}/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Points reward</label>
          <input className="form-input" type="number" min={0} value={form.pointsReward} onChange={e=>f('pointsReward',parseInt(e.target.value))}/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Video URL</label>
          <input className="form-input" value={form.videoUrl} onChange={e=>f('videoUrl',e.target.value)} placeholder="YouTube, Vimeo…"/>
        </div>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Short summary for the library card"/>
        </div>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Content (recipe, procedure, upsell script)</label>
          <textarea className="form-textarea" rows={8} value={form.content} onChange={e=>f('content',e.target.value)} placeholder="Paste full recipe, procedure, or script here…" style={{ fontSize:13, lineHeight:1.7 }}/>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} saveLabel="Add lesson"/>
    </Modal>
  );
}

// ── Challenge Modal ───────────────────────────────────────────────────────────
function ChallengeModal({ locationId, onClose, onSaved }) {
  const today    = new Date().toISOString().slice(0,10);
  const nextWeek = new Date(Date.now()+7*864e5).toISOString().slice(0,10);
  const [form, setForm] = useState({ title:'', description:'', challengeType:'individual', metric:'upsells', target:20, pointsReward:200, bonusReward:'', startDate:today, endDate:nextWeek });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.title||!form.startDate||!form.endDate) return alert('Title and dates required');
    setSaving(true);
    try { onSaved(await agent6.createChallenge({...form, locationId})); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <Modal title="New challenge" onClose={onClose}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Challenge title *</label>
          <input className="form-input" value={form.title} onChange={e=>f('title',e.target.value)} placeholder='e.g. "Sell 20 Aparajita Fizz this week"'/>
        </div>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Rules, how to track, eligibility…"/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Type</label>
          <select className="form-select" value={form.challengeType} onChange={e=>f('challengeType',e.target.value)}>
            <option value="individual">Individual</option>
            <option value="team">Team</option>
            <option value="location">Location</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Metric</label>
          <select className="form-select" value={form.metric} onChange={e=>f('metric',e.target.value)}>
            {['upsells','training_modules','shifts_attended','reviews_mentioned','waste_items'].map(m=><option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Target</label>
          <input className="form-input" type="number" min={1} value={form.target} onChange={e=>f('target',parseFloat(e.target.value))}/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Points reward</label>
          <input className="form-input" type="number" min={0} value={form.pointsReward} onChange={e=>f('pointsReward',parseInt(e.target.value))}/>
        </div>
        <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
          <label className="form-label">Bonus reward (optional)</label>
          <input className="form-input" value={form.bonusReward} onChange={e=>f('bonusReward',e.target.value)} placeholder="e.g. $50 gift card, extra PTO day"/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Start date</label>
          <input className="form-input" type="date" value={form.startDate} onChange={e=>f('startDate',e.target.value)}/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">End date</label>
          <input className="form-input" type="date" value={form.endDate} onChange={e=>f('endDate',e.target.value)}/>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} saveLabel="Create challenge"/>
    </Modal>
  );
}

// ── Reward Modal ──────────────────────────────────────────────────────────────
function RewardModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ title:'', description:'', rewardType:'gift_card', value:'', pointsCost:500 });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.title||!form.pointsCost) return alert('Title and points cost required');
    setSaving(true);
    try { onSaved(await agent6.addReward(form)); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <Modal title="Add reward" onClose={onClose} width={420}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e=>f('title',e.target.value)} placeholder="e.g. $25 Amazon Gift Card"/>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Type</label>
          <select className="form-select" value={form.rewardType} onChange={e=>f('rewardType',e.target.value)}>
            {[['cash','Cash bonus'],['pto','PTO day'],['gift_card','Gift card'],['recognition','Recognition'],['other','Other']].map(([k,l])=><option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">$ Value</label>
            <input className="form-input" type="number" min={0} value={form.value} onChange={e=>f('value',e.target.value)}/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Points cost *</label>
            <input className="form-input" type="number" min={1} value={form.pointsCost} onChange={e=>f('pointsCost',parseInt(e.target.value))}/>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Details about the reward"/>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} saveLabel="Add reward"/>
    </Modal>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=520 }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:60,paddingTop:20,overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width,maxWidth:'95vw',border:'1px solid var(--border)',margin:'0 16px 60px' }}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel='Save' }) {
  return (
    <div style={{ display:'flex',gap:8,marginTop:16 }}>
      <button className="btn" style={{ flex:1,justifyContent:'center' }} onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" style={{ flex:2,justifyContent:'center' }} onClick={onSave} disabled={saving}>{saving?'Saving…':saveLabel}</button>
    </div>
  );
}
