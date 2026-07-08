import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || window.location.origin;

const fmt  = n => n == null ? '—' : Number(n).toLocaleString();
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

// QR code using Google Charts API
function QRCode({ value, size=160 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  return <img src={url} alt="QR Code" width={size} height={size} style={{ borderRadius:8 }}/>;
}

export default function LoyaltyPortal() {
  const { code } = useParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('card');

  useEffect(() => {
    if (!code || code === 'loyalty') { setError('No member code provided'); setLoading(false); return; }
    fetch(`${API}/api/agent-8/portal/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(r => { if (r.ok) setData(r.data); else setError(r.error || 'Member not found'); })
      .catch(() => setError('Could not load your card'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D0D0D', color:'#fff', fontFamily:'system-ui' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:32, height:32, border:'3px solid #333', borderTopColor:'#E8A020', borderRadius:'50%', animation:'spin .6s linear infinite', margin:'0 auto 16px' }}/>
        <div style={{ color:'#666', fontSize:14 }}>Loading your loyalty card…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D0D0D', color:'#fff', fontFamily:'system-ui', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:40 }}>🦚</div>
      <div style={{ fontSize:18, fontWeight:600 }}>{error}</div>
      <div style={{ color:'#666', fontSize:14 }}>Check your referral code and try again</div>
    </div>
  );

  const { member, program, tenant_name, next_tier, pts_to_next, progress_pct, transactions, challenges, rewards } = data;
  const accent = program.accent_color || '#E8A020';
  const portalUrl = `${window.location.origin}/member/${member.referral_code}`;

  const tierColors = { bronze:'#CD7F32', silver:'#A8A9AD', gold:'#FFD700', platinum:'#E8A020' };
  const tierColor  = tierColors[member.tier] || accent;

  return (
    <div style={{ minHeight:'100vh', background:'#0D0D0D', color:'#F0F0F0', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth:440, margin:'0 auto', padding:'0 0 80px' }}>

      {/* Header */}
      <div style={{ padding:'24px 20px 16px', borderBottom:'1px solid #1A1A1A' }}>
        <div style={{ fontSize:11, color:'#666', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>{tenant_name}</div>
        <div style={{ fontSize:22, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }}>{program.program_name}</div>
        <div style={{ fontSize:13, color:'#888', marginTop:3 }}>{program.program_tagline}</div>
      </div>

      {/* Loyalty card */}
      <div style={{ margin:'20px 16px', borderRadius:16, overflow:'hidden', background:`linear-gradient(135deg, #1A1A1A 0%, #111 100%)`, border:`1px solid ${tierColor}40`, position:'relative' }}>
        {/* Tier badge */}
        <div style={{ position:'absolute', top:16, right:16, padding:'4px 12px', borderRadius:20, background:`${tierColor}20`, border:`1px solid ${tierColor}40`, fontSize:11, fontWeight:700, color:tierColor, textTransform:'uppercase', letterSpacing:'.08em' }}>
          {member.tier_label}
        </div>
        <div style={{ padding:'24px 20px' }}>
          <div style={{ fontSize:13, color:'#666', marginBottom:4 }}>{member.name}</div>
          <div style={{ fontFamily:'monospace', fontSize:28, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }}>
            {fmt(member.points_balance)}
          </div>
          <div style={{ fontSize:12, color:'#666', marginTop:2 }}>Spice Points</div>

          {/* Progress to next tier */}
          {next_tier && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#666', marginBottom:6 }}>
                <span>{member.tier_label}</span>
                <span>{fmt(pts_to_next)} pts to {next_tier.label}</span>
              </div>
              <div style={{ height:4, background:'#222', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${progress_pct}%`, background:accent, borderRadius:2, transition:'width .5s' }}/>
              </div>
            </div>
          )}

          {/* Referral code */}
          <div style={{ marginTop:20, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'#0D0D0D', borderRadius:8, border:'1px solid #222' }}>
            <div>
              <div style={{ fontSize:10, color:'#555', marginBottom:2, textTransform:'uppercase', letterSpacing:'.08em' }}>Your code</div>
              <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:accent }}>{member.referral_code}</div>
            </div>
            <button onClick={()=>{ navigator.clipboard?.writeText(member.referral_code); }} style={{ background:'none', border:`1px solid #333`, borderRadius:6, padding:'6px 12px', color:'#888', fontSize:11, cursor:'pointer' }}>Copy</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #1A1A1A', padding:'0 16px', margin:'0 0 20px' }}>
        {[['card','Card'],['rewards','Rewards'],['history','History'],['challenges','Challenges']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'10px 14px', background:'none', border:'none', borderBottom:`2px solid ${tab===k?accent:'transparent'}`, color:tab===k?accent:'#666', fontSize:13, cursor:'pointer', fontWeight:tab===k?600:400 }}>{l}</button>
        ))}
      </div>

      {/* CARD TAB */}
      {tab==='card' && (
        <div style={{ padding:'0 16px' }}>
          {/* QR code */}
          <div style={{ background:'#1A1A1A', borderRadius:12, padding:20, textAlign:'center', marginBottom:16, border:'1px solid #222' }}>
            <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>Show this at the restaurant</div>
            <div style={{ display:'inline-block', background:'#fff', padding:12, borderRadius:8 }}>
              <QRCode value={portalUrl} size={140}/>
            </div>
            <div style={{ fontSize:12, color:'#555', marginTop:10, fontFamily:'monospace' }}>{member.referral_code}</div>
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              { label:'Total visits',    val: member.visit_count || 0 },
              { label:'Lifetime points', val: fmt(member.points_lifetime) },
              { label:'Member since',    val: fmtDate(member.member_since) },
              { label:'Last visit',      val: fmtDate(member.last_visit) },
            ].map((s,i)=>(
              <div key={i} style={{ background:'#1A1A1A', borderRadius:10, padding:'14px', border:'1px solid #222' }}>
                <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</div>
                <div style={{ fontSize:18, fontWeight:600, color:'#fff' }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Share referral */}
          <div style={{ background:'#1A1A1A', borderRadius:12, padding:16, border:'1px solid #222' }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>🦚 Refer a friend</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>You both get 500 points when they join and dine</div>
            <button onClick={()=>{
              if (navigator.share) {
                navigator.share({ title: `Join ${program.program_name}!`, text: `Use my code ${member.referral_code} to join and we both earn bonus points.`, url: portalUrl });
              } else {
                navigator.clipboard?.writeText(portalUrl);
                alert('Link copied!');
              }
            }} style={{ width:'100%', padding:'12px', background:accent, color:'#000', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Share my referral link
            </button>
          </div>
        </div>
      )}

      {/* REWARDS TAB */}
      {tab==='rewards' && (
        <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {rewards.map((r,i)=>{
            const canRedeem = member.points_balance >= r.pts;
            return (
              <div key={i} style={{ background:'#1A1A1A', borderRadius:12, padding:'14px 16px', border:`1px solid ${canRedeem?accent+'30':'#222'}`, display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:22 }}>{r.category==='experience'?'✨':r.category==='food'?'🍽️':'🍷'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{r.label}</div>
                  <div style={{ fontSize:14, fontWeight:700, color: canRedeem ? accent : '#555', marginTop:2, fontFamily:'monospace' }}>{fmt(r.pts)} pts</div>
                </div>
                {canRedeem
                  ? <div style={{ fontSize:11, color:accent, fontWeight:600 }}>Available</div>
                  : <div style={{ fontSize:11, color:'#555' }}>{fmt(r.pts - member.points_balance)} more</div>
                }
              </div>
            );
          })}
          <div style={{ fontSize:12, color:'#555', textAlign:'center', padding:'12px 0' }}>Ask staff to redeem points at the restaurant</div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab==='history' && (
        <div style={{ padding:'0 16px' }}>
          {!transactions.length
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'#555' }}>No transactions yet</div>
            : transactions.map((tx,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #1A1A1A' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background: tx.type==='earn' ? '#1A2A1A' : tx.type==='redeem' ? '#2A1A1A' : '#1A1A2A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {tx.type==='earn' ? '↑' : tx.type==='redeem' ? '↓' : '~'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{tx.reason || tx.rule || 'Transaction'}</div>
                  <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{fmtDate(tx.created_at)}</div>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:600, color: tx.points > 0 ? '#3ECF8E' : '#F26C6C' }}>
                  {tx.points > 0 ? '+' : ''}{tx.points}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* CHALLENGES TAB */}
      {tab==='challenges' && (
        <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {!challenges.length
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'#555' }}>No active challenges</div>
            : challenges.map((ch,i)=>(
              <div key={i} style={{ background:'#1A1A1A', borderRadius:12, padding:'14px 16px', border:`1px solid ${ch.completed?'#3ECF8E30':'#222'}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:22 }}>{ch.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{ch.label}</div>
                    <div style={{ fontSize:11, color:'#666' }}>{ch.description}</div>
                  </div>
                  {ch.completed
                    ? <div style={{ fontSize:11, color:'#3ECF8E', fontWeight:600 }}>✓ Done</div>
                    : <div style={{ fontSize:11, color:accent, fontFamily:'monospace' }}>+{fmt(ch.points_reward)}</div>
                  }
                </div>
                <div style={{ height:4, background:'#111', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(100,(ch.progress/ch.target)*100)}%`, background:ch.completed?'#3ECF8E':accent, borderRadius:2 }}/>
                </div>
                <div style={{ fontSize:11, color:'#555', marginTop:6, fontFamily:'monospace' }}>{ch.progress}/{ch.target}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
