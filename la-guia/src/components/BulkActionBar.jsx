import React from 'react';

// Bottom-docked bar that appears once something is selected. `actions` is
// [{ label, icon, onClick, danger }] — the page passes in whatever single-
// item actions it already has, called over the current selection.
export default function BulkActionBar({ count, onClear, actions }) {
  if (count === 0) return null;
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40,
      background: 'var(--charcoal)', color: 'var(--cream)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow-lg)',
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 13.5,
    }}>
      <span style={{ fontWeight: 700 }}>{count} selected</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            style={{
              background: a.danger ? 'var(--red)' : 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
              borderRadius: 'var(--r-sm)', padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {a.icon && <i className={`ph ${a.icon}`} />} {a.label}
          </button>
        ))}
      </div>
      <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--cream)', opacity: 0.7, cursor: 'pointer', marginLeft: 4 }}>
        <i className="ph ph-x" />
      </button>
    </div>
  );
}
