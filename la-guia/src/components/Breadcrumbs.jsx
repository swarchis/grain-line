import React from 'react';
import { useNavigate } from 'react-router-dom';

// A real hierarchical trail (Home > Vendors > Acme Textiles), distinct
// from FlowStepper.jsx (a fixed 6-node cross-feature stage jumper, not
// hierarchical). `items` is [{ label, path? }] — the last item (current
// page) should omit `path`.
export default function Breadcrumbs({ items }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 6 }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <i className="ph ph-caret-right" style={{ fontSize: 10 }} />}
          {it.path ? (
            <span style={{ cursor: 'pointer' }} onClick={() => navigate(it.path)} onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-3)'}>
              {it.label}
            </span>
          ) : (
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
