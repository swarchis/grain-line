import React from 'react';
import { useParams } from 'react-router-dom';
import { materials } from '../data/mockData.js';
import { trustTagClass } from '../lib/format.js';
import EmptyState from '../components/EmptyState.jsx';
import { PhotoPanel } from '../components/decor.jsx';

const TONE_BY_RISK = { green: 'sage', amber: 'gold', red: 'clay' };

export default function MaterialDetail() {
  const { id } = useParams();
  const material = materials.find(m => String(m.id) === id);

  if (!material) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Material not found" sub="This material isn't in the library yet." /></div>;
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Material</div>
            <h1 className="page-title">{material.name}</h1>
          </div>
          <div className="page-sub">{material.category}</div>
        </div>
        <div className="topbar-right">
          <span className={trustTagClass(material.riskLevel === 'green' ? 'green' : material.riskLevel === 'red' ? 'red' : 'amber')}>
            {material.riskLevel === 'green' ? 'Low risk' : material.riskLevel === 'red' ? 'High risk' : 'Watch'}
          </span>
        </div>
      </div>

      <div className="content">
        <PhotoPanel variant="weave" tone={TONE_BY_RISK[material.riskLevel] || 'gold'} aspect="21 / 5" label={material.name} icon="ph-flask" style={{ marginBottom: 20 }} />

        <div className="card-raised" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Behavior warning</span></div>
          <div className="card-body">
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>{material.warning}</p>
          </div>
        </div>

        <div className="section-label">Used across designs</div>
        {material.usedIn.length ? (
          <div className="card">
            {material.usedIn.map(name => (
              <div className="list-row" key={name}><span style={{ fontSize: 13.5 }}>{name}</span></div>
            ))}
          </div>
        ) : (
          <EmptyState icon="ph-flask" color="var(--c-materials)" title="Not used yet" sub="This material isn't attached to any tech pack right now." />
        )}
      </div>
    </>
  );
}
