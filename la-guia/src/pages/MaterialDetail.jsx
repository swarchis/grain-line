import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { trustTagClass } from '../lib/format.js';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import { PhotoPanel } from '../components/decor.jsx';
import { useMaterials } from '../context/MaterialsContext.jsx';

const TONE_BY_RISK = { green: 'sage', amber: 'gold', red: 'clay' };

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deleteMaterial } = useMaterials();
  const [material, setMaterial] = useState(null);
  const [usedInProducts, setUsedInProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    async function loadData() {
      // 1. Load the Material definition
      const { data: matData, error: matError } = await supabase
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();
      
      if (!matError && matData) {
        setMaterial(matData);
        
        // 2. Cross-reference: Load all tech packs to find where this is used
        const { data: tpData } = await supabase
          .from('tech_packs')
          .select('product_id, bom, products(name, stage, category)');
          
        if (tpData) {
          // Filter to find any BOM array containing a material string that matches this material's name
          const matches = tpData.filter(tp => {
            if (!tp.bom || !Array.isArray(tp.bom)) return false;
            return tp.bom.some(b => b.material && b.material.toLowerCase().includes(matData.name.toLowerCase()));
          });
          setUsedInProducts(matches);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [id]);

  if (loading) return <div className="content" style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;

  if (!material) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Material not found" sub="This material isn't in the library yet." /></div>;
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Material Intelligence</div>
            <h1 className="page-title">{material.name}</h1>
          </div>
          <div className="page-sub">{material.category}</div>
        </div>
        <div className="topbar-right">
          <span className={trustTagClass(material.risk_level)}>
            {material.risk_level === 'green' ? 'Low risk' : material.risk_level === 'red' ? 'High risk' : 'Watch'}
          </span>
          <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete material" style={{ color: 'var(--red)' }}>
            <i className="ph ph-trash" />
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        itemLabel="material"
        itemName={material.name}
        warning={usedInProducts.length > 0
          ? `It's referenced in ${usedInProducts.length} tech pack${usedInProducts.length > 1 ? 's' : ''} by name — those BOM lines will stop matching it, but won't be deleted.`
          : undefined}
        onConfirm={async () => { await deleteMaterial(id); navigate('/materials'); }}
      />

      <div className="content">
        <PhotoPanel variant="weave" tone={TONE_BY_RISK[material.risk_level] || 'gold'} aspect="21 / 5" label={material.name} icon="ph-flask" style={{ marginBottom: 20 }} />

        <div className="grid-2">
            <div className="card-raised" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Production Warning</span></div>
                <div className="card-body">
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink)' }}>{material.warning}</p>
                </div>
            </div>

            <div className="card-raised" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Handling Notes</span></div>
                <div className="card-body">
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>{material.handling_notes || 'No specific handling notes on file.'}</p>
                </div>
            </div>
        </div>

        <div className="section-label">Usage Analysis</div>
        {usedInProducts.length === 0 ? (
           <div className="card-raised" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
              <i className="ph ph-flask" style={{ fontSize: 24, marginBottom: 10, display: 'block' }} />
              This material is not currently used in any active Tech Packs.
           </div>
        ) : (
           <div className="card">
             {usedInProducts.map(tp => (
                <div className="list-row" key={tp.product_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tech-packs/${tp.product_id}`)}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <i className="ph ph-tag" style={{ color: 'var(--c-materials)', fontSize: 16 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{tp.products?.name || 'Unknown Product'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, textTransform: 'capitalize' }}>
                          {tp.products?.category} · {tp.products?.stage}
                        </div>
                      </div>
                   </div>
                   <button className="btn btn-sm">View Tech Pack <i className="ph ph-arrow-right" /></button>
                </div>
             ))}
           </div>
        )}
      </div>
    </>
  );
}