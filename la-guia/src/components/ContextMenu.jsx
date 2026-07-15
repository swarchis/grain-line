import React, { useEffect, useRef, useState } from 'react';

// Generic right-click menu. Wrap any row/card in `<ContextMenuTarget items={...}>`.
// Positions at cursor, closes on outside-click or Escape. `items` is
// [{ label, icon, onClick, danger }] — the same actions already available
// via buttons elsewhere on the row; this is a shortcut, not new functionality.
export function ContextMenuTarget({ items, children }) {
  const [menu, setMenu] = useState(null); // { x, y }
  const ref = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = e => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const onContextMenu = (e) => {
    if (!items || items.length === 0) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div ref={ref} onContextMenu={onContextMenu} style={{ position: 'relative' }}>
      {children}
      {menu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: menu.x, top: menu.y, zIndex: 100, minWidth: 180,
            background: 'var(--bg-1)', border: '1.5px solid var(--border-2)', borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-lg)', padding: 4,
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => { it.onClick(); setMenu(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                background: 'none', border: 'none', padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--r-sm)', color: it.danger ? 'var(--red)' : 'var(--ink)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {it.icon && <i className={`ph ${it.icon}`} />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
