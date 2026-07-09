import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { readinessColor } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function ReadinessReview() {
  const navigate = useNavigate();
  const { products } = useProducts();
  const [techPacks, setTechPacks] = useState({});
  const [loading, setLoading] = useState(true);

  // Get products that have a tech pack or are further along
  const items = products
    .filter(p => ['techpack', 'sourcing', 'sampling', 'production', 'launched'].includes(p.stage))
    .sort((a, b) => a.readiness - b.readiness);

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

  const cleared = items.filter(p => p.readiness >= 80).length;
  const needsReview = items.length - cleared;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-finalcheck)' }}>Final Check</div>
            <h1 className="page-title">Readiness Review</h1>
          </div>
          <div className="page-sub">Final pre-production validation before sending to a vendor</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-spinner ph-spin" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon="ph-check-circle" title="Nothing to review" sub="Generate some tech packs to evaluate their factory readiness here." color="var(--c-finalcheck)" />
        ) : (
          <>
            <div className="stat-strip" style={{ marginBottom: 22, maxWidth: 420 }}>
              <div className="stat-strip-seg">
                <div className="stat-strip-value">{items.length}</div>
                <div className="stat-strip-label">Total pieces</div>
              </div>
              <div className="stat-strip-seg">
                <div className="stat-strip-value" style={{ color: 'var(--green)' }}>{cleared}</div>
                <div className="stat-strip-label">Gate cleared</div>
              </div>
              <div className="stat-strip-seg">
                <div className="stat-strip-value" style={{ color: needsReview > 0 ? 'var(--amber)' : 'var(--ink)' }}>{needsReview}</div>
                <div className="stat-strip-label">Needs review</div>
              </div>
            </div>
            
            <div className="card">
              {items.map(p => {
                const tp = techPacks[p.id];
                const done = tp?.readiness_checklist?.filter(c => c.status === 'done').length || 0;
                const total = tp?.readiness_checklist?.length || 0;
                
                return (
                  <div className="list-row" key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tech-packs/${p.id}`)}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                        {total > 0 ? `${done}/${total} checklist items complete` : 'No checklist generated'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 500, color: readinessColor(p.readiness) }}>{p.readiness}%</span>
                      {p.readiness >= 80
                        ? <span className="tag tag-green">Gate cleared</span>
                        : <span className="tag tag-amber">Needs review</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}