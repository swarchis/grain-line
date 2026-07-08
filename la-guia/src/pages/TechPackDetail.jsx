import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { riskTagClass, readinessColor, currency } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { supabase } from '../lib/supabase.js';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'bom', label: 'Bill of Materials', icon: 'ph-list-checks' },
  { key: 'measurements', label: 'Measurements', icon: 'ph-ruler' },
  { key: 'sampling', label: 'Sampling', icon: 'ph-scissors' },
  { key: 'readiness', label: 'Readiness', icon: 'ph-check-circle' },
];

export default function TechPackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const { products } = useProducts();
  const product = products.find(p => p.id === id);

  const [imageUrl, setImageUrl] = useState(null);
  const [bom, setBom] = useState([{ id: 'bom-init', material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const [measurements, setMeasurements] = useState([{ id: 'meas-init', size: 'M', chest: '', length: '', sleeve: '' }]);
  const [materialWarnings, setMaterialWarnings] = useState([]);
  const [readinessChecklist, setReadinessChecklist] = useState([]);
  
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

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
          if (data.image_url) setImageUrl(data.image_url);
          if (data.bom && data.bom.length > 0) setBom(data.bom);
          if (data.measurements && data.measurements.length > 0) setMeasurements(data.measurements);
          if (data.material_warnings) setMaterialWarnings(data.material_warnings);
          if (data.readiness_checklist) setReadinessChecklist(data.readiness_checklist);
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

  const updateBom = (rowId, field, value) => setBom(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addBomRow = () => setBom(prev => [...prev, { id: `bom-${Date.now()}`, material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const removeBomRow = (rowId) => setBom(prev => prev.filter(item => item.id !== rowId));

  const updateMeas = (rowId, field, value) => setMeasurements(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addMeasRow = () => setMeasurements(prev => [...prev, { id: `meas-${Date.now()}`, size: '', chest: '', length: '', sleeve: '' }]);
  const removeMeasRow = (rowId) => setMeasurements(prev => prev.filter(item => item.id !== rowId));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tech_packs')
        .upsert({
          product_id: id,
          bom,
          measurements,
          updated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });

      if (error) throw error;
      alert("✓ Tech Pack saved successfully!");
    } catch (err) {
      alert("Error saving tech pack: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalBomCost = bom.reduce((sum, item) => sum + ((parseFloat(item.qtyPerUnit) || 0) * (parseFloat(item.unitCost) || 0)), 0);

  return (
    <>
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingData}>
            <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save Tech Pack'}
          </button>
        </div>
      </div>

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
                            <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="e.g. Cotton" value={b.material} onChange={e => updateBom(b.id, 'material', e.target.value)} /></td>
                            <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="Supplier" value={b.supplier} onChange={e => updateBom(b.id, 'supplier', e.target.value)} /></td>
                            <td style={{ padding: '8px 20px' }}><input className="form-input" type="number" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="1.5" value={b.qtyPerUnit} onChange={e => updateBom(b.id, 'qtyPerUnit', e.target.value)} /></td>
                            <td style={{ padding: '8px 20px', position: 'relative' }}>
                              <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', zIndex: 1 }}>$</span>
                              <input className="form-input" type="number" style={{ padding: '8px 12px 8px 20px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="0.00" value={b.unitCost} onChange={e => updateBom(b.id, 'unitCost', e.target.value)} />
                            </td>
                            <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{currency(lineTotal)}</td>
                            <td style={{ padding: '8px 20px 8px 0', textAlign: 'right' }}><button onClick={() => removeBomRow(b.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button></td>
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

            {tab === 'sampling' && <EmptyState icon="ph-scissors" title="No samples logged" color="var(--c-materials)" sub="Track proto → fit → revised → size set → pre-production here." />}
            {tab === 'readiness' && <EmptyState icon="ph-check-circle" color="var(--c-finalcheck)" title="No readiness checklist yet" sub="The final pre-production validation checklist appears here." />}
          </>
        )}
      </div>
    </>
  );
}