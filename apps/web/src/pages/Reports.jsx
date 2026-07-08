import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../App.jsx';
import { reports, insights } from '../lib/api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const USD_LOCS = ['ROOH SF','ROOH PA','Alora SF','Fitoor SR','Pippal','Fitoor SM','Alora Social','Pippal Dublin'];
const INR_LOCS = ['ROOH DELHI'];

function fmtSales(val, currency) {
  if (val == null) return '—';
  if (currency === 'INR') {
    if (val >= 10000000) return '₹' + (val/10000000).toFixed(2) + 'Cr';
    if (val >= 100000)   return '₹' + (val/100000).toFixed(1) + 'L';
    return '₹' + Math.round(val).toLocaleString();
  }
  if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
  if (val >= 1000)    return '$' + (val/1000).toFixed(1) + 'k';
  return '$' + Math.round(val).toLocaleString();
}

function pctChange(curr, prev) {
  if (!prev || !curr) return null;
  return ((curr - prev) / Math.abs(prev) * 100);
}

function PctBadge({ pct }) {
  if (pct == null) return null;
  const pos = pct >= 0;
  return (
    <span style={{ fontSize:10, padding:'1px 5px', borderRadius:4, marginLeft:4,
      background: pos ? 'rgba(62,207,142,.12)' : 'rgba(242,108,108,.12)',
      color: pos ? '#3ECF8E' : '#F26C6C', fontWeight:600 }}>
      {pos ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function Reports() {
  const [openReport, setOpenReport] = useState(null);
  const { user } = useAuth();

  const isOwner   = user?.role === 'owner';
  const isManager = user?.role === 'manager' || user?.role === 'owner';

  const ALL_REPORTS = [
    {
      id:      'mom',
      label:   'Month over Month Sales',
      icon:    '📊',
      access:  'owner',
      desc:    'Net sales across all restaurants by month and year. Compare performance YoY with % change.',
      tags:    ['Sales','Group-wide','Historical'],
    },
    {
      id:      'labor-demand',
      label:   'Labor vs Demand',
      icon:    '⚖️',
      access:  'manager',
      desc:    'Sales per labor dollar by week and location — flags overstaffed and understaffed weeks automatically.',
      tags:    ['Labor','Efficiency','POS-powered'],
    },
    {
      id:      'marketing-roi',
      label:   'Marketing ROI',
      icon:    '📣',
      access:  'manager',
      desc:    'Every newsletter and text campaign joined to the sales that followed — see which sends actually moved revenue.',
      tags:    ['Marketing','Revenue','Cross-source'],
    },
    {
      id:      'payroll',
      label:   'Payroll Report',
      icon:    '💰',
      access:  'manager',
      desc:    'Weekly and monthly payroll breakdown by location — FOH, BOH, Other and Support wages with payroll %.',
      tags:    ['Payroll','Per location','Weekly'],
    },
  ];

  const canAccess = (r) => {
    if (r.access === 'owner')   return isOwner;
    if (r.access === 'manager') return isManager;
    return true;
  };

  // If a report is open, render it full-screen with a back button
  if (openReport) {
    return (
      <div>
        <div className="topbar">
          <div className="topbar-left">
            <button className="btn btn-sm" onClick={()=>setOpenReport(null)} style={{marginRight:10}}>← Reports</button>
            <h1 className="page-title">{ALL_REPORTS.find(r=>r.id===openReport)?.icon} {ALL_REPORTS.find(r=>r.id===openReport)?.label}</h1>
          </div>
        </div>
        <div className="content">
          {openReport==='mom'     && <MoMReport/>}
          {openReport==='payroll' && <PayrollReport/>}
          {openReport==='labor-demand' && <LaborDemandReport/>}
          {openReport==='marketing-roi' && <MarketingRoiReport/>}
        </div>
      </div>
    );
  }

  // Reports library landing page
  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Reports</h1>
          <div className="page-sub">Group-wide analytics & historical data</div>
        </div>
      </div>
      <div className="content">
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16}}>
          {ALL_REPORTS.map(r => {
            const accessible = canAccess(r);
            return (
              <div key={r.id}
                onClick={()=>accessible && setOpenReport(r.id)}
                style={{
                  background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:12,
                  padding:24, cursor:accessible?'pointer':'default',
                  opacity:accessible?1:0.5, transition:'border-color .15s, box-shadow .15s',
                }}
                onMouseEnter={e=>{ if(accessible){ e.currentTarget.style.borderColor='var(--gold)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(184,116,26,.12)'; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.boxShadow='none'; }}>
                <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12}}>
                  <div style={{fontSize:32}}>{r.icon}</div>
                  {!accessible && <span style={{fontSize:10, padding:'2px 8px', borderRadius:10, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink-3)', fontWeight:600}}>
                    🔒 {r.access === 'owner' ? 'Owner only' : 'Managers+'}
                  </span>}
                  {accessible && r.access !== 'all' && <span style={{fontSize:10, padding:'2px 8px', borderRadius:10,
                    background: r.access==='owner'?'rgba(184,116,26,.12)':'rgba(74,144,217,.1)',
                    color: r.access==='owner'?'var(--gold)':'#4A90D9', fontWeight:600}}>
                    {r.access==='owner'?'Owner':'Managers+'}
                  </span>}
                </div>
                <div style={{fontFamily:'var(--serif)', fontSize:17, fontWeight:700, marginBottom:8}}>{r.label}</div>
                <div style={{fontSize:13, color:'var(--ink-3)', lineHeight:1.6, marginBottom:14}}>{r.desc}</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {r.tags.map(tag => (
                    <span key={tag} style={{fontSize:10, padding:'2px 8px', borderRadius:10, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink-3)'}}>{tag}</span>
                  ))}
                </div>
                {accessible && <div style={{marginTop:14, fontSize:12, color:'var(--gold)', fontWeight:600}}>Open report →</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ── Month over Month Sales Report ─────────────────────────────────────────────
function MoMReport() {
  const [data, setData]           = useState([]);
  const [locs, setLocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedLocs, setSelectedLocs] = useState([]);
  const [yearRange, setYearRange] = useState({ from: 2022, to: new Date().getFullYear() });
  const [showAdd, setShowAdd]     = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewMode, setViewMode]   = useState('table');

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sales, locations] = await Promise.all([
        reports.monthlySales({ yearFrom: yearRange.from, yearTo: yearRange.to }),
        reports.locations(),
      ]);
      const salesArr = Array.isArray(sales) ? sales : [];
      const locsArr  = Array.isArray(locations) ? locations : [];
      setData(salesArr);
      setLocs(locsArr);
      if (selectedLocs.length === 0 && locsArr.length) {
        const usdLocs = locsArr.filter(l => l.currency === 'USD').map(l => l.location_name);
        setSelectedLocs(usdLocs.length ? usdLocs : [locsArr[0].location_name]);
      }
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  }, [yearRange.from, yearRange.to]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeLocs = locs.filter(l => selectedLocs.includes(l.location_name));
  const years = [...new Set(data.filter(d => selectedLocs.includes(d.location_name)).map(d => d.year))].sort();

  const annualTotals = {};
  data.forEach(d => {
    if (!selectedLocs.includes(d.location_name)) return;
    const key = d.location_name + '_' + d.year;
    annualTotals[key] = (annualTotals[key] || 0) + parseFloat(d.net_sales || 0);
  });

  const monthRows = MONTHS.map((mon, mi) => {
    const monthNum = mi + 1;
    const cells = {};
    activeLocs.forEach(loc => {
      cells[loc.location_name] = {};
      years.forEach(yr => {
        const row = data.find(d => d.location_name === loc.location_name && d.year === yr && d.month === monthNum);
        cells[loc.location_name][yr] = row ? parseFloat(row.net_sales) : null;
      });
    });
    return { month: mon, monthNum, cells };
  });

  const toggleLoc = (name) => setSelectedLocs(prev => prev.includes(name) ? prev.filter(x=>x!==name) : [...prev, name]);

  if (loading) return <div className="spinner" style={{ margin:'60px auto' }}/>;

  return (
    <div>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <label style={{ fontSize:11, color:'var(--ink-3)' }}>From</label>
          <select className="form-select" style={{ fontSize:12, width:80 }} value={yearRange.from} onChange={e=>setYearRange(r=>({...r,from:parseInt(e.target.value)}))}>
            {[2022,2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
          </select>
          <label style={{ fontSize:11, color:'var(--ink-3)' }}>To</label>
          <select className="form-select" style={{ fontSize:12, width:80 }} value={yearRange.to} onChange={e=>setYearRange(r=>({...r,to:parseInt(e.target.value)}))}>
            {[2022,2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', gap:4 }}>
          {['table','chart'].map(v=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{ padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
              border:`1px solid ${viewMode===v?'var(--gold)':'var(--border)'}`,
              background:viewMode===v?'var(--gold-bg)':'transparent',
              color:viewMode===v?'var(--gold)':'var(--ink-3)' }}>
              {v==='table'?'📋 Table':'📈 Chart'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>+ Add month</button>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:'var(--ink-3)', alignSelf:'center' }}>Restaurants:</span>
        {locs.map(loc => (
          <button key={loc.location_name} onClick={()=>toggleLoc(loc.location_name)}
            style={{ padding:'4px 12px', borderRadius:20, fontSize:12, cursor:'pointer',
              border:`1px solid ${selectedLocs.includes(loc.location_name)?'var(--gold)':'var(--border)'}`,
              background:selectedLocs.includes(loc.location_name)?'var(--gold-bg)':'transparent',
              color:selectedLocs.includes(loc.location_name)?'var(--gold)':'var(--ink-3)',
              fontWeight:selectedLocs.includes(loc.location_name)?600:400 }}>
            {loc.location_name} {loc.currency !== 'USD' && <span style={{ fontSize:9, opacity:.7 }}>({loc.currency})</span>}
          </button>
        ))}
        <button onClick={()=>setSelectedLocs(locs.map(l=>l.location_name))} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, cursor:'pointer', border:'1px solid var(--border)', background:'transparent', color:'var(--ink-3)' }}>All</button>
        <button onClick={()=>setSelectedLocs([])} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, cursor:'pointer', border:'1px solid var(--border)', background:'transparent', color:'var(--ink-3)' }}>None</button>
      </div>

      {selectedLocs.length === 0 ? (
        <div className="empty-state"><div className="empty-state-title">Select at least one restaurant</div></div>
      ) : viewMode === 'chart' ? (
        <MoMChart monthRows={monthRows} activeLocs={activeLocs} years={years} />
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--bg-2)', borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, color:'var(--ink-3)', fontWeight:600, minWidth:60, position:'sticky', left:0, background:'var(--bg-2)', zIndex:2 }}>Month</th>
                {activeLocs.map(loc => (
                  <th key={loc.location_name} colSpan={years.length} style={{ padding:'8px 14px', textAlign:'center', fontSize:11, fontWeight:700, color:'var(--ink-2)', borderLeft:'2px solid var(--border)' }}>
                    {loc.location_name} {loc.currency !== 'USD' && <span style={{ fontSize:9, color:'var(--ink-3)', fontWeight:400 }}>({loc.currency})</span>}
                  </th>
                ))}
              </tr>
              <tr style={{ background:'var(--bg)', borderBottom:'2px solid var(--border)' }}>
                <th style={{ padding:'6px 14px', position:'sticky', left:0, background:'var(--bg)', zIndex:2 }}/>
                {activeLocs.map(loc => (
                  years.map((yr, yi) => (
                    <th key={loc.location_name+'_'+yr} style={{ padding:'6px 10px', textAlign:'right', fontSize:10, color:'var(--ink-3)', fontWeight:600, borderLeft: yi===0?'2px solid var(--border)':'1px solid var(--border)' }}>
                      {yr}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map(({ month, monthNum, cells }) => (
                <tr key={month} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <td style={{ padding:'8px 14px', fontWeight:600, fontSize:12, position:'sticky', left:0, background:'inherit', zIndex:1 }}>{month}</td>
                  {activeLocs.map(loc => (
                    years.map((yr, yi) => {
                      const val  = cells[loc.location_name]?.[yr];
                      const prev = cells[loc.location_name]?.[yr-1];
                      const pct  = pctChange(val, prev);
                      return (
                        <td key={loc.location_name+'_'+yr} style={{ padding:'7px 10px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, borderLeft: yi===0?'2px solid var(--border)':'1px solid var(--border)', color: val ? 'var(--ink)' : 'var(--ink-4)' }}>
                          {fmtSales(val, loc.currency)}
                          <PctBadge pct={pct}/>
                        </td>
                      );
                    })
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop:'2px solid var(--border)', background:'var(--bg-2)', fontWeight:700 }}>
                <td style={{ padding:'9px 14px', fontSize:12, fontWeight:700, position:'sticky', left:0, background:'var(--bg-2)', zIndex:1 }}>Annual</td>
                {activeLocs.map(loc => (
                  years.map((yr, yi) => {
                    const total = annualTotals[loc.location_name+'_'+yr] || null;
                    const prevTotal = annualTotals[loc.location_name+'_'+(yr-1)] || null;
                    const pct = pctChange(total || 0, prevTotal);
                    return (
                      <td key={loc.location_name+'_'+yr+'_tot'} style={{ padding:'9px 10px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12, fontWeight:700, borderLeft: yi===0?'2px solid var(--border)':'1px solid var(--border)', color:'var(--gold)' }}>
                        {fmtSales(total, loc.currency)}
                        <PctBadge pct={pct}/>
                      </td>
                    );
                  })
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddMonthModal locs={locs} onClose={()=>setShowAdd(false)}
          onSaved={async(row)=>{ await reports.upsertMonthly(row); setShowAdd(false); showToast('Saved'); loadData(); }}/>
      )}
      {toast && <div className="toast" style={{ background:toast.err?'#E24B4A':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

function MoMChart({ monthRows, activeLocs, years }) {
  const W = 900, H = 320, PAD = { t:20, r:20, b:40, l:60 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const showYears = years.slice(-3);
  const COLORS = ['#4A90D9','#E8A020','#3ECF8E','#E24B4A','#9B59B6','#1ABC9C'];

  const series = [];
  activeLocs.slice(0,3).forEach(loc => {
    showYears.forEach((yr, yi) => {
      series.push({
        label: loc.location_name + ' ' + yr,
        color: COLORS[(activeLocs.indexOf(loc) * showYears.length + yi) % COLORS.length],
        values: MONTHS.map((_, mi) => monthRows[mi].cells[loc.location_name]?.[yr] || 0),
        currency: loc.currency,
      });
    });
  });

  if (!series.length) return null;
  const maxVal = Math.max(...series.flatMap(s => s.values)) * 1.1 || 1;
  const groupW = chartW / MONTHS.length;
  const barW   = (groupW / series.length) * 0.85;

  return (
    <div style={{ overflowX:'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', maxWidth:W, fontFamily:'var(--mono)' }}>
        {[0,.25,.5,.75,1].map(t => {
          const y = PAD.t + chartH * (1-t);
          return (
            <g key={t}>
              <line x1={PAD.l} x2={W-PAD.r} y1={y} y2={y} stroke="var(--border)" strokeWidth={t===0?1.5:0.5}/>
              <text x={PAD.l-6} y={y+4} textAnchor="end" fill="var(--ink-3)" fontSize={9}>{fmtSales(maxVal*t, series[0]?.currency)}</text>
            </g>
          );
        })}
        {MONTHS.map((mon, mi) => (
          <g key={mon}>
            {series.map((s, si) => {
              const barH = (s.values[mi]/maxVal)*chartH;
              const x    = PAD.l + mi*groupW + si*barW + (groupW - series.length*barW)/2;
              return <rect key={si} x={x} y={PAD.t+chartH-barH} width={barW} height={barH} fill={s.color} opacity={0.85} rx={2}/>;
            })}
            <text x={PAD.l+mi*groupW+groupW/2} y={H-PAD.b+14} textAnchor="middle" fill="var(--ink-3)" fontSize={9}>{mon}</text>
          </g>
        ))}
      </svg>
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:8 }}>
        {series.map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--ink-3)' }}>
            <span style={{ width:10, height:10, borderRadius:2, background:s.color, display:'inline-block', flexShrink:0 }}/>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddMonthModal({ locs, onClose, onSaved }) {
  const ALL_LOCS = [...new Set([...USD_LOCS, ...INR_LOCS, ...locs.map(l=>l.location_name)])];
  const curYear = new Date().getFullYear();
  const [form, setForm] = useState({ locationName: locs[0]?.location_name || '', currency:'USD', year:curYear, month:new Date().getMonth()+1, netSales:'' });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleLocChange = name => { f('locationName',name); f('currency', INR_LOCS.includes(name)?'INR':'USD'); };
  const handleSave = async () => {
    if (!form.locationName||!form.netSales) return;
    setSaving(true);
    try { await onSaved({...form, netSales:parseFloat(String(form.netSales).replace(/,/g,''))}); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:440, maxWidth:'95vw', border:'1px solid var(--border)', padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Add monthly sales</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Restaurant</label>
            <select className="form-select" value={form.locationName} onChange={e=>handleLocChange(e.target.value)}>
              {ALL_LOCS.map(l=><option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Year</label><select className="form-select" value={form.year} onChange={e=>f('year',parseInt(e.target.value))}>{[2022,2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select></div>
            <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Month</label><select className="form-select" value={form.month} onChange={e=>f('month',parseInt(e.target.value))}>{MONTH_FULL.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Currency</label><select className="form-select" value={form.currency} onChange={e=>f('currency',e.target.value)}><option value="USD">USD ($)</option><option value="INR">INR (₹)</option></select></div>
            <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Net sales</label><input className="form-input" value={form.netSales} onChange={e=>f('netSales',e.target.value)} style={{ fontFamily:'var(--mono)' }}/></div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSave} disabled={saving||!form.locationName||!form.netSales}>{saving?'Saving…':'Save'}</button>
        </div>
      </div>
    </div>
  );
}


// ── Payroll Report ─────────────────────────────────────────────────────────────
function PayrollReport() {
  const [data, setData]           = useState([]);
  const [locs, setLocs]           = useState([]);
  const [location, setLocation]   = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);
  const [viewMode, setViewMode]   = useState('weekly'); // weekly | monthly
  const [showAdd, setShowAdd]     = useState(false);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locsData, payrollData] = await Promise.all([
        reports.payrollLocations(),
        reports.payroll({ locationName: location||undefined, yearFrom: yearFilter!=='all'?yearFilter:undefined, yearTo: yearFilter!=='all'?yearFilter:undefined }),
      ]);
      const locsArr = Array.isArray(locsData) ? locsData : [];
      setLocs(locsArr);
      if (!location && locsArr.length) setLocation(locsArr[0]);
      setData(Array.isArray(payrollData) ? payrollData : []);
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  }, [location, yearFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(d => {
    if (location && d.location_name !== location) return false;
    if (yearFilter !== 'all' && !(d.week_ending_str||d.week_ending||'').startsWith(yearFilter)) return false;
    return true;
  }).sort((a,b) => (b.week_ending_str||b.week_ending||'').localeCompare(a.week_ending_str||a.week_ending||''));

  const fmtD = v => v == null ? '—' : '$' + parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtP = v => v == null ? '—' : parseFloat(v).toFixed(1) + '%';

  // Monthly aggregation
  const monthlyData = (() => {
    const map = {};
    filtered.forEach(w => {
      const key = (w.week_ending_str||w.week_ending||'').slice(0,7);
      if (!key) return;
      if (!map[key]) map[key] = { month:key, count:0, totalPayroll:0, netSales:0, foh:0, boh:0, other:0, support:0 };
      const m = map[key];
      m.count++;
      m.totalPayroll += parseFloat(w.total_payroll||0);
      m.netSales     += parseFloat(w.net_sales||0);
      m.foh          += parseFloat(w.foh_wages||0);
      m.boh          += parseFloat(w.boh_wages||0);
      m.other        += parseFloat(w.other_wages||0);
      m.support      += parseFloat(w.support_wages||0);
    });
    return Object.values(map).sort((a,b) => b.month.localeCompare(a.month));
  })();

  // Summary stats
  const totPayroll = filtered.reduce((s,r)=>s+parseFloat(r.total_payroll||0),0);
  const totSales   = filtered.reduce((s,r)=>s+parseFloat(r.net_sales||0),0);
  const avgPayPct  = totSales ? (totPayroll/totSales*100) : 0;

  const years = [...new Set(data.map(d => d.week_ending?.slice(0,4)).filter(Boolean))].sort().reverse();

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        <select className="form-select" style={{ fontSize:12, minWidth:160 }} value={location} onChange={e=>setLocation(e.target.value)}>
          <option value="">All locations</option>
          {locs.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="form-select" style={{ fontSize:12, width:100 }} value={yearFilter} onChange={e=>setYearFilter(e.target.value)}>
          <option value="all">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', gap:4 }}>
          {['weekly','monthly'].map(v => (
            <button key={v} onClick={()=>setViewMode(v)} style={{ padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
              border:`1px solid ${viewMode===v?'var(--gold)':'var(--border)'}`,
              background:viewMode===v?'var(--gold-bg)':'transparent',
              color:viewMode===v?'var(--gold)':'var(--ink-3)' }}>
              {v==='weekly'?'📅 Weekly':'📆 Monthly'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>+ Add week</button>
      </div>

      {/* Summary stat cards */}
      {!loading && filtered.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'Total payroll', val:'$'+Math.round(totPayroll).toLocaleString(), color:'var(--gold)' },
            { label:'Total sales',   val:'$'+Math.round(totSales).toLocaleString(),   color:'var(--ink)' },
            { label:'Avg payroll %', val:avgPayPct.toFixed(1)+'%',  color:avgPayPct>35?'#F26C6C':avgPayPct>28?'#E8A020':'#3ECF8E' },
            { label:'Weeks',         val:filtered.length,            color:'var(--ink-3)' },
          ].map((s,i) => (
            <div key={i} style={{ background:'var(--bg-2)', borderRadius:10, padding:'12px 16px', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="spinner" style={{ margin:'40px auto' }}/> : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <div className="empty-state-title">No payroll data</div>
          <div className="empty-state-sub">Import payroll data or add weeks manually</div>
        </div>
      ) : viewMode === 'monthly' ? (
        /* Monthly view */
        <div className="card" style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--border)', background:'var(--bg-2)' }}>
                {['Month','Total Payroll','Net Sales','Payroll %','FOH','BOH','Other','Support'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:h==='Month'?'left':'right', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m,i) => {
                const payPct = m.netSales ? (m.totalPayroll/m.netSales*100) : 0;
                const [yr, mo] = m.month.split('-');
                return (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{MONTH_FULL[parseInt(mo)-1]} {yr}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--gold)', fontWeight:600 }}>{fmtD(m.totalPayroll)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)' }}>{fmtD(m.netSales)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', color:payPct>35?'#F26C6C':payPct>28?'#E8A020':'#3ECF8E', fontWeight:600 }}>{payPct.toFixed(1)}%</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>{fmtD(m.foh)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>{fmtD(m.boh)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>{fmtD(m.other)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>{fmtD(m.support)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Weekly view — all columns */
        <div className="card" style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg-2)' }}>
                <th colSpan={2}/>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>Payroll</th>
                <th colSpan={4} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>ER Taxes</th>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>Sales</th>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'#4A90D9', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>FOH</th>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'#E24B4A', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>BOH</th>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>Other</th>
                <th colSpan={2} style={{ padding:'4px 8px', textAlign:'center', fontSize:9, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>Support</th>
              </tr>
              <tr style={{ borderBottom:'2px solid var(--border)', background:'var(--bg-2)' }}>
                {[
                  {label:'Week',txt:true},{label:'Location',txt:true},
                  {label:'Total',bl:true},{label:'Base Payroll'},
                  {label:'ER Other',bl:true},{label:'ER FOH'},{label:'ER BOH'},{label:'ER Support'},
                  {label:'Net Sales',bl:true},{label:'Pay%'},{label:'Tax%'},
                  {label:'$',bl:true},{label:'%'},
                  {label:'$',bl:true},{label:'%'},
                  {label:'$',bl:true},{label:'%'},
                  {label:'$',bl:true},{label:'%'},
                ].map((h,i) => (
                  <th key={i} style={{ padding:'6px 8px', textAlign:h.txt?'left':'right', fontSize:9, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', whiteSpace:'nowrap', borderLeft:h.bl?'1px solid var(--border)':undefined }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((w,i) => {
                const pp = parseFloat(w.payroll_pct||0);
                return (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'6px 8px', fontWeight:500, whiteSpace:'nowrap' }}>{w.week_ending_str||w.week_ending}</td>
                    <td style={{ padding:'6px 8px', fontSize:10, color:'var(--ink-3)' }}>{w.location_name}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--gold)', fontWeight:600, borderLeft:'1px solid var(--border)' }}>{fmtD(w.total_payroll)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11 }}>{fmtD(w.payroll_base)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11, borderLeft:'1px solid var(--border)' }}>{fmtD(w.er_taxes_other)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11 }}>{fmtD(w.er_taxes_foh)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11 }}>{fmtD(w.er_taxes_boh)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontSize:11 }}>{fmtD(w.er_taxes_support)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', borderLeft:'1px solid var(--border)' }}>{fmtD(w.net_sales)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', fontWeight:600, color:pp>35?'#F26C6C':pp>28?'#E8A020':'#3ECF8E' }}>{fmtP(w.payroll_pct)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmtP(w.payroll_tax_pct)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'#4A90D9', borderLeft:'1px solid var(--border)' }}>{fmtD(w.foh_wages)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmtP(w.foh_pct)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'#E24B4A', borderLeft:'1px solid var(--border)' }}>{fmtD(w.boh_wages)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmtP(w.boh_pct)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', borderLeft:'1px solid var(--border)' }}>{fmtD(w.other_wages)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmtP(w.other_pct)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', borderLeft:'1px solid var(--border)' }}>{fmtD(w.support_wages)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{fmtP(w.support_pct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddPayrollModal
          locs={locs}
          defaultLoc={location}
          onClose={()=>setShowAdd(false)}
          onSaved={async(row)=>{ await reports.upsertPayroll(row); setShowAdd(false); showToast('Saved'); load(); }}
        />
      )}
      {toast && <div className="toast" style={{ background:toast.err?'#E24B4A':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

function AddPayrollModal({ locs, defaultLoc, onClose, onSaved }) {
  const [form, setForm] = useState({
    locationName: defaultLoc || locs[0] || 'Alora SF',
    weekEnding:'', totalPayroll:'', netSales:'',
    fohWages:'', bohWages:'', otherWages:'', payrollPct:'',
  });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const pn = v => v ? parseFloat(String(v).replace(/,/g,'')) : null;

  const handleSave = async () => {
    if (!form.weekEnding || !form.totalPayroll) return;
    setSaving(true);
    try {
      await onSaved({
        locationName: form.locationName,
        weekEnding:   form.weekEnding,
        totalPayroll: pn(form.totalPayroll),
        netSales:     pn(form.netSales),
        payrollPct:   pn(form.payrollPct),
        fohWages:     pn(form.fohWages),
        bohWages:     pn(form.bohWages),
        otherWages:   pn(form.otherWages),
      });
    } catch(e) { alert(e.message); setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:460, maxWidth:'95vw', border:'1px solid var(--border)', padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Add payroll week</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
            <label className="form-label">Location</label>
            <select className="form-select" value={form.locationName} onChange={e=>f('locationName',e.target.value)}>
              {[...new Set([...locs, 'Alora SF','ROOH SF','ROOH PA'])].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
            <label className="form-label">Week ending</label>
            <input className="form-input" type="date" value={form.weekEnding} onChange={e=>f('weekEnding',e.target.value)}/>
          </div>
          {[
            ['totalPayroll','Total payroll'],['netSales','Net sales'],
            ['fohWages','FOH wages'],['bohWages','BOH wages'],
            ['otherWages','Other wages'],['payrollPct','Payroll %'],
          ].map(([k,label]) => (
            <div key={k} className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">{label}</label>
              <input className="form-input" value={form[k]} onChange={e=>f(k,e.target.value)} style={{ fontFamily:'var(--mono)' }}/>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSave}
            disabled={saving||!form.weekEnding||!form.totalPayroll}>
            {saving?'Saving…':'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Labor vs Demand Report ─────────────────────────────────────────────────────
function LaborDemandReport() {
  const [data, setData] = useState(null);
  const [weeks, setWeeks] = useState(12);
  useEffect(() => { insights.laborVsDemand(weeks).then(setData).catch(()=>setData([])); }, [weeks]);
  if (!data) return <div className="spinner" style={{margin:'60px auto'}}/>;
  const fmtD = v => v==null?'—':'$'+Math.round(v).toLocaleString();
  const FLAG = { overstaffed:{label:'Overstaffed',c:'#E8A020'}, understaffed_risk:{label:'Stretched',c:'#4A90D9'}, normal:{label:'',c:''} };
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <span style={{fontSize:12,color:'var(--ink-3)'}}>Window:</span>
        {[8,12,26].map(w=><button key={w} onClick={()=>setWeeks(w)} style={{padding:'4px 10px',fontSize:11,borderRadius:6,cursor:'pointer',border:`1px solid ${weeks===w?'var(--gold)':'var(--border)'}`,background:weeks===w?'var(--gold-bg)':'transparent',color:weeks===w?'var(--gold)':'var(--ink-3)'}}>{w} weeks</button>)}
        <span style={{fontSize:11,color:'var(--ink-3)',marginLeft:'auto'}}>Efficiency = sales generated per $1 of labor. Flags trip at ±15% vs the location's own average.</span>
      </div>
      {data.length===0 && <div className="empty-state"><div className="empty-state-title">No labor + sales data yet</div><div className="empty-state-sub">Needs weekly KPI data with FOH/BOH labor filled in</div></div>}
      {data.map(loc => (
        <div key={loc.location} className="card" style={{marginBottom:16,padding:'14px 18px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700}}>{loc.location}</div>
            <div style={{fontSize:12,color:'var(--ink-3)'}}>Avg <span style={{fontFamily:'var(--mono)',color:'var(--gold)',fontWeight:700}}>${loc.avgSalesPerLaborDollar||'—'}</span> sales / labor $</div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Week','Sales','Labor','Efficiency',''].map(h=><th key={h} style={{padding:'5px 10px',textAlign:h==='Week'?'left':'right',fontSize:10,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>)}
            </tr></thead>
            <tbody>{loc.weeks.map((w,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'5px 10px'}}>{w.week}</td>
                <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'var(--mono)'}}>{fmtD(w.sales)}</td>
                <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'var(--mono)'}}>{fmtD(w.labor)}</td>
                <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600}}>{w.efficiency?'$'+w.efficiency:'—'}</td>
                <td style={{padding:'5px 10px',textAlign:'right'}}>{w.flag&&w.flag!=='normal'&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:10,fontWeight:600,background:FLAG[w.flag].c+'20',color:FLAG[w.flag].c}}>{FLAG[w.flag].label}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Marketing ROI Report ───────────────────────────────────────────────────────
function MarketingRoiReport() {
  const [data, setData] = useState(null);
  useEffect(() => { insights.marketingRoi().then(setData).catch(()=>setData([])); }, []);
  if (!data) return <div className="spinner" style={{margin:'60px auto'}}/>;
  const fmtD = v => v==null?'—':'$'+Math.round(v).toLocaleString();
  return (
    <div>
      <div style={{fontSize:12,color:'var(--ink-3)',marginBottom:14,lineHeight:1.6}}>
        Each send compared to the prior 4-week sales baseline of its week. Lift is directional — it shows correlation, not pure causation, but consistent positive lift across sends is a strong signal.
      </div>
      {data.length===0 ? (
        <div className="empty-state"><div className="empty-state-icon">📣</div><div className="empty-state-title">No sent campaigns yet</div><div className="empty-state-sub">Send a newsletter or text campaign and it will appear here with its revenue impact</div></div>
      ) : (
        <div className="card">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{borderBottom:'2px solid var(--border)',background:'var(--bg-2)'}}>
              {['Campaign','Channel','Sent','Recipients','Week sales','Baseline','Lift'].map(h=>
                <th key={h} style={{padding:'8px 14px',textAlign:['Campaign','Channel','Sent'].includes(h)?'left':'right',fontSize:10,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>)}
            </tr></thead>
            <tbody>{data.map((c,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'8px 14px',fontWeight:600,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</td>
                <td style={{padding:'8px 14px',fontSize:11}}>{c.channel==='email'?'✉️ Email':c.channel==='whatsapp'?'📱 WhatsApp':'💬 SMS'}</td>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--ink-3)'}}>{c.sentAt}</td>
                <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--mono)'}}>{c.recipients||'—'}</td>
                <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--mono)'}}>{fmtD(c.sendWeekSales)}</td>
                <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{fmtD(c.baselineSales)}</td>
                <td style={{padding:'8px 14px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:c.lift>0?'#3ECF8E':c.lift<0?'#F26C6C':'var(--ink-3)'}}>
                  {c.lift!=null?(c.lift>0?'+':'')+fmtD(c.lift).replace('$-','-$'):'—'}
                  {c.liftPct!=null&&<span style={{fontSize:10,marginLeft:4,opacity:.7}}>({c.liftPct>0?'+':''}{c.liftPct}%)</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
