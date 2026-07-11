import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { currency, riskTagClass, readinessColor, stageLink, swatchGradient } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import { PhotoPanel } from '../components/decor.jsx';

const COVER_TONES = { 'fall-capsule-02': 'gold', 'core-basics': 'sage', 'spring-preview': 'clay', 'resort-capsule': 'ink' };

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, collections, deleteCollection } = useProducts();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const collection = collections.find(c => c.id === id);
  const members = products.filter(p => p.collection_id === id);

  if (!collection) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Collection not found" sub="This collection doesn't exist yet." /></div>;
  }

  const totalCost = members.reduce((s, p) => s + p.budget, 0);
  const avgReadiness = members.length ? Math.round(members.reduce((s, p) => s + p.readiness, 0) / members.length) : 0;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-organization)' }}>Collection</div>
            <h1 className="page-title">{collection.name}</h1>
          </div>
          <div className="page-sub">{collection.launch_window || 'No launch window set'}</div>
        </div>
        <div className="topbar-right">
          {collection.timeline_conflict && <span className="tag tag-amber">Timeline conflict</span>}
          <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete collection" style={{ color: 'var(--red)' }}>
            <i className="ph ph-trash" />
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        itemLabel="collection"
        itemName={collection.name}
        warning="Products in it won't be deleted — they'll just be un-grouped from this collection."
        onConfirm={async () => { await deleteCollection(id); navigate('/collections'); }}
      />

      <div className="content">
        <PhotoPanel variant="weave" tone={COVER_TONES[collection.id] || 'gold'} aspect="21 / 6" label={collection.name} icon="ph-stack" style={{ marginBottom: 24 }} />

        <div className="stats-row">
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-organization)' }}>
            <div className="stat-label">Products</div>
            <div className="stat-value">{members.length}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
            <div className="stat-label">Total cost</div>
            <div className="stat-value">{currency(totalCost)}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-techpack)' }}>
            <div className="stat-label">Avg. readiness</div>
            <div className="stat-value" style={{ color: readinessColor(avgReadiness) }}>{avgReadiness}%</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-home)' }}>
            <div className="stat-label">Launch window</div>
            <div className="stat-value" style={{ fontSize: 17 }}>{collection.launch_window || '—'}</div>
          </div>
        </div>

        <div className="section-label">Products in this collection</div>
        {members.length === 0 ? (
          <EmptyState icon="ph-t-shirt" title="Empty collection" sub="Create a design in the Design Studio and assign it to this collection to see it here." color="var(--c-organization)" />
        ) : (
          <div className="grid-cards">
            {members.map(p => (
              <div key={p.id} className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(stageLink(p.stage, p.id))}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div className="swatch" style={{ background: swatchGradient(p.id) }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, textTransform: 'capitalize' }}>{p.stage}</div>
                  </div>
                </div>
                <div className="readiness" style={{ marginBottom: 10 }}>
                  <div className="readiness-track">
                    <div className="readiness-fill" style={{ width: `${p.readiness}%`, background: readinessColor(p.readiness) }} />
                  </div>
                  <span className="readiness-value">{p.readiness}%</span>
                </div>
                <span className={riskTagClass(p.risk)}>{p.risk}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}