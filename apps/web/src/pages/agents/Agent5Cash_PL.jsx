import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { agent5, locations as locationsApi } from '../../lib/api.js';
import { useAuth } from '../../App.jsx';

// ── Categories ────────────────────────────────────────────────────────────────
const PL_CATS = [
  { key:'revenue',          label:'Revenue',              color:'var(--green)', sign:+1, section:null },
  { key:'cogs',             label:'Cost of Goods',        color:'#E8A020',      sign:-1, section:'Cost of Sales' },
  { key:'labor',            label:'Labor',                color:'#E8A020',      sign:-1, section:null },
  { key:'rent',             label:'Rent & Lease',         color:'#4A90D9',      sign:-1, section:'Operating Expenses' },
  { key:'utilities',        label:'Utilities',            color:'#4A90D9',      sign:-1, section:null },
  { key:'insurance',        label:'Insurance',            color:'#4A90D9',      sign:-1, section:null },
  { key:'repairs',          label:'Maintenance & Repairs',color:'#4A90D9',      sign:-1, section:null },
  { key:'credit_card_fees', label:'Credit Card Fees',     color:'#4A90D9',      sign:-1, section:null },
  { key:'professional_fees',label:'Professional Fees',    color:'#4A90D9',      sign:-1, section:null },
  { key:'supplies',         label:'Supplies',             color:'#4A90D9',      sign:-1, section:null },
  { key:'marketing',        label:'Marketing',            color:'#4A90D9',      sign:-1, section:null },
  { key:'other',            label:'Other Expenses',       color:'var(--ink-3)', sign:-1, section:null },
  { key:'excluded',         label:'Not P&L (Personal/Non-biz)', color:'var(--ink-4)', sign:0,  section:null },
  { key:'transfer',         label:'Transfer (skip)',         color:'var(--ink-4)', sign:0,  section:null },
];
const EXPENSE_CATS = PL_CATS.filter(c => c.sign === -1).map(c => c.key);
// Note: allCats is computed inside the component to include custom categories

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$    = n => n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits:0 });
const fmtFull = n => n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtPct  = n => n == null ? '—' : Number(n).toFixed(1) + '%';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';

function momChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function ChangeArrow({ pct, inverted, size = 11 }) {
  if (pct == null) return null;
  const better = inverted ? pct < 0 : pct > 0;
  const color = Math.abs(pct) < 1 ? 'var(--ink-3)' : better ? 'var(--green)' : 'var(--red)';
  return (
    <span style={{ fontFamily:'var(--mono)', fontSize:size, color, fontWeight:600, marginLeft:4 }}>
      {pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Insight({ label, value, target, inverted, fmt='pct' }) {
  const v = fmt === 'pct' ? fmtPct(value) : fmt$(value);
  const ok = target == null ? null : inverted ? value <= target : value >= target;
  const color = ok === null ? 'var(--ink)' : ok ? 'var(--green)' : 'var(--red)';
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
      <span style={{ color:'var(--ink-2)' }}>{label}</span>
      <span style={{ fontFamily:'var(--mono)', fontWeight:600, color }}>
        {v}
        {target != null && <span style={{ fontSize:10, color:'var(--ink-4)', marginLeft:4 }}>/ {fmt === 'pct' ? fmtPct(target) : fmt$(target)}</span>}
      </span>
    </div>
  );
}

// ── Monthly P&L table ─────────────────────────────────────────────────────────
function MonthlyTable({ periods, targets }) {
  if (!periods || periods.length === 0) {
    return (
      <div className="empty-state" style={{padding:60}}>
        <div className="empty-state-icon">🏦</div>
        <div className="empty-state-title">No bank transactions yet</div>
        <div className="empty-state-sub" style={{maxWidth:400}}>
          Connect your bank account via the Accounts tab to pull transactions automatically,
          or use "Import statement" to upload a CSV/PDF from your bank.
        </div>
      </div>
    );
  }

  const ROWS = [
    { key:'revenue',         label:'Revenue',              bold:false, section:'Revenue',           inverted:false },
    { key:'cogs',            label:'Cost of Goods',        bold:false, section:'Cost of Sales',     inverted:true  },
    { key:'labor',           label:'Labor',                bold:false, section:null,                inverted:true,  target: targets?.laborCostPct },
    { key:'gross_profit',    label:'Gross Profit',         bold:true,  section:null,                inverted:false, computed:true },
    { key:'rent',            label:'Rent & Lease',         bold:false, section:'Operating Expenses', inverted:true },
    { key:'utilities',       label:'Utilities',            bold:false, section:null,                inverted:true  },
    { key:'insurance',       label:'Insurance',            bold:false, section:null,                inverted:true  },
    { key:'repairs',         label:'Maintenance & Repairs',bold:false, section:null,                inverted:true  },
    { key:'credit_card_fees',label:'Credit Card Fees',     bold:false, section:null,                inverted:true  },
    { key:'professional_fees',label:'Professional Fees',   bold:false, section:null,                inverted:true  },
    { key:'supplies',        label:'Supplies',             bold:false, section:null,                inverted:true  },
    { key:'marketing',       label:'Marketing',            bold:false, section:null,                inverted:true  },
    { key:'other',           label:'Other Expenses',       bold:false, section:null,                inverted:true  },
    { key:'total_expense',   label:'Total Expenses',       bold:true,  section:null,                inverted:true,  computed:true },
    { key:'net_income',      label:'Net Income',           bold:true,  section:'Bottom Line',       inverted:false, computed:true },
    { key:'net_margin_pct',  label:'Net Margin %',         bold:false, section:null,                inverted:false, pct:true },
    { key:'cogs_pct',        label:'COGS %',               bold:false, section:null,                inverted:true,  pct:true, target: targets?.foodCostPct },
    { key:'labor_pct',       label:'Labor %',              bold:false, section:null,                inverted:true,  pct:true, target: targets?.laborCostPct },
  ];

  return (
    <div className="card-raised">
      <div className="card-header">
        <span className="card-title">Month-over-month P&L</span>
        <span style={{ fontSize:11, color:'var(--ink-3)', fontFamily:'var(--mono)' }}>
          {periods.length} months · {periods[0]?.label} → {periods[periods.length-1]?.label}

        </span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth: periods.length * 110 + 220 }}>
          <thead>
            <tr style={{ background:'var(--bg)' }}>
              <th style={{ padding:'10px 18px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'2px solid var(--border)', position:'sticky', left:0, background:'var(--bg)', minWidth:190, zIndex:2 }}>
                Line item
              </th>
              {periods.map((p, i) => (
                <th key={i} style={{ padding:'10px 14px', textAlign:'right', fontSize:11, fontWeight:700, color: i===periods.length-1 ? 'var(--gold)' : 'var(--ink)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap', background: i===periods.length-1 ? 'rgba(184,116,26,.06)' : '', minWidth:110 }}>
                  {p.label}
                  {i===periods.length-1 && <div style={{ fontSize:9, fontWeight:500, color:'var(--gold)', marginTop:2 }}>current</div>}
                </th>
              ))}
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid var(--border)', minWidth:56 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <React.Fragment key={row.key}>
                {row.section && (
                  <tr>
                    <td colSpan={periods.length + 2} style={{ padding:'10px 18px 4px', fontSize:9, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.12em', fontFamily:'var(--mono)', borderTop:'2px solid var(--border)', background:'var(--bg)' }}>
                      {row.section}
                    </td>
                  </tr>
                )}
                <tr onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}
                  style={{ borderBottom:`1px solid var(--border)`, background: row.bold ? 'var(--bg)' : 'transparent' }}>
                  <td style={{ padding: row.bold ? '11px 18px' : '9px 18px', fontWeight: row.bold ? 700 : 400, fontSize: row.bold ? 13 : 12, color:'var(--ink)', position:'sticky', left:0, background:'inherit', zIndex:1 }}>
                    {row.label}
                  </td>
                  {periods.map((p, i) => {
                    const val  = p?.[row.key];
                    const prev = periods[i-1]?.[row.key];
                    const isLatest = i === periods.length - 1;
                    const isPct = row.pct;
                    const isExpense = row.inverted && !isPct && !row.computed;

                    // Color logic
                    let valColor = 'var(--ink)';
                    if (row.key === 'net_income') valColor = val >= 0 ? 'var(--green)' : 'var(--red)';
                    else if (row.key === 'revenue' || row.key === 'gross_profit') valColor = 'var(--green)';
                    else if (isPct && row.target != null) {
                      valColor = val <= row.target ? 'var(--green)' : val <= row.target * 1.15 ? 'var(--amber)' : 'var(--red)';
                    }

                    // MoM change
                    const chg = i > 0 ? momChange(val, prev) : null;

                    return (
                      <td key={i} style={{ padding: row.bold ? '11px 14px' : '9px 14px', textAlign:'right', fontFamily:'var(--mono)', background: isLatest ? 'rgba(184,116,26,.04)' : '' }}>
                        <div style={{ fontSize: row.bold ? 14 : 12, fontWeight: row.bold ? 700 : isLatest ? 600 : 400, color: valColor }}>
                          {isPct ? fmtPct(val) : fmt$(val)}
                        </div>
                        {chg != null && (
                          <ChangeArrow pct={chg} inverted={row.inverted} size={10} />
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding:'9px 14px', textAlign:'center' }}>
                    <MiniSparkline values={periods.map(p => p?.[row.key]).filter(v => v != null)} inverted={row.inverted} />
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'10px 18px', fontSize:10, color:'var(--ink-3)', borderTop:'1px solid var(--border)', display:'flex', gap:20 }}>
        <span>▲▼ = month-over-month change</span>
        <span>Colors vs targets where set</span>
        <span>Trend = {periods.length}-month sparkline</span>
      </div>
    </div>
  );
}

function MiniSparkline({ values, inverted }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const W = 52, H = 18;
  const pts = values.map((v, i) => `${(i/(values.length-1))*W},${H - ((v-min)/range*(H-4)) - 2}`).join(' ');
  const last = values[values.length-1], prev = values[values.length-2];
  const color = last > prev ? (inverted ? 'var(--red)' : 'var(--green)') : last < prev ? (inverted ? 'var(--green)' : 'var(--red)') : 'var(--ink-3)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:W, height:H, display:'inline-block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={(values.length-1)/(values.length-1)*W} cy={H-((last-min)/range*(H-4))-2} r="2" fill={color}/>
    </svg>
  );
}

// ── Insights panel ────────────────────────────────────────────────────────────
function InsightsPanel({ periods, targets }) {
  if (!periods || periods.length === 0) return null;
  const curr = periods[periods.length - 1];
  const prev = periods.length >= 2 ? periods[periods.length - 2] : null;
  if (!curr) return null;

  const insights = [];

  // Revenue trend
  const revChg = prev ? momChange(curr.revenue, prev.revenue) : null;
  if (revChg != null) {
    insights.push({
      icon: revChg >= 0 ? '📈' : '📉',
      color: revChg >= 0 ? 'var(--green)' : 'var(--red)',
      text: `Revenue ${revChg >= 0 ? 'up' : 'down'} ${Math.abs(revChg).toFixed(1)}% vs last month (${fmt$(curr.revenue)} vs ${fmt$(prev?.revenue)})`,
      priority: Math.abs(revChg) > 10 ? 'high' : 'medium',
    });
  }

  // Net margin alert
  if (curr.net_margin_pct != null) {
    const targetMargin = 100 - (targets?.foodCostPct||28) - (targets?.laborCostPct||32) - (targets?.overheadPct||15);
    if (curr.net_margin_pct < targetMargin - 3) {
      insights.push({
        icon: '⚠',
        color: 'var(--red)',
        text: `Net margin ${fmtPct(curr.net_margin_pct)} is below target ${fmtPct(targetMargin)} — review expense categories`,
        priority: 'high',
      });
    }
  }

  // Cost spikes
  const expenseChecks = [
    { key:'cogs',            label:'Food & beverage cost', target: targets?.foodCostPct, pctKey:'cogs_pct' },
    { key:'labor',           label:'Labor',                target: targets?.laborCostPct, pctKey:'labor_pct' },
    { key:'repairs',         label:'Maintenance & repairs', threshold:0.5 },
    { key:'credit_card_fees',label:'Credit card fees',      threshold:0.3 },
  ];

  for (const check of expenseChecks) {
    const chg = prev ? momChange(curr[check.key], prev[check.key]) : null;
    if (chg != null && chg > 15) {
      insights.push({
        icon: '🔺',
        color: 'var(--amber)',
        text: `${check.label} up ${chg.toFixed(1)}% this month (${fmt$(curr[check.key])} vs ${fmt$(prev[check.key])}) — investigate`,
        priority: 'medium',
      });
    }
    if (check.pctKey && curr[check.pctKey] != null && check.target != null && curr[check.pctKey] > check.target) {
      insights.push({
        icon: '📊',
        color: 'var(--amber)',
        text: `${check.label} ${fmtPct(curr[check.pctKey])} exceeds target ${fmtPct(check.target)} — review vendors or scheduling`,
        priority: 'medium',
      });
    }
  }

  // Categories with zero data (worth flagging to track)
  const missing = ['rent','insurance','utilities'].filter(k => !curr[k] || curr[k] === 0);
  if (missing.length > 0) {
    insights.push({
      icon: 'ℹ',
      color: 'var(--ink-3)',
      text: `No data for: ${missing.map(k => PL_CATS.find(c=>c.key===k)?.label).join(', ')} — add manual entries or check Plaid sync`,
      priority: 'low',
    });
  }

  if (insights.length === 0) {
    insights.push({ icon:'✓', color:'var(--green)', text:`Everything looks on track for ${curr.label}`, priority:'low' });
  }

  const sorted = [...insights].sort((a,b) => { const o={high:0,medium:1,low:2}; return o[a.priority]-o[b.priority]; });

  return (
    <div className="card-raised">
      <div className="card-header">
        <span className="card-title">⚡ Alerts & insights — {curr.label}</span>
      </div>
      <div style={{ padding:'0 16px 12px' }}>
        {sorted.map((ins, i) => (
          <div key={i} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom: i < sorted.length-1 ? '1px solid var(--border)' : 'none', alignItems:'flex-start' }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{ins.icon}</span>
            <span style={{ fontSize:12, color:'var(--ink)', lineHeight:1.6 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Current month summary cards ───────────────────────────────────────────────
function CurrentMonthCards({ curr, prev }) {
  if (!curr) return null;
  const cards = [
    { label: curr.label + ' Revenue',  val: fmt$(curr.revenue),     color:'var(--green)',  chg: momChange(curr.revenue, prev?.revenue),    inverted:false },
    { label: 'Total Expenses',         val: fmt$(curr.total_expense),color:'var(--red)',    chg: momChange(curr.total_expense, prev?.total_expense), inverted:true },
    { label: 'Net Income',             val: fmt$(curr.net_income),   color: curr.net_income >= 0 ? 'var(--green)' : 'var(--red)', chg: momChange(curr.net_income, prev?.net_income), inverted:false },
    { label: 'Net Margin',             val: fmtPct(curr.net_margin_pct), color: (curr.net_margin_pct||0) >= 8 ? 'var(--green)' : 'var(--amber)', chg: null },
    { label: 'COGS %',                 val: fmtPct(curr.cogs_pct),   color: (curr.cogs_pct||0) <= 30 ? 'var(--green)' : 'var(--red)', chg: momChange(curr.cogs_pct, prev?.cogs_pct), inverted:true },
    { label: 'Labor %',                val: fmtPct(curr.labor_pct),  color: (curr.labor_pct||0) <= 32 ? 'var(--green)' : 'var(--red)', chg: momChange(curr.labor_pct, prev?.labor_pct), inverted:true },
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
      {cards.map((c, i) => (
        <div key={i} className="stat-card">
          <div className="stat-label">{c.label}</div>
          <div className="stat-value" style={{ color:c.color, fontSize:22 }}>{c.val}</div>
          {c.chg != null && (
            <div style={{ marginTop:4, fontSize:11 }}>
              <ChangeArrow pct={c.chg} inverted={c.inverted} />
              <span style={{ color:'var(--ink-3)', fontSize:10, marginLeft:4 }}>vs last mo</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Plaid components ──────────────────────────────────────────────────────────
function PlaidLinkButton({ locationId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleConnect = async () => {
    setLoading(true); setError('');
    try {
      const { link_token } = await agent5.linkToken();
      await new Promise((res, rej) => {
        if (window.Plaid) return res();
        const s = document.createElement('script');
        s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          try { await agent5.exchangeToken({ publicToken: public_token, locationId, institutionName: metadata.institution?.name }); onSuccess(); }
          catch(e) { setError(e.message); }
        },
        onExit: (err) => { if (err) setError(err.display_message || ''); },
      });
      handler.open();
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div>
      <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>{loading ? 'Connecting…' : '+ Connect bank account'}</button>
      {error && <div style={{ fontSize:11, color:'var(--red)', marginTop:6 }}>{error}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Agent5CashPL() {
  const { location: selectedLocationId, setLocation } = useAuth();
  const [allLocations, setAllLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  // Phase 2: the tab lives in the URL (/cashpl/:tab)
  const { tab: _urlTab } = useParams();
  const _nav = useNavigate();
  const _navLoc = useLocation();
  const activeTab = _urlTab || 'monthly';
  const setActiveTab = (t) => _nav('/cashpl/' + t);
  useEffect(() => { // backcompat: old ?tab= links redirect to the path form
    const t = new URLSearchParams(_navLoc.search).get('tab');
    if (t) _nav('/cashpl/' + t, { replace: true });
  }, [_navLoc.search]);
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [connectedItems, setConnectedItems] = useState([]);
  const [targets, setTargets] = useState(() => { try { return JSON.parse(localStorage.getItem('pulse_pl_targets')||'{}'); } catch { return {}; } });
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [showManual, setShowManual]       = useState(false);
  const [customCats, setCustomCats]       = useState([]);
  const [learnedRules, setLearnedRules]   = useState([]);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const today = new Date().toISOString().slice(0,10);
  const ninetyDaysAgo = new Date(Date.now()-90*24*60*60*1000).toISOString().slice(0,10);
  const [dateFrom, setDateFrom] = useState(ninetyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  useEffect(() => {
    locationsApi.list().then(locs => {
      setAllLocations(locs);
      const active = selectedLocationId ? locs.find(l=>l.id===selectedLocationId) : locs[0];
      setCurrentLocation(active || locs[0] || null);
    }).catch(()=>{});
  }, [selectedLocationId]);

  const loadMonthly = useCallback(async () => {
    if (!currentLocation) return;
    setLoading(true);
    try {
      const data = await agent5.monthly(currentLocation.id, 6);
      setMonthlyData(data);
      const items = await agent5.items(currentLocation.id).catch(()=>[]);
      const [cats, rules] = await Promise.all([
        agent5.categories().catch(()=>[]),
        agent5.rules().catch(()=>[]),
      ]);
      setCustomCats(Array.isArray(cats) ? cats : []);
      setLearnedRules(Array.isArray(rules) ? rules : []);
      setConnectedItems(Array.isArray(items) ? items : []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentLocation]);

  const loadTransactions = useCallback(async () => {
    if (!currentLocation) return;
    try {
      const data = await agent5.transactions({ locationId:currentLocation.id, periodStart:dateFrom, periodEnd:dateTo, plCategory:txCategory||undefined, search:txSearch||undefined, limit:500 });
      setTransactions(Array.isArray(data) ? data : []);
    } catch(e) { console.error(e); }
  }, [currentLocation, txCategory, txSearch, dateFrom, dateTo]);

  useEffect(() => { loadMonthly(); }, [loadMonthly]);
  useEffect(() => { if (activeTab==='transactions') loadTransactions(); }, [activeTab, loadTransactions]);

  const handleSync = async (itemId) => {
    setSyncing(itemId);
    try {
      let res = await agent5.sync(itemId);
      if (res.synced===0) res = await agent5.syncLegacy(itemId);
      showToast(res.synced>0?`Synced ${res.synced} transactions`:'No new transactions found');
      await loadMonthly();
    } catch(e) { showToast(e.message,true); }
    finally { setSyncing(null); }
  };

  const saveTargets = (t) => { setTargets(t); localStorage.setItem('pulse_pl_targets', JSON.stringify(t)); };

  // Merge built-in and custom categories for dropdowns
  const allCats = [
    ...PL_CATS,
    ...customCats.map(c => ({ key: c.key, label: c.label, color:'var(--ink-2)', sign: c.sign ?? -1, section:null }))
  ];

  const periods   = monthlyData?.periods || [];
  const currMonth = periods[periods.length - 1];
  const prevMonth = periods[periods.length - 2];

  const TABS = [
    { key:'monthly',      label:'📊 Monthly P&L' },
    { key:'transactions', label:'💳 Transactions' },
    { key:'accounts',     label:'🏦 Accounts' },
    { key:'rules',        label:'🧠 Learned rules' },
  ];

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <div style={{ flexBasis:'100%', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:3 }}>Cash Flow &amp; Profitability <span style={{ color:'var(--gold)' }}>▸ {((TABS.find(t=>t.key===activeTab)||{}).label||activeTab).replace(/^[^A-Za-z]+/,'')}</span></div>
          <h1 className="page-title">Cash Flow & Profitability — {currentLocation?.name || '…'}</h1>
          <div className="page-sub">{currMonth ? currMonth.label + ' · ' + periods.length + ' months of bank data' : 'Connect a bank account to get started'}</div>
        </div>
        <div className="topbar-right">
          {allLocations.length > 1 && (
            <span className="btn" style={{ cursor:'default', opacity:.9 }} title="Change restaurant from the sidebar">📍 {currentLocation?.name || 'All restaurants'}</span>
          )}
          <button className="btn btn-primary" onClick={()=>setShowImport(true)}>📎 Import statement</button>
          <button className="btn" onClick={()=>setShowCatManager(true)}>🏷 Categories</button>
          <button className="btn" onClick={()=>setShowManual(true)}>+ Manual entry</button>
          <button className="btn" onClick={()=>setShowTargets(true)}>⚙ Targets</button>
          <button className="btn" onClick={loadMonthly}>↻</button>
        </div>
      </div>


      <div className="content">
        {loading && periods.length === 0 ? (
          <div className="spinner" style={{ margin:'60px auto' }} />
        ) : (
          <>
            {/* ── MONTHLY P&L ── */}
            {activeTab==='monthly' && (
              <div>
                <CurrentMonthCards curr={currMonth} prev={prevMonth} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:16, marginBottom:20 }}>
                  <InsightsPanel periods={periods} targets={targets} />
                  <div className="card-raised">
                    <div className="card-header"><span className="card-title">Current month — {currMonth?.label}</span></div>
                    <div style={{ padding:'0 16px 16px' }}>
                      {currMonth && PL_CATS.filter(c=>c.sign===-1).map(c=>(
                        <div key={c.key} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                          <span style={{ color:'var(--ink-2)' }}>{c.label}</span>
                          <span style={{ fontFamily:'var(--mono)', fontWeight:500, color: (currMonth[c.key]||0)>0 ? 'var(--ink)' : 'var(--ink-4)' }}>
                            {(currMonth[c.key]||0)>0 ? fmt$(currMonth[c.key]) : '—'}
                            {prevMonth && (currMonth[c.key]||0)>0 && (
                              <ChangeArrow pct={momChange(currMonth[c.key], prevMonth[c.key])} inverted={true} size={10} />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <MonthlyTable periods={periods} targets={targets} />
              </div>
            )}

            {/* ── TRANSACTIONS ── */}
            {activeTab==='transactions' && (
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
                  <input className="form-input" value={txSearch} onChange={e=>setTxSearch(e.target.value)} placeholder="Search…" style={{ maxWidth:200, fontSize:12 }}/>
                  <select className="form-select" value={txCategory} onChange={e=>setTxCategory(e.target.value)} style={{ maxWidth:180, fontSize:12 }}>
                    <option value="">All categories</option>
                    {allCats.map(c=><option key={c.key} value={c.key}>{c.label}{c.sign===0?' (not in P&L)':''}</option>)}
                  </select>
                  <input type="date" className="form-input" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ maxWidth:140, fontSize:12 }}/>
                  <span style={{ color:'var(--ink-3)' }}>→</span>
                  <input type="date" className="form-input" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ maxWidth:140, fontSize:12 }}/>
                  <button className="btn btn-sm" onClick={loadTransactions}>↻</button>
                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-3)' }}>{transactions.length} transactions</span>
                </div>
                {transactions.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-title">No transactions</div><div className="empty-state-sub">Connect a bank account to see transactions here</div></div>
                ) : (
                  <div className="card-raised">
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--bg)' }}>
                          {['Date','Description','Amount','Category',''].map(h=>(
                            <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx, i) => {
                          const isRev = tx.pl_category==='revenue';
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink-3)', fontSize:11 }}>{fmtDate(tx.date)}</td>
                              <td style={{ padding:'9px 14px', maxWidth:300 }}>
                                <div style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.merchant_name||tx.name}</div>
                                {tx.merchant_name && tx.name!==tx.merchant_name && <div style={{ fontSize:10, color:'var(--ink-3)' }}>{tx.name}</div>}
                              </td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', fontWeight:500, color:isRev?'var(--green)':'var(--ink)', whiteSpace:'nowrap' }}>
                                {isRev?'+':'-'}{fmtFull(Math.abs(tx.amount))}
                              </td>
                              <td style={{ padding:'9px 14px' }}>
                                <select value={tx.pl_category||'other'} onChange={e=>{ agent5.recategorize(tx.id,e.target.value).then(loadTransactions).catch(()=>{}); }}
                                  style={{ fontSize:11, padding:'3px 6px', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', background:'var(--bg)', color:'var(--ink)', cursor:'pointer' }}>
                                  {allCats.map(c=><option key={c.key} value={c.key}>{c.label}{c.sign===0?' (not in P&L)':''}</option>)}
                                </select>
                              </td>
                              <td style={{ padding:'9px 14px', whiteSpace:'nowrap' }}>
                                {tx.source==='imported'&&<span style={{ fontSize:9, padding:'2px 6px', borderRadius:10, background:'rgba(184,116,26,.12)', color:'var(--gold)', marginRight:4 }}>imported</span>}
                                {tx.pending&&<span className="tag tag-amber">Pending</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── LEARNED RULES ── */}
            {activeTab==='rules' && (
              <div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Learned from manual categorizations</div>
                  <div style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.6 }}>
                    Every time you manually change a transaction category, Pulse remembers it.
                    Next time you import a CSV, matching transactions are pre-categorized automatically.
                  </div>
                </div>
                {learnedRules.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🧠</div>
                    <div className="empty-state-title">No rules learned yet</div>
                    <div className="empty-state-sub">Re-categorize transactions in the Transactions tab — Pulse will remember them for future imports.</div>
                  </div>
                ) : (
                  <div className="card-raised">
                    <div className="card-header">
                      <span className="card-title">Category rules</span>
                      <span style={{ fontSize:11, color:'var(--ink-3)' }}>{learnedRules.length} patterns learned</span>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--bg)' }}>
                          {['Merchant / Description','Category','Times applied'].map(h=>(
                            <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', borderBottom:'1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {learnedRules.map((r,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', fontSize:11 }}>{r.pattern}</td>
                            <td style={{ padding:'9px 14px' }}>
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--gold)', fontWeight:500 }}>{r.category}</span>
                            </td>
                            <td style={{ padding:'9px 14px', color:'var(--ink-3)', fontFamily:'var(--mono)' }}>{r.match_count}×</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── ACCOUNTS ── */}
            {activeTab==='accounts' && (
              <div>
                <div style={{ marginBottom:20 }}>
                  <PlaidLinkButton locationId={currentLocation?.id} onSuccess={()=>{ loadMonthly(); showToast('Account connected — syncing…'); }}/>
                  <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:8 }}>Connects via Plaid. 12,000+ banks supported. We never store your login credentials.</div>
                </div>
                {connectedItems.length===0 ? (
                  <div className="empty-state"><div className="empty-state-icon">🏦</div><div className="empty-state-title">No accounts connected</div><div className="empty-state-sub">Connect your bank accounts to pull transactions automatically</div></div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {connectedItems.map((item,i)=>(
                      <div key={i} className="card-raised" style={{ padding:'16px 20px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:14 }}>{item.institution_name}</div>
                            <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>Last sync: {item.last_sync?fmtDate(item.last_sync):'Never'}</div>
                          </div>
                          <button className="btn btn-sm" onClick={()=>handleSync(item.id)} disabled={!!syncing}>{syncing===item.id?'Syncing…':'↻ Sync'}</button>
                          <button className="btn btn-sm btn-danger" onClick={async()=>{ if(confirm('Disconnect?')) { await agent5.removeItem(item.id); loadMonthly(); } }}>Disconnect</button>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {(item.accounts||[]).map((acct,j)=>(
                            <div key={j} style={{ padding:'6px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', fontSize:11 }}>
                              <span style={{ fontWeight:500 }}>{acct.name}</span>
                              <span style={{ color:'var(--ink-3)', marginLeft:6 }}>····{acct.mask}</span>
                              {acct.balances?.current!=null&&<span style={{ fontFamily:'var(--mono)', marginLeft:8, color:acct.balances.current>=0?'var(--green)':'var(--red)' }}>{fmtFull(acct.balances.current)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showImport && (
        <ImportModal
          locationId={currentLocation?.id}
          onImported={async(result)=>{ setShowImport(false); showToast(`Imported ${result.imported} transactions`); await loadMonthly(); }}
          onClose={()=>setShowImport(false)}
        />
      )}

      {showCatManager && (
        <CategoryManagerModal
          customCats={customCats}
          onAdd={async(data)=>{
            const saved = await agent5.addCategory(data);
            setCustomCats(c=>[...c.filter(x=>x.key!==saved.key), saved]);
          }}
          onDelete={async(key)=>{
            await agent5.deleteCategory(key);
            setCustomCats(c=>c.filter(x=>x.key!==key));
          }}
          onClose={()=>setShowCatManager(false)}
        />
      )}

      {showManual && (
        <ManualEntryModal
          locationId={currentLocation?.id}
          onSave={async(data)=>{ try{ await agent5.addManual(data); showToast('Entry added'); setShowManual(false); loadMonthly(); } catch(e){ showToast(e.message,true); } }}
          onClose={()=>setShowManual(false)}
        />
      )}

      {showTargets && (
        <TargetsModal
          targets={targets}
          onSave={(t)=>{ saveTargets(t); setShowTargets(false); showToast('Targets saved'); }}
          onClose={()=>setShowTargets(false)}
        />
      )}

      {toast && <div className="toast" style={{ background:toast.err?'var(--red)':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

function ManualEntryModal({ locationId, onSave, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  const [form, setForm] = useState({ category:'revenue', label:'', amount:'', periodStart:monthStart, periodEnd:today, notes:'' });
  const [saving, setSaving] = useState(false);
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const handleSave = async() => {
    if (!form.label||!form.amount) return;
    setSaving(true);
    try { await onSave({...form, locationId, amount:parseFloat(form.amount)}); } finally { setSaving(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:440, maxWidth:'95vw', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Manual entry</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px' }}>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={e=>setF('category',e.target.value)}>
              {PL_CATS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={form.label} onChange={e=>setF('label',e.target.value)} placeholder="e.g. Monthly rent payment"/></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group"><label className="form-label">Amount ($)</label><input className="form-input" type="number" step="0.01" value={form.amount} onChange={e=>setF('amount',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Month (period start)</label><input className="form-input" type="date" value={form.periodStart} onChange={e=>setF('periodStart',e.target.value)}/></div>
          </div>
          <div className="form-group"><label className="form-label">Notes (optional)</label><input className="form-input" value={form.notes} onChange={e=>setF('notes',e.target.value)}/></div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving||!form.label||!form.amount}>{saving?'Saving…':'Add entry'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetsModal({ targets, onSave, onClose }) {
  const [form, setForm] = useState({
    foodCostPct:  targets.foodCostPct  ?? 28,
    laborCostPct: targets.laborCostPct ?? 32,
    overheadPct:  targets.overheadPct  ?? 15,
  });
  const total = (parseFloat(form.foodCostPct)||0)+(parseFloat(form.laborCostPct)||0)+(parseFloat(form.overheadPct)||0);
  const F = (key, label, hint) => (
    <div className="form-group">
      <label className="form-label">{label} <span style={{ fontWeight:400, fontSize:9, color:'var(--ink-3)' }}>{hint}</span></label>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input className="form-input" type="number" min={0} max={100} step={0.5} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ maxWidth:100 }}/>
        <span style={{ fontSize:12, color:'var(--ink-3)' }}>%</span>
      </div>
    </div>
  );
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:400, maxWidth:'95vw', border:'1px solid var(--border)', padding:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>P&L targets</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>
        {F('foodCostPct',  'Food & beverage cost %', 'Typical 25–32%')}
        {F('laborCostPct', 'Labor cost %',           'Typical 28–35%')}
        {F('overheadPct',  'Overhead %',             'Rent, utilities, insurance, etc')}
        <div style={{ padding:'10px 14px', background:'var(--bg)', borderRadius:'var(--r-sm)', marginBottom:16, fontSize:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--ink-3)' }}>Total costs</span><span style={{ fontFamily:'var(--mono)' }}>{total.toFixed(1)}%</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}><span style={{ color:'var(--ink-3)' }}>Target net margin</span><span style={{ fontFamily:'var(--mono)', color:(100-total)>=10?'var(--green)':(100-total)>=5?'var(--amber)':'var(--red)' }}>{(100-total).toFixed(1)}%</span></div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={()=>onSave(form)}>Save targets</button>
        </div>
      </div>
    </div>
  );
}

// ── Import Statement Modal ─────────────────────────────────────────────────────
function ImportModal({ locationId, onImported, onClose }) {
  const [file, setFile]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError]     = useState('');

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.pdf')) {
      setError('Please upload a CSV or PDF file'); return;
    }
    setFile(f); setError(''); setPreview(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const token = localStorage.getItem('ros_token');
      const form = new FormData();
      form.append('file', file);
      if (locationId) form.append('locationId', locationId);

      const res = await fetch('/api/agent-5/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Upload failed');
      setPreview(data.data);
    } catch(e) { setError(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:40, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:620, maxWidth:'95vw', border:'1px solid var(--border)', margin:'0 16px 60px' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Import bank statement</h2>
            <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>CSV or PDF · Claude will categorize each transaction automatically</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>

        <div style={{ padding:'20px' }}>
          {!preview ? (
            <>
              <div style={{ border:'2px dashed var(--border)', borderRadius:'var(--r)', padding:'32px', textAlign:'center', marginBottom:16, background:'var(--bg)' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
                <div style={{ fontWeight:600, marginBottom:6 }}>Drop your bank statement here</div>
                <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:16 }}>CSV export from your bank, or PDF statement</div>
                <input type="file" accept=".csv,.pdf" onChange={handleFile} style={{ display:'none' }} id="stmt-upload"/>
                <label htmlFor="stmt-upload" className="btn btn-primary" style={{ cursor:'pointer', display:'inline-flex' }}>
                  Choose file
                </label>
                {file && <div style={{ marginTop:12, fontSize:12, color:'var(--green)', fontWeight:500 }}>✓ {file.name} ({(file.size/1024).toFixed(0)} KB)</div>}
              </div>

              <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:16, lineHeight:1.7 }}>
                <strong>How it works:</strong> Upload your bank or credit card CSV/PDF. Claude reads each transaction and assigns it to the right P&L category (COGS, Labor, Rent, etc.). You can review and adjust before saving.
              </div>

              {error && <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>}

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleUpload} disabled={uploading || !file}>
                  {uploading ? '🤖 Analysing…' : 'Analyse & categorize'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding:'12px 16px', background:'var(--bg)', borderRadius:'var(--r-sm)', marginBottom:16, display:'flex', gap:20, flexWrap:'wrap' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700, color:'var(--green)' }}>{preview.imported}</div>
                  <div style={{ fontSize:10, color:'var(--ink-3)' }}>imported to P&L</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700 }}>{preview.total}</div>
                  <div style={{ fontSize:10, color:'var(--ink-3)' }}>total parsed</div>
                </div>

                {preview.duplicates_skipped > 0 && (
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700, color:'var(--amber)' }}>{preview.duplicates_skipped}</div>
                    <div style={{ fontSize:10, color:'var(--ink-3)' }}>duplicates skipped</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:12, lineHeight:1.6 }}>
                {preview.duplicates_skipped > 0 && <span>✓ Duplicate detection active — re-uploading the same file is safe. </span>}
                <span>Transfers and owner draws are imported but excluded from P&L calculations.</span>
              </div>

              <div style={{ maxHeight:320, overflowY:'auto', marginBottom:16 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Date','Description','Amount','Category','Confidence'].map(h=>(
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', borderBottom:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.transactions||[]).map((tx,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'6px 10px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{tx.date}</td>
                        <td style={{ padding:'6px 10px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.description}</td>
                        <td style={{ padding:'6px 10px', fontFamily:'var(--mono)', color:tx.pl_category==='revenue'?'var(--green)':'var(--ink)' }}>
                          {tx.pl_category==='revenue'?'+':'-'}${Math.abs(tx.amount).toFixed(2)}
                        </td>
                        <td style={{ padding:'6px 10px', color:'var(--gold)', fontWeight:500 }}>{tx.pl_category}</td>
                        <td style={{ padding:'6px 10px' }}>
                          <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:tx.confidence==='high'?'#0A2A1A':tx.confidence==='medium'?'#2A1A0A':'var(--bg)', color:tx.confidence==='high'?'#3ECF8E':tx.confidence==='medium'?'#E8A020':'var(--ink-3)' }}>
                            {tx.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={()=>setPreview(null)}>← Re-upload</button>
                <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={()=>onImported(preview)}>
                  ✓ Save {preview.imported} transactions to P&L
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category Manager Modal ─────────────────────────────────────────────────────
function CategoryManagerModal({ customCats, onAdd, onDelete, onClose }) {
  const [form, setForm] = useState({ label:'', sign:-1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!form.label.trim()) return;
    setSaving(true); setError('');
    try {
      const key = form.label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      await onAdd({ key, label: form.label.trim(), sign: parseInt(form.sign) });
      setForm({ label:'', sign:-1 });
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const BUILT_IN = [
    'Revenue','Cost of Goods','Labor','Rent & Lease','Utilities','Insurance',
    'Maintenance & Repairs','Credit Card Fees','Professional Fees','Supplies',
    'Marketing','Other Expenses','Not P&L','Transfer'
  ];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:520, maxWidth:'95vw', border:'1px solid var(--border)', maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>Manage categories</h2>
            <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>Add custom P&L categories for your business</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>

        <div style={{ padding:'16px 20px', overflowY:'auto', flex:1 }}>
          {/* Add new category */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:'var(--ink-2)' }}>Add new category</div>
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <div className="form-group" style={{ flex:2, marginBottom:0 }}>
                <label className="form-label">Category name</label>
                <input className="form-input" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                  placeholder="e.g. Equipment Lease, Software, Staff Meals"
                  onKeyDown={e=>e.key==='Enter'&&handleAdd()}/>
              </div>
              <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={form.sign} onChange={e=>setForm(f=>({...f,sign:e.target.value}))}>
                  <option value={-1}>Expense (−)</option>
                  <option value={1}>Revenue (+)</option>
                  <option value={0}>Not in P&L</option>
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving||!form.label.trim()} style={{ marginBottom:0, flexShrink:0 }}>
                {saving ? 'Adding…' : '+ Add'}
              </button>
            </div>
            {error && <div style={{ fontSize:11, color:'var(--red)', marginTop:6 }}>{error}</div>}
          </div>

          {/* Custom categories */}
          {customCats.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:8, color:'var(--ink-2)' }}>Your custom categories</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {customCats.map(c=>(
                  <div key={c.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)' }}>
                    <span style={{ flex:1, fontWeight:500, fontSize:13 }}>{c.label}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--ink-3)' }}>
                      {c.sign === 1 ? 'revenue' : c.sign === 0 ? 'not in P&L' : 'expense'}
                    </span>
                    <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-4)' }}>{c.key}</span>
                    <button onClick={()=>onDelete(c.key)} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Built-in categories (read-only reference) */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:8, color:'var(--ink-3)' }}>Built-in categories</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {BUILT_IN.map(l=>(
                <span key={l} style={{ fontSize:11, padding:'3px 10px', borderRadius:10, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink-3)' }}>{l}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn" style={{ width:'100%', justifyContent:'center' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
