import React, { useState } from 'react';
import { currency } from '../lib/format.js';

// Smooth gradient-filled revenue line, in the style of a storefront sales
// tracker — no charting library, same inline-SVG approach as PriceHistoryChart.
// Every point is hoverable/tappable and shows its exact value plus the
// month-over-month change, which is real arithmetic on the passed-in data,
// not decoration.
export default function RevenueChart({ data, accent = 'var(--c-analytics)' }) {
  const [active, setActive] = useState(data.length - 1);
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.revenue);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 720;
  const H = 220;
  const padX = 20;
  const padTop = 20;
  const padBottom = 34;

  const coords = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * (W - padX * 2),
    y: padTop + (1 - (d.revenue - min) / range) * (H - padTop - padBottom),
    ...d,
  }));

  const linePath = coords.reduce((acc, c, i) => {
    if (i === 0) return `M ${c.x},${c.y}`;
    const prev = coords[i - 1];
    const midX = (prev.x + c.x) / 2;
    return `${acc} C ${midX},${prev.y} ${midX},${c.y} ${c.x},${c.y}`;
  }, '');

  const baseline = H - padBottom;
  const areaPath = `${linePath} L ${coords[coords.length - 1].x},${baseline} L ${coords[0].x},${baseline} Z`;

  const activePoint = coords[active];
  const prevPoint = active > 0 ? coords[active - 1] : null;
  const delta = prevPoint ? ((activePoint.revenue - prevPoint.revenue) / (prevPoint.revenue || 1)) * 100 : null;

  // Keep the tooltip from clipping off the right/left edge of the chart.
  const tooltipLeft = Math.min(Math.max(activePoint.x, 60), W - 60);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: `${(tooltipLeft / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 2 }}>
        <div style={{
          background: 'var(--charcoal)', color: 'var(--cream)', borderRadius: 8, padding: '7px 12px',
          fontSize: 12, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)', textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13.5 }}>{currency(activePoint.revenue)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', marginTop: 2, opacity: 0.85 }}>
            <span>{activePoint.month}</span>
            {delta !== null && (
              <span style={{ color: delta >= 0 ? '#8DB077' : '#CB8267' }}>
                <i className={`ph ${delta >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`} /> {Math.abs(delta).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1={padX} y1={baseline} x2={W - padX} y2={baseline} stroke="var(--border)" strokeWidth="1" />

        <path d={areaPath} fill="url(#revenue-fill)" />
        <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <g key={c.month} style={{ cursor: 'pointer' }} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
            <rect x={c.x - (W / data.length) / 2} y={0} width={W / data.length} height={H} fill="transparent" />
            {i === active && <line x1={c.x} y1={padTop} x2={c.x} y2={baseline} stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />}
            <circle cx={c.x} cy={c.y} r={i === active ? 6 : 3.5} fill={i === active ? accent : 'var(--bg-1)'} stroke={accent} strokeWidth="2" />
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', marginTop: 4 }}>
        {coords.map((c, i) => (
          <div
            key={c.month}
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(i)}
            style={{ flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: 11.5, fontWeight: i === active ? 700 : 500, color: i === active ? 'var(--ink)' : 'var(--ink-3)' }}
          >
            {c.month}
          </div>
        ))}
      </div>
    </div>
  );
}
