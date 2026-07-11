import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { readinessColor, riskTagClass, swatchGradient } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';

export default function TechPackList() {
  const navigate = useNavigate();
  const { products, deleteProduct } = useProducts();
  const [techPacks, setTechPacks] = useState({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Only show products that have moved past the pure design stage
  const items = products.filter(p => ['techpack', 'sourcing', 'sampling', 'production', 'launched'].includes(p.stage));

  useEffect(() => {
    async function loadTechPacks() {
      const { data, error } = await supabase.from('tech_packs').select('*');
      if (!error && data) {
        const tpMap = {};
        data.forEach(tp => { tpMap[tp.product_id] = tp; });
        setTechPacks(tpMap);
      }
      setLoading(false);
    }
    loadTechPacks();
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-techpack)' }}>Tech Packs</div>
            <h1 className="page-title">Tech Pack List</h1>
          </div>
          <div className="page-sub">{items.length} tech packs across your brand</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-spinner ph-spin" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon="ph-ruler" title="No Tech Packs yet" sub="Generate a tech pack from the Design Studio to see it here." color="var(--c-techpack)" />
        ) : (
          <div className="grid-cards" data-tour="tech-packs">
            {items.map(p => {
              const tp = techPacks[p.id];
              const warnings = tp?.material_warnings?.length || 0;
              
              return (
                <div key={p.id} className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/tech-packs/${p.id}`)}>
                  <div className="corner-fold" style={{ '--fold-color': 'var(--c-techpack)' }} />
                  <button
                    className="piece-move-btn"
                    title="Delete design"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}
                    style={{ color: 'var(--red)' }}
                  >
                    <i className="ph ph-trash" />
                  </button>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div className="swatch" style={{ background: swatchGradient(p.id) }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.category}</div>
                    </div>
                  </div>
                  <div className="readiness" style={{ marginBottom: 10 }}>
                    <div className="readiness-track">
                      <div className="readiness-fill" style={{ width: `${p.readiness}%`, background: readinessColor(p.readiness) }} />
                      <div className="readiness-gate" style={{ left: '80%' }} />
                    </div>
                    <span className="readiness-value">{p.readiness}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={riskTagClass(p.risk)}>{p.risk}</span>
                    {warnings > 0 && <span className="tag tag-amber"><i className="ph ph-warning" style={{ marginRight: 4 }} />{warnings} material warning{warnings > 1 ? 's' : ''}</span>}
                    {!tp && <span className="tag tag-neutral">Drafting...</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        itemLabel="design"
        itemName={deleteTarget?.name || ''}
        warning="Its tech pack, measurements, and BOM will be deleted with it."
        onConfirm={async () => { await deleteProduct(deleteTarget.id); }}
      />
    </>
  );
}