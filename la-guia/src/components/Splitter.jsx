import React, { useRef, useCallback } from 'react';

// Plain mousedown/mousemove drag-to-resize divider — no dependency, matches
// this app's existing no-heavy-deps convention (see techPackExcel.js's
// comment on why xlsx was avoided). `width`/`onWidthChange` control the
// left pane's width in px; the right pane fills the remaining space.
export default function Splitter({ width, onWidthChange, min = 220, max = 640 }) {
  const dragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (moveEvent) => {
      if (!dragging.current) return;
      const next = Math.min(max, Math.max(min, startWidth + (moveEvent.clientX - startX)));
      onWidthChange(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onWidthChange, min, max]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{ width: 6, cursor: 'col-resize', flexShrink: 0, background: 'transparent', position: 'relative' }}
      title="Drag to resize"
    >
      <div style={{ position: 'absolute', left: 2, top: 0, bottom: 0, width: 2, borderRadius: 1, background: 'var(--border-2)' }} />
    </div>
  );
}
