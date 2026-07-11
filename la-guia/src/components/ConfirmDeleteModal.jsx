import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Two layers of protection against an accidental delete: (1) this modal only
// opens on a deliberate click, never fires from the item's own click target,
// and (2) even once open, the actual delete button stays disabled until the
// item's exact name is typed in — a stray click or Enter key can't finish it.
export default function ConfirmDeleteModal({ open, onClose, onConfirm, itemLabel, itemName, warning }) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setDeleting(false);
    setError(null);
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const matches = typed.trim() === itemName;

  const handleConfirm = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setDeleting(false);
      setError('Could not delete: ' + err.message);
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,12,0.55)' }} onClick={onClose} />
      <div className="card-raised enter" style={{ position: 'relative', width: 420, padding: '22px 24px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ph ph-trash" style={{ color: 'var(--red)', fontSize: 16 }} />
            </div>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 19 }}>Delete this {itemLabel}?</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16 }}><i className="ph ph-x" /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 6 }}>
          <strong>{itemName}</strong> will be permanently deleted. {warning || "This can't be undone."}
        </p>

        <div style={{ margin: '16px 0 6px' }}>
          <label style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'block', marginBottom: 6 }}>
            Type <strong style={{ color: 'var(--ink-2)' }}>{itemName}</strong> to confirm
          </label>
          <input
            autoFocus
            className="form-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
            placeholder={itemName}
            style={{ width: '100%' }}
          />
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-sm"
            onClick={handleConfirm}
            disabled={!matches || deleting}
            style={{
              background: matches ? 'var(--red)' : 'var(--bg-3)',
              borderColor: matches ? 'var(--red)' : 'var(--border-2)',
              color: matches ? '#fff' : 'var(--ink-4)',
              cursor: matches ? 'pointer' : 'not-allowed',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
