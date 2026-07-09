import React from 'react';
import { useNavigate } from 'react-router-dom';
import { techPacks } from '../data/mockData.js';
import { readinessColor } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';

export default function ReadinessReview() {
  const navigate = useNavigate();
  const { products } = useProducts();
  const items = products.filter(p => techPacks[p.id]).sort((a, b) => a.readiness - b.readiness);
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
            const done = tp?.readinessChecklist?.filter(c => c.status === 'done').length || 0;
            const total = tp?.readinessChecklist?.length || 0;
            return (
              <div className="list-row" key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tech-packs/${p.id}`)}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{done}/{total} checklist items complete</div>
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
      </div>
    </>
  );
}
