import React, { useState, useEffect, useCallback } from 'react';
import { agent11, agent3, locations as locationsApi } from '../../lib/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const MENU_TYPES = ['dinner','lunch','brunch','bar','dessert','tasting'];
const QUADRANT_META = {
  star:      { label:'⭐ Stars',      color:'#1a7a4a', bg:'#d4f5e4', border:'#7dd9aa', textColor:'#0d3d25', chipBg:'#a8ecc9', chipText:'#0d3d25', desc:'High margin · High popularity — Promote, feature prominently' },
  plowhorse: { label:'🐴 Plowhorses', color:'#1a5fa8', bg:'#d6e8fb', border:'#7ab3e8', textColor:'#0d2e52', chipBg:'#aacdf0', chipText:'#0d2e52', desc:'Low margin · High popularity — Raise price or reduce cost' },
  puzzle:    { label:'🧩 Puzzles',    color:'#a06010', bg:'#fdefd3', border:'#f0be6a', textColor:'#4a2a05', chipBg:'#f8d898', chipText:'#4a2a05', desc:'High margin · Low popularity — Better placement + staff training' },
  dog:       { label:'🐕 Dogs',       color:'#b83030', bg:'#fad8d8', border:'#e89090', textColor:'#4a1010', chipBg:'#f2b0b0', chipText:'#4a1010', desc:'Low margin · Low popularity — Remove or reimagine' },
};
const fmtCurrency = v => v != null ? `$${parseFloat(v).toFixed(2)}` : '—';
const fmtPct      = v => v != null ? `${parseFloat(v).toFixed(1)}%` : '—';

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Agent11Menu_Management() {
  const [tab, setTab]               = useState('matrix');
  const [locations, setLocations]   = useState([]);
  const [loc, setLoc]               = useState(null);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);

  const [summary, setSummary]       = useState(null);
  const [matrix, setMatrix]         = useState(null);
  const [items, setItems]           = useState([]);
  const [sections, setSections]     = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [simResult, setSimResult]   = useState(null);

  const [genLoading, setGenLoading] = useState(false);
  const [optLoading, setOptLoading] = useState(false);

  // Modals
  const [showAddItem, setShowAddItem]     = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showSalesEntry, setShowSalesEntry] = useState(null);
  const [showSimulator, setShowSimulator]   = useState(null);
  const [showImport, setShowImport]         = useState(false);
  const [showScan, setShowScan]             = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [scanResult, setScanResult]         = useState(null);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  useEffect(() => {
    locationsApi.list().then(locs => { setLocations(locs||[]); if(locs?.length) setLoc(locs[0]); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!loc?.id) return;
    agent11.summary(loc.id).then(s=>setSummary(s)).catch(()=>{});
    agent11.sections({locationId:loc.id}).then(s=>setSections(Array.isArray(s)?s:[])).catch(()=>{});
  }, [loc]);

  useEffect(() => {
    if (!loc?.id) return;
    if (tab==='matrix')   { setLoading(true); agent11.matrix({locationId:loc.id}).then(m=>setMatrix(m)).catch(()=>{}).finally(()=>setLoading(false)); }
    if (tab==='menu')     { setLoading(true); agent11.items({locationId:loc.id}).then(i=>setItems(Array.isArray(i)?i:[])).catch(()=>{}).finally(()=>setLoading(false)); }
    if (tab==='pricing')  { agent11.priceSuggestions().then(s=>setSuggestions(Array.isArray(s)?s:[])).catch(()=>{}); }
    if (tab==='optimize' && optimizations.length===0) {} // user triggers manually
  }, [tab, loc]);

  const handleGeneratePricing = async () => {
    setGenLoading(true);
    try { const s=await agent11.generatePricing(loc.id); setSuggestions(Array.isArray(s)?s:[]); showToast(`${s.length} pricing suggestions generated`); }
    catch(e) { showToast(e.message,true); }
    finally { setGenLoading(false); }
  };

  const handleOptimize = async () => {
    setOptLoading(true);
    try { const r=await agent11.optimize(loc.id); setOptimizations(Array.isArray(r)?r:[]); showToast('Optimization analysis complete'); }
    catch(e) { showToast(e.message,true); }
    finally { setOptLoading(false); }
  };

  const handleApplyPrice = async (id) => {
    await agent11.applyPrice(id);
    setSuggestions(s=>s.filter(x=>x.id!==id));
    showToast('Price updated');
  };

  const handleScan = async (fileBase64, mimeType) => {
    setScanning(true);
    try {
      const r = await agent11.scanMenu({ fileBase64, mimeType, locationId: loc?.id });
      setScanResult(r);
      showToast(`✓ Imported ${r.items_created} items across ${r.sections_created} sections`);
      // Reload menu data
      agent11.items({locationId:loc?.id}).then(i=>setItems(Array.isArray(i)?i:[])).catch(()=>{});
      agent11.sections({locationId:loc?.id}).then(s=>setSections(Array.isArray(s)?s:[])).catch(()=>{});
      agent11.summary(loc?.id).then(s=>setSummary(s)).catch(()=>{});
    } catch(e) { showToast(e.message, true); }
    finally { setScanning(false); }
  };

  const handleImport = async () => {
    setShowImport(false);
    try { const r=await agent11.importRecipes(loc?.id); showToast(`${r.imported} items imported from recipes`); agent11.items({locationId:loc?.id}).then(i=>setItems(Array.isArray(i)?i:[])); }
    catch(e) { showToast(e.message,true); }
  };

  const tabs = [
    { id:'matrix',   label:'📊 Matrix' },
    { id:'pricing',  label:'💰 Pricing' },
    { id:'menu',     label:'🍽️ Menu designer' },
    { id:'optimize', label:'🤖 AI Optimize' },
  ];

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Menu Engineering</h1>
          <div className="page-sub">{loc?.name||'Select location'}</div>
        </div>
        <div className="topbar-right">
          <select className="form-select" style={{ fontSize:12 }} value={loc?.id||''} onChange={e=>setLoc(locations.find(l=>l.id===e.target.value)||null)}>
            {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {tab==='matrix'  && <button className="btn btn-sm" onClick={()=>setShowSimulator({})}>⚡ What-if simulator</button>}
          {tab==='pricing' && <button className="btn btn-primary" onClick={handleGeneratePricing} disabled={genLoading}>{genLoading?'🤖 Generating…':'🤖 Generate suggestions'}</button>}
          {tab==='menu'    && <>
            <button className="btn btn-primary" onClick={()=>setShowScan(true)}>📄 Upload menu PDF</button>
            <button className="btn btn-sm" onClick={()=>setShowImport(true)}>⬇ Import from recipes</button>
            <button className="btn btn-sm" onClick={()=>setShowAddSection(true)}>+ Section</button>
            <button className="btn btn-primary" onClick={()=>setShowAddItem({})}>+ Item</button>
          </>}
          {tab==='optimize' && <button className="btn btn-primary" onClick={handleOptimize} disabled={optLoading}>{optLoading?'🤖 Analyzing…':'🤖 Run analysis'}</button>}
        </div>
      </div>

      <div className="content">
        {/* Summary stats */}
        {summary && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Active items',    val:summary.items?.active||0,           color:'var(--ink)' },
              { label:'Avg menu price',  val:fmtCurrency(summary.items?.avg_price), color:'var(--gold)' },
              { label:'Avg margin',      val:fmtPct(summary.items?.avg_margin),  color: parseFloat(summary.items?.avg_margin||0)>=65?'#3ECF8E':'#F26C6C' },
              { label:'Price suggestions', val:summary.suggestions?.pending||0, color:'#E8A020' },
            ].map((s,i)=>(
              <div key={i} className="card" style={{ padding:'12px 16px' }}>
                <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:5 }}>{s.label}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color:s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
          {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'8px 16px', background:'none', border:'none', borderBottom:`2px solid ${tab===t.id?'var(--gold)':'transparent'}`, color:tab===t.id?'var(--gold)':'var(--ink-3)', fontSize:13, cursor:'pointer', fontWeight:tab===t.id?600:400 }}>{t.label}</button>)}
        </div>

        {/* ── MATRIX TAB ────────────────────────────────────────────────────── */}
        {tab==='matrix' && (
          loading ? <div className="spinner" style={{ margin:'60px auto' }}/> : !matrix ? (
            <div className="empty-state"><div className="empty-state-title">No data yet</div><div className="empty-state-sub">Add menu items with prices and log weekly sales to see the matrix</div></div>
          ) : (
            <>
              {/* 2x2 Matrix visual */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:24 }}>
                {['star','puzzle','plowhorse','dog'].map(q => {
                  const meta  = QUADRANT_META[q];
                  const qItems = matrix.quadrants[q]||[];
                  return (
                    <div key={q} style={{ background:meta.bg, borderRadius:12, padding:'16px 20px', border:`2px solid ${meta.border}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:15, fontWeight:700, color:meta.textColor }}>{meta.label}</div>
                          <div style={{ fontSize:11, color:meta.color, marginTop:2, lineHeight:1.4, fontWeight:500 }}>{meta.desc}</div>
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:28, fontWeight:700, color:meta.textColor }}>{qItems.length}</div>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {qItems.slice(0,8).map(item=>(
                          <div key={item.id} style={{ background:meta.chipBg, border:`1px solid ${meta.border}`, borderRadius:6, padding:'5px 10px', fontSize:11 }}>
                            <span style={{ fontWeight:600, color:meta.textColor }}>{item.name}</span>
                            <span style={{ color:meta.color, marginLeft:6, fontWeight:500 }}>
                              {fmtCurrency(item.price)} · {fmtPct(item.margin_pct)} margin
                              {item.avg_weekly_sales > 0 && ` · ${parseFloat(item.avg_weekly_sales).toFixed(1)}/wk`}
                            </span>
                          </div>
                        ))}
                        {qItems.length > 8 && <div style={{ fontSize:11, color:meta.color, padding:'4px 8px', fontWeight:500 }}>+{qItems.length-8} more</div>}
                        {qItems.length === 0 && <div style={{ fontSize:11, color:meta.color, fontStyle:'italic' }}>No items in this quadrant</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Averages reference */}
              <div style={{ display:'flex', gap:16, marginBottom:20, fontSize:12, color:'var(--ink-3)' }}>
                <span>Popularity threshold: <strong style={{ color:'var(--ink)' }}>{matrix.averages.avg_weekly_sales} units/wk</strong></span>
                <span>Profit threshold: <strong style={{ color:'var(--ink)' }}>{fmtCurrency(matrix.averages.avg_gross_profit)}/unit</strong></span>
                <span>Avg margin: <strong style={{ color:'var(--ink)' }}>{fmtPct(matrix.averages.avg_margin_pct)}</strong></span>
              </div>

              {/* Full item table */}
              <div className="card">
                <div className="card-header"><span className="card-title">All items</span></div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['Item','Category','Price','Food cost','Margin','Profit/unit','Avg/wk','Quadrant',''].map(h=>(
                          <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.items.map(item=>{
                        const qm = QUADRANT_META[item.quadrant];
                        return (
                          <tr key={item.id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'9px 12px', fontWeight:500 }}>
                              {item.name}
                              {item.is_signature && <span style={{ marginLeft:6, fontSize:10, color:'var(--gold)' }}>★ Signature</span>}
                            </td>
                            <td style={{ padding:'9px 12px', color:'var(--ink-3)' }}>{item.category||item.section_name||'—'}</td>
                            <td style={{ padding:'9px 12px', fontFamily:'var(--mono)' }}>{fmtCurrency(item.price)}</td>
                            <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color: parseFloat(item.food_cost_live||0)/parseFloat(item.price||1)>0.35?'#F26C6C':'var(--ink-3)' }}>{fmtCurrency(item.food_cost_live)}</td>
                            <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color: parseFloat(item.margin_pct||0)>=65?'#3ECF8E':parseFloat(item.margin_pct||0)>=50?'#E8A020':'#F26C6C', fontWeight:600 }}>{fmtPct(item.margin_pct)}</td>
                            <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color:'var(--gold)' }}>{fmtCurrency(item.gross_profit)}</td>
                            <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{parseFloat(item.avg_weekly_sales||0).toFixed(1)}</td>
                            <td style={{ padding:'9px 12px' }}>
                              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:qm.chipBg, color:qm.textColor, border:`1px solid ${qm.border}` }}>{qm.label}</span>
                            </td>
                            <td style={{ padding:'9px 12px' }}>
                              <div style={{ display:'flex', gap:4 }}>
                                <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>setShowSalesEntry(item)}>Log sales</button>
                                <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>setShowSimulator(item)}>Simulate</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        )}

        {/* ── PRICING TAB ───────────────────────────────────────────────────── */}
        {tab==='pricing' && (
          <>
            {suggestions.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No pricing suggestions yet</div>
                <div className="empty-state-sub">Click "Generate suggestions" to get AI-powered pricing recommendations based on food cost, demand, and margins</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {suggestions.map(s=>{
                  const typeColors = { price_increase:'#3ECF8E', price_decrease:'#4A90D9', seasonal:'#E8A020', bundle:'#9B59B6' };
                  const tc = typeColors[s.suggestion_type]||'#666';
                  const delta = parseFloat(s.suggested_price||0) - parseFloat(s.current_price||s.current_price_live||0);
                  return (
                    <div key={s.id} className="card" style={{ padding:'16px 20px', borderLeft:`3px solid ${tc}` }}>
                      <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${tc}20`, color:tc, textTransform:'capitalize' }}>{s.suggestion_type?.replace('_',' ')}</span>
                            <span style={{ fontWeight:600, fontSize:14 }}>{s.item_name}</span>
                            {s.category && <span style={{ fontSize:11, color:'var(--ink-3)' }}>{s.category}</span>}
                          </div>
                          <div style={{ display:'flex', gap:20, marginBottom:8, fontSize:13 }}>
                            <span>Current: <strong style={{ fontFamily:'var(--mono)' }}>{fmtCurrency(s.current_price||s.current_price_live)}</strong></span>
                            <span>→</span>
                            <span>Suggested: <strong style={{ fontFamily:'var(--mono)', color:delta>=0?'#3ECF8E':'#F26C6C' }}>{fmtCurrency(s.suggested_price)}</strong></span>
                            <span style={{ fontSize:12, color:delta>=0?'#3ECF8E':'#F26C6C', fontWeight:600 }}>{delta>=0?'+':''}{fmtCurrency(delta)}</span>
                          </div>
                          <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:4, lineHeight:1.6 }}>{s.reason}</div>
                          {s.impact_est && <div style={{ fontSize:11, color:'var(--gold)', fontWeight:500 }}>📈 {s.impact_est}</div>}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                          <button className="btn btn-primary btn-sm" onClick={()=>handleApplyPrice(s.id)}>Apply</button>
                          <button className="btn btn-sm" onClick={async()=>{ await agent11.dismissPrice(s.id); setSuggestions(p=>p.filter(x=>x.id!==s.id)); }} style={{ color:'var(--ink-3)' }}>Dismiss</button>
                          <button className="btn btn-sm" onClick={()=>setShowSimulator({id:s.item_id,name:s.item_name,price:s.current_price||s.current_price_live})} style={{ fontSize:10 }}>Simulate</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── MENU DESIGNER TAB ─────────────────────────────────────────────── */}
        {tab==='menu' && (
          loading ? <div className="spinner" style={{ margin:'60px auto' }}/> : (
            <div>
              {sections.length===0 && items.length===0 ? (
                <MenuUploadPrompt onScan={()=>setShowScan(true)} onImport={()=>setShowImport(true)} onAdd={()=>setShowAddItem({})}/>
              ) : (
                <div>
                  {/* Ungrouped section or by section */}
                  {sections.length === 0 ? (
                    <ItemTable items={items} onEdit={i=>setShowAddItem(i)} onDelete={async i=>{ await agent11.deleteItem(i.id); setItems(p=>p.filter(x=>x.id!==i.id)); }} onSales={i=>setShowSalesEntry(i)} onSimulate={i=>setShowSimulator(i)}/>
                  ) : (
                    <>
                      {sections.map(sec=>{
                        const secItems = items.filter(i=>i.section_id===sec.id);
                        return (
                          <div key={sec.id} style={{ marginBottom:28 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                              <div>
                                <span style={{ fontWeight:700, fontSize:14 }}>{sec.name}</span>
                                <span style={{ marginLeft:10, fontSize:11, color:'var(--ink-3)', textTransform:'capitalize' }}>{sec.menu_type} · {secItems.length} items</span>
                              </div>
                              <button className="btn btn-sm" onClick={()=>setShowAddItem({sectionId:sec.id})}>+ Add to section</button>
                            </div>
                            <ItemTable items={secItems} onEdit={i=>setShowAddItem(i)} onDelete={async i=>{ await agent11.deleteItem(i.id); setItems(p=>p.filter(x=>x.id!==i.id)); }} onSales={i=>setShowSalesEntry(i)} onSimulate={i=>setShowSimulator(i)}/>
                          </div>
                        );
                      })}
                      {/* Items without section */}
                      {items.filter(i=>!i.section_id).length>0 && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:'var(--ink-3)', marginBottom:8 }}>Unsectioned items</div>
                          <ItemTable items={items.filter(i=>!i.section_id)} onEdit={i=>setShowAddItem(i)} onDelete={async i=>{ await agent11.deleteItem(i.id); setItems(p=>p.filter(x=>x.id!==i.id)); }} onSales={i=>setShowSalesEntry(i)} onSimulate={i=>setShowSimulator(i)}/>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {/* ── OPTIMIZE TAB ──────────────────────────────────────────────────── */}
        {tab==='optimize' && (
          <>
            {optimizations.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-title">Run the AI optimizer</div>
                <div className="empty-state-sub">Claude analyses your menu matrix, food costs, waste patterns, and sales data to generate specific improvement recommendations</div>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))', gap:14 }}>
                {optimizations.map((opt,i)=>{
                  const catColors = { pricing:'#3ECF8E', placement:'#4A90D9', removal:'#F26C6C', promotion:'#E8A020', waste:'#9B59B6', design:'#7B8CDE' };
                  const cc = catColors[opt.category]||'#666';
                  return (
                    <div key={i} className="card" style={{ padding:'18px', borderTop:`3px solid ${cc}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${cc}20`, color:cc, textTransform:'capitalize' }}>{opt.category}</span>
                            <span style={{ fontSize:10, fontWeight:600, color: opt.priority==='high'?'#F26C6C':opt.priority==='medium'?'#E8A020':'#4A90D9', textTransform:'uppercase' }}>{opt.priority}</span>
                          </div>
                          <div style={{ fontWeight:600, fontSize:14 }}>{opt.title}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.7, marginBottom:10 }}>{opt.action}</div>
                      {opt.impact && <div style={{ fontSize:11, color:'var(--gold)', fontWeight:500, marginBottom:8 }}>📈 {opt.impact}</div>}
                      {opt.items_affected?.length>0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {opt.items_affected.map((name,j)=>(
                            <span key={j} style={{ fontSize:10, padding:'2px 8px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4 }}>{name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {scanResult && (
        <ScanResultBanner result={scanResult} onDismiss={()=>setScanResult(null)} onGoToMatrix={()=>{ setScanResult(null); setTab('matrix'); }}/>
      )}
      {showScan && (
        <MenuScanModal scanning={scanning} onClose={()=>setShowScan(false)} onScan={handleScan}/>
      )}
      {showAddItem    && <ItemModal item={showAddItem} sections={sections} locationId={loc?.id} onClose={()=>setShowAddItem(null)} onSaved={item=>{ setItems(p=>{ const idx=p.findIndex(x=>x.id===item.id); if(idx>=0){const n=[...p];n[idx]={...n[idx],...item};return n;} return [item,...p]; }); setShowAddItem(null); showToast('Item saved'); }}/>}
      {showAddSection && <SectionModal locationId={loc?.id} onClose={()=>setShowAddSection(false)} onSaved={s=>{ setSections(p=>[...p,s]); setShowAddSection(false); showToast('Section added'); }}/>}
      {showSalesEntry && <SalesModal item={showSalesEntry} locationId={loc?.id} onClose={()=>setShowSalesEntry(null)} onSaved={()=>{ setShowSalesEntry(null); showToast('Sales logged'); }}/>}
      {showSimulator  && <SimulatorModal item={showSimulator} onClose={()=>setShowSimulator(null)}/>}
      {showImport     && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
          <div style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:400,padding:'24px',border:'1px solid var(--border)',textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>⬇️</div>
            <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700,marginBottom:8 }}>Import from Recipes</div>
            <div style={{ fontSize:13,color:'var(--ink-3)',marginBottom:20,lineHeight:1.6 }}>This will import all active recipes that aren't already on the menu, including their food cost data.</div>
            <div style={{ display:'flex',gap:8 }}>
              <button className="btn" style={{ flex:1 }} onClick={()=>setShowImport(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2 }} onClick={handleImport}>Import recipes</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" style={{ background:toast.err?'#E24B4A':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

// ── Item table (reused in menu designer) ──────────────────────────────────────
function ItemTable({ items, onEdit, onDelete, onSales, onSimulate }) {
  if (items.length === 0) return <div style={{ padding:'20px', color:'var(--ink-3)', fontSize:13, textAlign:'center', background:'var(--bg-2)', borderRadius:8 }}>No items in this section</div>;
  return (
    <div className="card">
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid var(--border)' }}>
            {['Item','Price','Food cost','Margin','Avg/wk','Tags',''].map(h=>(
              <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item=>(
            <tr key={item.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <td style={{ padding:'9px 12px' }}>
                <div style={{ fontWeight:500 }}>{item.name}</div>
                {item.description && <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:1 }}>{item.description.slice(0,50)}{item.description.length>50?'…':''}</div>}
              </td>
              <td style={{ padding:'9px 12px', fontFamily:'var(--mono)' }}>{fmtCurrency(item.price)}</td>
              <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color: parseFloat(item.food_cost_live||0)>parseFloat(item.price||1)*0.35?'#F26C6C':'var(--ink-3)' }}>{fmtCurrency(item.food_cost_live)}</td>
              <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontWeight:600, color: parseFloat(item.margin_pct||0)>=65?'#3ECF8E':parseFloat(item.margin_pct||0)>=50?'#E8A020':'#F26C6C' }}>{fmtPct(item.margin_pct)}</td>
              <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{parseFloat(item.avg_weekly_sales||0).toFixed(1)}</td>
              <td style={{ padding:'9px 12px' }}>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {item.is_signature && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'#2A2010', color:'#E8A020' }}>★ Signature</span>}
                  {item.is_seasonal  && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'#0A2A1A', color:'#3ECF8E' }}>🌿 Seasonal</span>}
                </div>
              </td>
              <td style={{ padding:'9px 12px' }}>
                <div style={{ display:'flex', gap:4 }}>
                  <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>onEdit(item)}>Edit</button>
                  <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>onSales(item)}>Sales</button>
                  <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>onSimulate(item)}>Sim</button>
                  <button className="btn btn-sm" style={{ fontSize:10, color:'#F26C6C' }} onClick={()=>{ if(confirm(`Remove ${item.name}?`)) onDelete(item); }}>✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Item Modal ─────────────────────────────────────────────────────────────────
function ItemModal({ item, sections, locationId, onClose, onSaved }) {
  const isNew = !item.id;
  const [form, setForm] = useState({
    name:item.name||'', description:item.description||'', price:item.price||'',
    foodCost:item.food_cost||item.food_cost_live||'', category:item.category||'',
    sectionId:item.section_id||item.sectionId||'', isSignature:item.is_signature||false,
    isSeasonal:item.is_seasonal||false, available:item.available??true,
    placementNotes:item.placement_notes||'',
  });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const margin = form.price && form.foodCost ? ((parseFloat(form.price)-parseFloat(form.foodCost))/parseFloat(form.price)*100).toFixed(1) : null;

  const handleSave = async () => {
    if (!form.name) return alert('Name required');
    setSaving(true);
    try {
      const saved = isNew ? await agent11.addItem({...form,locationId}) : await agent11.updateItem(item.id,form);
      onSaved(saved);
    } catch(e) { alert(e.message); setSaving(false); }
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:60,paddingTop:20,overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:560,maxWidth:'95vw',border:'1px solid var(--border)',margin:'0 16px 60px' }}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700 }}>{isNew?'Add item':'Edit item'}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          <div className="form-group" style={{ gridColumn:'1/-1',marginBottom:0 }}>
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Aparajita Fizz"/>
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1',marginBottom:0 }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Menu description (shown to guests)"/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Menu price ($)</label>
            <input className="form-input" type="number" min={0} step={0.5} value={form.price} onChange={e=>f('price',e.target.value)}/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Food cost ($) {margin && <span style={{ color: parseFloat(margin)>=65?'#3ECF8E':'#E8A020', marginLeft:6 }}>{margin}% margin</span>}</label>
            <input className="form-input" type="number" min={0} step={0.01} value={form.foodCost} onChange={e=>f('foodCost',e.target.value)}/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Category</label>
            <input className="form-input" value={form.category} onChange={e=>f('category',e.target.value)} placeholder="Cocktails, Mains, Starters…"/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Section</label>
            <select className="form-select" value={form.sectionId} onChange={e=>f('sectionId',e.target.value)}>
              <option value="">No section</option>
              {sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1',marginBottom:0 }}>
            <label className="form-label">Placement notes</label>
            <input className="form-input" value={form.placementNotes} onChange={e=>f('placementNotes',e.target.value)} placeholder="e.g. Feature in top-right, pair with tandoor dishes"/>
          </div>
          <div style={{ gridColumn:'1/-1',display:'flex',gap:20 }}>
            {[['isSignature','★ Signature item'],['isSeasonal','🌿 Seasonal'],['available','Available']].map(([k,l])=>(
              <label key={k} style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13 }}>
                <input type="checkbox" checked={form[k]} onChange={e=>f(k,e.target.checked)}/>{l}
              </label>
            ))}
          </div>
        </div>
        <div style={{ padding:'0 20px 16px',display:'flex',gap:8 }}>
          <button className="btn" style={{ flex:1,justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2,justifyContent:'center' }} onClick={handleSave} disabled={saving}>{saving?'Saving…':isNew?'Add item':'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Section Modal ──────────────────────────────────────────────────────────────
function SectionModal({ locationId, onClose, onSaved }) {
  const [form, setForm] = useState({ name:'', description:'', menuType:'dinner', sortOrder:0 });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.name) return alert('Name required');
    setSaving(true);
    try { onSaved(await agent11.addSection({...form,locationId})); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:420,maxWidth:'95vw',border:'1px solid var(--border)' }}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700 }}>Add section</div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px',display:'flex',flexDirection:'column',gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Section name *</label>
            <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Signature Cocktails, Starters, Mains"/>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Menu type</label>
              <select className="form-select" value={form.menuType} onChange={e=>f('menuType',e.target.value)}>
                {MENU_TYPES.map(t=><option key={t} value={t} style={{ textTransform:'capitalize' }}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Sort order</label>
              <input className="form-input" type="number" min={0} value={form.sortOrder} onChange={e=>f('sortOrder',parseInt(e.target.value))}/>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Optional note"/>
          </div>
        </div>
        <div style={{ padding:'0 20px 16px',display:'flex',gap:8 }}>
          <button className="btn" style={{ flex:1,justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2,justifyContent:'center' }} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Add section'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sales entry modal ──────────────────────────────────────────────────────────
function SalesModal({ item, locationId, onClose, onSaved }) {
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1);
  const [form, setForm] = useState({ weekStart:weekStart.toISOString().slice(0,10), unitsSold:'', revenue:'' });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const estRevenue = form.unitsSold && item.price ? (parseFloat(form.unitsSold)*parseFloat(item.price||0)).toFixed(2) : '';
  const handleSave = async () => {
    if (!form.unitsSold||!form.weekStart) return alert('Units sold and week required');
    setSaving(true);
    try { await agent11.logSales(item.id,{ locationId, weekStart:form.weekStart, unitsSold:parseInt(form.unitsSold), revenue:parseFloat(form.revenue||estRevenue||0) }); onSaved(); }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:380,maxWidth:'95vw',border:'1px solid var(--border)' }}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700 }}>Log sales — {item.name}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px',display:'flex',flexDirection:'column',gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Week starting</label>
            <input className="form-input" type="date" value={form.weekStart} onChange={e=>f('weekStart',e.target.value)}/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Units sold</label>
            <input className="form-input" type="number" min={0} value={form.unitsSold} onChange={e=>f('unitsSold',e.target.value)} placeholder="0"/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Revenue {estRevenue && <span style={{ color:'var(--ink-3)',marginLeft:6 }}>est. ${estRevenue}</span>}</label>
            <input className="form-input" type="number" min={0} step={0.01} value={form.revenue} onChange={e=>f('revenue',e.target.value)} placeholder={estRevenue||'0.00'}/>
          </div>
        </div>
        <div style={{ padding:'0 20px 16px',display:'flex',gap:8 }}>
          <button className="btn" style={{ flex:1,justifyContent:'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2,justifyContent:'center' }} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Log sales'}</button>
        </div>
      </div>
    </div>
  );
}

// ── What-if simulator modal ────────────────────────────────────────────────────
function SimulatorModal({ item, onClose }) {
  const [itemId, setItemId]     = useState(item?.id||'');
  const [newPrice, setNewPrice] = useState(item?.price||'');
  const [elasticity, setElasticity] = useState(-1.2);
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);

  const handleSimulate = async () => {
    if (!itemId||!newPrice) return alert('Item and new price required');
    setLoading(true);
    try { setResult(await agent11.simulate({ itemId, newPrice:parseFloat(newPrice), elasticity })); }
    catch(e) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:480,maxWidth:'95vw',border:'1px solid var(--border)' }}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--serif)',fontSize:18,fontWeight:700 }}>⚡ What-if simulator</div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">New price ($)</label>
              <input className="form-input" type="number" min={0} step={0.5} value={newPrice} onChange={e=>setNewPrice(e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Price elasticity</label>
              <select className="form-select" value={elasticity} onChange={e=>setElasticity(parseFloat(e.target.value))}>
                <option value={-0.5}>-0.5 (inelastic — premium items)</option>
                <option value={-1.0}>-1.0 (unit elastic)</option>
                <option value={-1.2}>-1.2 (moderate, default)</option>
                <option value={-1.5}>-1.5 (elastic)</option>
                <option value={-2.0}>-2.0 (highly elastic)</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width:'100%',justifyContent:'center' }} onClick={handleSimulate} disabled={loading}>{loading?'Calculating…':'Run simulation'}</button>

          {result && !result.error && (
            <div style={{ marginTop:20, background:'var(--bg)', borderRadius:10, padding:'16px' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>Simulation results — {result.item_name}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { label:'Current price',    val:fmtCurrency(result.current_price) },
                  { label:'New price',         val:fmtCurrency(result.new_price) },
                  { label:'Current units/wk',  val:result.current_units },
                  { label:'Est. units/wk',     val:result.estimated_units },
                  { label:'Current margin',    val:fmtPct(result.margin_pct_current) },
                  { label:'New margin',         val:fmtPct(result.margin_pct_new) },
                  { label:'Current wkly profit', val:fmtCurrency(result.current_weekly_profit) },
                  { label:'Est. wkly profit',   val:<span style={{ color: result.weekly_profit_delta>=0?'#3ECF8E':'#F26C6C', fontWeight:700 }}>{fmtCurrency(result.estimated_weekly_profit)}</span> },
                ].map((s,i)=>(
                  <div key={i}>
                    <div style={{ fontSize:9,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:3 }}>{s.label}</div>
                    <div style={{ fontFamily:'var(--mono)',fontSize:14,fontWeight:600 }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:14, padding:'12px', borderRadius:8, background: result.weekly_profit_delta>=0?'#0A2A1A':'#2A0A0A', textAlign:'center' }}>
                <div style={{ fontSize:11,color:'var(--ink-3)',marginBottom:4 }}>Annual profit impact</div>
                <div style={{ fontFamily:'var(--mono)',fontSize:22,fontWeight:700,color:result.annual_profit_delta>=0?'#3ECF8E':'#F26C6C' }}>
                  {result.annual_profit_delta>=0?'+':''}{fmtCurrency(result.annual_profit_delta)}/yr
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Menu Upload Prompt (empty state) ─────────────────────────────────────────
function MenuUploadPrompt({ onScan, onImport, onAdd }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, maxWidth:780, margin:'40px auto' }}>
      {[
        {
          icon:'📄', title:'Upload menu PDF',
          desc:'Paste or photograph your existing menu. Claude reads it and creates all sections and items automatically.',
          btn:'Upload menu', onClick:onScan, primary:true,
        },
        {
          icon:'🍽️', title:'Import from recipes',
          desc:'Pull items directly from your Agent 3 recipe costing database with food costs already calculated.',
          btn:'Import recipes', onClick:onImport, primary:false,
        },
        {
          icon:'✏️', title:'Build manually',
          desc:'Start from scratch. Create sections, add items one by one, and set prices and descriptions.',
          btn:'Add first item', onClick:onAdd, primary:false,
        },
      ].map((opt,i)=>(
        <div key={i} style={{ background:'var(--bg-2)', borderRadius:14, padding:'24px 20px', border:`1px solid ${opt.primary?'var(--gold)':'var(--border)'}`, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:12 }}>
          <div style={{ fontSize:40 }}>{opt.icon}</div>
          <div style={{ fontWeight:700, fontSize:15 }}>{opt.title}</div>
          <div style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.7, flex:1 }}>{opt.desc}</div>
          <button className={`btn${opt.primary?' btn-primary':''}`} style={{ width:'100%', justifyContent:'center' }} onClick={opt.onClick}>{opt.btn}</button>
        </div>
      ))}
    </div>
  );
}

// ── Menu Scan Modal ────────────────────────────────────────────────────────────
function MenuScanModal({ scanning, onClose, onScan }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]       = useState('');
  const inputRef = React.useRef();

  const ACCEPTED = ['application/pdf','image/jpeg','image/png','image/webp'];

  const handleFile = (f) => {
    setError('');
    if (!ACCEPTED.includes(f.type)) { setError('Please upload a PDF or image (JPG, PNG, WEBP)'); return; }
    if (f.size > 20 * 1024 * 1024) { setError('File too large — max 20 MB'); return; }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return setError('Please select a file first');
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      await onScan(base64, file.type);
      onClose();
    };
    reader.onerror = () => setError('Could not read file');
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:520,maxWidth:'95vw',border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:'var(--serif)',fontSize:19,fontWeight:700 }}>Upload your menu</div>
            <div style={{ fontSize:12,color:'var(--ink-3)',marginTop:2 }}>PDF, JPG, PNG or WEBP — up to 20 MB</div>
          </div>
          <button onClick={onClose} disabled={scanning} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)' }}>✕</button>
        </div>

        <div style={{ padding:'20px 22px' }}>
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onClick={()=>!scanning&&inputRef.current?.click()}
            style={{ border:`2px dashed ${dragOver?'var(--gold)':'var(--border)'}`, borderRadius:12, padding:'32px 20px', textAlign:'center', cursor:scanning?'wait':'pointer', background:dragOver?'var(--gold-bg)':'var(--bg)', transition:'all .15s', marginBottom:16 }}>
            <input ref={inputRef} type="file" accept=".pdf,image/*" style={{ display:'none' }} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight:180, maxWidth:'100%', borderRadius:8, marginBottom:10 }}/>
            ) : (
              <div style={{ fontSize:40, marginBottom:10 }}>{file?.type==='application/pdf'?'📄':'📷'}</div>
            )}
            {file ? (
              <div>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{file.name}</div>
                <div style={{ fontSize:12, color:'var(--ink-3)' }}>{(file.size/1024/1024).toFixed(1)} MB · {file.type}</div>
                <button className="btn btn-sm" style={{ marginTop:10 }} onClick={e=>{e.stopPropagation();setFile(null);setPreview(null);}}>Change file</button>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight:500, fontSize:14, marginBottom:4 }}>Drop your menu here</div>
                <div style={{ fontSize:12, color:'var(--ink-3)' }}>or click to browse — PDF, JPG, PNG, WEBP</div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div style={{ background:'var(--bg)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:12, color:'var(--ink-3)', lineHeight:1.8 }}>
            <div style={{ fontWeight:600, color:'var(--ink)', marginBottom:4 }}>Tips for best results</div>
            <div>• PDFs work better than photos — export directly from your design software</div>
            <div>• Photos: good lighting, flat surface, all text visible</div>
            <div>• Multi-page PDFs are fully supported</div>
            <div>• Claude will extract all items, prices, sections, and descriptions</div>
          </div>

          {error && <div style={{ color:'#F26C6C', fontSize:12, marginBottom:12 }}>⚠ {error}</div>}

          {scanning && (
            <div style={{ background:'#0A1A2A', borderRadius:10, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
              <div className="spinner" style={{ width:20, height:20, flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>Reading your menu…</div>
                <div style={{ fontSize:11, color:'var(--ink-3)' }}>Claude is extracting all sections, items, descriptions, and prices. This takes 10–30 seconds.</div>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose} disabled={scanning}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSubmit} disabled={!file||scanning}>
              {scanning ? '🤖 Reading menu…' : '🤖 Extract menu items'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scan result banner ─────────────────────────────────────────────────────────
function ScanResultBanner({ result, onDismiss, onGoToMatrix }) {
  return (
    <div style={{ background:'linear-gradient(135deg,#0A2A1A,#0A1A0A)', border:'1px solid #3ECF8E40', borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', gap:16, alignItems:'center' }}>
      <div style={{ fontSize:32 }}>🎉</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:'#3ECF8E' }}>Menu imported successfully</div>
        <div style={{ fontSize:13, color:'var(--ink-3)', lineHeight:1.6 }}>
          Created <strong style={{ color:'var(--ink)' }}>{result.items_created} items</strong> across <strong style={{ color:'var(--ink)' }}>{result.sections_created} sections</strong>.
          {result.items_total > result.items_created && ` (${result.items_total - result.items_created} skipped — already existed)`}
          {result.restaurant_name && ` Menu: ${result.restaurant_name}.`}
        </div>
        <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:4 }}>
          Next: add food costs to items to unlock the matrix analysis, or run AI pricing suggestions.
        </div>
      </div>
      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        <button className="btn btn-primary btn-sm" onClick={onGoToMatrix}>View matrix →</button>
        <button className="btn btn-sm" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
