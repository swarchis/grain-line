import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext.jsx';
import GarmentSilhouette, { GARMENT_TYPES } from '../components/GarmentSilhouette.jsx';

const STATUS_COLOR = { Sketching: 'var(--ink-3)', Refining: 'var(--c-design)', Ready: 'var(--green)' };

export default function Design() {
  const navigate = useNavigate();
  const { products, designs, createDesign } = useProducts();
  const [showNew, setShowNew] = useState(false);
  const [customType, setCustomType] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);
  const designProducts = products.filter(p => p.stage === 'concept' || p.stage === 'design');

  const startFromSilhouette = async (type) => {
    setLoading(true);
    try {
      const id = await createDesign({ garmentType: type.label, baseType: 'silhouette', silhouette: type.key });
      navigate(`/design/${id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startFromUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const id = await createDesign({ garmentType: 'Uploaded mockup', baseType: 'upload', colorway: file.name, file });
      navigate(`/design/${id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startFromAI = async () => {
    setLoading(true);
    try {
      const id = await createDesign({ garmentType: customType || 'Custom garment', baseType: 'ai-silhouette' });
      navigate(`/design/${id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-design)' }}>Design</div>
            <h1 className="page-title">Design Studio</h1>
          </div>
          <div className="page-sub">{designProducts.length} in concept or design</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => setShowNew(s => !s)} disabled={loading}>
            <i className="ph ph-plus" /> {loading ? 'Creating...' : 'New design'}
          </button>
        </div>
      </div>

      <div className="content">
        {showNew && (
          <div className="card-raised enter" style={{ marginBottom: 28 }}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-design)' }} />
            <div className="card-header"><span className="card-title">Start a new design</span></div>
            <div className="card-body">
              <div className="section-label" style={{ marginBottom: 12 }}>Start from a preset silhouette</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 22 }}>
                {GARMENT_TYPES.map(t => (
                  <div
                    key={t.key}
                    onClick={() => !loading && startFromSilhouette(t)}
                    style={{
                      border: '1.5px solid var(--border-2)', borderRadius: 'var(--r-sm)', padding: '14px 8px 10px',
                      textAlign: 'center', cursor: loading ? 'wait' : 'pointer', background: 'var(--bg-1)', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if(!loading) { e.currentTarget.style.borderColor = 'var(--c-design)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                    onMouseLeave={e => { if(!loading) { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.transform = ''; } }}
                  >
                    <div style={{ color: 'var(--ink-2)', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                      <GarmentSilhouette type={t.key} size={44} />
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>{t.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'var(--ink-4)' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span className="section-label" style={{ marginBottom: 0 }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <div
                onClick={() => !loading && fileRef.current?.click()}
                style={{
                  border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r)', padding: '26px 16px',
                  textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <i className="ph ph-upload-simple" style={{ fontSize: 22, marginBottom: 8, display: 'block', color: 'var(--c-design)' }} />
                Upload your own mockup, sketch, or reference photo
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={startFromUpload} />
              </div>

              <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', flex: 1, minWidth: 200 }}>
                  Don't see your garment type above? We'll generate a blank starting silhouette for you.
                </span>
                <input className="form-input" style={{ width: 160 }} placeholder="e.g. Balaclava" value={customType} onChange={e => setCustomType(e.target.value)} />
                <button className="btn btn-sm" onClick={startFromAI} disabled={loading}>Generate silhouette</button>
              </div>
            </div>
          </div>
        )}

        <div className="section-label">In progress</div>
        <div className="grid-cards">
          {designProducts.map(p => {
            const d = designs[p.id];
            return (
              <div key={p.id} className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/design/${p.id}`)}>
                <div className="corner-fold" style={{ '--fold-color': 'var(--c-design)' }} />
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-3)', borderRadius: 8, color: 'var(--ink-3)', flexShrink: 0 }}>
                    <GarmentSilhouette type={d?.silhouette || 'tee'} size={30} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.category}</div>
                  </div>
                </div>
                <span className="tag" style={{ background: 'transparent', borderColor: STATUS_COLOR[d?.status] || 'var(--border-2)', color: STATUS_COLOR[d?.status] || 'var(--ink-3)' }}>
                  {d ? d.status : 'Not started'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}