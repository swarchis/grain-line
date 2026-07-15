import React from 'react';

// Real date-range bars (start -> end) — nothing like this exists elsewhere
// in the app (ContentHub's "Drop Calendar" only plots single-date markers).
// `items` is [{ id, label, start: Date, end: Date, color, tag? }].
export default function GanttChart({ items, accent = 'var(--accent)' }) {
  if (!items || items.length === 0) return null;

  const allDates = items.flatMap(i => [i.start, i.end]);
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const totalMs = Math.max(1, maxDate - minDate);
  const pct = (d) => ((d - minDate) / totalMs) * 100;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
        <span>{minDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>{maxDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{item.label}</span>
              {item.tag && <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{item.tag}</span>}
            </div>
            <div style={{ position: 'relative', height: 10, background: 'var(--bg-3)', borderRadius: 5 }}>
              <div style={{
                position: 'absolute', left: `${pct(item.start)}%`, width: `${Math.max(1, pct(item.end) - pct(item.start))}%`,
                height: '100%', borderRadius: 5, background: item.color || accent,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
