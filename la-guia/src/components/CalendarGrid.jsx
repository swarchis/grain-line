import React, { useState } from 'react';

// A real month-grid calendar (day cells) — everywhere else in this app
// that says "calendar" (Content Hub's "Drop Calendar") is actually a
// vertical timeline list. `events` is [{ date: Date, render: () => JSX, key }].
export default function CalendarGrid({ events, accent = 'var(--accent)', onDayClick }) {
  const [cursor, setCursor] = useState(() => new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const eventsByDay = {};
  events.forEach(e => {
    if (e.date.getFullYear() === year && e.date.getMonth() === month) {
      const day = e.date.getDate();
      (eventsByDay[day] = eventsByDay[day] || []).push(e);
    }
  });

  const today = new Date();
  const isToday = (d) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={() => setCursor(new Date(year, month - 1, 1))}><i className="ph ph-caret-left" /></button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button className="btn btn-sm" onClick={() => setCursor(new Date(year, month + 1, 1))}><i className="ph ph-caret-right" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ background: 'var(--bg-2)', padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div
            key={i}
            onClick={() => day && onDayClick && onDayClick(new Date(year, month, day))}
            style={{
              background: 'var(--bg-1)', minHeight: 84, padding: 6, cursor: day && onDayClick ? 'pointer' : 'default',
              border: day && isToday(day) ? `1.5px solid ${accent}` : 'none',
            }}
          >
            {day && (
              <>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: isToday(day) ? accent : 'var(--ink-3)', fontWeight: isToday(day) ? 700 : 400, marginBottom: 4 }}>{day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(eventsByDay[day] || []).slice(0, 3).map(e => <div key={e.key}>{e.render()}</div>)}
                  {(eventsByDay[day] || []).length > 3 && <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>+{eventsByDay[day].length - 3} more</div>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
