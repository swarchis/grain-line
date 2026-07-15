import React from 'react';

// Placeholder shapes matching the content about to render, replacing the
// ph-spin spinner-icon loading convention used across most of this app.
// Reuses the .shimmer keyframe already defined in index.css.
export function SkeletonBlock({ width = '100%', height = 16, style }) {
  return <div className="shimmer" style={{ width, height, ...style }} />;
}

export function SkeletonRow() {
  return (
    <div className="list-row" style={{ pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SkeletonBlock width={32} height={32} style={{ borderRadius: 6 }} />
        <div>
          <SkeletonBlock width={140} height={13} style={{ marginBottom: 6 }} />
          <SkeletonBlock width={80} height={10} />
        </div>
      </div>
      <SkeletonBlock width={60} height={13} />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <SkeletonBlock height={120} style={{ marginBottom: 12, borderRadius: 'var(--r-sm)' }} />
      <SkeletonBlock width="70%" height={14} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="40%" height={11} />
    </div>
  );
}

// Convenience: N skeleton rows or cards, for a loading list/grid state.
export function SkeletonList({ count = 5, variant = 'row' }) {
  const Item = variant === 'card' ? SkeletonCard : SkeletonRow;
  return <>{Array.from({ length: count }).map((_, i) => <Item key={i} />)}</>;
}
