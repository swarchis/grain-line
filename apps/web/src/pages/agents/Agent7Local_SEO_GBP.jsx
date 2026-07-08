import React, { useState, useEffect } from 'react';
import { agent7, locations as locationsApi } from '../../lib/api.js';

const STATUS_COLORS = {
  claimed:   { bg:'#0A2A1A', color:'#3ECF8E', label:'Claimed' },
  unclaimed: { bg:'#2A1A0A', color:'#E8A020', label:'Unclaimed' },
  error:     { bg:'#2A0A0A', color:'#F26C6C', label:'Issue' },
};
const PRIORITY_COLORS = { critical:'#F26C6C', high:'#E8A020', medium:'#4A90D9', low:'#666' };

function scoreColor(s) { return s >= 80 ? '#3ECF8E' : s >= 60 ? '#E8A020' : '#F26C6C'; }

export default function Agent7Local_SEO_GBP() {
  const [tab, setTab]                       = useState('overview');
  const [locations, setLocations]           = useState([]);
  const [loc, setLoc]                       = useState(null);
  const [toast, setToast]                   = useState(null);
  const [summary, setSummary]               = useState(null);
  const [keywords, setKeywords]             = useState([]);
  const [citations, setCitations]           = useState([]);
  const [recs, setRecs]                     = useState([]);
  const [recsLoading, setRecsLoading]       = useState(false);
  const [kwGenLoading, setKwGenLoading]     = useState(false);
  const [auditResult, setAuditResult]       = useState(null);
  const [auditLoading, setAuditLoading]     = useState(false);
  const [websiteUrl, setWebsiteUrl]         = useState('');
  const [showKwModal, setShowKwModal]       = useState(false);

  function showToast(msg, err) { setToast({msg, err}); setTimeout(()=>setToast(null), 3500); }

  useEffect(function() {
    locationsApi.list().then(function(l) {
      setLocations(l||[]);
      if (l && l.length) setLoc(l[0]);
    }).catch(function(){});
  }, []);

  useEffect(function() {
    if (!loc || !loc.id) return;
    agent7.summary(loc.id).then(setSummary).catch(function(){});
  }, [loc]);

  useEffect(function() {
    if (!loc || !loc.id) return;
    if (tab === 'keywords') {
      agent7.keywords(loc.id).then(function(k){ setKeywords(k||[]); }).catch(function(){});
    }
    if (tab === 'citations') {
      agent7.citations(loc.id).then(function(c){ setCitations(c||[]); }).catch(function(){});
    }
    if (tab === 'website') {
      agent7.website(loc.id).then(function(d) {
        setWebsiteUrl(d.website_url || '');
        if (d.lastAudit) setAuditResult(d.lastAudit);
      }).catch(function(){});
    }
  }, [tab, loc]);

  function handleGetRecs() {
    setRecsLoading(true);
    agent7.recommendations(loc.id)
      .then(function(r){ setRecs(r||[]); showToast('Recommendations ready'); })
      .catch(function(e){ showToast(e.message, true); })
      .finally(function(){ setRecsLoading(false); });
  }

  function handleGenKeywords() {
    setKwGenLoading(true);
    agent7.generateKeywords(loc.id)
      .then(function(kws) {
        var added = 0;
        var chain = Promise.resolve();
        kws.forEach(function(kw) {
          chain = chain.then(function() {
            return agent7.addKeyword({ locationId: loc.id, keyword: kw.keyword, volume: kw.volume, difficulty: kw.difficulty });
          }).then(function(){ added++; }).catch(function(){});
        });
        return chain.then(function() {
          return agent7.keywords(loc.id);
        });
      })
      .then(function(fresh){ setKeywords(fresh||[]); showToast('Keywords generated'); })
      .catch(function(e){ showToast(e.message, true); })
      .finally(function(){ setKwGenLoading(false); });
  }

  function handleRunAudit() {
    if (!websiteUrl.trim()) return showToast('Enter a website URL first', true);
    setAuditLoading(true);
    agent7.saveWebsiteUrl(loc.id, websiteUrl.trim())
      .then(function() { return agent7.auditWebsite(loc.id, websiteUrl.trim()); })
      .then(function(r){ setAuditResult(r); showToast('Audit complete'); })
      .catch(function(e){ showToast(e.message, true); })
      .finally(function(){ setAuditLoading(false); });
  }

  var tabContent = null;
  if (tab === 'overview')  tabContent = renderOverview(summary, recs);
  if (tab === 'keywords')  tabContent = renderKeywords(keywords, loc, setKeywords, showToast, showKwModal, setShowKwModal);
  if (tab === 'citations') tabContent = renderCitations(citations, loc, setCitations, showToast);
  if (tab === 'website')   tabContent = renderWebsite(websiteUrl, setWebsiteUrl, auditLoading, auditResult, handleRunAudit);

  var TABS = [
    { id:'overview',  label:'📊 Overview' },
    { id:'keywords',  label:'🔍 Keywords' },
    { id:'citations', label:'📍 Citations' },
    { id:'website',   label:'🌐 Website SEO' },
  ];

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Local Visibility & SEO</h1>
          <div className="page-sub">{loc ? loc.name : 'Select location'}</div>
        </div>
        <div className="topbar-right">
          {locations.length > 1 && (
            <select className="form-select" style={{fontSize:12}} value={loc ? loc.id : ''} onChange={function(e){ setLoc(locations.find(function(l){ return l.id===e.target.value; })); }}>
              {locations.map(function(l){ return <option key={l.id} value={l.id}>{l.name}</option>; })}
            </select>
          )}
          {tab==='website' && (
            <button className="btn btn-primary" onClick={handleRunAudit} disabled={auditLoading || !websiteUrl.trim()}>
              {auditLoading ? '🔍 Analysing…' : '🔍 Run SEO audit'}
            </button>
          )}
          {tab==='overview' && (
            <button className="btn btn-primary" onClick={handleGetRecs} disabled={recsLoading}>
              {recsLoading ? '🤖 Analysing…' : '🤖 Get recommendations'}
            </button>
          )}
          {tab==='keywords' && (
            <button className="btn btn-primary" onClick={handleGenKeywords} disabled={kwGenLoading}>
              {kwGenLoading ? '🤖 Generating…' : '🤖 Generate keywords'}
            </button>
          )}
        </div>
      </div>

      <div className="content">
        {summary && (
          <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
            {[
              { label:'SEO Score',       val: (summary.health ? summary.health.score : 0) + '/100', color: scoreColor(summary.health ? summary.health.score : 0) },
              { label:'Google Rating',   val: summary.data.avg_google_rating ? summary.data.avg_google_rating + ' ★' : '—', color:'#4A90D9' },
              { label:'Yelp Rating',     val: summary.data.avg_yelp_rating   ? summary.data.avg_yelp_rating   + ' ★' : '—', color:'#E8A020' },
              { label:'Reviews (30d)',   val: summary.data.reviews_last_30d || 0, color:'var(--ink)' },
              { label:'Pending response',val: summary.data.pending_response  || 0, color: parseInt(summary.data.pending_response||0) > 0 ? '#F26C6C' : '#3ECF8E' },
              { label:'Keywords tracked',val: summary.data.active_keywords   || 0, color:'var(--ink)' },
            ].map(function(s, i) {
              return (
                <div key={i} className="card" style={{padding:'12px 16px',flex:'1 1 130px',minWidth:0}}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',marginBottom:4}}>{s.label}</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:700,color:s.color}}>{s.val}</div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)'}}>
          {TABS.map(function(t) {
            return (
              <button key={t.id} onClick={function(){ setTab(t.id); }} style={{padding:'8px 16px',background:'none',border:'none',borderBottom:'2px solid ' + (tab===t.id ? 'var(--gold)' : 'transparent'),color:tab===t.id ? 'var(--gold)' : 'var(--ink-3)',fontSize:13,cursor:'pointer',fontWeight:tab===t.id ? 600 : 400}}>
                {t.label}
              </button>
            );
          })}
        </div>

        {tabContent}
      </div>

      {showKwModal && (
        <KeywordModal
          locationId={loc ? loc.id : null}
          onClose={function(){ setShowKwModal(false); }}
          onSaved={function() {
            setShowKwModal(false);
            agent7.keywords(loc.id).then(function(k){ setKeywords(k||[]); }).catch(function(){});
            showToast('Keyword added');
          }}
        />
      )}

      {toast && (
        <div className="toast" style={{background: toast.err ? '#E24B4A' : 'var(--ink)'}}>
          {toast.err ? '⚠' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  );
}

function renderOverview(summary, recs) {
  if (!summary) return null;
  var health = summary.health || { issues:[], wins:[], score:0 };
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card">
          <div className="card-header"><span className="card-title">⚠ Issues to fix</span></div>
          <div style={{padding:'0 16px 12px'}}>
            {health.issues.length === 0
              ? <div style={{color:'#3ECF8E',fontSize:13,padding:'12px 0'}}>No issues — great SEO health!</div>
              : health.issues.map(function(issue, i) {
                  return (
                    <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:12,color:'var(--ink)',display:'flex',gap:8}}>
                      <span style={{color:'#F26C6C',flexShrink:0}}>●</span>
                      {issue}
                    </div>
                  );
                })
            }
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">✓ What's working</span></div>
          <div style={{padding:'0 16px 12px'}}>
            {health.wins.length === 0
              ? <div style={{color:'var(--ink-3)',fontSize:13,padding:'12px 0'}}>No wins yet</div>
              : health.wins.map(function(win, i) {
                  return (
                    <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:12,color:'var(--ink)',display:'flex',gap:8}}>
                      <span style={{color:'#3ECF8E',flexShrink:0}}>●</span>
                      {win}
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {summary.ratingTrend && summary.ratingTrend.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header"><span className="card-title">Rating trend (8 weeks)</span></div>
          <div style={{overflowX:'auto',padding:'0 16px 16px'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid var(--border)'}}>
                  <th style={{padding:'8px 12px',textAlign:'left',fontSize:10,color:'var(--ink-3)',textTransform:'uppercase'}}>Week</th>
                  <th style={{padding:'8px 12px',textAlign:'left',fontSize:10,color:'var(--ink-3)',textTransform:'uppercase'}}>Google</th>
                  <th style={{padding:'8px 12px',textAlign:'left',fontSize:10,color:'var(--ink-3)',textTransform:'uppercase'}}>Yelp</th>
                </tr>
              </thead>
              <tbody>
                {summary.ratingTrend.map(function(r, i) {
                  return (
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'9px 12px',color:'var(--ink-3)'}}>{r.week_start}</td>
                      <td style={{padding:'9px 12px',fontFamily:'var(--mono)',color:'#4A90D9'}}>{r.rating_google ? r.rating_google + ' ★' : '—'}</td>
                      <td style={{padding:'9px 12px',fontFamily:'var(--mono)',color:'#E8A020'}}>{r.rating_yelp   ? r.rating_yelp   + ' ★' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recs.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">🤖 AI Recommendations</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:12,padding:'0 16px 16px'}}>
            {recs.map(function(rec, i) {
              var pc = PRIORITY_COLORS[rec.priority] || '#666';
              return (
                <div key={i} style={{background:'var(--bg)',borderRadius:10,padding:'14px',borderLeft:'3px solid ' + pc}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:pc+'20',color:pc,textTransform:'uppercase'}}>{rec.priority}</span>
                    <span style={{fontSize:10,color:'var(--ink-3)',textTransform:'capitalize'}}>{rec.category ? rec.category.replace('_',' ') : ''}</span>
                    <span style={{marginLeft:'auto',fontSize:10,color:'var(--ink-3)'}}>⏱ {rec.effort}</span>
                  </div>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{rec.title}</div>
                  <div style={{fontSize:12,color:'var(--ink-3)',lineHeight:1.6,marginBottom:6}}>{rec.action}</div>
                  <div style={{fontSize:11,color:'#3ECF8E'}}>{rec.impact}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function renderKeywords(keywords, loc, setKeywords, showToast, showKwModal, setShowKwModal) {
  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
        <button className="btn btn-sm" onClick={function(){ setShowKwModal(true); }}>+ Add keyword</button>
        <span style={{fontSize:12,color:'var(--ink-3)'}}>{keywords.length} keywords tracked</span>
      </div>
      {keywords.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No keywords yet</div>
          <div className="empty-state-sub">Click "Generate keywords" above to get AI-suggested local search terms.</div>
        </div>
      ) : (
        <div className="card">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Keyword</th>
                <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Volume</th>
                <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Difficulty</th>
                <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Source</th>
                <th style={{padding:'8px 14px'}}></th>
              </tr>
            </thead>
            <tbody>
              {keywords.map(function(kw) {
                return (
                  <tr key={kw.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 14px',fontWeight:500}}>{kw.keyword}</td>
                    <td style={{padding:'10px 14px'}}>
                      {kw.volume && (
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:kw.volume==='high'?'#0A2A1A':kw.volume==='medium'?'#2A1A0A':'var(--bg)',color:kw.volume==='high'?'#3ECF8E':kw.volume==='medium'?'#E8A020':'var(--ink-3)'}}>
                          {kw.volume}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      {kw.difficulty && (
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:'var(--bg)',color:kw.difficulty==='easy'?'#3ECF8E':kw.difficulty==='hard'?'#F26C6C':'#E8A020'}}>
                          {kw.difficulty}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'10px 14px',color:'var(--ink-3)',fontSize:11}}>{kw.source}</td>
                    <td style={{padding:'10px 14px'}}>
                      <button onClick={function() {
                        agent7.deleteKeyword(kw.id).then(function() {
                          setKeywords(function(k){ return k.filter(function(x){ return x.id !== kw.id; }); });
                        }).catch(function(){});
                      }} style={{background:'none',border:'none',color:'#F26C6C',cursor:'pointer',fontSize:13}}>
                        x
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderCitations(citations, loc, setCitations, showToast) {
  if (citations.length === 0) {
    return <div className="spinner" style={{margin:'60px auto'}} />;
  }
  return (
    <div>
      <div style={{marginBottom:12,fontSize:12,color:'var(--ink-3)'}}>
        Citations are mentions of your business on directory sites. Claiming and keeping them accurate boosts local search rankings.
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
        {citations.map(function(c) {
          var sc = STATUS_COLORS[c.status] || STATUS_COLORS.unclaimed;
          return (
            <div key={c.id} className="card" style={{padding:'16px 18px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:14}}>{c.platform}</div>
                <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,background:sc.bg,color:sc.color}}>{sc.label}</span>
              </div>
              {c.rating && (
                <div style={{fontSize:13,color:'var(--gold)',marginBottom:4}}>
                  {c.rating} {c.review_count ? '· ' + c.review_count + ' reviews' : ''}
                </div>
              )}
              {c.profile_url && (
                <div style={{fontSize:11,marginBottom:8}}>
                  <a href={c.profile_url} target="_blank" rel="noopener noreferrer" style={{color:'#4A90D9'}}>View listing</a>
                </div>
              )}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
                {['claimed','unclaimed','error'].map(function(s) {
                  var bc = STATUS_COLORS[s];
                  return (
                    <button key={s} onClick={function() {
                      agent7.updateCitation({locationId: loc.id, platform: c.platform, status: s})
                        .then(function() { return agent7.citations(loc.id); })
                        .then(function(fresh){ setCitations(fresh||[]); showToast(c.platform + ' marked as ' + s); })
                        .catch(function(){});
                    }} style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid ' + (c.status===s ? bc.color : 'var(--border)'),background:c.status===s ? bc.bg : 'none',color:c.status===s ? bc.color : 'var(--ink-3)',cursor:'pointer'}}>
                      {bc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderWebsite(websiteUrl, setWebsiteUrl, auditLoading, auditResult, handleRunAudit) {
  return (
    <div>
      <div className="card" style={{padding:'16px 20px',marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Restaurant website</div>
        <div style={{display:'flex',gap:8}}>
          <input
            className="form-input"
            style={{flex:1}}
            value={websiteUrl}
            onChange={function(e){ setWebsiteUrl(e.target.value); }}
            placeholder="https://www.yourrestaurant.com"
            onKeyDown={function(e){ if (e.key==='Enter') handleRunAudit(); }}
          />
          <button className="btn btn-primary" onClick={handleRunAudit} disabled={auditLoading || !websiteUrl.trim()}>
            {auditLoading ? '🔍 Analysing…' : '🔍 Analyse'}
          </button>
        </div>
        <div style={{fontSize:11,color:'var(--ink-3)',marginTop:8}}>
          Claude will fetch your website and check 12 SEO factors including title tags, meta descriptions, local keywords, schema markup, NAP consistency, and mobile setup.
        </div>
      </div>

      {auditLoading && (
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:12,padding:'24px',textAlign:'center'}}>
          <div className="spinner" style={{margin:'0 auto 12px'}} />
          <div style={{fontSize:13,fontWeight:500}}>Fetching and analysing your website…</div>
          <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>This takes 15–30 seconds</div>
        </div>
      )}

      {auditResult && !auditLoading && (
        <div>
          <div style={{display:'flex',gap:14,marginBottom:16,alignItems:'stretch'}}>
            <div className="card" style={{padding:'20px 24px',minWidth:140,textAlign:'center',flexShrink:0}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',marginBottom:8}}>SEO Score</div>
              <div style={{fontFamily:'var(--mono)',fontSize:42,fontWeight:700,lineHeight:1,color:auditResult.score>=80?'#3ECF8E':auditResult.score>=60?'#E8A020':'#F26C6C'}}>
                {auditResult.score}
              </div>
              <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>out of 100</div>
            </div>
            <div className="card" style={{padding:'16px 20px',flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Summary</div>
              <div style={{fontSize:13,color:'var(--ink)',lineHeight:1.7}}>{auditResult.summary}</div>
              <div style={{fontSize:10,color:'var(--ink-3)',marginTop:8}}>
                Audited: {auditResult.website_url || websiteUrl}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Detailed checks</span></div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid var(--border)'}}>
                  <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Check</th>
                  <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Status</th>
                  <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Finding</th>
                  <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>Fix</th>
                </tr>
              </thead>
              <tbody>
                {(auditResult.checks || []).map(function(c, i) {
                  var sc = c.status==='pass' ? {bg:'#0A2A1A',color:'#3ECF8E'} : c.status==='warning' ? {bg:'#2A1A0A',color:'#E8A020'} : {bg:'#2A0A0A',color:'#F26C6C'};
                  return (
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'10px 14px',fontWeight:500,whiteSpace:'nowrap'}}>{c.label}</td>
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>
                        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:sc.bg,color:sc.color,textTransform:'uppercase'}}>{c.status}</span>
                      </td>
                      <td style={{padding:'10px 14px',color:'var(--ink-3)',maxWidth:300}}>{c.finding}</td>
                      <td style={{padding:'10px 14px',color:c.fix ? '#E8A020' : 'var(--ink-3)',maxWidth:300}}>{c.fix || 'none'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!auditResult && !auditLoading && (
        <div className="empty-state">
          <div className="empty-state-title">No audit yet</div>
          <div className="empty-state-sub">Enter your website URL above and click Analyse. Claude will check 12 SEO factors and give you specific fixes.</div>
        </div>
      )}
    </div>
  );
}

function KeywordModal(props) {
  var locationId = props.locationId;
  var onClose    = props.onClose;
  var onSaved    = props.onSaved;
  var [keyword, setKeyword] = useState('');
  var [saving, setSaving]   = useState(false);

  function handleSave() {
    if (!keyword.trim()) return;
    setSaving(true);
    agent7.addKeyword({ locationId: locationId, keyword: keyword.trim() })
      .then(onSaved)
      .catch(function(e){ alert(e.message); setSaving(false); });
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={function(e){ e.stopPropagation(); }} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:400,maxWidth:'95vw',border:'1px solid var(--border)'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
          <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700}}>Add keyword</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>x</button>
        </div>
        <div style={{padding:'16px 20px'}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Keyword</label>
            <input className="form-input" value={keyword} onChange={function(e){ setKeyword(e.target.value); }} placeholder="e.g. Indian restaurant San Francisco" onKeyDown={function(e){ if (e.key==='Enter') handleSave(); }} />
          </div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',gap:8}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={handleSave} disabled={saving || !keyword.trim()}>
            {saving ? 'Adding…' : 'Add keyword'}
          </button>
        </div>
      </div>
    </div>
  );
}
