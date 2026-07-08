import React from 'react';

// Small inline SVG line chart — quote price over time for one vendor.
// No charting library; this app avoids heavy deps and the shape is simple enough not to need one.
export default function PriceHistoryChart({ points }) {
  if (!points || points.length < 2) return null;

  const sorted = [...points].sort((a, b) => new Date(a.date) - new Date(b.date));
  const amounts = sorted.map(p => p.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;

  const W = 560;
  const H = 140;
  const padX = 12;
  const padY = 16;

  const coords = sorted.map((p, i) => {
    const x = padX + (i / (sorted.length - 1)) * (W - padX * 2);
    const y = H - padY - ((p.amount - min) / range) * (H - padY * 2);
    return { x, y, ...p };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
        <path d={path} fill="none" stroke="var(--c-vendors)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="4" fill="var(--bg-1)" stroke="var(--c-vendors)" strokeWidth="2" />
            <text x={c.x} y={H - 2} fontSize="9" fill="var(--ink-4)" textAnchor="middle" fontFamily="var(--mono)">
              {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
        <span>Low ${min.toFixed(2)}</span>
        <span>High ${max.toFixed(2)}</span>
      </div>
    </div>
  );
}
