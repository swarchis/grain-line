import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUTS } from '../lib/useKeyboardShortcuts.js';

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px',
      fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)',
      background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderBottom: '2px solid var(--border-3)', borderRadius: 5,
    }}>
      {children}
    </kbd>
  );
}

export default function ShortcutsHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,12,0.55)' }} onClick={onClose} />
      <div className="card-raised enter" style={{ position: 'relative', width: 420, maxHeight: '80vh', overflowY: 'auto', padding: '22px 24px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20 }}>Keyboard shortcuts</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16 }}><i className="ph ph-x" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SHORTCUTS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 4px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{s.description}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(isMac && s.macKeys ? s.macKeys : s.keys).map((k, ki) => <Kbd key={ki}>{k}</Kbd>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
