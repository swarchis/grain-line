import React from 'react';
import { useNavigate } from 'react-router-dom';
import { materials } from '../data/mockData.js';
import { trustTagClass } from '../lib/format.js';
import { PhotoPanel } from '../components/decor.jsx';

const SWATCH_TONES = ['clay', 'gold', 'sage', 'ink'];

export default function MaterialLibrary() {
  const navigate = useNavigate();

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Materials & Production</div>
            <h1 className="page-title">Material Library</h1>
          </div>
          <div className="page-sub">Browse and search material risk reference data</div>
        </div>
      </div>

      <div className="content">
        <div className="grid-cards">
          {materials.map((m, mi) => (
            <div key={m.id} className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/materials/${m.id}`)}>
              <div className="corner-fold" style={{ '--fold-color': 'var(--c-materials)' }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <PhotoPanel variant="weave" tone={SWATCH_TONES[mi % SWATCH_TONES.length]} aspect="1 / 1" style={{ width: 44, flexShrink: 0, borderRadius: 'var(--r-sm)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{m.category}</div>
                </div>
              </div>
              <span className={trustTagClass(m.riskLevel === 'green' ? 'green' : m.riskLevel === 'red' ? 'red' : 'amber')} style={{ marginBottom: 10, display: 'inline-flex' }}>{m.riskLevel === 'green' ? 'Low risk' : m.riskLevel === 'red' ? 'High risk' : 'Watch'}</span>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 8 }}>{m.warning}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
