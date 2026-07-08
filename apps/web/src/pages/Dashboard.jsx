import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { agent4 } from '../lib/api.js';
import { AGENT_META } from '@restaurantos/shared';

function AgentCard({ id, meta, summary, loading, onClick }) {
  const isLive = true; // all agents are live
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', padding: '16px 18px', cursor: 'pointer',
        transition: 'all .15s', borderLeft: '3px solid var(--gold)',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            {meta.name}
          </span>
        </div>
        {isLive
          ? <span className="tag tag-green">Live</span>
          : <span className="tag tag-muted">Soon</span>}
      </div>
      {loading ? (
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '40%', background: 'var(--gold)', borderRadius: 1, animation: 'shimmer 1.2s ease infinite' }} />
        </div>
      ) : summary && id === 'agent_4_reviews' ? (
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: summary.pending > 0 ? 'var(--amber)' : 'var(--green)', fontWeight: 500 }}>
              {summary.pending || 0}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>pending</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 500 }}>
              {summary.avg_rating || '—'}★
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>avg rating</div>
          </div>
          {summary.urgent > 0 && (
            <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
              <span className="tag tag-red">⚠ {summary.urgent} urgent</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--ink3)', fontStyle: 'italic' }}>
          {isLive ? 'Click to open' : 'Coming soon'}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, right: 12,
        fontFamily: 'var(--serif)', fontSize: 48, color: 'var(--border)',
        lineHeight: 1, pointerEvents: 'none', fontStyle: 'italic',
      }}>
        {meta.icon}
      </div>
    </div>
  );
}

function MondayBriefCard() {
  const [brief, setBrief] = React.useState(undefined); // undefined=loading, null=no data
  React.useEffect(() => {
    import('../lib/api.js').then(({ insights }) =>
      insights.mondayBrief().then(r => setBrief(r?.brief || null)).catch(() => setBrief(null))
    );
  }, []);
  if (brief === undefined) return (
    <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 22px',marginBottom:16,fontSize:13,color:'var(--ink-3)'}}>
      📊 Generating your weekly brief…
    </div>
  );
  if (!brief) return null;
  return (
    <div style={{background:'var(--bg-2)',border:'1px solid var(--gold)',borderRadius:12,padding:'18px 22px',marginBottom:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div style={{fontFamily:'var(--serif)',fontSize:16,fontWeight:700}}>📊 {brief.headline}</div>
        <a href="/assistant" style={{fontSize:12,color:'var(--gold)',textDecoration:'none',fontWeight:600,flexShrink:0}}>Ask Sage about this →</a>
      </div>
      <ul style={{margin:'10px 0 0',paddingLeft:18,fontSize:13,lineHeight:1.8,color:'var(--ink-2)'}}>
        {(brief.bullets||[]).map((b,i)=><li key={i}>{b}</li>)}
      </ul>
      {brief.action && (
        <div style={{marginTop:12,padding:'10px 14px',background:'var(--gold-bg)',borderLeft:'3px solid var(--gold)',borderRadius:6,fontSize:13}}>
          <strong>This week:</strong> {brief.action}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState({});

  useEffect(() => {
    setLoading(l => ({ ...l, agent_4_reviews: true }));
    agent4.summary()
      .then(d => setSummaries(s => ({ ...s, agent_4_reviews: d })))
      .catch(() => {})
      .finally(() => setLoading(l => ({ ...l, agent_4_reviews: false })));
  }, []);

  const agents = Object.entries(AGENT_META);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(200%)} }
      `}</style>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">{greeting}, {user?.name?.split(' ')[0]}</h1>
          <div className="page-sub">
            {user?.tenantName} · {agents.filter(([id]) => (user?.activeAgents||[]).includes(id)).length} agents active
          </div>
        </div>
        <div className="topbar-right">
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="content">
        <MondayBriefCard/>

        {/* Agent grid */}
        <div className="section-label">All agents</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {agents.map(([id, meta]) => (
            <AgentCard
              key={id}
              id={id}
              meta={meta}
              summary={summaries[id]}
              loading={loading[id]}
              onClick={() => navigate(meta.path)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
