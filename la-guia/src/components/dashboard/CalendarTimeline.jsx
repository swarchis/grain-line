import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduction } from '../../context/ProductionContext.jsx';

const STAGE_COLOR = { 'Sampling': 'var(--c-materials)', 'In production': 'var(--c-vendors)', 'Delivered': 'var(--green)' };

function daysUntil(dateStr) {
  const ms = new Date(dateStr) - new Date(new Date().toDateString());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatWhen(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

// A real, date-driven timeline — the only reliable date field in the data
// model is production_orders.due_date (collections only have a free-text
// launch_window, not an actual date), so this is scoped to production dates.
export default function CalendarTimeline() {
  const navigate = useNavigate();
  const { orders } = useProduction();

  const upcoming = orders
    .filter(o => o.due_date && o.stage !== 'Delivered')
    .map(o => ({ ...o, days: daysUntil(o.due_date) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  return (
    <div data-tour="calendar-timeline-widget" className="card-raised" style={{ padding: 20 }}>
      <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 14 }}>
        Calendar timeline
      </div>
      {upcoming.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', padding: '14px 0' }}>No production dates on the calendar yet.</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 14 }}>
          <div style={{ position: 'absolute', left: 3, top: 4, bottom: 4, width: 1.5, background: 'var(--border-2)' }} />
          {upcoming.map(o => (
            <div
              key={o.id}
              style={{ position: 'relative', paddingBottom: 14, cursor: 'pointer' }}
              onClick={() => navigate(`/production/${o.id}`)}
            >
              <span style={{
                position: 'absolute', left: -14, top: 3, width: 8, height: 8, borderRadius: '50%',
                background: o.days < 0 ? 'var(--red)' : (STAGE_COLOR[o.stage] || 'var(--ink-3)'),
                border: '2px solid var(--bg)',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.products?.name || o.po_number || 'Order'}
                </span>
                <span style={{ fontSize: 11, color: o.days < 0 ? 'var(--red)' : 'var(--ink-3)', flexShrink: 0, fontFamily: 'var(--mono)' }}>{formatWhen(o.days)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{o.stage} · {o.due_date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
