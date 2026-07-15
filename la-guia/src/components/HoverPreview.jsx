import React, { useState } from 'react';

// A rich hover popover (thumbnail + key facts) vs. this app's existing
// plain title="" tooltips. Wrap any row/card trigger; `content` is
// arbitrary JSX rendered inside the popover card.
export default function HoverPreview({ content, children, width = 240 }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', width: '100%' }}
      onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom + 6 }); setShow(true); }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && (
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 90, width,
          background: 'var(--bg-1)', border: '1.5px solid var(--border-2)', borderRadius: 'var(--r-sm)',
          boxShadow: 'var(--shadow-lg)', padding: 12, pointerEvents: 'none',
        }}>
          {content}
        </div>
      )}
    </div>
  );
}
