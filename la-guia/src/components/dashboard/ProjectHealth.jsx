import React from 'react';
import { useProducts } from '../../context/ProductsContext.jsx';
import { useProduction } from '../../context/ProductionContext.jsx';
import { readinessColor } from '../../lib/format.js';

const RISK_ORDER = ['Conservative', 'Balanced', 'Aggressive'];
const RISK_COLOR = { Conservative: 'var(--blue)', Balanced: 'var(--accent)', Aggressive: 'var(--amber)' };

export default function ProjectHealth() {
  const { products } = useProducts();
  const { orders } = useProduction();

  const avgReadiness = products.length ? Math.round(products.reduce((s, p) => s + p.readiness, 0) / products.length) : 0;
  const gateFlags = products.filter(p => p.readiness < 80 && p.stage === 'sourcing').length;
  const overdue = orders.filter(o => o.due_date && o.stage !== 'Delivered' && new Date(o.due_date) < new Date()).length;
  const riskCounts = RISK_ORDER.map(r => ({ risk: r, count: products.filter(p => p.risk === r).length }));
  const maxRisk = Math.max(1, ...riskCounts.map(r => r.count));

  const healthLabel = gateFlags > 0 || overdue > 0 ? 'Needs attention' : avgReadiness >= 70 ? 'On track' : 'Early stage';
  const healthColor = gateFlags > 0 || overdue > 0 ? 'var(--amber)' : avgReadiness >= 70 ? 'var(--green)' : 'var(--ink-3)';

  return (
    <div data-tour="project-health-widget" className="card-raised" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>Project health</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: healthColor }}>{healthLabel}</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 5 }}>
          <span>Avg. readiness</span><span>{avgReadiness}%</span>
        </div>
        <div className="readiness-track">
          <div className="readiness-fill" style={{ width: `${avgReadiness}%`, background: readinessColor(avgReadiness) }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: gateFlags > 0 ? 'var(--amber)' : 'var(--ink)' }}>{gateFlags}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Gate flags</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: overdue > 0 ? 'var(--red)' : 'var(--ink)' }}>{overdue}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Overdue orders</div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 6 }}>Risk mix</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {riskCounts.map(r => (
          <div key={r.risk} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)', width: 74, flexShrink: 0 }}>{r.risk}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.count / maxRisk) * 100}%`, height: '100%', background: RISK_COLOR[r.risk] }} />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)', width: 14, textAlign: 'right' }}>{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
