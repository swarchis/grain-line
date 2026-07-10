import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trustTagClass } from '../lib/format.js';
import { PhotoPanel } from '../components/decor.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useMaterials } from '../context/MaterialsContext.jsx';

const SWATCH_TONES = ['clay', 'gold', 'sage', 'ink'];

export default function MaterialLibrary() {
  const navigate = useNavigate();
  const { materials, loading } = useMaterials();
  const [search, setSearch] = useState('');

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Materials & Production</div>
            <h1 className="page-title">Material Library</h1>
          </div>
          <div className="page-sub">Global risk reference for apparel production</div>
        </div>
        <div className="topbar-right">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input 
              className="form-input" 
              placeholder="Search materials..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="ph-flask" title="No materials found" sub="Try a different search term." />
        ) : (
          <div className="grid-cards" data-tour="material-library">
            {filtered.map((m, mi) => (
              <div key={m.id} className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/materials/${m.id}`)}>
                <div className="corner-fold" style={{ '--fold-color': 'var(--c-materials)' }} />
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <PhotoPanel variant="weave" tone={SWATCH_TONES[mi % SWATCH_TONES.length]} aspect="1 / 1" style={{ width: 44, flexShrink: 0, borderRadius: 'var(--r-sm)' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{m.category}</div>
                  </div>
                </div>
                <span className={trustTagClass(m.risk_level)} style={{ marginBottom: 10, display: 'inline-flex' }}>
                  {m.risk_level === 'green' ? 'Low risk' : m.risk_level === 'red' ? 'High risk' : 'Watch'}
                </span>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 8 }}>{m.warning}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}