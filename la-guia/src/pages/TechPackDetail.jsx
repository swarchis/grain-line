import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { riskTagClass, readinessColor, currency } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { supabase } from '../lib/supabase.js';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'bom', label: 'Bill of Materials', icon: 'ph-list-checks' },
  { key: 'measurements', label: 'Measurements', icon: 'ph-ruler' },
  { key: 'sampling', label: 'Sampling', icon: 'ph-scissors' },
];

const DEFAULT_CHECKLIST = [
  { id: 'c-proto', label: 'Proto sample approved', status: 'pending' },
  { id: 'c-fit', label: 'Fit sample approved', status: 'pending' },
  { id: 'c-sizeset', label: 'Size set approved', status: 'pending' },
  { id: 'c-pp', label: 'Pre-production (PP) sample approved', status: 'pending' }
];

export default function TechPackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const { products, activeBrand, updateProduct } = useProducts();
  const product = products.find(p => p.id === id);

  const [imageUrl, setImageUrl] = useState(null);
  const [bom, setBom] = useState([{ id: 'bom-init', material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const [measurements, setMeasurements] = useState([{ id: 'meas-init', size: 'M', chest: '', length: '', sleeve: '' }]);
  const [materialWarnings, setMaterialWarnings] = useState([]);
  const [readinessChecklist, setReadinessChecklist] = useState(DEFAULT_CHECKLIST);
  
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hasTechPack, setHasTechPack] = useState(false);

  useEffect(() => {
    async function loadTechPack() {
      if (!product) return;
      try {
        const { data, error } = await supabase
          .from('tech_packs')
          .select('*')
          .eq('product_id', id)
          .single();
          
        if (data) {
          setHasTechPack(true);
          if (data.image_url) setImageUrl(data.image_url);
          if (data.bom && data.bom.length > 0) setBom(data.bom);
          if (data.measurements && data.measurements.length > 0) setMeasurements(data.measurements);
          if (data.material_warnings) setMaterialWarnings(data.material_warnings);
          if (data.readiness_checklist && data.readiness_checklist.length > 0) setReadinessChecklist(data.readiness_checklist);
        }
      } catch (err) {
        console.error('Error fetching tech pack:', err);
      } finally {
        setLoadingData(false);
      }
    }
    loadTechPack();
  }, [id, product]);

  if (!product) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Tech pack not found" sub="This workspace doesn't exist yet." /></div>;
  }

  // BOM Handlers
  const updateBom = (rowId, field, value) => setBom(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addBomRow = () => setBom(prev => [...prev, { id: `bom-${Date.now()}`, material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const removeBomRow = (rowId) => setBom(prev => prev.filter(item => item.id !== rowId));

  // Measurement Handlers
  const updateMeas = (rowId, field, value) => setMeasurements(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addMeasRow = () => setMeasurements(prev => [...prev, { id: `meas-${Date.now()}`, size: '', chest: '', length: '', sleeve: '' }]);
  const removeMeasRow = (rowId) => setMeasurements(prev => prev.filter(item => item.id !== rowId));

  // Sampling Checklist Handlers
  const toggleChecklistStatus = (itemId) => setReadinessChecklist(prev => prev.map(item => item.id === itemId ? { ...item, status: item.status === 'done' ? 'pending' : 'done' } : item));
  const updateChecklistItem = (itemId, newLabel) => setReadinessChecklist(prev => prev.map(item => item.id === itemId ? { ...item, label: newLabel } : item));
  const addChecklistItem = () => setReadinessChecklist(prev => [...prev, { id: `c-${Date.now()}`, label: '', status: 'pending' }]);
  const removeChecklistItem = (itemId) => setReadinessChecklist(prev => prev.filter(item => item.id !== itemId));

  // --- Dynamic Readiness Engine ---
  const calculateReadiness = () => {
    let score = 0;
    
    // Base 10 points for having a visual reference
    if (imageUrl) score += 10;
    
    // BOM Evaluation (Up to 30 points)
    const validBom = bom.filter(b => b.material && b.qtyPerUnit);
    if (validBom.length > 0) {
      score += 15; // Has valid materials
      // Bonus 15 points if all valid materials are priced (budgeted)
      const pricedBom = validBom.filter(b => b.unitCost);
      if (pricedBom.length === validBom.length) score += 15;
    }

    // Measurements Evaluation (Up to 30 points)
    const validMeas = measurements.filter(m => m.size && m.chest && m.length);
    if (validMeas.length > 0) score += 30; // Has basic graded sizing

    // Sampling Evaluation (Up to 30 points)
    if (readinessChecklist.length > 0) {
      const doneCount = readinessChecklist.filter(c => c.status === 'done').length;
      score += Math.floor((doneCount / readinessChecklist.length) * 30);
    }

    return score;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newReadiness = calculateReadiness();

      // 1. Save Tech Pack Data
      const { error: tpError } = await supabase
        .from('tech_packs')
        .upsert({
          product_id: id,
          bom,
          measurements,
          readiness_checklist: readinessChecklist,
          updated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });

      if (tpError) throw tpError;

      // 2. Update Product Readiness Score globally
      await updateProduct(id, { readiness: newReadiness });

      alert("✓ Tech Pack saved successfully!");
    } catch (err) {
      alert("Error saving tech pack: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalBomCost = bom.reduce((sum, item) => sum + ((parseFloat(item.qtyPerUnit) || 0) * (parseFloat(item.unitCost) || 0)), 0);

  // Clears just the tech_packs row — the product/design itself stays put,
  // it just goes back to looking "not started" on Tech Pack List.
  const handleDeleteTechPack = async () => {
    const { error } = await supabase.from('tech_packs').delete().eq('product_id', id);
    if (error) throw error;
    setHasTechPack(false);
    setImageUrl(null);
    setBom([{ id: 'bom-init', material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
    setMeasurements([{ id: 'meas-init', size: 'M', chest: '', length: '', sleeve: '' }]);
    setMaterialWarnings([]);
    setReadinessChecklist(DEFAULT_CHECKLIST);
  };

  // Trigger browser print dialog for PDF export
  const handleExportPDF = () => {
    window.print();
  };

  return (
    <>
      {/* ── STANDARD WEB UI (Hidden during print) ── */}
      <div className="no-print">
        <div className="topbar">
          <div className="topbar-left">
            <div>
              <div className="page-eyebrow" style={{ color: 'var(--c-techpack)' }}>Tech Pack</div>
              <h1 className="page-title">{product.name}</h1>
            </div>
            <div className="page-sub">{product.category}</div>
          </div>
          <div className="topbar-right">
            <span className={riskTagClass(product.risk)} style={{ marginRight: 8 }}>{product.risk}</span>
            {hasTechPack && (
              <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete tech pack data" style={{ color: 'var(--red)' }}>
                <i className="ph ph-trash" />
              </button>
            )}
            <button className="btn" onClick={handleExportPDF} disabled={loadingData}>
              <i className="ph ph-file-pdf" /> Export PDF
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingData}>
              <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save Tech Pack'}
            </button>
          </div>
        </div>

        <ConfirmDeleteModal
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          itemLabel="tech pack"
          itemName={product.name}
          warning="The BOM, measurements, and sampling checklist will be cleared — the design itself stays."
          onConfirm={handleDeleteTechPack}
        />

        <div style={{ padding: '14px 30px 0' }}>
          <FlowStepper productId={product.id} current="techpack" />
        </div>

        <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-techpack)" />

        <div className="content">
          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-3)' }}>
              <i className="ph ph-spinner ph-spin" style={{ fontSize: 24, marginBottom: 10 }} />
              <div>Loading Tech Pack...</div>
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  {/* Image Panel */}
                  <div style={{ width: 320, flexShrink: 0, background: 'var(--bg-1)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ width: '100%', aspectRatio: '4/5', background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                      {imageUrl ? (
                        <img src={imageUrl} alt="Garment design" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 24 }}>
                          <i className="ph ph-image" />
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/design/${id}`)}>
                        <i className="ph ph-pencil-simple" /> Edit Design
                      </button>
                    </div>
                  </div>

                  {/* Stats & Warnings */}
                  <div style={{ flex: 1 }}>
                    <div className="stats-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                      <div className="stat-card" style={{ '--stat-accent': 'var(--c-techpack)' }}>
                        <div className="stat-label">Factory readiness</div>
                        <div className="stat-value" style={{ color: readinessColor(product.readiness) }}>{product.readiness}%</div>
                        <div className="stat-delta delta-muted">Updates dynamically on save</div>
                      </div>
                      <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                        <div className="stat-label">Target Unit Cost</div>
                        <div className="stat-value">{currency(totalBomCost || product.budget)}</div>
                      </div>
                      <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
                        <div className="stat-label">BOM line items</div>
                        <div className="stat-value">{bom.length}</div>
                      </div>
                      <div className="stat-card" style={{ '--stat-accent': 'var(--c-finalcheck)' }}>
                        <div className="stat-label">Material warnings</div>
                        <div className="stat-value" style={{ color: materialWarnings.length > 0 ? 'var(--amber)' : 'var(--ink)' }}>{materialWarnings.length}</div>
                      </div>
                    </div>

                    {materialWarnings.length > 0 && (
                      <div className="card-raised">
                        <div className="card-header"><span className="card-title">Production Mistake Predictor</span></div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {materialWarnings.map((w, i) => (
                            <div key={i} className={`alert alert-${w.severity === 'red' ? 'red' : 'amber'}`} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 8, background: `var(--${w.severity}-bg)`, border: `1px solid var(--${w.severity}-border)`, color: `var(--${w.severity})`, fontSize: 13.5 }}>
                              <i className="ph ph-warning" style={{ marginTop: 2 }} />
                              <div><strong>{w.material}:</strong> {w.warning}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'bom' && (
                <div className="card">
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                          <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '35%' }}>Material / Component</th>
                          <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Supplier</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Qty / Unit</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Est. Cost</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Line Total</th>
                          <th style={{ width: '4%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bom.map((b, i) => {
                          const lineTotal = (parseFloat(b.qtyPerUnit) || 0) * (parseFloat(b.unitCost) || 0);
                          return (
                            <tr key={b.id} style={{ borderBottom: i < bom.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="e.g. Cotton" value={b.material} onChange={e => updateBom(b.id, 'material', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="Supplier" value={b.supplier} onChange={e => updateBom(b.id, 'supplier', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" type="number" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="1.5" value={b.qtyPerUnit} onChange={e => updateBom(b.id, 'qtyPerUnit', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', zIndex: 1 }}>$</span>
                                <input className="form-input" type="number" style={{ padding: '8px 12px 8px 20px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="0.00" value={b.unitCost} onChange={e => updateBom(b.id, 'unitCost', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>
                                {currency(lineTotal)}
                              </td>
                              <td style={{ padding: '8px 20px 8px 0', textAlign: 'right' }}>
                                <button onClick={() => removeBomRow(b.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--bg-3)', borderTop: '2px solid var(--border)' }}>
                          <td colSpan="4" style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Total BOM Cost</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: 'var(--c-techpack)' }}>{currency(totalBomCost)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm" onClick={addBomRow}><i className="ph ph-plus" /> Add Material</button>
                  </div>
                </div>
              )}

              {tab === 'measurements' && (
                <div className="card" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '20%' }}>Size (Grade)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Chest (in)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Length (in)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Sleeve (in)</th>
                        <th style={{ width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((m, i) => (
                        <tr key={m.id} style={{ borderBottom: i < measurements.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }} placeholder="e.g. M" value={m.size} onChange={e => updateMeas(m.id, 'size', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='22.5"' value={m.chest} onChange={e => updateMeas(m.id, 'chest', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='28"' value={m.length} onChange={e => updateMeas(m.id, 'length', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='25"' value={m.sleeve} onChange={e => updateMeas(m.id, 'sleeve', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px 8px 0', textAlign: 'right' }}><button onClick={() => removeMeasRow(m.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm" onClick={addMeasRow}><i className="ph ph-plus" /> Add Size</button>
                  </div>
                </div>
              )}

              {tab === 'sampling' && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Sampling & Validation</span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {readinessChecklist.map((item) => (
                      <div key={item.id} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button 
                          onClick={() => toggleChecklistStatus(item.id)}
                          style={{
                            width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${item.status === 'done' ? 'var(--green)' : 'var(--border-2)'}`,
                            background: item.status === 'done' ? 'var(--green)' : 'var(--bg-1)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s'
                          }}
                        >
                          {item.status === 'done' && <i className="ph ph-check" style={{ fontSize: 14 }} />}
                        </button>
                        <input 
                          className="form-input" 
                          style={{ flex: 1, padding: '8px 12px', fontSize: 13.5, background: 'transparent', border: 'none', boxShadow: 'none', textDecoration: item.status === 'done' ? 'line-through' : 'none', color: item.status === 'done' ? 'var(--ink-3)' : 'var(--ink)' }}
                          value={item.label} 
                          onChange={e => updateChecklistItem(item.id, e.target.value)} 
                          placeholder="Checklist item description"
                        />
                        <button onClick={() => removeChecklistItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button>
                      </div>
                    ))}
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-sm" onClick={addChecklistItem}><i className="ph ph-plus" /> Add Step</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PRINT ONLY LAYOUT (Hidden during normal web browsing) ── */}
      <div className="print-only tech-pack-print">
        <h1>{activeBrand?.name || 'Grainline Brand'} - Tech Pack Specification</h1>
        
        <div className="meta-grid">
          <div className="meta-item"><strong>Style Name:</strong> {product.name}</div>
          <div className="meta-item"><strong>Category:</strong> {product.category}</div>
          <div className="meta-item"><strong>Target Unit Cost:</strong> {currency(totalBomCost)}</div>
          <div className="meta-item"><strong>Date Exported:</strong> {new Date().toLocaleDateString()}</div>
        </div>

        {imageUrl && (
          <div>
            <h2>1. Design Reference</h2>
            <img src={imageUrl} alt="Garment Sketch" className="hero-image" />
          </div>
        )}

        <h2>2. Bill of Materials (BOM)</h2>
        <table>
          <thead>
            <tr>
              <th>Material / Component</th>
              <th>Supplier / Ref</th>
              <th>Qty per Unit</th>
            </tr>
          </thead>
          <tbody>
            {bom.filter(b => b.material).map((b, i) => (
              <tr key={i}>
                <td>{b.material}</td>
                <td>{b.supplier || 'TBD'}</td>
                <td>{b.qtyPerUnit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>3. Graded Measurements</h2>
        <table>
          <thead>
            <tr>
              <th>Size</th>
              <th>Chest (in)</th>
              <th>Length (in)</th>
              <th>Sleeve (in)</th>
            </tr>
          </thead>
          <tbody>
            {measurements.filter(m => m.size).map((m, i) => (
              <tr key={i}>
                <td><strong>{m.size}</strong></td>
                <td>{m.chest}</td>
                <td>{m.length}</td>
                <td>{m.sleeve}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {readinessChecklist.length > 0 && (
          <>
            <h2>4. Sampling & Validation Checklist</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Status</th>
                  <th>Requirement</th>
                </tr>
              </thead>
              <tbody>
                {readinessChecklist.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold', color: c.status === 'done' ? '#228B22' : '#666' }}>
                      {c.status === 'done' ? '✓ APPROVED' : 'PENDING'}
                    </td>
                    <td>{c.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="footer">
          Generated via Grainline Production OS • {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}