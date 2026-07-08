import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { agent3, locations as locationsApi } from '../../lib/api.js';
import { useAuth } from '../../App.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key:'food',     label:'Food / BOH',   icon:'🥩', color:'var(--chart-food)' },
  { key:'beverage', label:'Beverage / Bar',icon:'🍷', color:'var(--chart-bar)' },
  { key:'cleaning', label:'Cleaning',      icon:'🧹', color:'var(--blue)' },
  { key:'paper',    label:'Paper / FOH',   icon:'📦', color:'var(--amber)' },
  { key:'other',    label:'Other',         icon:'📋', color:'var(--ink3)' },
];

const STORAGE_AREAS = [
  'walk_in_cooler','walk_in_freezer','dry_storage','bar_storage',
  'foh_storage','prep_area','other',
];

const STATUS_COLORS = {
  pending_review: 'var(--amber)',
  approved:       'var(--green)',
  rejected:       'var(--red)',
  in_progress:    'var(--blue)',
  submitted:      'var(--green)',
};

const fmt$ = n => n==null?'—':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

// ── Invoice Scanner ───────────────────────────────────────────────────────────
function InvoiceScanner({ locationId, category, onScanned, onClose }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError]       = useState('');
  const [cat, setCat]           = useState(category || 'food');
  const dropRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleScan = async () => {
    if (!file) return setError('Please select an invoice image or PDF');
    setScanning(true); setError('');
    try {
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || 'image/jpeg';
      const data = await agent3.scanInvoice({ imageBase64: base64, mimeType, locationId, category: cat });
      onScanned(data);
      onClose();
    } catch(e) { setError(e.message); }
    finally { setScanning(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:40, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:560, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:22, fontStyle:'italic' }}>📄 Scan invoice</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          <div className="form-group">
            <label className="form-label">Invoice type</label>
            <div style={{ display:'flex', gap:8 }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={()=>setCat(c.key)} className="btn btn-sm" style={cat===c.key?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div ref={dropRef} onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onClick={()=>document.getElementById('invoice-file').click()}
            style={{ border:`2px dashed ${file?'var(--green)':'var(--border2)'}`, borderRadius:'var(--r)', padding:'24px', textAlign:'center', cursor:'pointer', marginBottom:16, background: file ? 'var(--green-bg)' : 'var(--bg)', transition:'all .15s' }}>
            {preview && file?.type?.startsWith('image/') ? (
              <img src={preview} alt="Invoice" style={{ maxHeight:240, maxWidth:'100%', borderRadius:'var(--r-sm)', objectFit:'contain' }}/>
            ) : file ? (
              <div style={{ fontSize:14, color:'var(--green)' }}>📄 {file.name} ready to scan</div>
            ) : (
              <>
                <div style={{ fontSize:36, marginBottom:8 }}>📸</div>
                <div style={{ fontSize:13, color:'var(--ink2)', fontWeight:500 }}>Take a photo or upload invoice</div>
                <div style={{ fontSize:11, color:'var(--ink3)', marginTop:4 }}>Supports JPG, PNG, PDF · Drop here or click to browse</div>
              </>
            )}
            <input id="invoice-file" type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} capture="environment"/>
          </div>

          <div className="alert alert-blue" style={{ marginBottom:16 }}>
            <span>ℹ</span>
            <div style={{ fontSize:11 }}>Claude Vision reads the invoice and extracts every line item automatically — vendor, items, quantities, prices. You review and approve before anything is committed. Price increases {'>'} 10% are flagged automatically.</div>
          </div>

          {error && <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>}

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleScan} disabled={scanning||!file}>
              {scanning ? '🔍 Scanning…' : '🔍 Scan with AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Review ────────────────────────────────────────────────────────────
function InvoiceReview({ invoiceId, onApproved, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    agent3.getInvoice(invoiceId).then(d => { setData(d); setLoading(false); }).catch(console.error);
  }, [invoiceId]);

  const handleApprove = async () => {
    setApproving(true);
    try { await agent3.approveInvoice(invoiceId); onApproved(); onClose(); }
    catch(e) { alert(e.message); }
    finally { setApproving(false); }
  };

  if (loading) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div className="spinner"/>
    </div>
  );

  const { invoice, lineItems } = data || {};
  const flagged = lineItems?.filter(l => l.flagged) || [];
  const unmatched = lineItems?.filter(l => !l.matched) || [];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:32, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:720, maxWidth:'96vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic' }}>{invoice?.vendor || 'Invoice'}</h2>
            <div style={{ fontSize:11, color:'var(--ink3)', fontFamily:'var(--mono)', marginTop:2 }}>
              #{invoice?.invoice_number} · {fmtDate(invoice?.invoice_date)} · {fmt$(invoice?.total_amount)}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>

        <div style={{ padding:'16px 22px', maxHeight:'70vh', overflowY:'auto' }}>
          {/* Flags */}
          {flagged.length > 0 && (
            <div className="alert alert-red" style={{ marginBottom:14 }}>
              <span>⚠</span>
              <div>
                <strong>{flagged.length} price alert{flagged.length>1?'s':''}</strong>
                {flagged.map((f,i) => <div key={i} style={{ fontSize:11, marginTop:3 }}>• {f.description}: {f.flag_reason}</div>)}
              </div>
            </div>
          )}
          {unmatched.length > 0 && (
            <div className="alert alert-gold" style={{ marginBottom:14 }}>
              <span>ℹ</span>
              <div><strong>{unmatched.length} new items</strong> will be added to your catalog on approval</div>
            </div>
          )}

          {/* Line items table */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                {['Item','Qty','Unit','Unit price','Total','Status'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems?.map((li, i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: li.flagged ? 'var(--red-bg)' : '' }}
                  onMouseEnter={e => e.currentTarget.style.background = li.flagged ? 'var(--red-bg)' : 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = li.flagged ? 'var(--red-bg)' : ''}>
                  <td style={{ padding:'9px 12px', fontWeight:500 }}>
                    {li.description}
                    {li.flagged && <div style={{ fontSize:10, color:'var(--red)', marginTop:2 }}>⚠ {li.flag_reason}</div>}
                  </td>
                  <td style={{ padding:'9px 12px', fontFamily:'var(--mono)' }}>{li.quantity || '—'}</td>
                  <td style={{ padding:'9px 12px', color:'var(--ink3)' }}>{li.unit || '—'}</td>
                  <td style={{ padding:'9px 12px', fontFamily:'var(--mono)' }}>{fmt$(li.unit_price)}</td>
                  <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontWeight:500 }}>{fmt$(li.total_price)}</td>
                  <td style={{ padding:'9px 12px' }}>
                    {li.matched
                      ? <span className="tag tag-green">Matched</span>
                      : <span className="tag tag-gold">New item</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--bg)' }}>
                <td colSpan={4} style={{ padding:'10px 12px', fontWeight:600 }}>Total</td>
                <td style={{ padding:'10px 12px', fontFamily:'var(--mono)', fontWeight:700, fontSize:14 }}>{fmt$(invoice?.total_amount)}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
            {approving ? 'Approving…' : '✓ Approve & update catalog'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Physical Count Sheet ──────────────────────────────────────────────────────
function CountSheet({ countId, onSubmitted, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const d = await agent3.getCount(countId);
    setData(d);
    setLoading(false);
  };
  useEffect(() => { load(); }, [countId]);

  const handleQtyChange = async (lineId, qty) => {
    await agent3.updateCountLine(lineId, { quantity: parseFloat(qty) || 0 }).catch(console.error);
    setData(d => ({
      ...d,
      lines: d.lines.map(l => l.id === lineId ? { ...l, quantity: parseFloat(qty)||0, total_value: (parseFloat(qty)||0) * (l.unit_price||0) } : l),
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try { await agent3.submitCount(countId); onSubmitted(); onClose(); }
    catch(e) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div className="spinner"/>
    </div>
  );

  const { count, lines } = data || {};
  const byArea = {};
  const filteredLines = lines?.filter(l => !filter || l.item_name.toLowerCase().includes(filter.toLowerCase())) || [];
  filteredLines.forEach(l => { const a = l.storage_area || 'other'; if (!byArea[a]) byArea[a] = []; byArea[a].push(l); });
  const totalValue = lines?.reduce((s,l) => s + (parseFloat(l.total_value)||0), 0) || 0;
  const countedItems = lines?.filter(l => l.quantity != null && l.quantity > 0).length || 0;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:760, maxWidth:'96vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic' }}>
              {count?.category === 'beverage' ? '🍷 Bar count' : '🥩 Kitchen count'} — {fmtDate(count?.count_date)}
            </h2>
            <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>
              {countedItems}/{lines?.length} items counted · estimated value: <strong style={{ color:'var(--gold)', fontFamily:'var(--mono)' }}>{fmt$(totalValue)}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)' }}>
          <input className="form-input" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search items…" style={{ fontSize:12, maxWidth:280 }}/>
        </div>

        {/* Count lines grouped by storage area */}
        <div style={{ maxHeight:'60vh', overflowY:'auto' }}>
          {Object.entries(byArea).map(([area, areaLines]) => (
            <div key={area}>
              <div style={{ padding:'8px 20px', background:'var(--bg)', fontSize:10, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                {area.replace(/_/g,' ')} ({areaLines.length} items)
              </div>
              {areaLines.map(line => (
                <div key={line.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{line.item_name}</div>
                    <div style={{ fontSize:10, color:'var(--ink3)', marginTop:1 }}>
                      {line.unit} · {fmt$(line.unit_price)}/unit
                      {line.par_level && <span style={{ marginLeft:8, color:'var(--blue)' }}>par: {line.par_level}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <input
                      type="number" min={0} step={0.1}
                      defaultValue={line.quantity || ''}
                      onBlur={e => handleQtyChange(line.id, e.target.value)}
                      placeholder="0"
                      style={{ width:72, fontFamily:'var(--mono)', fontSize:14, fontWeight:500, textAlign:'right', padding:'6px 8px', borderRadius:'var(--r-sm)', border:'1px solid var(--border2)', background:'var(--bg)', color:'var(--ink)' }}
                    />
                    <span style={{ fontSize:11, color:'var(--ink3)', width:28 }}>{line.unit?.slice(0,4)}</span>
                    <span style={{ fontFamily:'var(--mono)', fontSize:12, color: line.quantity > 0 ? 'var(--green)' : 'var(--ink4)', width:70, textAlign:'right' }}>
                      {line.quantity > 0 ? fmt$(parseFloat(line.quantity) * parseFloat(line.unit_price||0)) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, fontFamily:'var(--mono)', fontSize:14 }}>
            Total inventory value: <strong style={{ color:'var(--gold)', fontSize:18 }}>{fmt$(totalValue)}</strong>
          </div>
          <button className="btn" onClick={onClose}>Save & close</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : '✓ Submit count'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Bulk Invoice Scanner ──────────────────────────────────────────────────────
function BulkInvoiceScanner({ locationId, onComplete, onClose }) {
  const [files, setFiles]       = useState([]);
  const [scanning, setScanning] = useState(false);
  const [results, setResults]   = useState([]);
  const [progress, setProgress] = useState(0);
  const [cat, setCat]           = useState('food');

  const addFiles = (fileList) => {
    const arr = Array.from(fileList).map(f => ({ file: f, name: f.name }));
    setFiles(prev => {
      const existing = new Set(prev.map(x => x.name));
      return [...prev, ...arr.filter(a => !existing.has(a.name))];
    });
  };

  const removeFile = (i) => setFiles(f => f.filter((_,idx) => idx !== i));

  const handleScanAll = async () => {
    if (!files.length) return;
    setScanning(true); setResults([]); setProgress(0);
    const invoices = [];
    for (const item of files) {
      const base64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(item.file);
      });
      invoices.push({ imageBase64:base64, mimeType:item.file.type||'image/jpeg', filename:item.name, category:cat });
    }
    const batchSize = 3;
    const allResults = [];
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, i+batchSize);
      try {
        const r = await agent3.scanBulk({ invoices:batch, locationId });
        allResults.push(...r);
      } catch(e) {
        batch.forEach(b => allResults.push({ ok:false, filename:b.filename, error:e.message }));
      }
      setProgress(Math.min(100, Math.round(((i+batchSize)/invoices.length)*100)));
      setResults([...allResults]);
    }
    setScanning(false);
    onComplete();
  };

  const succeeded = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:50, paddingTop:32, overflowY:'auto' }}>
      <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:600, maxWidth:'96vw', boxShadow:'var(--shadow-lg)', margin:'0 16px 48px', border:'1px solid var(--border)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:22, fontStyle:'italic' }}>📂 Bulk invoice upload</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          {/* Category */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:8 }}>Invoice type</div>
            <div style={{ display:'flex', gap:8 }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={()=>setCat(c.key)} className="btn btn-sm"
                  style={cat===c.key?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* File picker — plain visible input */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:8 }}>Select invoice files</div>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              disabled={scanning}
              onClick={e => e.stopPropagation()}
              onChange={e => { addFiles(e.target.files); e.stopPropagation(); }}
              style={{ display:'block', width:'100%', fontSize:13, color:'var(--ink)', cursor:'pointer' }}
            />
            <div style={{ fontSize:10, color:'var(--ink3)', marginTop:6 }}>
              Hold <strong>Cmd</strong> (Mac) or <strong>Ctrl</strong> (Windows) to select multiple files
            </div>
          </div>

          {/* Drag zone */}
          <div
            onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}
            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--gold)';e.currentTarget.style.background='var(--gold-bg)';}}
            onDragLeave={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.background='var(--bg)';}}
            style={{ border:'2px dashed var(--border2)', borderRadius:'var(--r-sm)', padding:'16px', textAlign:'center', background:'var(--bg)', marginBottom:16, transition:'all .15s' }}
          >
            <div style={{ fontSize:11, color:'var(--ink3)' }}>Or drag & drop files here</div>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.1em', fontFamily:'var(--mono)', marginBottom:8 }}>
                {files.length} file{files.length!==1?'s':''} selected
              </div>
              <div style={{ maxHeight:180, overflowY:'auto', border:'1px solid var(--border)', borderRadius:'var(--r-sm)' }}>
                {files.map((f,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                    <span style={{ fontSize:14 }}>{f.file.type?.includes('pdf')?'📄':'🖼️'}</span>
                    <span style={{ flex:1, color:'var(--ink2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize:10, color:'var(--ink3)', fontFamily:'var(--mono)', flexShrink:0 }}>{(f.file.size/1024).toFixed(0)}KB</span>
                    {!scanning && <button onClick={()=>removeFile(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', fontSize:16, lineHeight:1, flexShrink:0, padding:0 }}>×</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {scanning && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--ink3)', marginBottom:6 }}>
                <span>Scanning {files.length} invoice{files.length!==1?'s':''} with Claude Vision…</span>
                <span style={{ fontFamily:'var(--mono)' }}>{progress}%</span>
              </div>
              <div style={{ height:6, background:'var(--bg2)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:progress+'%', background:'var(--gold)', borderRadius:3, transition:'width .4s' }}/>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && !scanning && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', gap:10, marginBottom:8 }}>
                {succeeded > 0 && <div className="alert alert-green" style={{ flex:1, padding:'8px 12px' }}><span>✓</span>{succeeded} scanned — pending review</div>}
                {failed    > 0 && <div className="alert alert-red"   style={{ flex:1, padding:'8px 12px' }}><span>⚠</span>{failed} failed</div>}
              </div>
              {results.filter(r=>!r.ok).map((r,i) => (
                <div key={i} style={{ fontSize:11, color:'var(--red)', padding:'3px 0' }}>✗ {r.filename}: {r.error}</div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>
              {results.length > 0 ? 'Close' : 'Cancel'}
            </button>
            {results.length === 0 && (
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleScanAll} disabled={scanning||!files.length}>
                {scanning ? 'Scanning…' : `🔍 Scan ${files.length||''} invoice${files.length!==1?'s':''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Edit Item Modal ───────────────────────────────────────────────────────────
function VendorModal({ vendor, onClose, onSaved }) {
  const isNew = !vendor;
  const [form, setForm] = useState({
    name: vendor?.name||'', category: vendor?.category||'food', contact_name: vendor?.contact_name||'',
    phone: vendor?.phone||'', email: vendor?.email||'', address: vendor?.address||'',
    account_number: vendor?.account_number||'', payment_terms: vendor?.payment_terms||'',
    website: vendor?.website||'', notes: vendor?.notes||'',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const F = (key, label, ph='') => (
    <div className="form-group" style={{ marginBottom:10 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={form[key]} placeholder={ph} style={{ fontSize:12 }}
        onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/>
    </div>
  );
  const save = async () => {
    if (!form.name.trim()) return setError('Vendor name is required');
    setSaving(true); setError('');
    try {
      if (isNew) await agent3.vendorAdd(form); else await agent3.vendorUpdate(vendor.id, form);
      onSaved();
    } catch(e){ setError(e.message); setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remove this vendor from the directory? Invoice history is kept.')) return;
    setSaving(true);
    try { await agent3.vendorDelete(vendor.id); onSaved(); } catch(e){ setError(e.message); setSaving(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:560, maxWidth:'95vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>{isNew ? 'Add vendor' : 'Edit vendor'}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'14px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
            {F('name','Vendor name *','Sysco, ABC Hood Cleaning…')}
            <div className="form-group" style={{ marginBottom:10 }}>
              <label className="form-label">Category</label>
              <select className="form-input" value={form.category} style={{ fontSize:12 }}
                onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                {['food','beverage','maintenance','services','equipment','other'].map(c=>(<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            {F('contact_name','Contact person')}
            {F('phone','Phone')}
            {F('email','Email')}
            {F('account_number','Account number','Your customer # with them')}
            {F('payment_terms','Payment terms','Net 30, COD…')}
            {F('website','Website')}
          </div>
          {F('address','Address')}
          <div className="form-group" style={{ marginBottom:10 }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} style={{ fontSize:12 }}
              placeholder="Delivery windows, rep details, after-hours line…"
              onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
          </div>
          {error && <div style={{ color:'var(--red)', fontSize:12 }}>{error}</div>}
        </div>
        <div style={{ padding:'12px 20px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
          {!isNew && <button className="btn btn-sm" style={{ color:'var(--red)' }} disabled={saving} onClick={remove}>Remove</button>}
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save vendor'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function EditItemModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({ ...item });
  const [saving, setSaving] = useState(false);
  const f = (key, label, type='text', placeholder='') => (
    <div className="form-group" style={{ marginBottom:12 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[key]||''} placeholder={placeholder}
        onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={{ fontSize:12 }}/>
    </div>
  );
  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:480, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontStyle:'italic' }}>{item.id ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {f('name', 'Item name', 'text', 'e.g. Chicken thighs')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category||'food'} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={{ fontSize:12 }}>
                {CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label className="form-label">Storage area</label>
              <select className="form-select" value={form.storage_area||'dry_storage'} onChange={e=>setForm(p=>({...p,storage_area:e.target.value}))} style={{ fontSize:12 }}>
                {STORAGE_AREAS.map(a=><option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {f('unit', 'Unit', 'text', 'CS, LB, EA, GAL…')}
            {f('vendor', 'Vendor', 'text', 'Sysco, US Foods…')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {f('last_price', 'Last price ($)', 'number', '0.00')}
            {f('par_level', 'Par level', 'number', '0')}
            {f('reorder_point', 'Reorder point', 'number', '0')}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (form.id ? 'Save item' : 'Add item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Agent 3 page ─────────────────────────────────────────────────────────
export default function Agent3Inventory() {
  const { location: selectedLocationId, setLocation } = useAuth();
  const [allLocations, setAllLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  // Phase 2: the tab lives in the URL (/inventory/:tab)
  const { tab: _urlTab } = useParams();
  const _nav = useNavigate();
  const _navLoc = useLocation();
  const activeTab = _urlTab || 'invoices';
  const setActiveTab = (t) => _nav('/inventory/' + t);
  useEffect(() => { // backcompat: old ?tab= links redirect to the path form
    const t = new URLSearchParams(_navLoc.search).get('tab');
    if (t) _nav('/inventory/' + t, { replace: true });
  }, [_navLoc.search]);
  const [invoices, setInvoices]     = useState([]);
  const [items, setItems]           = useState([]);
  const [counts, setCounts]         = useState([]);
  const [cogs, setCogs]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [summary, setSummary]       = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showBulkScanner, setShowBulkScanner] = useState(false);
  const [emailQueue, setEmailQueue] = useState([]);
  const [reviewInvoiceId, setReviewInvoiceId] = useState(null);
  const [countSheetId, setCountSheetId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [toast, setToast]           = useState(null);
  const [newCountModal, setNewCountModal] = useState(false);
  const [newCountForm, setNewCountForm]   = useState({ category:'food', countDate: new Date().toISOString().slice(0,10) });
  const [editItem, setEditItem]           = useState(null);  // item being edited
  const [recipes, setRecipes]               = useState([]);
  const [orders, setOrders]                 = useState([]);
  const [currentOrder, setCurrentOrder]     = useState(null); // null=list, order obj=detail
  const [generatedLines, setGeneratedLines] = useState([]);
  const [generating, setGenerating]         = useState(false);
  const [editRecipe, setEditRecipe]         = useState(null);  // null=closed, {}=new, {id}=edit
  const [costingReport, setCostingReport]   = useState(null);
  const [recipeView, setRecipeView]         = useState('list'); // 'list' | 'costing'

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    locationsApi.list().then(locs => {
      setAllLocations(locs);
      // Always follow the sidebar selection — default to first location only if sidebar has one set
      const active = selectedLocationId
        ? locs.find(l => l.id === selectedLocationId)
        : locs[0] || null;
      setCurrentLocation(active);
    }).catch(()=>{});
  }, [selectedLocationId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    if (!currentLocation && allLocations.length === 0) return; // wait for locations
    const locId = currentLocation?.id || null;
    try {
      const params = locId ? { locationId:locId } : {};
      const [inv, itms, cts, sum] = await Promise.all([
        agent3.invoices(params),
        agent3.items(params),
        agent3.counts(params),
        agent3.summary(locId).catch(()=>null),
      ]);
      setInvoices(Array.isArray(inv)?inv:[]);
      setItems(Array.isArray(itms)?itms:[]);
      setCounts(Array.isArray(cts)?cts:[]);
      setSummary(sum);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentLocation]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadCOGS = async (cat) => {
    if (!currentLocation) return;
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
    try {
      const data = await agent3.cogs({ locationId:currentLocation.id, periodStart:firstOfMonth, periodEnd:today.toISOString().slice(0,10), category:cat||'food' });
      setCogs(data);
    } catch(e) { console.error(e); }
  };

  useEffect(() => { if (activeTab==='cogs') loadCOGS(filterCat||'food'); }, [activeTab, currentLocation]);
  useEffect(() => {
    if (activeTab === 'orders') {
      const params = currentLocation?.id ? { locationId:currentLocation.id } : {};
      agent3.orders(params).then(o => setOrders(Array.isArray(o)?o:[])).catch(()=>{});
    }
    if (activeTab === 'recipes') {
      const locId = currentLocation?.id;
      const params = locId ? { locationId:locId } : {};
      agent3.recipes(params).then(r => setRecipes(Array.isArray(r)?r:[])).catch(()=>{});
      agent3.costingReport(params).then(r => setCostingReport(r)).catch(()=>{});
    }
  }, [activeTab, currentLocation]);
  useEffect(() => {
    if (activeTab==='email' && currentLocation) {
      agent3.emailQueue().then(d => setEmailQueue(Array.isArray(d)?d:[])).catch(()=>{});
    }
  }, [activeTab, currentLocation]);
  const [costWatch, setCostWatch] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorCat, setVendorCat] = useState('');
  const [editVendor, setEditVendor] = useState(undefined); // undefined=closed, null=new, object=edit
  const loadVendors = useCallback(() => {
    agent3.vendors({ search: vendorSearch || undefined, category: vendorCat || undefined })
      .then(setVendors).catch(() => setVendors([]));
  }, [vendorSearch, vendorCat]);
  useEffect(() => { if (activeTab === 'vendors') loadVendors(); }, [activeTab, loadVendors]);
  useEffect(() => {
    if (activeTab !== 'costwatch') return;
    const params = currentLocation?.id ? { locationId: currentLocation.id } : {};
    Promise.all([
      (agent3.priceWatch ? agent3.priceWatch(params) : Promise.resolve(null)).catch(()=>null),
      (agent3.foodCostTrend ? agent3.foodCostTrend(params) : Promise.resolve(null)).catch(()=>null),
    ]).then(([pw, trend]) => setCostWatch({ pw, trend }));
  }, [activeTab, currentLocation]);

  const handleDeleteInvoice = async (id) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try { await agent3.deleteInvoice(id); showToast('Invoice deleted'); await loadAll(); }
    catch(e) { showToast(e.message, true); }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Remove this item from the catalog?')) return;
    try { await agent3.deleteItem(id); showToast('Item removed'); await loadAll(); }
    catch(e) { showToast(e.message, true); }
  };

  const handleSaveItem = async (item) => {
    try {
      if (item.id) {
        await agent3.updateItem(item.id, item);
      } else {
        await agent3.createItem({ ...item, location_id: currentLocation?.id });
      }
      showToast(item.id ? 'Item saved' : 'Item added');
      setEditItem(null);
      await loadAll();
    } catch(e) { showToast(e.message, true); }
  };

  const handleStartCount = async () => {
    try {
      const count = await agent3.createCount({ ...newCountForm, locationId:currentLocation?.id });
      setNewCountModal(false);
      setCountSheetId(count.id);
      showToast('Count sheet created');
    } catch(e) { showToast(e.message, true); }
  };

  const tabs = [
    { key:'invoices', label:'📄 Invoices' },
    { key:'catalog',  label:'📋 Item catalog' },
    { key:'counts',   label:'🔢 Physical counts' },
    { key:'cogs',     label:'📊 COGS' },
    { key:'costwatch',label:'💹 Cost watch' },
    { key:'vendors',  label:'🏢 Vendors' },
    { key:'email',    label:'📧 Email queue' },
    { key:'recipes',  label:'🍽️ Recipes & costing' },
    { key:'orders',   label:'📋 Order lists' },
  ];

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review');

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div style={{ flexBasis:'100%', fontSize:10, fontFamily:'var(--mono)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:3 }}>Inventory Management <span style={{ color:'var(--gold)' }}>▸ {((tabs.find(t=>t.key===activeTab)||{}).label||activeTab).replace(/^[^A-Za-z]+/,'')}</span></div>
          <h1 className="page-title">Inventory Management — {currentLocation?.name || '…'}</h1>
          <div className="page-sub">
            {summary?.items?.total || 0} items · {summary?.invoices?.pending || pendingInvoices.length} invoices pending
          </div>
        </div>
        <div className="topbar-right">
          {allLocations.length > 1 && (
            <span className="btn" style={{ cursor:'default', opacity:.9 }} title="Change restaurant from the sidebar">📍 {currentLocation?.name || 'All restaurants'}</span>
          )}
          <button className="btn" onClick={loadAll}>↻</button>
          {activeTab==='invoices'  && <>
            <button className="btn" onClick={()=>setShowBulkScanner(true)}>📂 Bulk upload</button>
            <button className="btn btn-primary" onClick={()=>setShowScanner(true)}>📄 Scan invoice</button>
          </>}
          {activeTab==='counts'    && <button className="btn btn-primary" onClick={()=>setNewCountModal(true)}>🔢 Start count</button>}
          {activeTab==='catalog'   && <button className="btn btn-primary" onClick={()=>setEditItem({ id:null, name:'', category:'food', unit:'each', storage_area:'dry_storage', vendor:'', par_level:'', reorder_point:'', last_price:'' })}>+ Add item</button>}
          {activeTab==='orders'     && !currentOrder && <button className="btn btn-primary" onClick={async()=>{
            setGenerating(true);
            try {
              const params = currentLocation?.id ? { locationId:currentLocation.id } : {};
              const lines = await agent3.generateOrderList(params);
              setGeneratedLines(lines);
              setCurrentOrder({ _new:true, title:'', vendor:'', notes:'', lines });
            } catch(e) { showToast(e.message, true); }
            finally { setGenerating(false); }
          }} disabled={generating}>{generating?'Generating…':'⚡ Generate from par levels'}</button>}
          {activeTab==='orders'     && !currentOrder && <button className="btn btn-sm" onClick={()=>setCurrentOrder({ _new:true, title:'', vendor:'', notes:'', lines:[] })}>+ Blank order</button>}
          {activeTab==='orders'     && currentOrder  && <button className="btn btn-sm" onClick={()=>setCurrentOrder(null)}>← Back to orders</button>}
          {activeTab==='recipes'    && <div style={{ display:'flex', gap:8 }}>
            <button className={`btn btn-sm${recipeView==='list'?' btn-primary':''}`} onClick={()=>setRecipeView('list')}>Recipes</button>
            <button className={`btn btn-sm${recipeView==='costing'?' btn-primary':''}`} onClick={()=>setRecipeView('costing')}>Costing report</button>
            {recipeView==='list' && <button className="btn btn-primary" onClick={()=>setEditRecipe({ name:'', category:'', type:'dish', yieldQty:1, yieldUnit:'portion', menuPrice:'', ingredients:[] })}>+ New recipe</button>}
          </div>}
        </div>
      </div>


      <div className="content">
        {/* ── INVOICES ── */}
        {activeTab==='invoices' && (
          <>
            {/* Summary stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              {[
                { label:'Pending review', val:pendingInvoices.length,                                   color:pendingInvoices.length>0?'var(--amber)':'var(--green)' },
                { label:'Approved this month', val:invoices.filter(i=>i.status==='approved').length,    color:'var(--green)' },
                { label:'Total spend (approved)', val:fmt$(invoices.filter(i=>i.status==='approved').reduce((s,i)=>s+(parseFloat(i.total_amount)||0),0)), color:'var(--ink)' },
                { label:'Items in catalog', val:items.length,                                           color:'var(--ink)' },
              ].map((s,i)=>(
                <div key={i} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color:s.color, fontSize:s.val?.toString().includes('$')?20:28 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display:'flex', gap:6, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
              {['','pending_review','approved'].map(s=>(
                <button key={s||'all'} className="btn btn-sm" style={filterStatus===s?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>setFilterStatus(s)}>
                  {s==='pending_review'?'⏳ Pending':s==='approved'?'✓ Approved':'All'}
                </button>
              ))}
              <div style={{ width:1, height:16, background:'var(--border2)', margin:'0 4px' }}/>
              {['',...CATEGORIES.map(c=>c.key)].map(c=>(
                <button key={c||'all'} className="btn btn-sm" style={filterCat===c?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>setFilterCat(c)}>
                  {c?CATEGORIES.find(x=>x.key===c)?.label:'All types'}
                </button>
              ))}
            </div>

            {loading ? <div className="spinner"/> : (
              invoices.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-title">No invoices yet</div>
                  <div className="empty-state-sub" style={{ marginBottom:16 }}>Scan your first vendor invoice — Claude Vision extracts all line items automatically</div>
                  <button className="btn btn-primary" onClick={()=>setShowScanner(true)}>📄 Scan first invoice</button>
                </div>
              ) : (
                <div className="card-raised">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'var(--bg)' }}>
                        {['Date','Vendor','Invoice #','Type','Items','Total','Status',''].map(h=>(
                          <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.filter(i=>(!filterStatus||i.status===filterStatus)&&(!filterCat||i.category===filterCat)).map((inv,i)=>(
                        <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                          onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{fmtDate(inv.invoice_date||inv.created_at)}</td>
                          <td style={{ padding:'10px 14px', fontWeight:500 }}>{inv.vendor||'Unknown'}</td>
                          <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink3)' }}>{inv.invoice_number||'—'}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:'var(--bg2)', color:'var(--ink3)', fontWeight:500 }}>
                              {CATEGORIES.find(c=>c.key===inv.category)?.icon} {CATEGORIES.find(c=>c.key===inv.category)?.label||inv.category}
                            </span>
                          </td>
                          <td style={{ padding:'10px 14px', textAlign:'center' }}>—</td>
                          <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:500 }}>{fmt$(inv.total_amount)}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[inv.status]||'var(--ink3)', textTransform:'uppercase', letterSpacing:'.05em' }}>{inv.status?.replace('_',' ')}</span>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex', gap:4 }}>
                            <button className="btn btn-sm" onClick={()=>setReviewInvoiceId(inv.id)}>
                              {inv.status==='pending_review'?'Review':'View'}
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={()=>handleDeleteInvoice(inv.id)}>Delete</button>
                          </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}

        {/* ── CATALOG ── */}
        {activeTab==='catalog' && (
          <div className="card-raised">
            <div className="card-header">
              <span className="card-title">Item catalog</span>
              <span style={{ fontSize:11, color:'var(--ink3)' }}>{items.length} items · built from approved invoices</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--bg)' }}>
                    {['Item','Category','Unit','Storage','Vendor','Last price','Avg (3mo)','Par',''].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length===0 ? (
                    <tr><td colSpan={8} style={{ padding:'32px', textAlign:'center', color:'var(--ink3)', fontStyle:'italic' }}>No items yet — approve invoices to auto-populate the catalog</td></tr>
                  ) : (
                    items.map((item,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{ padding:'9px 12px', fontWeight:500 }}>{item.name}</td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ fontSize:10 }}>{CATEGORIES.find(c=>c.key===item.category)?.icon} {item.category}</span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'var(--ink3)' }}>{item.unit}</td>
                        <td style={{ padding:'9px 12px', color:'var(--ink3)', fontSize:11 }}>{item.storage_area?.replace(/_/g,' ')}</td>
                        <td style={{ padding:'9px 12px', color:'var(--ink3)' }}>{item.vendor||'—'}</td>
                        <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontWeight:500 }}>{fmt$(item.last_price)}</td>
                        <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color:'var(--ink3)' }}>{fmt$(item.avg_price_3)}</td>
                        <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color: item.last_price && item.par_level ? (item.last_price < item.par_level ? 'var(--red)' : 'var(--green)') : 'var(--ink3)' }}>
                          {item.par_level||'—'}
                        </td>
                        <td style={{ padding:'9px 12px' }}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="btn btn-sm" onClick={()=>setEditItem({...item})}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={()=>handleDeleteItem(item.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PHYSICAL COUNTS ── */}
        {activeTab==='counts' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
              {CATEGORIES.slice(0,2).map(cat=>{
                const lastCount=counts.filter(c=>c.category===cat.key&&c.status==='submitted').sort((a,b)=>b.count_date.localeCompare(a.count_date))[0];
                return (
                  <div key={cat.key} className="stat-card" style={{ borderLeft:`3px solid ${cat.color}` }}>
                    <div className="stat-label">{cat.icon} {cat.label}</div>
                    <div className="stat-value" style={{ fontSize:22 }}>{lastCount ? fmt$(lastCount.total_value) : '—'}</div>
                    <div className="stat-delta delta-muted">{lastCount ? `Last count: ${fmtDate(lastCount.count_date)}` : 'No counts yet'}</div>
                  </div>
                );
              })}
            </div>

            {counts.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔢</div>
                <div className="empty-state-title">No counts yet</div>
                <div className="empty-state-sub" style={{ marginBottom:16 }}>Start a physical count to track your actual inventory value</div>
                <button className="btn btn-primary" onClick={()=>setNewCountModal(true)}>🔢 Start first count</button>
              </div>
            ) : (
              <div className="card-raised">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Date','Type','Period','Status','Total value',''].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map((c,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{fmtDate(c.count_date)}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:11 }}>{CATEGORIES.find(x=>x.key===c.category)?.icon} {CATEGORIES.find(x=>x.key===c.category)?.label||c.category}</span>
                        </td>
                        <td style={{ padding:'10px 14px', color:'var(--ink3)', fontSize:11 }}>
                          {c.period_start?`${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}`:'—'}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[c.status], textTransform:'uppercase', letterSpacing:'.05em' }}>{c.status?.replace('_',' ')}</span>
                        </td>
                        <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:500 }}>{c.total_value?fmt$(c.total_value):'—'}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <button className="btn btn-sm" onClick={()=>setCountSheetId(c.id)}>
                            {c.status==='in_progress'?'Continue counting':'View'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── COGS ── */}
        {activeTab==='cogs' && (
          <>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {CATEGORIES.slice(0,2).map(cat=>(
                <button key={cat.key} className="btn btn-sm" style={filterCat===cat.key?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>{setFilterCat(cat.key);loadCOGS(cat.key);}}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {cogs ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
                <div className="card-raised" style={{ gridColumn:'1/-1' }}>
                  <div className="card-header">
                    <span className="card-title">COGS calculation — {cogs.period_start} to {cogs.period_end}</span>
                    <span style={{ fontSize:11, color:'var(--ink3)' }}>{filterCat||'food'}</span>
                  </div>
                  <div className="card-body">
                    {/* Waterfall */}
                    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                      {[
                        { label:'Opening inventory', val:cogs.opening_inventory, sub:`Count date: ${fmtDate(cogs.opening_date)}`, color:'var(--ink)', sign:'' },
                        { label:'+ Purchases', val:cogs.purchases, sub:'Approved invoices in period', color:'var(--amber)', sign:'+' },
                        { label:'− Closing inventory', val:cogs.closing_inventory, sub:`Count date: ${fmtDate(cogs.closing_date)}`, color:'var(--blue)', sign:'−' },
                        { label:'= Cost of goods sold', val:cogs.cogs, sub:'Opening + Purchases − Closing', color:'var(--gold)', sign:'=', bold:true },
                      ].map((row,i)=>(
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 0', borderBottom:i<3?'1px solid var(--border)':undefined }}>
                          <div style={{ width:24, fontFamily:'var(--mono)', fontSize:18, color:'var(--ink3)', flexShrink:0 }}>{row.sign}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:row.bold?14:12, fontWeight:row.bold?600:500, color:row.bold?'var(--gold)':'var(--ink2)' }}>{row.label}</div>
                            <div style={{ fontSize:10, color:'var(--ink3)', marginTop:2 }}>{row.sub}</div>
                          </div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:row.bold?24:18, fontWeight:row.bold?700:500, color:row.color }}>{fmt$(row.val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Missing data alerts */}
                {(!cogs.opening_date || !cogs.closing_date) && (
                  <div className="alert alert-gold" style={{ gridColumn:'1/-1' }}>
                    <span>ℹ</span>
                    <div>
                      {!cogs.opening_date && <div>No opening inventory count found. Submit a physical count before the period start to get accurate COGS.</div>}
                      {!cogs.closing_date && <div>No closing inventory count found. Submit a physical count at period end to complete the calculation.</div>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-title">Loading COGS…</div>
              </div>
            )}
          </>
        )}

        {/* ── EMAIL QUEUE ── */}
        {activeTab==='orders' && (
          <OrdersTab
            orders={orders}
            currentOrder={currentOrder}
            items={items}
            locationId={currentLocation?.id}
            onSelect={o=>{ agent3.order(o.id).then(full=>setCurrentOrder(full)).catch(()=>setCurrentOrder(o)); }}
            onNew={o=>{ setOrders(prev=>[o,...prev]); setCurrentOrder(null); showToast('Order list saved'); }}
            onDelete={async id=>{ await agent3.deleteOrder(id); setOrders(prev=>prev.filter(o=>o.id!==id)); showToast('Order deleted'); }}
            onClose={()=>setCurrentOrder(null)}
            showToast={showToast}
          />
        )}

        {activeTab==='recipes' && (
          <RecipeTab
            recipes={recipes}
            costingReport={costingReport}
            view={recipeView}
            items={items}
            locationId={currentLocation?.id}
            onEdit={r=>setEditRecipe(r)}
            onDelete={async id=>{ await agent3.deleteRecipe(id); setRecipes(r=>r.filter(x=>x.id!==id)); showToast('Recipe deleted'); }}
          />
        )}

        {activeTab==='vendors' && (
          <>
          {vendors && vendors.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              {(() => {
                const noContact = vendors.filter(v=>!v.phone && !v.email).length;
                const maint = vendors.filter(v=>!['food','beverage'].includes(v.category)).length;
                const spend = vendors.reduce((t,v)=>t+(parseFloat(v.spend_90d)||0),0);
                return [
                  { label:'Vendors on file', val:vendors.length, color:'var(--ink)' },
                  { label:'Maintenance & services', val:maint, color:'var(--ink)' },
                  { label:'90-day spend (approved)', val:fmt$(spend), color:'var(--ink)' },
                  { label:'Missing contact info', val:noContact, color:noContact>0?'var(--amber)':'var(--green)' },
                ].map((c,i)=>(
                  <div key={i} className="stat-card">
                    <div className="stat-label">{c.label}</div>
                    <div className="stat-value" style={{ color:c.color, fontSize:String(c.val).includes('$')?20:28 }}>{c.val}</div>
                  </div>
                ));
              })()}
            </div>
          )}
          <div className="card">
            <div className="card-header" style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span className="card-title">Vendor directory</span>
              <span style={{ fontSize:11, color:'var(--ink3)' }}>auto-captured from invoices · add anything else manually</span>
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <input className="form-input" placeholder="Search name, contact, email…" value={vendorSearch}
                  onChange={e=>setVendorSearch(e.target.value)} style={{ width:220, padding:'6px 10px', fontSize:12 }}/>
                <select className="form-input" value={vendorCat} onChange={e=>setVendorCat(e.target.value)} style={{ width:'auto', padding:'6px 10px', fontSize:12 }}>
                  <option value="">All categories</option>
                  {['food','beverage','maintenance','services','equipment','other'].map(c=>(<option key={c} value={c}>{c}</option>))}
                </select>
                <button className="btn btn-primary btn-sm" onClick={()=>setEditVendor(null)}>+ Add vendor</button>
              </div>
            </div>
            <div className="card-body" style={{ padding:0 }}>
              {!vendors ? <div style={{ padding:24, color:'var(--ink3)' }}>Loading…</div> :
               vendors.length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--ink3)', fontSize:13 }}>
                  No vendors yet. They appear here automatically as invoices are approved — or add one manually.
                </div>
               ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid var(--border)', textAlign:'left' }}>
                      {['Vendor','Category','Contact','Account #','Terms','Last invoice','90-day spend',''].map(h=>(
                        <th key={h} style={{ padding:'9px 12px', fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--ink4)', fontFamily:'var(--mono)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {vendors.map(v => (
                        <tr key={v.id} style={{ borderBottom:'1px solid var(--border)' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={{ padding:'9px 12px' }}>
                            <div style={{ fontWeight:600 }}>{v.name}</div>
                            {v.source==='invoice' && <span style={{ fontSize:9, color:'var(--ink4)', fontFamily:'var(--mono)' }}>from invoices</span>}
                          </td>
                          <td style={{ padding:'9px 12px' }}><span className="tag">{v.category||'—'}</span></td>
                          <td style={{ padding:'9px 12px', lineHeight:1.5 }}>
                            {v.contact_name && <div>{v.contact_name}</div>}
                            {v.phone && <div><a href={'tel:'+v.phone} style={{ color:'var(--gold)' }}>{v.phone}</a></div>}
                            {v.email && <div><a href={'mailto:'+v.email} style={{ color:'var(--gold)' }}>{v.email}</a></div>}
                            {!v.contact_name && !v.phone && !v.email && <span style={{ color:'var(--ink4)' }}>—</span>}
                          </td>
                          <td style={{ padding:'9px 12px', fontFamily:'var(--mono)' }}>{v.account_number||'—'}</td>
                          <td style={{ padding:'9px 12px' }}>{v.payment_terms||'—'}</td>
                          <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', color:'var(--ink3)' }}>{v.last_invoice_date ? String(v.last_invoice_date).slice(0,10) : '—'}</td>
                          <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontWeight:600 }}>{Number(v.spend_90d) > 0 ? fmt$(v.spend_90d) : '—'}</td>
                          <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                            <button className="btn btn-sm" onClick={()=>setEditVendor(v)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
               )}
            </div>
          </div>
          </>
        )}

        {activeTab==='costwatch' && (
          <>
            {!costWatch ? <div className="spinner" style={{ margin:'40px auto' }}/> : (
              <>
                {/* Live food-cost % — purchases vs sales, no count needed */}
                <div className="card-raised" style={{ marginBottom:18 }}>
                  <div className="card-header">
                    <span className="card-title">Running cost % — approved invoices ÷ weekly sales</span>
                    <span style={{ fontSize:10, color:'var(--ink3)' }}>No count required — updates as invoices are approved</span>
                  </div>
                  <div style={{ padding:'14px 18px' }}>
                    {(() => {
                      const wks = (costWatch.trend?.weeks||[]).filter(w => w.blended_pct != null || w.food_cost_pct != null);
                      if (!wks.length) return <div style={{ fontSize:12, color:'var(--ink3)', padding:'12px 0' }}>No overlapping weeks of approved invoices and sales yet — approve a few invoices and this fills in automatically.</div>;
                      // Headline numbers: most recent week that HAS each metric
                      // (imported weeks sometimes carry total sales without food/bar splits)
                      const latestWith = (key) => [...wks].reverse().find(w => w[key] != null);
                      const heads = [
                        ['Food cost %', 'food_cost_pct'], ['Bar cost %', 'bar_cost_pct'], ['Blended', 'blended_pct'],
                      ].map(([l, k]) => { const w = latestWith(k); return [l, w ? w[k] : null, w?.week_start]; });
                      return (
                        <>
                          <div style={{ display:'flex', gap:28, marginBottom:14 }}>
                            {heads.map(([l, v, wk]) => (
                              <div key={l}>
                                <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--ink4)', fontFamily:'var(--mono)' }}>{l}{wk ? ' · wk ' + wk.slice(5) : ''}</div>
                                <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:600 }}>{v != null ? v+'%' : '—'}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:90 }}>
                            {wks.slice(-12).map((w,i) => {
                              const v = w.blended_pct ?? w.food_cost_pct;
                              const h = v != null ? Math.min(100, v/45*100) : 0;
                              const hot = v != null && v > 32;
                              return (
                                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }} title={`${w.week_start}: ${v ?? '—'}% (purchases ${fmt$(w.total_purchases)} / sales ${fmt$(w.total_sales)})`}>
                                  <div style={{ fontSize:8, fontFamily:'var(--mono)', color: hot ? 'var(--red)' : 'var(--ink3)' }}>{v != null ? v : ''}</div>
                                  <div style={{ width:'100%', maxWidth:34, height:`${h}%`, minHeight:2, borderRadius:3, background: hot ? 'var(--red)' : 'var(--gold)', opacity: v==null ? .2 : .9 }}/>
                                  <div style={{ fontSize:8, color:'var(--ink4)', fontFamily:'var(--mono)' }}>{w.week_start?.slice(5).replace('-','/')}</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Vendor price watch */}
                <div className="card-raised">
                  <div className="card-header">
                    <span className="card-title">Price watch — latest invoice vs 3-invoice average</span>
                    {costWatch.pw?.monthly_impact_up > 0 && (
                      <span style={{ fontSize:11, color:'var(--red)', fontFamily:'var(--mono)' }}>
                        ≈{fmt$(costWatch.pw.monthly_impact_up)}/mo in increases
                      </span>
                    )}
                  </div>
                  {!(costWatch.pw?.movers||[]).length ? (
                    <div className="empty-state" style={{ padding:'36px 20px' }}>
                      <div className="empty-state-title">No significant price moves</div>
                      <div className="empty-state-sub">Items appear here when a vendor's latest price moves ±5% vs your 3-invoice average. Keep approving scanned invoices — the history builds itself.</div>
                    </div>
                  ) : (
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead><tr style={{ background:'var(--bg)' }}>{['Item','Vendor','Unit','3-inv avg','Latest','Change','Est. monthly impact'].map(h=>(
                          <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                        ))}</tr></thead>
                        <tbody>
                          {costWatch.pw.movers.map(m=>(
                            <tr key={m.id} style={{ borderBottom:'1px solid var(--border)' }}>
                              <td style={{ padding:'9px 14px', fontWeight:500 }}>{m.name}</td>
                              <td style={{ padding:'9px 14px', color:'var(--ink3)' }}>{m.vendor||'—'}</td>
                              <td style={{ padding:'9px 14px', color:'var(--ink3)', fontSize:11 }}>{m.unit}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)' }}>{fmt$(m.avg_price_3)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', fontWeight:600 }}>{fmt$(m.last_price)}</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color: m.direction==='up'?'var(--red)':'var(--green)' }}>{m.direction==='up'?'▲':'▼'}{Math.abs(m.pct_change)}%</td>
                              <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color: m.monthly_impact>0?'var(--red)':'var(--green)' }}>{m.monthly_qty>0 ? fmt$(Math.abs(m.monthly_impact))+(m.monthly_impact>0?' more':' less') : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab==='email' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic', marginBottom:4 }}>Email invoice queue</h2>
                <p style={{ fontSize:12, color:'var(--ink3)', lineHeight:1.7, maxWidth:520 }}>
                  Forward vendor invoices to your dedicated email alias and they'll be automatically scanned and queued for review. No manual uploads needed.
                </p>
              </div>
              <button className="btn btn-sm" onClick={()=>agent3.processQueue().then(()=>agent3.emailQueue().then(d=>setEmailQueue(Array.isArray(d)?d:[]))).catch(console.error)}>
                ↻ Process queue
              </button>
            </div>

            {/* Setup instructions */}
            <div className="card-raised" style={{ marginBottom:16 }}>
              <div className="card-header"><span className="card-title">Setup — 3 steps</span></div>
              <div className="card-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  {[
                    { step:1, title:'Get your alias', desc:'Use a service like Zapier Email Parser, Mailgun Inbound, or Postmark Inbound. Set up an email address like invoices@yourcompany.com', icon:'📧' },
                    { step:2, title:'Configure webhook', desc:`Point the email service webhook to:\n\nhttps://restaurantosapi-production-434f.up.railway.app/api/agent-3/email-webhook\n\nSet header X-Webhook-Secret to your EMAIL_WEBHOOK_SECRET Railway variable`, icon:'🔗' },
                    { step:3, title:'Forward invoices', desc:'Tell your vendors to email invoices to your alias, or set up a Gmail filter to auto-forward from known vendor email addresses', icon:'✉️' },
                  ].map(s => (
                    <div key={s.step} style={{ padding:'14px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--gold-bg)', border:'1px solid var(--gold-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>{s.step}</div>
                        <span style={{ fontSize:13, fontWeight:500 }}>{s.icon} {s.title}</span>
                      </div>
                      <p style={{ fontSize:11, color:'var(--ink3)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{s.desc}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, padding:'10px 14px', background:'var(--bg2)', borderRadius:'var(--r-sm)', fontSize:11 }}>
                  <strong>Railway Variable to add:</strong> <code style={{ fontFamily:'var(--mono)', background:'var(--card)', padding:'1px 5px', borderRadius:3 }}>EMAIL_WEBHOOK_SECRET</code> — set to any long random string, then put the same value in your email service webhook config
                </div>
              </div>
            </div>

            {/* Queue */}
            {emailQueue.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📧</div>
                <div className="empty-state-title">No emails received yet</div>
                <div className="empty-state-sub">Once set up, invoices forwarded to your alias appear here and are processed automatically</div>
              </div>
            ) : (
              <div className="card-raised">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Received','From','Subject','Attachments','Status','Invoices created'].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emailQueue.map((q,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--ink3)', fontSize:11 }}>{fmtDate(q.received_at)}</td>
                        <td style={{ padding:'9px 14px', fontSize:11 }}>{q.from_email||'—'}</td>
                        <td style={{ padding:'9px 14px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.subject||'—'}</td>
                        <td style={{ padding:'9px 14px', textAlign:'center', fontFamily:'var(--mono)' }}>{(q.attachments||[]).length}</td>
                        <td style={{ padding:'9px 14px' }}>
                          <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[q.status]||'var(--ink3)', textTransform:'uppercase' }}>{q.status}</span>
                          {q.error && <div style={{ fontSize:10, color:'var(--red)', marginTop:2 }}>{q.error}</div>}
                        </td>
                        <td style={{ padding:'9px 14px', fontFamily:'var(--mono)', color:'var(--green)' }}>{q.invoice_ids?.length||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* New count modal */}
      {newCountModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(28,21,16,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
          <div style={{ background:'var(--card-raised)', borderRadius:'var(--r-lg)', width:400, maxWidth:'95vw', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)', padding:'22px' }}>
            <h2 style={{ fontFamily:'var(--serif)', fontSize:20, fontStyle:'italic', marginBottom:16 }}>🔢 Start physical count</h2>
            <div className="form-group">
              <label className="form-label">Count type</label>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-sm" style={newCountForm.category==='food'?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>setNewCountForm(f=>({...f,category:'food'}))}>🥩 Kitchen / BOH</button>
                <button className="btn btn-sm" style={newCountForm.category==='beverage'?{background:'var(--gold-bg)',color:'var(--gold)',borderColor:'var(--gold-border)',fontWeight:600}:{}} onClick={()=>setNewCountForm(f=>({...f,category:'beverage'}))}>🍷 Bar / FOH</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Count date</label>
              <input className="form-input" type="date" value={newCountForm.countDate} onChange={e=>setNewCountForm(f=>({...f,countDate:e.target.value}))}/>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={()=>setNewCountModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleStartCount}>Start counting</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showBulkScanner && <BulkInvoiceScanner locationId={currentLocation?.id} onComplete={()=>{loadAll();showToast('Invoices scanned — review and approve');}} onClose={()=>setShowBulkScanner(false)}/>}
      {editItem && <EditItemModal item={editItem} onSave={handleSaveItem} onClose={()=>setEditItem(null)}/>}
      {editVendor !== undefined && <VendorModal vendor={editVendor} onClose={()=>setEditVendor(undefined)}
        onSaved={()=>{ setEditVendor(undefined); loadVendors(); }}/>}
      {showScanner && <InvoiceScanner locationId={currentLocation?.id} onScanned={()=>{loadAll();showToast('Invoice scanned — review and approve');}} onClose={()=>setShowScanner(false)}/>}
      {reviewInvoiceId && <InvoiceReview invoiceId={reviewInvoiceId} onApproved={()=>{loadAll();showToast('Invoice approved');}} onClose={()=>setReviewInvoiceId(null)}/>}
      {countSheetId && <CountSheet countId={countSheetId} onSubmitted={()=>{loadAll();showToast('Count submitted');}} onClose={()=>setCountSheetId(null)}/>}
      {editRecipe && <RecipeModal recipe={editRecipe} items={items} recipes={recipes} locationId={currentLocation?.id} onClose={()=>setEditRecipe(null)} onSaved={saved=>{ setRecipes(r=>{ const idx=r.findIndex(x=>x.id===saved.id); if(idx>=0){const n=[...r];n[idx]=saved;return n;}return [saved,...r]; }); setEditRecipe(null); showToast(saved.name+' saved'); }}/>}

      {toast && <div className="toast" style={{ background:toast.err?'var(--red)':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe components
// ─────────────────────────────────────────────────────────────────────────────

const UNITS = ['g','kg','oz','lb','ml','l','tsp','tbsp','cup','floz','qt','gal','each','portion','piece','slice','bunch','clove','pinch'];
const fmtCurrency = v => v != null ? `$${parseFloat(v).toFixed(4)}` : '—';
const fmtPct      = v => v != null ? `${parseFloat(v).toFixed(1)}%` : '—';
const foodCostColor = pct => pct == null ? 'var(--ink-3)' : pct > 35 ? '#F26C6C' : pct > 28 ? '#E8A020' : '#3ECF8E';

// ── Recipe list + costing report ──────────────────────────────────────────────
function RecipeTab({ recipes, costingReport, view, items, locationId, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const categories = [...new Set(recipes.map(r=>r.category).filter(Boolean))];
  const filtered = recipes.filter(r =>
    (!catFilter || r.category === catFilter) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  if (view === 'costing') {
    if (!costingReport) return <div className="spinner" style={{ margin:'60px auto' }}/>;
    return (
      <div>
        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total recipes',      val: costingReport.summary?.total_recipes || 0,         color:'var(--ink)' },
            { label:'Avg food cost %',    val: fmtPct(costingReport.summary?.avg_food_cost_pct),  color: costingReport.summary?.avg_food_cost_pct > 35 ? '#F26C6C' : '#3ECF8E' },
            { label:'High cost (>35%)',   val: costingReport.summary?.high_cost_recipes || 0,     color:'#F26C6C' },
            { label:'Missing menu price', val: costingReport.summary?.missing_prices || 0,        color:'#E8A020' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:'14px 16px' }}>
              <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{s.label}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* By category */}
        {Object.entries(costingReport.by_category || {}).map(([cat, recs]) => (
          <div key={cat} className="card" style={{ marginBottom:16 }}>
            <div className="card-header"><span className="card-title">{cat}</span><span style={{ fontSize:11, color:'var(--ink-3)' }}>{recs.length} recipes</span></div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Recipe','Yield','Portion cost','Menu price','Food cost %','Ingredients'].map(h=>(
                      <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recs.map(r => (
                    <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'10px 14px', fontWeight:500 }}>{r.name}{r.location_id && <span style={{ fontSize:10, color:'var(--ink-3)', marginLeft:6 }}>({r.location_name})</span>}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontSize:11 }}>{r.yield_qty} {r.yield_unit}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'var(--mono)' }}>{fmtCurrency(r.portion_cost)}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'var(--mono)' }}>{r.menu_price ? `$${parseFloat(r.menu_price).toFixed(2)}` : <span style={{ color:'#555' }}>—</span>}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', fontWeight:600, color:foodCostColor(r.food_cost_pct) }}>{fmtPct(r.food_cost_pct)}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{r.ingredient_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // List view
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes…" style={{ maxWidth:240 }}/>
        <select className="form-select" value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{ maxWidth:180 }}>
          <option value="">All categories</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-title">No recipes yet</div><div className="empty-state-sub">Add your first recipe to start tracking costs</div></div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ borderLeft:`3px solid ${foodCostColor(r.food_cost_pct)}` }}>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{r.name}</div>
                    <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>
                      {r.type === 'batch' ? '🍲 Batch' : '🍽️ Dish'} · {r.yield_qty} {r.yield_unit}
                      {r.category && ` · ${r.category}`}
                      {r.location_name && <span style={{ color:'#555' }}> · {r.location_name}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm" onClick={()=>onEdit(r)}>Edit</button>
                    <button className="btn btn-sm" onClick={()=>confirm(`Delete ${r.name}?`)&&onDelete(r.id)} style={{ color:'#F26C6C' }}>✕</button>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    { label:'Portion cost', val: fmtCurrency(r.portion_cost) },
                    { label:'Menu price',   val: r.menu_price ? `$${parseFloat(r.menu_price).toFixed(2)}` : '—' },
                    { label:'Food cost',    val: fmtPct(r.food_cost_pct), color: foodCostColor(r.food_cost_pct) },
                  ].map((s,i) => (
                    <div key={i} style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'8px 10px' }}>
                      <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600, color:s.color||'var(--ink)' }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {r.ingredient_count > 0 && <span>{r.ingredient_count} ingredient{r.ingredient_count>1?'s':''}</span>}
                    {r.notes && <span title={r.notes} style={{ color:'#555' }}>📋 Method</span>}
                  </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recipe Modal (create / edit) ──────────────────────────────────────────────
function RecipeModal({ recipe, items, recipes, locationId, onClose, onSaved }) {
  const isNew = !recipe.id;
  const [form, setForm] = useState({
    name:        recipe.name || '',
    category:    recipe.category || '',
    type:        recipe.type || 'dish',
    yieldQty:    recipe.yield_qty || 1,
    yieldUnit:   recipe.yield_unit || 'portion',
    menuPrice:   recipe.menu_price || '',
    description: recipe.description || '',
    notes:       recipe.notes || '',
    cookingMethod: recipe.cooking_method || '',
    locationId:  recipe.location_id || locationId || '',
  });
  const [lines, setLines]   = useState(recipe.ingredients || []);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [addLine, setAddLine] = useState({ ingredientType:'item', inventoryItemId:'', subRecipeId:'', name:'', qty:'', unit:'g', unitCost:'' });

  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // Live cost calculation
  const totalCost = lines.reduce((s,l) => s + (parseFloat(l.line_cost||l.unit_cost||0) * parseFloat(l.qty||0) / (l.unit_cost ? 1 : 1)), 0);

  const handleAddLine = async () => {
    if (!addLine.qty || (!addLine.inventoryItemId && !addLine.subRecipeId && !addLine.name)) return;
    const newLine = { ...addLine, qty: parseFloat(addLine.qty), line_cost: parseFloat(addLine.unitCost||0) * parseFloat(addLine.qty||0) };

    if (!isNew && recipe.id) {
      try {
        const saved = await agent3.addIngredient(recipe.id, addLine);
        setLines(l => [...l, saved]);
      } catch(e) { setError(e.message); return; }
    } else {
      setLines(l => [...l, { ...newLine, id: Date.now().toString() }]);
    }
    setAddLine({ ingredientType:'item', inventoryItemId:'', subRecipeId:'', name:'', qty:'', unit:'g', unitCost:'' });
  };

  const handleRemoveLine = async (lineId) => {
    if (!isNew && recipe.id) {
      try { await agent3.deleteIngredient(lineId); } catch(e) {}
    }
    setLines(l => l.filter(x => x.id !== lineId));
  };

  const handleSave = async () => {
    if (!form.name) return setError('Recipe name required');
    if (!form.yieldQty || form.yieldQty <= 0) return setError('Yield quantity must be > 0');
    setSaving(true); setError('');
    try {
      const payload = { ...form, yieldQty: parseFloat(form.yieldQty), menuPrice: form.menuPrice || null, notes: form.cookingMethod || form.notes || null };
      let saved;
      if (isNew) {
        saved = await agent3.createRecipe({ ...payload, ingredients: lines.map(l=>({
          ingredientType: l.ingredientType || l.ingredient_type || 'item',
          inventoryItemId: l.inventoryItemId || l.inventory_item_id,
          subRecipeId: l.subRecipeId || l.sub_recipe_id,
          name: l.name, qty: l.qty, unit: l.unit, unitCost: l.unitCost || l.unit_cost,
        }))});
      } else {
        saved = await agent3.updateRecipe(recipe.id, payload);
      }
      onSaved(saved);
    } catch(e) { setError(e.message); setSaving(false); }
  };

  const portionCost = lines.reduce((s,l) => {
    const cost = parseFloat(l.unitCost||l.unit_cost||0);
    const qty  = parseFloat(l.qty||0);
    return s + (cost * qty);
  }, 0) / parseFloat(form.yieldQty||1);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:60, paddingTop:20, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:700, maxWidth:'96vw', border:'1px solid var(--border)', margin:'0 16px 60px' }}>

        {/* Header */}
        <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700 }}>{isNew ? 'New recipe' : `Edit: ${recipe.name}`}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>

        <div style={{ padding:'20px 22px' }}>
          {/* Basic info */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Recipe name *</label>
              <input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="e.g. Butter Chicken, Makhani Sauce"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Category</label>
              <input className="form-input" value={form.category} onChange={e=>f('category',e.target.value)} placeholder="e.g. Mains, Sauces"/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e=>f('type',e.target.value)}>
                <option value="dish">Dish (per portion)</option>
                <option value="batch">Batch prep (bulk yield)</option>
                <option value="beverage">Beverage</option>
                <option value="dessert">Dessert</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:20 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Yield qty *</label>
              <input className="form-input" type="number" min={0.001} step={0.001} value={form.yieldQty} onChange={e=>f('yieldQty',e.target.value)}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Yield unit</label>
              <select className="form-select" value={form.yieldUnit} onChange={e=>f('yieldUnit',e.target.value)}>
                <option value="portion">portion</option>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Menu price ($)</label>
              <input className="form-input" type="number" min={0} step={0.01} value={form.menuPrice} onChange={e=>f('menuPrice',e.target.value)} placeholder="0.00"/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:4 }}>
              <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Est. food cost</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color: form.menuPrice && portionCost ? foodCostColor((portionCost/parseFloat(form.menuPrice))*100) : 'var(--ink-3)' }}>
                {form.menuPrice && portionCost ? `${((portionCost/parseFloat(form.menuPrice))*100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div style={{ fontSize:12, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Ingredients</div>

          {/* Existing lines */}
          {lines.length > 0 && (
            <div className="card" style={{ marginBottom:12 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Ingredient','Qty','Unit','Unit cost','Line cost',''].map(h=>(
                      <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const lineCost = parseFloat(line.unit_cost||line.unitCost||0) * parseFloat(line.qty||0);
                    return (
                      <tr key={line.id||idx} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'8px 12px', fontWeight:500 }}>
                          {line.ingredient_type==='sub_recipe'&&<span style={{ fontSize:9, color:'#E8A020', fontWeight:700, marginRight:4 }}>SUB</span>}
                          {line.name||'—'}
                        </td>
                        <td style={{ padding:'8px 12px', fontFamily:'var(--mono)' }}>{line.qty}</td>
                        <td style={{ padding:'8px 12px', color:'var(--ink-3)' }}>{line.unit}</td>
                        <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:'var(--ink-3)' }}>{line.unit_cost||line.unitCost ? `$${parseFloat(line.unit_cost||line.unitCost).toFixed(4)}` : <span style={{ color:'#555' }}>auto</span>}</td>
                        <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color:'#3ECF8E' }}>{lineCost > 0 ? `$${lineCost.toFixed(4)}` : '—'}</td>
                        <td style={{ padding:'8px 12px' }}><button onClick={()=>handleRemoveLine(line.id||idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'#F26C6C', fontSize:14 }}>✕</button></td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop:'2px solid var(--border)' }}>
                    <td colSpan={4} style={{ padding:'8px 12px', fontWeight:600, fontSize:11, color:'var(--ink-3)', textAlign:'right' }}>Total cost</td>
                    <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', fontWeight:700, color:'var(--gold)' }}>
                      ${lines.reduce((s,l)=>s+parseFloat(l.unit_cost||l.unitCost||0)*parseFloat(l.qty||0),0).toFixed(4)}
                    </td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Add ingredient line */}
          <div style={{ background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'12px', border:'1px dashed var(--border)', marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-3)', marginBottom:10 }}>Add ingredient</div>
            <div style={{ display:'grid', gridTemplateColumns:'auto 1fr 80px 100px 90px auto', gap:8, alignItems:'flex-end' }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Type</label>
                <select className="form-select" style={{ width:100 }} value={addLine.ingredientType} onChange={e=>setAddLine(p=>({...p,ingredientType:e.target.value,inventoryItemId:'',subRecipeId:'',name:''}))}>
                  <option value="item">Inventory item</option>
                  <option value="sub_recipe">Sub-recipe</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">{addLine.ingredientType==='item'?'Item':addLine.ingredientType==='sub_recipe'?'Recipe':'Name'}</label>
                {addLine.ingredientType==='item' ? (
                  <select className="form-select" value={addLine.inventoryItemId} onChange={e=>setAddLine(p=>({...p,inventoryItemId:e.target.value,name:items.find(i=>i.id===e.target.value)?.name||''}))}>
                    <option value="">Select item…</option>
                    {items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                ) : addLine.ingredientType==='sub_recipe' ? (
                  <select className="form-select" value={addLine.subRecipeId} onChange={e=>setAddLine(p=>({...p,subRecipeId:e.target.value,name:recipes.find(r=>r.id===e.target.value)?.name||''}))}>
                    <option value="">Select recipe…</option>
                    {recipes.filter(r=>r.type==='batch'||r.type==='sauce').map(r=><option key={r.id} value={r.id}>{r.name} ({r.yield_qty}{r.yield_unit})</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={addLine.name} onChange={e=>setAddLine(p=>({...p,name:e.target.value}))} placeholder="Ingredient name"/>
                )}
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Qty</label>
                <input className="form-input" type="number" min={0} step={0.001} value={addLine.qty} onChange={e=>setAddLine(p=>({...p,qty:e.target.value}))}/>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Unit</label>
                <select className="form-select" value={addLine.unit} onChange={e=>setAddLine(p=>({...p,unit:e.target.value}))}>
                  {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Unit cost ($)</label>
                <input className="form-input" type="number" min={0} step={0.0001} value={addLine.unitCost} onChange={e=>setAddLine(p=>({...p,unitCost:e.target.value}))} placeholder="auto"/>
              </div>
              <button className="btn btn-primary" onClick={handleAddLine} style={{ alignSelf:'flex-end' }}>Add</button>
            </div>
            <div style={{ fontSize:10, color:'#555', marginTop:6 }}>
              Leave unit cost blank to pull automatically from inventory item's last/avg price
            </div>
          </div>

          <div className="form-group" style={{ marginBottom:16 }}>
            <label className="form-label">Cooking method / instructions</label>
            <textarea className="form-textarea" rows={5} value={form.cookingMethod} onChange={e=>f('cookingMethod',e.target.value)}
              placeholder="e.g. Marinate chicken overnight in yogurt and spices. Sear on high heat 3 min each side. Simmer in makhani sauce 12 min until cooked through. Finish with cream and kasuri methi."
              style={{ lineHeight:1.6, fontSize:13 }}
            />
          </div>
          {error && <div className="alert alert-red" style={{ marginBottom:12 }}><span>⚠</span>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ flex:1, justifyContent:'center' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create recipe' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order List components
// ─────────────────────────────────────────────────────────────────────────────

function OrdersTab({ orders, currentOrder, items, locationId, onSelect, onNew, onDelete, onClose, showToast }) {
  if (currentOrder) return <OrderDetail order={currentOrder} items={items} locationId={locationId} onSaved={onNew} onClose={onClose} showToast={showToast}/>;

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  return (
    <div>
      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No order lists yet</div>
          <div className="empty-state-sub">Generate one from par levels or create a blank list manually</div>
        </div>
      ) : (
        <div className="card">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Title','Vendor','Items','Est. cost','Created','Status',''].map(h=>(
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }} onClick={()=>onSelect(o)}>
                  <td style={{ padding:'11px 16px', fontWeight:500 }}>{o.title || 'Untitled order'}</td>
                  <td style={{ padding:'11px 16px', color:'var(--ink-3)', fontSize:12 }}>{o.vendor || '—'}</td>
                  <td style={{ padding:'11px 16px', fontFamily:'var(--mono)', textAlign:'center' }}>{o.line_count||0}</td>
                  <td style={{ padding:'11px 16px', fontFamily:'var(--mono)' }}>{o.total_cost > 0 ? `$${parseFloat(o.total_cost).toFixed(2)}` : '—'}</td>
                  <td style={{ padding:'11px 16px', fontSize:12, color:'var(--ink-3)' }}>{fmtDate(o.created_at)}</td>
                  <td style={{ padding:'11px 16px' }}>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background: o.status==='sent'?'#0A2A1A':o.status==='draft'?'#2A2010':'#1A1A2A', color: o.status==='sent'?'#3ECF8E':o.status==='draft'?'#E8A020':'#7B8CDE', textTransform:'capitalize' }}>{o.status}</span>
                  </td>
                  <td style={{ padding:'11px 16px' }} onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={()=>{ if(confirm('Delete this order list?')) onDelete(o.id); }} style={{ color:'#F26C6C' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderDetail({ order, items, locationId, onSaved, onClose, showToast }) {
  const isNew = !!order._new;
  const [form, setForm] = useState({ title: order.title||'', vendor: order.vendor||'', notes: order.notes||'' });
  const [lines, setLines] = useState(order.lines || []);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({ itemId:'', itemName:'', unit:'', vendor:'', orderQty:'', unitPrice:'', notes:'' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const af = (k,v) => setAddForm(p=>({...p,[k]:v}));

  // When item selected from catalog, prefill
  const onItemSelect = id => {
    const item = items.find(i=>i.id===id);
    if (item) setAddForm(p=>({ ...p, itemId:id, itemName:item.name, unit:item.unit||'', vendor:item.vendor||'', unitPrice:item.last_price||item.avg_price_3||'', orderQty:'' }));
    else setAddForm(p=>({...p, itemId:'', itemName:'', unit:'', vendor:'', unitPrice:'', orderQty:''}));
  };

  const handleAddLine = () => {
    if (!addForm.itemName || !addForm.orderQty) return;
    const line = {
      id: Date.now().toString(),
      inventory_item_id: addForm.itemId||null,
      item_name: addForm.itemName,
      unit: addForm.unit,
      vendor: addForm.vendor,
      order_qty: parseFloat(addForm.orderQty),
      unit_price: addForm.unitPrice ? parseFloat(addForm.unitPrice) : null,
      notes: addForm.notes,
      _local: true,
    };
    setLines(prev => [...prev, line]);
    setAddForm({ itemId:'', itemName:'', unit:'', vendor:'', orderQty:'', unitPrice:'', notes:'' });
  };

  const updateLine = (idx, field, val) => setLines(prev => prev.map((l,i)=>i===idx?{...l,[field]:val}:l));
  const removeLine = idx => setLines(prev => prev.filter((_,i)=>i!==idx));

  const totalCost = lines.reduce((s,l) => s + (parseFloat(l.order_qty||0) * parseFloat(l.unit_price||0)), 0);

  // Group by vendor for display
  const byVendor = lines.reduce((acc,l) => {
    const v = l.vendor || 'No vendor';
    if (!acc[v]) acc[v] = [];
    acc[v].push(l);
    return acc;
  }, {});

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await agent3.createOrder({ ...form, locationId, lines: lines.map((l,i)=>({...l,sort_order:i})) });
      onSaved(saved);
    } catch(e) { showToast(e.message, true); setSaving(false); }
  };

  // Export as plain text (copy to clipboard)
  const handleCopyText = () => {
    const title = form.title || 'Order List';
    const date  = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    let text = `${title}\n${date}\n${'─'.repeat(40)}\n\n`;
    for (const [vendor, vLines] of Object.entries(byVendor)) {
      text += `${vendor.toUpperCase()}\n`;
      for (const l of vLines) {
        const price = l.unit_price ? ` @ $${parseFloat(l.unit_price).toFixed(2)}/${l.unit||'unit'}` : '';
        const sku   = l.vendor_sku ? ` [${l.vendor_sku}]` : '';
        text += `  ${l.order_qty} ${l.unit||'units'} — ${l.item_name}${sku}${price}\n`;
      }
      text += '\n';
    }
    if (form.notes) text += `Notes: ${form.notes}\n`;
    if (totalCost > 0) text += `\nEst. total: $${totalCost.toFixed(2)}\n`;
    navigator.clipboard.writeText(text).then(()=>showToast('Copied to clipboard')).catch(()=>showToast('Copy failed', true));
  };

  // Export as PDF via print
  const handlePrint = () => {
    const title = form.title || 'Order List';
    const date  = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    let html = `<html><head><style>
      body{font-family:Arial,sans-serif;font-size:13px;padding:32px;max-width:700px;margin:0 auto}
      h1{font-size:20px;margin-bottom:4px} .date{color:#666;margin-bottom:24px}
      .vendor{font-weight:700;font-size:14px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;padding:4px 8px;border-bottom:1px solid #eee}
      td{padding:6px 8px;border-bottom:1px solid #f5f5f5}
      .total{font-weight:700;margin-top:20px;padding-top:12px;border-top:2px solid #333}
      .notes{color:#666;margin-top:16px;font-style:italic}
      @media print{button{display:none}}
    </style></head><body>`;
    html += `<h1>${title}</h1><div class="date">${date}</div>`;
    for (const [vendor, vLines] of Object.entries(byVendor)) {
      html += `<div class="vendor">${vendor}</div>`;
      html += `<table><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Total</th></tr>`;
      for (const l of vLines) {
        const lineTotal = (parseFloat(l.order_qty||0) * parseFloat(l.unit_price||0));
        html += `<tr>
          <td>${l.item_name}</td>
          <td style="color:#888">${l.vendor_sku||'—'}</td>
          <td style="font-weight:600">${l.order_qty}</td>
          <td>${l.unit||''}</td>
          <td>${l.unit_price?`$${parseFloat(l.unit_price).toFixed(2)}`:'—'}</td>
          <td>${lineTotal>0?`$${lineTotal.toFixed(2)}`:'—'}</td>
        </tr>`;
      }
      html += '</table>';
    }
    if (form.notes) html += `<div class="notes">Notes: ${form.notes}</div>`;
    if (totalCost > 0) html += `<div class="total">Estimated total: $${totalCost.toFixed(2)}</div>`;
    html += '</body></html>';
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(), 300);
  };

  return (
    <div>
      {/* Header form */}
      <div className="card" style={{ marginBottom:16, padding:'16px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Order title</label>
            <input className="form-input" value={form.title} onChange={e=>f('title',e.target.value)} placeholder="e.g. Weekly produce order — Rooh SF"/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Vendor / supplier</label>
            <input className="form-input" value={form.vendor} onChange={e=>f('vendor',e.target.value)} placeholder="e.g. Sysco"/>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Delivery instructions, etc."/>
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <span className="card-title">Items ({lines.length})</span>
          {totalCost > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:'var(--gold)' }}>Est. ${totalCost.toFixed(2)}</span>}
        </div>

        {/* Add item row */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg)', display:'grid', gridTemplateColumns:'2fr 80px 100px 90px 90px auto', gap:8, alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Item</div>
            <select className="form-select" style={{ fontSize:12 }} value={addForm.itemId} onChange={e=>onItemSelect(e.target.value)}>
              <option value="">From catalog…</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {!addForm.itemId && <input className="form-input" value={addForm.itemName} onChange={e=>af('itemName',e.target.value)} placeholder="Or type custom item" style={{ fontSize:12, marginTop:4 }}/>}
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Qty *</div>
            <input className="form-input" type="number" min={0} step={0.1} value={addForm.orderQty} onChange={e=>af('orderQty',e.target.value)} style={{ fontSize:12 }}/>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Unit</div>
            <input className="form-input" value={addForm.unit} onChange={e=>af('unit',e.target.value)} placeholder="kg, case…" style={{ fontSize:12 }}/>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Unit price</div>
            <input className="form-input" type="number" min={0} step={0.01} value={addForm.unitPrice} onChange={e=>af('unitPrice',e.target.value)} style={{ fontSize:12 }}/>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Vendor</div>
            <input className="form-input" value={addForm.vendor} onChange={e=>af('vendor',e.target.value)} style={{ fontSize:12 }}/>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAddLine} style={{ alignSelf:'flex-end' }} disabled={!addForm.orderQty||(!addForm.itemId&&!addForm.itemName)}>Add</button>
        </div>

        {/* Items grouped by vendor */}
        {lines.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--ink-3)', fontSize:13 }}>No items yet. Add items above or generate from par levels.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            {Object.entries(byVendor).map(([vendor, vLines]) => (
              <div key={vendor}>
                <div style={{ padding:'8px 16px', background:'var(--bg-2)', fontSize:10, fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid var(--border)' }}>{vendor}</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Item','SKU','Order qty','Unit','Unit price','Line total','Notes',''].map(h=>(
                        <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--ink-3)', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vLines.map((line, rawIdx) => {
                      const idx = lines.indexOf(line);
                      const lineTotal = parseFloat(line.order_qty||0) * parseFloat(line.unit_price||0);
                      return (
                        <tr key={line.id||rawIdx} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'8px 12px', fontWeight:500 }}>
                            {line.item_name}
                            {line.par_level && <div style={{ fontSize:10, color:'var(--ink-3)' }}>Par: {line.par_level} | Stock: {line.current_stock||0}</div>}
                          </td>
                          <td style={{ padding:'8px 12px', fontSize:11, color:'var(--ink-3)' }}>{line.vendor_sku||'—'}</td>
                          <td style={{ padding:'8px 12px' }}>
                            <input type="number" min={0} step={0.1} value={line.order_qty} onChange={e=>updateLine(idx,'order_qty',parseFloat(e.target.value)||0)}
                              style={{ width:70, padding:'3px 6px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, color:'var(--ink)', fontFamily:'var(--mono)', fontSize:12 }}/>
                          </td>
                          <td style={{ padding:'8px 12px', color:'var(--ink-3)' }}>{line.unit||'—'}</td>
                          <td style={{ padding:'8px 12px' }}>
                            <input type="number" min={0} step={0.01} value={line.unit_price||''} onChange={e=>updateLine(idx,'unit_price',e.target.value?parseFloat(e.target.value):null)}
                              placeholder="—" style={{ width:70, padding:'3px 6px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, color:'var(--ink)', fontFamily:'var(--mono)', fontSize:12 }}/>
                          </td>
                          <td style={{ padding:'8px 12px', fontFamily:'var(--mono)', color: lineTotal>0?'var(--gold)':'var(--ink-3)' }}>{lineTotal>0?`$${lineTotal.toFixed(2)}`:'—'}</td>
                          <td style={{ padding:'8px 12px' }}>
                            <input value={line.notes||''} onChange={e=>updateLine(idx,'notes',e.target.value)}
                              placeholder="—" style={{ width:100, padding:'3px 6px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, color:'var(--ink)', fontSize:12 }}/>
                          </td>
                          <td style={{ padding:'8px 12px' }}>
                            <button onClick={()=>removeLine(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'#F26C6C', fontSize:14 }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {totalCost > 0 && (
              <div style={{ padding:'12px 16px', borderTop:'2px solid var(--border)', display:'flex', justifyContent:'flex-end', fontFamily:'var(--mono)', fontWeight:700, color:'var(--gold)', fontSize:15 }}>
                Total: ${totalCost.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" onClick={handleCopyText} disabled={lines.length===0}>📋 Copy as text</button>
        <button className="btn btn-sm" onClick={handlePrint} disabled={lines.length===0}>🖨️ Print / Save PDF</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving||lines.length===0} style={{ marginLeft:'auto' }}>
          {saving ? 'Saving…' : 'Save order list'}
        </button>
      </div>
    </div>
  );
}
