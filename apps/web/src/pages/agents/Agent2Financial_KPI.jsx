import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { agent2, agent4, locations as locationsApi } from '../../lib/api.js';
import { useAuth } from '../../App.jsx';

// Normalize DB rows — PostgreSQL returns NUMERIC as strings
function normalizeWeek(w) {
  const num = (v) => v == null ? null : parseFloat(v) || null;
  // week_start comes back as a Date object from pg driver — convert to string
  const ws = w.week_start instanceof Date
    ? w.week_start.toISOString().slice(0, 10)
    : w.week_start ? String(w.week_start).slice(0, 10) : null;
  return {
    ...w,
    week_start: ws,
    bar_net_sales:    num(w.bar_net_sales),
    food_net_sales:   num(w.food_net_sales),
    total_sales:      num(w.total_sales),
    bar_ordering:     num(w.bar_ordering),
    kitchen_ordering: num(w.kitchen_ordering),
    other_ordering:   num(w.other_ordering),
    other_cost:       num(w.other_cost),
    bar_cost_pct:     num(w.bar_cost_pct),
    food_cost_pct:    num(w.food_cost_pct),
    foh_labor:        num(w.foh_labor),
    boh_labor:        num(w.boh_labor),
    foh_pct:          num(w.foh_pct),
    boh_pct:          num(w.boh_pct),
    bar_inventory:    num(w.bar_inventory),
    kitchen_inventory:num(w.kitchen_inventory),
    event_inquiries:  w.event_inquiries != null ? parseInt(w.event_inquiries) : null,
    event_converted:  w.event_converted  != null ? parseInt(w.event_converted)  : null,
    event_revenue:    num(w.event_revenue),
    event_conv_rate:  num(w.event_conv_rate),
    cash_deposited:   num(w.cash_deposited),
    cash_spent:       num(w.cash_spent),
    // Compute dollar cost amounts from pct × sales
    bar_cost:  (num(w.bar_cost)  != null) ? num(w.bar_cost)  : (num(w.bar_cost_pct)  != null && num(w.total_sales) != null) ? parseFloat((num(w.total_sales) * num(w.bar_cost_pct)  / 100).toFixed(2)) : (num(w.bar_net_sales)  != null && num(w.bar_cost_pct)  != null) ? parseFloat((num(w.bar_net_sales)  * num(w.bar_cost_pct)  / 100).toFixed(2)) : null,
    food_cost: (num(w.food_cost) != null) ? num(w.food_cost) : (num(w.food_cost_pct) != null && num(w.total_sales) != null) ? parseFloat((num(w.total_sales) * num(w.food_cost_pct) / 100).toFixed(2)) : (num(w.food_net_sales) != null && num(w.food_cost_pct) != null) ? parseFloat((num(w.food_net_sales) * num(w.food_cost_pct) / 100).toFixed(2)) : null,
    cash_in_toast:    num(w.cash_in_toast),
    rating_google:    num(w.rating_google),
    rating_yelp:      num(w.rating_yelp),
    rating_opentable: num(w.rating_opentable),
  };
}

// Formatting helpers
const fmt$ = n => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPct = n => n == null ? '—' : Number(n).toFixed(1) + '%';
const fmtK = n => n == null ? '—' : n >= 1000 ? '$' + (n/1000).toFixed(1) + 'k' : '$' + Math.round(n);
const pctColor = (v, target) => {
  if (v == null) return 'var(--ink)';
  const d = v - target;
  return d > 3 ? 'var(--red)' : d > 1 ? 'var(--amber)' : 'var(--green)';
};
const delta = (curr, prev) => {
  if (!prev || !curr) return null;
  return ((curr - prev) / Math.abs(prev) * 100).toFixed(1);
};

// Stacked area chart with cost/labor overlay lines
function StackedAreaChart({ weeks, targets }) {
  if (!weeks || weeks.length < 2) return <div className="empty-state" style={{ padding: 30 }}><div className="empty-state-sub">Not enough data</div></div>;
  const W = 540, H = 180, PAD = { t: 10, r: 70, b: 28, l: 52 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxTotal = Math.max(...weeks.map(w => (w.bar_net_sales||0) + (w.food_net_sales||0))) * 1.15 || 1;
  // Right axis: 0–50% for cost/labor lines
  const maxPct = 50;
  const x = i => PAD.l + (i / (weeks.length - 1)) * cW;
  const yS = v => PAD.t + cH - (v / maxTotal) * cH;  // sales axis (left)
  const yP = v => PAD.t + cH - (v / maxPct) * cH;     // pct axis (right)
  const foodPts  = weeks.map((w,i) => `${x(i)},${yS(w.food_net_sales||0)}`).join(' ');
  const totalPts = weeks.map((w,i) => `${x(i)},${yS((w.bar_net_sales||0)+(w.food_net_sales||0))}`).join(' ');
  const foodArea  = `${x(0)},${yS(0)} ${foodPts} ${x(weeks.length-1)},${yS(0)}`;
  const totalArea = `${x(0)},${yS(0)} ${totalPts} ${x(weeks.length-1)},${yS(0)}`;
  // Cost/labor line points — skip nulls
  const linePts = (key) => weeks.map((w,i) => w[key]!=null ? `${x(i)},${yP(w[key])}` : null).filter(Boolean).join(' ');
  const barCostPts   = linePts('bar_cost_pct');
  const foodCostPts  = linePts('food_cost_pct');
  const totalLaborPts = weeks.map((w,i) => {
    const t = ((w.foh_pct||0)+(w.boh_pct||0));
    return t > 0 ? `${x(i)},${yP(t)}` : null;
  }).filter(Boolean).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(maxTotal / 4 * i));
  const pctTicks = [10, 20, 30, 40];
  const showEvery = Math.ceil(weeks.length / 6);
  const tBar  = targets?.bar_cost_pct  || 22;
  const tFood = targets?.food_cost_pct || 18;
  const tLab  = (targets?.foh_pct||15) + (targets?.boh_pct||15);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {/* Sales grid + left axis */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} y1={yS(t)} x2={W-PAD.r} y2={yS(t)} stroke="var(--chart-grid)" strokeWidth="1" strokeDasharray="3,3"/>
            <text x={PAD.l-4} y={yS(t)+4} textAnchor="end" fontSize="9" fill="var(--ink4)" fontFamily="var(--mono)">{t>=1000?`${(t/1000).toFixed(0)}k`:t}</text>
          </g>
        ))}
        {/* Pct right axis */}
        {pctTicks.map(t => (
          <g key={'p'+t}>
            <text x={W-PAD.r+4} y={yP(t)+4} textAnchor="start" fontSize="9" fill="var(--ink4)" fontFamily="var(--mono)">{t}%</text>
          </g>
        ))}
        {/* Target lines (dashed) */}
        <line x1={PAD.l} y1={yP(tBar)}  x2={W-PAD.r} y2={yP(tBar)}  stroke="#E8A020" strokeWidth="1" strokeDasharray="4,3" opacity=".5"/>
        <line x1={PAD.l} y1={yP(tFood)} x2={W-PAD.r} y2={yP(tFood)} stroke="#4A90D9" strokeWidth="1" strokeDasharray="4,3" opacity=".5"/>
        <line x1={PAD.l} y1={yP(tLab)}  x2={W-PAD.r} y2={yP(tLab)}  stroke="#9B59B6" strokeWidth="1" strokeDasharray="4,3" opacity=".5"/>
        {/* Sales areas */}
        <polygon points={totalArea} fill="var(--chart-bar)" opacity=".1"/>
        <polygon points={foodArea}  fill="var(--chart-food)" opacity=".15"/>
        <polyline points={totalPts} fill="none" stroke="var(--chart-bar)"  strokeWidth="2"   strokeLinejoin="round"/>
        <polyline points={foodPts}  fill="none" stroke="var(--chart-food)" strokeWidth="1.5" strokeLinejoin="round"/>
        {/* Cost/labor lines */}
        {barCostPts   && <polyline points={barCostPts}   fill="none" stroke="#E8A020" strokeWidth="1.5" strokeLinejoin="round"/>}
        {foodCostPts  && <polyline points={foodCostPts}  fill="none" stroke="#4A90D9" strokeWidth="1.5" strokeLinejoin="round"/>}
        {totalLaborPts && <polyline points={totalLaborPts} fill="none" stroke="#9B59B6" strokeWidth="1.5" strokeLinejoin="round"/>}
        {/* X axis labels */}
        {weeks.map((w, i) => i % showEvery === 0 && (
          <text key={i} x={x(i)} y={H-4} textAnchor="middle" fontSize="9" fill="var(--ink4)" fontFamily="var(--mono)">{w.week_start?.slice(5).replace('-','/')}</text>
        ))}
        {weeks.length > 0 && <circle cx={x(weeks.length-1)} cy={yS((weeks[weeks.length-1].bar_net_sales||0)+(weeks[weeks.length-1].food_net_sales||0))} r="3" fill="var(--chart-bar)"/>}
      </svg>
      <div style={{ display:'flex', gap:14, fontSize:10, color:'var(--ink3)', marginTop:6, flexWrap:'wrap', paddingLeft:52 }}>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:16, height:2, background:'var(--chart-bar)', display:'inline-block' }}/> Total sales</span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:16, height:2, background:'var(--chart-food)', display:'inline-block' }}/> Food</span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:16, height:2, background:'#E8A020', display:'inline-block' }}/> Bar cost %</span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:16, height:2, background:'#4A90D9', display:'inline-block' }}/> Food cost %</span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:16, height:2, background:'#9B59B6', display:'inline-block' }}/> Total labor %</span>
        <span style={{ display:'flex', alignItems:'center', gap:4, opacity:.55 }}><span style={{ width:16, height:0, borderTop:'2px dashed var(--ink3)', display:'inline-block' }}/> Targets</span>
      </div>
    </div>
  );
}

// Bullet chart
function BulletChart({ label, value, target, max, good, warn }) {
  if (value == null) return null;
  const pct = v => Math.min(100, (v / max) * 100);
  const color = value <= good ? 'var(--green)' : value <= warn ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 500, color }}>{fmtPct(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct(good)}%`, background: 'rgba(45,106,79,.12)' }}/>
        <div style={{ position: 'absolute', left: `${pct(good)}%`, top: 0, height: '100%', width: `${pct(warn)-pct(good)}%`, background: 'rgba(146,98,10,.1)' }}/>
        <div style={{ position: 'absolute', left: `${pct(warn)}%`, top: 0, height: '100%', width: `${pct(max)-pct(warn)}%`, background: 'rgba(155,35,53,.08)' }}/>
        <div style={{ position: 'absolute', left: 0, top: 1, height: 6, width: `${pct(value)}%`, borderRadius: 3, background: color, transition: 'width .6s ease' }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--ink4)', fontFamily: 'var(--mono)' }}>
        <span>0%</span><span>target {fmtPct(target)}</span><span>{fmtPct(max)}</span>
      </div>
    </div>
  );
}

// Rating chart
function RatingChart({ weeks }) {
  if (!weeks || weeks.length < 2) return <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>No rating data yet</div>;
  const W = 540, H = 120, PAD = { t: 16, r: 10, b: 24, l: 36 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const minR = 3.0, maxR = 5.0;
  const x = i => PAD.l + (i / (weeks.length - 1)) * cW;
  const y = v => PAD.t + cH - ((v - minR) / (maxR - minR)) * cH;
  const platforms = [
    { key: 'rating_google', color: '#4285F4', label: 'Google' },
    { key: 'rating_yelp', color: '#d32323', label: 'Yelp' },
    { key: 'rating_opentable', color: 'var(--gold)', label: 'OpenTable' },
  ];
  const showEvery = Math.ceil(weeks.length / 6);
  const ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {ratingTicks.map(t => (
        <g key={t}>
          <line x1={PAD.l} y1={y(t)} x2={W-PAD.r} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1"/>
          <text x={PAD.l-4} y={y(t)+3} textAnchor="end" fontSize="9" fill="var(--ink4)" fontFamily="var(--mono)">{t.toFixed(1)}</text>
        </g>
      ))}
      {platforms.map(({ key, color }) => {
        const validWeeks = weeks.filter(w => w[key]);
        if (validWeeks.length < 2) return null;
        const pts = weeks.map((w, i) => w[key] ? `${x(i)},${y(Number(w[key]))}` : null).filter(Boolean).join(' ');
        const lastW = [...weeks].reverse().find(w => w[key]);
        const lastI = weeks.length - 1 - [...weeks].reverse().findIndex(w => w[key]);
        return (
          <g key={key}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity=".85"/>
            {lastW && <circle cx={x(lastI)} cy={y(Number(lastW[key]))} r="3" fill={color}/>}
          </g>
        );
      })}
      {weeks.map((w, i) => i % showEvery === 0 && (
        <text key={i} x={x(i)} y={H-4} textAnchor="middle" fontSize="9" fill="var(--ink4)" fontFamily="var(--mono)">{w.week_start?.slice(5).replace('-','/')}</text>
      ))}
    </svg>
  );
}

// Heat calendar
function HeatCalendar({ weeks, metric, label, target }) {
  if (!weeks || weeks.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink2)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {weeks.map((w, i) => {
          const v = w[metric];
          const color = v == null ? 'var(--bg2)' : v <= target ? '#d1fae5' : v <= target + 2 ? '#fef3c7' : '#fee2e2';
          const textColor = v == null ? 'var(--ink4)' : v <= target ? '#065f46' : v <= target + 2 ? '#92400e' : '#991b1b';
          return (
            <div key={i} title={`${w.week_start?.slice(0,10)}: ${fmtPct(v)}`} style={{ width: 32, height: 28, borderRadius: 4, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: 'var(--mono)', color: textColor, fontWeight: 500, cursor: 'default' }}>
              {v != null ? v.toFixed(0) : '·'}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--ink3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#d1fae5', display: 'inline-block' }}/>On target</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#fef3c7', display: 'inline-block' }}/>Watch</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#fee2e2', display: 'inline-block' }}/>Over</span>
      </div>
    </div>
  );
}

// Cash waterfall
function CashWaterfall({ weeks }) {
  const recent = weeks?.slice(-8).filter(w => w.cash_deposited || w.cash_spent || w.cash_in_toast);
  if (!recent || recent.length === 0) return <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>No cash data yet</div>;
  const maxVal = Math.max(...recent.map(w => Math.max(w.cash_deposited||0, w.cash_in_toast||0))) * 1.2 || 2000;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '0 4px' }}>
      {recent.map((w, i) => {
        const dep = w.cash_deposited || 0;
        const variance = dep - (w.cash_in_toast || 0);
        const depH = (dep / maxVal) * 70;
        const varColor = Math.abs(variance) < 50 ? 'var(--green)' : variance < 0 ? 'var(--red)' : 'var(--amber)';
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${w.week_start?.slice(0,10)}\nDeposited: ${fmt$(dep)}\nVariance: ${fmt$(variance)}`}>
            <div style={{ width: '100%', height: Math.max(depH, 2), background: 'var(--chart-bar)', borderRadius: '3px 3px 0 0', opacity: .75 }}/>
            <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: varColor, fontWeight: 500 }}>{variance > 0 ? '+' : ''}{Math.round(variance)}</div>
            <div style={{ fontSize: 8, color: 'var(--ink4)', fontFamily: 'var(--mono)' }}>{w.week_start?.slice(5).replace('-','/')}</div>
          </div>
        );
      })}
    </div>
  );
}

// Event funnel
function EventFunnel({ weeks }) {
  const recent = weeks?.slice(-12);
  if (!recent || recent.length === 0) return <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>No event data</div>;
  const totInq = recent.reduce((s, w) => s + (w.event_inquiries || 0), 0);
  const totConv = recent.reduce((s, w) => s + (w.event_converted || 0), 0);
  const totRev = recent.reduce((s, w) => s + (w.event_revenue || 0), 0);
  const convRate = totInq ? ((totConv / totInq) * 100).toFixed(0) : 0;
  return (
    <div style={{ padding: '4px 0' }}>
      {[
        { label: 'Inquiries', val: totInq, pct: 100, color: 'var(--ink3)' },
        { label: 'Converted', val: totConv, pct: totInq ? (totConv/totInq)*100 : 0, color: 'var(--chart-food)' },
        { label: 'Revenue', val: fmt$(totRev), pct: null, color: 'var(--gold)' },
      ].map(({ label, val, pct, color }, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 500, color }}>{val}</span>
          </div>
          {pct !== null && <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, opacity: .7 }}/></div>}
        </div>
      ))}
      <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--gold-bg)', borderRadius: 'var(--r-sm)', textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--gold)', fontWeight: 500 }}>{convRate}%</span>
        <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 6 }}>conversion rate</span>
      </div>
    </div>
  );
}

// Weekly entry form
function EntryForm({ onSaved, location_id }) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const [form, setForm] = useState({ week_start: monday.toISOString().slice(0, 10), location_id });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const totalSales = (parseFloat(form.bar_net_sales)||0) + (parseFloat(form.food_net_sales)||0);
  const barPct = form.bar_ordering && form.bar_net_sales ? ((form.bar_ordering/form.bar_net_sales)*100).toFixed(1) : null;
  const foodPct = form.kitchen_ordering && form.food_net_sales ? ((form.kitchen_ordering/form.food_net_sales)*100).toFixed(1) : null;
  const fohPct = form.foh_labor && totalSales ? ((form.foh_labor/totalSales)*100).toFixed(1) : null;
  const bohPct = form.boh_labor && totalSales ? ((form.boh_labor/totalSales)*100).toFixed(1) : null;

  const F = (key, label, prefix='$', step='any') => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', fontSize: 12 }}>{prefix}</span>}
        <input className="form-input" type="number" step={step} value={form[key]||''} onChange={e => setForm(p => ({...p,[key]:e.target.value}))} style={{ paddingLeft: prefix ? 22 : 11, fontFamily: 'var(--mono)', fontSize: 12 }}/>
      </div>
    </div>
  );
  const section = (title, children) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{title}</div>
      {children}
    </div>
  );
  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await agent2.enterWeeklyData({ ...form, total_sales: totalSales, bar_cost_pct: barPct?parseFloat(barPct):null, food_cost_pct: foodPct?parseFloat(foodPct):null, foh_pct: fohPct?parseFloat(fohPct):null, boh_pct: bohPct?parseFloat(bohPct):null });
      onSaved();
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  };
  return (
    <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
      <div className="form-group"><label className="form-label">Week starting (Monday)</label><input className="form-input" type="date" value={form.week_start} onChange={e => setForm(p=>({...p,week_start:e.target.value}))}/></div>
      {section('Sales', (<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>{F('bar_net_sales','Bar net sales')}{F('food_net_sales','Food net sales')}<div style={{ gridColumn:'1/-1', padding:'8px 12px', background:'var(--gold-bg)', borderRadius:'var(--r-sm)', fontSize:12, fontFamily:'var(--mono)', color:'var(--gold)' }}>Total: <strong>{fmt$(totalSales||null)}</strong></div></div>))}
      {section('Ordering / COGs', (<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Bar ordering {barPct && <span style={{ color: barPct>22?'var(--red)':'var(--green)', fontFamily:'var(--mono)', fontWeight:700 }}>→ {barPct}%</span>}</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)', fontSize:12 }}>$</span><input className="form-input" type="number" value={form.bar_ordering||''} onChange={e=>setForm(p=>({...p,bar_ordering:e.target.value}))} style={{ paddingLeft:22, fontFamily:'var(--mono)', fontSize:12 }}/></div></div>
        <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Kitchen ordering {foodPct && <span style={{ color: foodPct>18?'var(--red)':'var(--green)', fontFamily:'var(--mono)', fontWeight:700 }}>→ {foodPct}%</span>}</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)', fontSize:12 }}>$</span><input className="form-input" type="number" value={form.kitchen_ordering||''} onChange={e=>setForm(p=>({...p,kitchen_ordering:e.target.value}))} style={{ paddingLeft:22, fontFamily:'var(--mono)', fontSize:12 }}/></div></div>
        {F('other_ordering','Other (Amazon, FOH)')}{F('other_cost','HK / Linen / Packaging')}
      </div>))}
      {section('Labor', (<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">FOH labor {fohPct && <span style={{ color: fohPct>15?'var(--red)':'var(--green)', fontFamily:'var(--mono)', fontWeight:700 }}>→ {fohPct}%</span>}</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)', fontSize:12 }}>$</span><input className="form-input" type="number" value={form.foh_labor||''} onChange={e=>setForm(p=>({...p,foh_labor:e.target.value}))} style={{ paddingLeft:22, fontFamily:'var(--mono)', fontSize:12 }}/></div></div>
        <div className="form-group" style={{ marginBottom:0 }}><label className="form-label">BOH labor {bohPct && <span style={{ color: bohPct>15?'var(--red)':'var(--green)', fontFamily:'var(--mono)', fontWeight:700 }}>→ {bohPct}%</span>}</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)', fontSize:12 }}>$</span><input className="form-input" type="number" value={form.boh_labor||''} onChange={e=>setForm(p=>({...p,boh_labor:e.target.value}))} style={{ paddingLeft:22, fontFamily:'var(--mono)', fontSize:12 }}/></div></div>
      </div>))}
      {section('Events', (<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>{F('event_inquiries','Inquiries','',1)}{F('event_converted','Converted','',1)}{F('event_revenue','Revenue')}</div>))}
      {section('Cash', (<><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>{F('cash_deposited','Deposited')}{F('cash_in_toast','In Toast')}{F('cash_spent','Spent')}</div><div className="form-group" style={{ marginBottom:0 }}><label className="form-label">Cash notes</label><textarea className="form-textarea" rows={2} value={form.cash_notes||''} onChange={e=>setForm(p=>({...p,cash_notes:e.target.value}))} style={{ fontSize:11 }}/></div></>))}
      {section('Ratings', (<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>{F('rating_google','Google','',0.1)}{F('rating_yelp','Yelp','',0.1)}{F('rating_opentable','OpenTable','',0.1)}</div>))}
      {error && <div className="alert alert-red"><span>⚠</span>{error}</div>}
      <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:4 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save week'}</button>
    </div>
  );
}


// Targets configuration modal
function TargetsModal({ targets, onSave, onClose }) {
  const [form, setForm] = useState({
    bar_cost_pct:  targets.bar_cost_pct  ?? 22,
    food_cost_pct: targets.food_cost_pct ?? 18,
    foh_pct:       targets.foh_pct       ?? 15,
    boh_pct:       targets.boh_pct       ?? 15,
  });
  const F = (key, label, hint) => (
    <div className="form-group" style={{ marginBottom:12 }}>
      <label className="form-label" style={{ display:'flex', justifyContent:'space-between' }}>
        <span>{label}</span>
        <span style={{ color:'var(--ink3)', fontFamily:'var(--mono)', fontSize:11 }}>{hint}</span>
      </label>
      <div style={{ position:'relative' }}>
        <input className="form-input" type="number" step="0.5" min="0" max="100"
          value={form[key]} onChange={e => setForm(p => ({...p, [key]: parseFloat(e.target.value)||0}))}
          style={{ fontFamily:'var(--mono)', paddingRight:28 }}/>
        <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink3)', fontSize:12 }}>%</span>
      </div>
    </div>
  );
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:400, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>Cost targets</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px' }}>
          <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:16, lineHeight:1.6 }}>
            Set your target cost percentages. These are used to color-code metrics and draw target lines on charts.
          </div>
          {F('bar_cost_pct',  'Bar / Liquor cost %', 'industry avg 20–24%')}
          {F('food_cost_pct', 'Food cost %',          'industry avg 16–20%')}
          {F('foh_pct',       'FOH labor %',          'industry avg 13–17%')}
          {F('boh_pct',       'BOH labor %',          'industry avg 12–16%')}
        </div>
        <div style={{ padding:'0 22px 18px', display:'flex', gap:8 }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={() => { onSave(form); onClose(); }}>Save targets</button>
        </div>
      </div>
    </div>
  );
}

// Main page
export default function Agent2Financial() {
  const { location: selectedLocationId, setLocation } = useAuth();
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEntry, setShowEntry] = useState(false);
  // Phase 2: the tab lives in the URL (/financial/:tab)
  const { tab: _urlTab } = useParams();
  const _nav = useNavigate();
  const _navLoc = useLocation();
  const activeTab = _urlTab || 'overview';
  const setActiveTab = (t) => _nav('/financial/' + t);
  useEffect(() => { // backcompat: old ?tab= links redirect to the path form
    const t = new URLSearchParams(_navLoc.search).get('tab');
    if (t) _nav('/financial/' + t, { replace: true });
  }, [_navLoc.search]);
  const [toast, setToast] = useState(null);
  const [allLocations, setAllLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  // Configurable targets — stored in localStorage per location
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pulse_kpi_targets')||'{}'); } catch{ return {}; }
  });
  const [showTargets, setShowTargets] = useState(false);
  const getTarget = (key) => targets[key] ?? { bar_cost_pct:22, food_cost_pct:18, foh_pct:15, boh_pct:15 }[key] ?? null;
  const saveTargets = (t) => { setTargets(t); localStorage.setItem('pulse_kpi_targets', JSON.stringify(t)); };

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    locationsApi.list().then(locs => {
      setAllLocations(locs);
      const active = selectedLocationId ? locs.find(l => l.id === selectedLocationId) : locs[0];
      setCurrentLocation(active || locs[0] || null);
    }).catch(() => {});
  }, [selectedLocationId]);

  const loadData = useCallback(async () => {
    // Don't run before locations list has been fetched
    if (allLocations.length === 0) return;
    setLoading(true);
    try {
      const locationId = currentLocation?.id || null;
      const d = await agent2.weeklyData(locationId).catch(err => { console.error('weeklyData error:', err); return { weeks: [] }; });
      const rows = d?.weeks || (Array.isArray(d) ? d : []);
      setWeeks(rows.map(normalizeWeek));
    } catch(e) { console.error('loadData error:', e); setWeeks([]); }
    finally { setLoading(false); }
  }, [currentLocation]);

  useEffect(() => { loadData(); }, [loadData]);

  // Week picker — null means "latest week with data"
  const [selectedWeek, setSelectedWeek] = useState(null);
  useEffect(() => { setSelectedWeek(null); }, [currentLocation]);

  // Use most recent week that has at least sales data; for labor use most recent week with labor
  const latestCurr = [...weeks].reverse().find(w => w.total_sales) || weeks[weeks.length - 1] || {};
  const curr = (selectedWeek && weeks.find(w => w.week_start === selectedWeek)) || latestCurr;
  const prev = weeks[weeks.indexOf(curr) - 1] || {};
  const isPastWeek = !!selectedWeek && curr.week_start !== latestCurr.week_start;

  const tabs = [
    { key: 'overview',  label: 'Overview' },
    { key: '4week',     label: 'Monthly comparison' },
    { key: 'sales',     label: 'Sales trends' },
    { key: 'costs',     label: 'Cost analysis' },
    { key: 'ratings',   label: 'Ratings' },
    { key: 'events',    label: 'Events' },
    { key: 'cash',      label: 'Cash' },
    { key: 'history',   label: 'All weeks' },
  ];

  if (loading && weeks.length === 0) return (
    <><div className="topbar"><div className="topbar-left"><div style={{ flexBasis:'100%', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:3 }}>Business Health &amp; KPIs <span style={{ color:'var(--gold)' }}>▸ {((tabs.find(t=>t.key===activeTab)||{}).label||activeTab).replace(/^[^A-Za-z]+/,'')}</span></div>
<h1 className="page-title">Business Health & KPIs</h1></div></div><div className="content"><div className="spinner"/></div></>
  );

  const dEl = (curr, prev) => {
    const v = delta(curr, prev);
    if (!v) return null;
    const up = parseFloat(v) > 0;
    return <span className={up ? 'delta-up' : 'delta-down'} style={{ fontFamily:'var(--mono)', fontSize:11 }}>{up?'▲':'▼'}{Math.abs(v)}%</span>;
  };

  // Calendar month builder — groups weeks by the month their Monday falls in
  const buildMonthPeriod = (wks, monthLabel) => {
    const valid = wks.filter(w => w.total_sales);
    if (!valid.length) return null;
    const sum = (key) => valid.reduce((a, w) => a + (w[key] || 0), 0);
    const avg = (key) => { const vals = valid.filter(w => w[key]!=null).map(w=>w[key]); return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null; };
    const totalSales=sum('total_sales'), totalBar=sum('bar_net_sales'), totalFood=sum('food_net_sales');
    const totalFoh=sum('foh_labor'), totalBoh=sum('boh_labor');
    const totalBarOrd  = sum('bar_ordering');
    const totalKitOrd  = sum('kitchen_ordering');
    // Bar/food cost %: use ordering/sales if available, else weighted avg of weekly pcts
    const barCostPct  = totalBarOrd && totalBar
      ? (totalBarOrd / totalBar * 100)
      : (totalSales ? valid.filter(w=>w.bar_cost_pct!=null).reduce((a,w)=>a+(w.bar_cost_pct*(w.total_sales||0)),0) / totalSales : null);
    const foodCostPct = totalKitOrd && totalFood
      ? (totalKitOrd / totalFood * 100)
      : (totalSales ? valid.filter(w=>w.food_cost_pct!=null).reduce((a,w)=>a+(w.food_cost_pct*(w.total_sales||0)),0) / totalSales : null);
    return {
      monthLabel,
      start: wks[0]?.week_start?.slice(0,10),
      end:   wks[wks.length-1]?.week_start?.slice(0,10),
      weeks: wks.length,
      total_sales: totalSales, bar_net_sales: totalBar, food_net_sales: totalFood,
      avg_total_sales: valid.length ? totalSales/valid.length : null,
      bar_cost_pct:  barCostPct  != null ? parseFloat(barCostPct.toFixed(2))  : null,
      food_cost_pct: foodCostPct != null ? parseFloat(foodCostPct.toFixed(2)) : null,
      bar_ordering: totalBarOrd || null,
      kitchen_ordering: totalKitOrd || null,
      foh_pct:       totalSales ? (totalFoh/totalSales*100)    : null,
      boh_pct:       totalSales ? (totalBoh/totalSales*100)    : null,
      foh_labor: totalFoh, boh_labor: totalBoh,
      event_inquiries: sum('event_inquiries'), event_converted: sum('event_converted'), event_revenue: sum('event_revenue'),
      rating_google: avg('rating_google'), rating_yelp: avg('rating_yelp'), rating_opentable: avg('rating_opentable'),
      cash_deposited: sum('cash_deposited'), cash_spent: sum('cash_spent'),
    };
  };

  // Group weeks by calendar month
  const monthMap = {};
  weeks.forEach(w => {
    if (!w.week_start) return;
    const d = new Date(w.week_start + 'T12:00');
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(w);
  });
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periods = Object.keys(monthMap).sort().map(k => {
    const [yr, mo] = k.split('-');
    const label = MONTH_NAMES[parseInt(mo)-1] + ' ' + yr;
    return buildMonthPeriod(monthMap[k], label);
  }).filter(Boolean);
  const latest4 = periods[periods.length-1];
  const prior4  = periods[periods.length-2];

  const pctChg = (curr, prev) => (!prev||!curr) ? null : ((curr-prev)/Math.abs(prev)*100);

  const FOUR_WEEK_METRICS = [
    { key:'total_sales',     label:'Total sales',       format:'dollar', inverted:false, section:'── Sales' },
    { key:'bar_net_sales',   label:'Bar sales',         format:'dollar', inverted:false },
    { key:'food_net_sales',  label:'Food sales',        format:'dollar', inverted:false },
    { key:'avg_total_sales', label:'Avg weekly sales',  format:'dollar', inverted:false },
    { key:'bar_cost_pct',    label:'Bar / Liquor cost %', format:'pct',    inverted:true,  section:'── Cost %' },
    { key:'food_cost_pct',   label:'Food cost %',          format:'pct',    inverted:true },
    { key:'bar_ordering',    label:'Bar / Liquor cost $',  format:'dollar', inverted:true },
    { key:'kitchen_ordering',label:'Food cost $',          format:'dollar', inverted:true },
    { key:'foh_pct',         label:'FOH labor %',       format:'pct',    inverted:true,  section:'── Labor' },
    { key:'boh_pct',         label:'BOH labor %',       format:'pct',    inverted:true },
    { key:'foh_labor',       label:'FOH labor $',       format:'dollar', inverted:true },
    { key:'boh_labor',       label:'BOH labor $',       format:'dollar', inverted:true },
    { key:'event_inquiries', label:'Inquiries',         format:'int',    inverted:false, section:'── Events' },
    { key:'event_converted', label:'Converted',         format:'int',    inverted:false },
    { key:'event_revenue',   label:'Event revenue',     format:'dollar', inverted:false },
    { key:'rating_google',   label:'Google rating',     format:'rating', inverted:false, section:'── Ratings' },
    { key:'rating_yelp',     label:'Yelp rating',       format:'rating', inverted:false },
    { key:'rating_opentable',label:'OpenTable rating',  format:'rating', inverted:false },
    { key:'cash_deposited',  label:'Cash deposited',    format:'dollar', inverted:false, section:'── Cash' },
    { key:'cash_spent',      label:'Cash spent',        format:'dollar', inverted:true },
  ];

  const fmtVal = (val, format) => {
    if (val==null) return '—';
    if (format==='dollar') return fmt$(val);
    if (format==='pct')    return fmtPct(val);
    if (format==='rating') return Number(val).toFixed(2)+'★';
    if (format==='int')    return Math.round(val).toString();
    return String(val);
  };
  const TARGETS4 = { bar_cost_pct: getTarget('bar_cost_pct'), food_cost_pct: getTarget('food_cost_pct'), foh_pct: getTarget('foh_pct'), boh_pct: getTarget('boh_pct'), rating_google:4.0, rating_yelp:3.9, rating_opentable:4.3 };
  const cellColor4 = (key, val, format) => {
    if (val==null) return 'var(--ink)';
    const t = TARGETS4[key]; if (!t) return 'var(--ink)';
    if (format==='pct')    return val<=t ? 'var(--green)' : val<=t+3 ? 'var(--amber)' : 'var(--red)';
    if (format==='rating') return val>=t ? 'var(--green)' : val>=t-0.2 ? 'var(--amber)' : 'var(--red)';
    return 'var(--ink)';
  };
  const changeCell4 = (curr, prev, inverted=false) => {
    const pct = pctChg(curr, prev);
    if (pct==null) return <span style={{ color:'var(--ink4)' }}>—</span>;
    const better = inverted ? pct<0 : pct>0;
    const color = Math.abs(pct)<1 ? 'var(--ink3)' : better ? 'var(--green)' : 'var(--red)';
    return <span style={{ fontFamily:'var(--mono)', fontSize:10, color, fontWeight:500 }}>{pct>0?'▲':'▼'}{Math.abs(pct).toFixed(1)}%</span>;
  };
  const MiniTrend4 = ({ metric, inverted }) => {
    const vals = periods.map(p => p?.[metric]).filter(v => v!=null);
    if (vals.length < 2) return null;
    const min=Math.min(...vals), max=Math.max(...vals), range=max-min||1;
    const W=56, H=18;
    const pts = vals.map((v,i) => `${(i/(vals.length-1))*W},${H-((v-min)/range*(H-4))-2}`).join(' ');
    const last=vals[vals.length-1], prev2=vals[vals.length-2];
    const color = last>prev2 ? (inverted?'var(--red)':'var(--green)') : last<prev2 ? (inverted?'var(--green)':'var(--red)') : 'var(--ink3)';
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:W, height:H, display:'inline-block' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx={(vals.length-1)/(vals.length-1)*W} cy={H-((last-min)/range*(H-4))-2} r="2" fill={color}/>
      </svg>
    );
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Business Health & KPIs — {currentLocation?.name || '…'}</h1>
          <div className="page-sub">{weeks.length} weeks · {isPastWeek ? 'viewing' : 'last'}: {curr.week_start?.slice(0,10) || 'none'}</div>
        </div>
        <div className="topbar-right">
          {weeks.length > 0 && (
            <select className="form-input" style={{ width:'auto', padding:'6px 10px', fontSize:12, fontFamily:'var(--mono)' }}
              value={selectedWeek || ''} onChange={e => setSelectedWeek(e.target.value || null)} title="View a past week">
              <option value="">Latest week</option>
              {[...weeks].reverse().map(w => w.week_start ? (
                <option key={w.week_start} value={w.week_start}>
                  Wk {w.week_start.slice(0,10)}{w.week_start === latestCurr.week_start ? ' (latest)' : ''}
                </option>
              ) : null)}
            </select>
          )}
          {allLocations.length > 1 && (
            <span className="btn" style={{ cursor:'default', opacity:.9 }} title="Change restaurant from the sidebar">📍 {currentLocation?.name || 'All restaurants'}</span>
          )}
          <button className="btn" onClick={() => setShowTargets(true)}>⚙ Targets</button>
          <button className="btn" onClick={loadData}>↻</button>
          <button className="btn btn-primary" onClick={() => setShowEntry(true)}>+ Enter week</button>
        </div>
      </div>


      <div className="content">
        {weeks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">No data for {currentLocation?.name}</div>
            <div className="empty-state-sub" style={{ marginBottom:16 }}>Enter your first week or run the import script</div>
            <button className="btn btn-primary" onClick={() => setShowEntry(true)}>+ Enter this week</button>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <>
                {isPastWeek && (
                  <div style={{ background:'var(--gold-bg)', border:'1px solid var(--gold-border)', borderRadius:6, padding:'9px 14px', marginBottom:14, fontSize:12, color:'var(--gold)', display:'flex', alignItems:'center', gap:10 }}>
                    <span>⏱ Viewing week of <strong>{curr.week_start?.slice(0,10)}</strong>{prev.week_start ? <> — deltas vs prior week {prev.week_start.slice(0,10)}</> : null}</span>
                    <button className="btn btn-sm" style={{ marginLeft:'auto' }} onClick={() => setSelectedWeek(null)}>Back to latest</button>
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
                  {[
                    { label:'Total sales',  val:fmtK(curr.total_sales),    delta:dEl(curr.total_sales,prev.total_sales),      note: curr.week_start ? 'Wk ' + curr.week_start.slice(0,10) : 'No data' },
                    { label:'Bar cost %',   val:fmtPct(curr.bar_cost_pct), color:pctColor(curr.bar_cost_pct, getTarget('bar_cost_pct')),   note:'Target ' + fmtPct(getTarget('bar_cost_pct')), actual: curr.bar_cost   != null ? fmtK(curr.bar_cost)   : null },
                    { label:'Food cost %',  val:fmtPct(curr.food_cost_pct), color:pctColor(curr.food_cost_pct, getTarget('food_cost_pct')), note:'Target ' + fmtPct(getTarget('food_cost_pct')), actual: curr.food_cost  != null ? fmtK(curr.food_cost)  : null },
                    { label:'FOH labor %',  val:fmtPct(curr.foh_pct),       color:pctColor(curr.foh_pct, getTarget('foh_pct')),             note:'Target ' + fmtPct(getTarget('foh_pct')),       actual: curr.foh_labor  != null ? fmtK(curr.foh_labor)  : null },
                    { label:'BOH labor %',  val:fmtPct(curr.boh_pct),       color:pctColor(curr.boh_pct, getTarget('boh_pct')),             note:'Target ' + fmtPct(getTarget('boh_pct')),       actual: curr.boh_labor  != null ? fmtK(curr.boh_labor)  : null },
                  ].map((s,i) => (
                    <div key={i} className="stat-card">
                      <div className="stat-label">{s.label}</div>
                      <div className="stat-value" style={s.color?{color:s.color}:{}}>{s.val}</div>
                      {s.actual != null && (
                        <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:600, color:'var(--ink-2)', marginTop:1 }}>{s.actual}</div>
                      )}
                      <div className="stat-delta delta-muted" style={{ display:'flex', alignItems:'center', gap:6 }}>{s.delta} <span>{s.note}</span></div>
                    </div>
                  ))}
                </div>
                <div className="grid-2">
                  <div className="card-raised" style={{ gridColumn:'1/-1' }}>
                    <div className="card-header">
                      <span className="card-title">Weekly sales</span>
                      <div style={{ display:'flex', gap:16, fontSize:11 }}>
                        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:2, background:'var(--chart-bar)', display:'inline-block', borderRadius:1 }}/> Total</span>
                        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:2, background:'var(--chart-food)', display:'inline-block', borderRadius:1 }}/> Food only</span>
                      </div>
                    </div>
                    <div className="card-body" style={{ paddingBottom:10 }}><StackedAreaChart weeks={weeks} targets={targets}/></div>
                  </div>
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Cost % — this week</span></div>
                    <div className="card-body">
                      <BulletChart label="Bar cost %" value={curr.bar_cost_pct} target={getTarget('bar_cost_pct')} max={40} good={getTarget('bar_cost_pct')-4} warn={getTarget('bar_cost_pct')+3}/>
                      <BulletChart label="Food cost %" value={curr.food_cost_pct} target={getTarget('food_cost_pct')} max={35} good={getTarget('food_cost_pct')-3} warn={getTarget('food_cost_pct')+4}/>
                      <BulletChart label="FOH labor %" value={curr.foh_pct} target={getTarget('foh_pct')} max={25} good={getTarget('foh_pct')-2} warn={getTarget('foh_pct')+2}/>
                      <BulletChart label="BOH labor %" value={curr.boh_pct} target={getTarget('boh_pct')} max={25} good={getTarget('boh_pct')-3} warn={getTarget('boh_pct')+3}/>
                    </div>
                  </div>
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Rating trends</span></div>
                    <div className="card-body" style={{ paddingBottom:10 }}>
                      <RatingChart weeks={weeks}/>
                      <div style={{ display:'flex', justifyContent:'space-around', marginTop:10 }}>
                        {[{label:'Google',key:'rating_google',color:'#4285F4'},{label:'Yelp',key:'rating_yelp',color:'#d32323'},{label:'OpenTable',key:'rating_opentable',color:'var(--gold)'}].map(p => {
                          const last = [...weeks].reverse().find(w => w[p.key])?.[p.key];
                          return (<div key={p.key} style={{ textAlign:'center' }}><div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:500, color:p.color }}>{last ? Number(last).toFixed(1) : '—'}★</div><div style={{ fontSize:10, color:'var(--ink3)' }}>{p.label}</div></div>);
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Labor heat — all weeks</span></div>
                    <div className="card-body">
                      <HeatCalendar weeks={weeks} metric="foh_pct" label="FOH %" target={15}/>
                      <div style={{ marginTop:14 }}><HeatCalendar weeks={weeks} metric="boh_pct" label="BOH %" target={15}/></div>
                    </div>
                  </div>
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Event pipeline — last 12 weeks</span></div>
                    <div className="card-body"><EventFunnel weeks={weeks}/></div>
                  </div>
                </div>
              </>
            )}

            {/* MONTHLY COMPARISON */}
            {activeTab === '4week' && (
              <div>
                {periods.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-title">No monthly data yet — enter a few weeks first</div></div>
                ) : (
                  <div className="card-raised">
                    <div className="card-header">
                      <span className="card-title">Month-over-month comparison</span>
                      <span style={{ fontSize:11, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{periods.length} months · most recent →</span>
                    </div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth: periods.length * 110 + 180 }}>
                        <thead>
                          <tr style={{ background:'var(--bg)' }}>
                            <th style={{ padding:'10px 18px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'2px solid var(--border)', position:'sticky', left:0, background:'var(--bg)', minWidth:160, zIndex:1 }}>Metric</th>
                            {periods.map((p, i) => (
                              <th key={i} style={{ padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:700, color: i===periods.length-1 ? 'var(--gold)' : 'var(--ink)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap', background: i===periods.length-1 ? 'rgba(184,116,26,.06)' : '', minWidth:100 }}>
                                {p.monthLabel}
                                {i===periods.length-1 && <div style={{ fontSize:9, fontWeight:500, color:'var(--gold)', marginTop:2 }}>current</div>}
                              </th>
                            ))}
                            <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid var(--border)', minWidth:56 }}>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FOUR_WEEK_METRICS.map((m) => (
                            <React.Fragment key={m.key}>
                              {m.section && (
                                <tr>
                                  <td colSpan={periods.length + 2} style={{ padding:'10px 18px 4px', background:'var(--bg)', fontSize:9, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.12em', fontFamily:'var(--mono)', borderTop:'2px solid var(--border)' }}>
                                    {m.section.replace('── ','')}
                                  </td>
                                </tr>
                              )}
                              <tr onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''} style={{ borderBottom:'1px solid var(--border)' }}>
                                <td style={{ padding:'9px 18px', fontWeight:500, fontSize:11, color:'var(--ink)', position:'sticky', left:0, background:'inherit', zIndex:1 }}>{m.label}</td>
                                {periods.map((p, i) => {
                                  const val  = p?.[m.key];
                                  const prev = periods[i-1]?.[m.key];
                                  const isLatest = i === periods.length - 1;
                                  const valColor = cellColor4(m.key, val, m.format);
                                  // MoM change arrow
                                  let chgEl = null;
                                  if (i > 0 && val != null && prev != null) {
                                    const diff = m.format === 'pct' ? (val - prev) : pctChg(val, prev);
                                    const better = m.inverted ? diff < 0 : diff > 0;
                                    const chgColor = Math.abs(diff) < 0.5 ? 'var(--ink3)' : better ? 'var(--green)' : 'var(--red)';
                                    const arrow = diff > 0 ? '▲' : '▼';
                                    const display = m.format === 'pct'
                                      ? `${arrow}${Math.abs(diff).toFixed(1)}pp`
                                      : `${arrow}${Math.abs(diff).toFixed(1)}%`;
                                    chgEl = <div style={{ fontSize:10, color:chgColor, fontWeight:600, marginTop:1 }}>{display}</div>;
                                  }
                                  return (
                                    <td key={i} style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--mono)', background: isLatest ? 'rgba(184,116,26,.04)' : '' }}>
                                      <div style={{ fontSize:13, fontWeight: isLatest ? 700 : 400, color: valColor }}>{fmtVal(val, m.format)}</div>
                                      {chgEl}
                                    </td>
                                  );
                                })}
                                <td style={{ padding:'9px 14px', textAlign:'center' }}><MiniTrend4 metric={m.key} inverted={m.inverted}/></td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding:'10px 18px', fontSize:10, color:'var(--ink3)', borderTop:'1px solid var(--border)' }}>
                      ▲▼ = month-over-month change · pp = percentage points · % = relative change · colors vs targets
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SALES TRENDS */}
            {activeTab === 'sales' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="card-raised"><div className="card-header"><span className="card-title">Total sales — all weeks</span></div><div className="card-body"><StackedAreaChart weeks={weeks} targets={targets}/></div></div>
                <div className="card-raised">
                  <div className="card-header"><span className="card-title">Sales detail</span></div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead><tr style={{ background:'var(--bg)' }}>{['Week','Bar sales','Food sales','Total','vs prior'].map(h => <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...weeks].reverse().map((w, i) => {
                          const prevW = [...weeks].reverse()[i+1];
                          const d = delta(w.total_sales, prevW?.total_sales);
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                              <td style={{ padding:'10px 16px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{w.week_start?.slice(0,10)}</td>
                              <td style={{ padding:'10px 16px', fontFamily:'var(--mono)' }}>{fmt$(w.bar_net_sales)}</td>
                              <td style={{ padding:'10px 16px', fontFamily:'var(--mono)' }}>{fmt$(w.food_net_sales)}</td>
                              <td style={{ padding:'10px 16px', fontFamily:'var(--mono)', fontWeight:600 }}>{fmt$(w.total_sales)}</td>
                              <td style={{ padding:'10px 16px', fontFamily:'var(--mono)', color:d?(parseFloat(d)>0?'var(--green)':'var(--red)'):'var(--ink3)' }}>{d?`${parseFloat(d)>0?'▲':'▼'}${Math.abs(d)}%`:'—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* COST ANALYSIS */}
            {activeTab === 'costs' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { metric:'bar_cost_pct',  label:'Bar cost %',  target:22, max:45, good:18, warn:25 },
                  { metric:'food_cost_pct', label:'Food cost %', target:18, max:35, good:15, warn:22 },
                  { metric:'foh_pct',       label:'FOH labor %', target:15, max:25, good:13, warn:17 },
                  { metric:'boh_pct',       label:'BOH labor %', target:15, max:28, good:12, warn:18 },
                ].map(cfg => (
                  <div key={cfg.metric} className="card-raised">
                    <div className="card-header"><span className="card-title">{cfg.label}</span><span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:500, color:pctColor(curr[cfg.metric],cfg.target) }}>{fmtPct(curr[cfg.metric])}</span></div>
                    <div className="card-body">
                      <BulletChart label="This week" value={curr[cfg.metric]} target={cfg.target} max={cfg.max} good={cfg.good} warn={cfg.warn}/>
                      <HeatCalendar weeks={weeks} metric={cfg.metric} label="36-week heat map" target={cfg.target}/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* RATINGS */}
            {activeTab === 'ratings' && (
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Rating trends — all platforms</span></div>
                <div className="card-body">
                  <RatingChart weeks={weeks}/>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:20 }}>
                    {[{label:'Google',key:'rating_google',color:'#4285F4',target:4.0},{label:'Yelp',key:'rating_yelp',color:'#d32323',target:3.9},{label:'OpenTable',key:'rating_opentable',color:'var(--gold)',target:4.4}].map(p => {
                      const vals = weeks.filter(w=>w[p.key]).map(w=>Number(w[p.key]));
                      const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
                      const last = vals[vals.length-1]?.toFixed(1);
                      return (
                        <div key={p.key} className="stat-card" style={{ textAlign:'center' }}>
                          <div className="stat-label">{p.label}</div>
                          <div className="stat-value" style={{ color:p.color, fontSize:32 }}>{last||'—'}★</div>
                          <div className="stat-delta delta-muted">avg {avg||'—'} · target {p.target}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* EVENTS */}
            {activeTab === 'events' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:14 }}>
                <div className="card-raised"><div className="card-header"><span className="card-title">Pipeline summary</span></div><div className="card-body"><EventFunnel weeks={weeks}/></div></div>
                <div className="card-raised">
                  <div className="card-header"><span className="card-title">Events by week</span></div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead><tr style={{ background:'var(--bg)' }}>{['Week','Inquiries','Converted','Conv %','Revenue','$/event'].map(h => <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...weeks].reverse().filter(w=>w.event_inquiries||w.event_revenue).map((w,i) => {
                          const conv = w.event_inquiries ? ((w.event_converted||0)/w.event_inquiries*100).toFixed(0) : null;
                          const perEvent = w.event_converted ? (w.event_revenue/w.event_converted) : null;
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{w.week_start?.slice(0,10)}</td>
                              <td style={{ padding:'9px 14px' }}>{w.event_inquiries||'—'}</td>
                              <td style={{ padding:'9px 14px', color:'var(--green)' }}>{w.event_converted||'—'}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:conv>=40?'var(--green)':conv<25?'var(--red)':'var(--amber)' }}>{conv?conv+'%':'—'}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{fmt$(w.event_revenue)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{fmt$(perEvent)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* CASH */}
            {activeTab === 'cash' && (
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
                <div className="card-raised">
                  <div className="card-header"><span className="card-title">Cash reconciliation</span></div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead><tr style={{ background:'var(--bg)' }}>{['Week','Deposited','In Toast','Variance','Spent','Notes'].map(h => <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...weeks].reverse().filter(w=>w.cash_deposited||w.cash_in_toast).map((w,i) => {
                          const variance = (w.cash_deposited||0)-(w.cash_in_toast||0);
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{w.week_start?.slice(0,10)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{fmt$(w.cash_deposited)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{fmt$(w.cash_in_toast)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:Math.abs(variance)<50?'var(--green)':'var(--red)' }}>{variance>0?'+':''}{fmt$(variance)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--red)' }}>{fmt$(w.cash_spent)}</td>
                              <td style={{ padding:'9px 14px', fontSize:11, color:'var(--ink2)', maxWidth:180 }}>{w.cash_notes||'—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card-raised"><div className="card-header"><span className="card-title">Cash flow — last 8 weeks</span></div><div className="card-body"><CashWaterfall weeks={weeks}/></div></div>
              </div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
              <div className="card-raised">
                <div className="card-header"><span className="card-title">All weeks</span></div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'var(--bg)' }}>
                        {['Week','Total','Bar','Food','Bar%','Food%','FOH%','BOH%','Events','Conv%','G★','Y★','OT★'].map(h => (
                          <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...weeks].reverse().map((w, i) => {
                        const conv = w.event_inquiries ? ((w.event_converted||0)/w.event_inquiries*100).toFixed(0) : null;
                        return (
                          <tr key={i} title="Click to view this week in Overview" style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                            onClick={() => { if (w.week_start) { setSelectedWeek(w.week_start); setActiveTab('overview'); } }}
                            onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:'var(--ink3)' }}>{w.week_start?.slice(0,10)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', fontWeight:600 }}>{fmtK(w.total_sales)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)' }}>{fmtK(w.bar_net_sales)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)' }}>{fmtK(w.food_net_sales)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:pctColor(w.bar_cost_pct,22) }}>{fmtPct(w.bar_cost_pct)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:pctColor(w.food_cost_pct,18) }}>{fmtPct(w.food_cost_pct)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:pctColor(w.foh_pct,15) }}>{fmtPct(w.foh_pct)}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:pctColor(w.boh_pct,15) }}>{fmtPct(w.boh_pct)}</td>
                            <td style={{ padding:'8px 12px', textAlign:'center' }}>{w.event_inquiries||'—'}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:conv>=40?'var(--green)':conv<25?'var(--red)':'var(--amber)' }}>{conv?conv+'%':'—'}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:w.rating_google>=4?'var(--green)':'var(--red)' }}>{w.rating_google?Number(w.rating_google).toFixed(1):'—'}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:w.rating_yelp>=3.9?'var(--green)':'var(--red)' }}>{w.rating_yelp?Number(w.rating_yelp).toFixed(1):'—'}</td>
                            <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:w.rating_opentable>=4.3?'var(--green)':'var(--red)' }}>{w.rating_opentable?Number(w.rating_opentable).toFixed(1):'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showEntry && (
        <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:48, overflowY:'auto' }}>
          <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:560, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
            <div style={{ padding:'20px 22px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ fontFamily:'var(--serif)', fontSize:22, fontStyle:'italic' }}>Enter weekly data</h2>
              <button onClick={() => setShowEntry(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'18px 22px 22px' }}>
              <EntryForm location_id={currentLocation?.id} onSaved={() => { setShowEntry(false); loadData(); showToast('Week saved'); }}/>
            </div>
          </div>
        </div>
      )}

      {showTargets && (
        <TargetsModal
          targets={targets}
          onSave={saveTargets}
          onClose={() => setShowTargets(false)}
        />
      )}

      {toast && (
        <div className="toast" style={{ background:toast.err?'var(--red)':'var(--ink)' }}>
          {toast.err?'⚠':'✓'} {toast.msg}
        </div>
      )}
    </>
  );
}
