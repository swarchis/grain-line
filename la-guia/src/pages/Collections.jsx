import React from 'react';
import { useNavigate } from 'react-router-dom';
import { collections } from '../data/mockData.js';
import { currency, swatchGradient } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { PhotoPanel } from '../components/decor.jsx';

const COVER_TONES = ['gold', 'sage', 'clay', 'ink'];

export default function Collections() {
  const navigate = useNavigate();
  const { products } = useProducts();

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-organization)' }}>Organization</div>
            <h1 className="page-title">Collections</h1>
          </div>
          <div className="page-sub">{collections.length} groupings · read-only aggregation of product data</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary"><i className="ph ph-plus" /> New collection</button>
        </div>
      </div>

      <div className="content">
        <div className="grid-2">
          {collections.map((c, ci) => {
            const members = products.filter(p => p.collectionId === c.id);
            const totalCost = members.reduce((s, p) => s + p.budget, 0);
            return (
              <div className="card-raised card-hover" key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/collections/${c.id}`)}>
                <PhotoPanel variant="weave" tone={COVER_TONES[ci % COVER_TONES.length]} aspect="16 / 6" label={c.name} icon="ph-stack" style={{ borderRadius: 'var(--r) var(--r) 0 0', border: 'none', borderBottom: '1px solid var(--border)' }} />
                <div className="corner-fold" style={{ '--fold-color': 'var(--c-organization)' }} />
                <div className="card-header">
                  <span className="card-title">{c.name}</span>
                  {c.timelineConflict && <span className="tag tag-amber">Timeline conflict</span>}
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div>
                      <div className="stat-label">Total cost</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 500 }}>{currency(totalCost)}</div>
                    </div>
                    <div>
                      <div className="stat-label">Launch window</div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{c.launchWindow}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: -6 }}>
                    {members.slice(0, 6).map((p, i) => (
                      <div key={p.id} className="swatch" style={{ width: 30, height: 30, marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg-1)', background: swatchGradient(p.id) }} />
                    ))}
                    {members.length > 6 && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink-3)', alignSelf: 'center' }}>+{members.length - 6}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
