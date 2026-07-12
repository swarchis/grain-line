import React from 'react';
import { useNotifications } from '../context/NotificationsContext.jsx';

const TYPE_ICON = { success: 'ph-check-circle', info: 'ph-info', warning: 'ph-warning' };
const TYPE_COLOR = { success: 'var(--green)', info: 'var(--blue)', warning: 'var(--amber)' };

export default function NotificationsInbox() {
  const { notifications, loading, markAllAsRead } = useNotifications();

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-settings)' }}>Notifications</div>
            <h1 className="page-title">Inbox</h1>
          </div>
          <div className="page-sub">{notifications.filter(n => !n.read).length} unread</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-sm" onClick={markAllAsRead}>Mark all read</button>
        </div>
      </div>

      <div className="content">
        {loading ? (
           <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>
        ) : notifications.length === 0 ? (
           <div className="card-raised" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
              No notifications yet. Alerts about your production, quotes, and AI tasks will appear here.
           </div>
        ) : (
          <div className="card">
            {notifications.map(n => (
              <div className="list-row" key={n.id} style={{ background: n.read ? 'transparent' : 'var(--accent-bg)' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <i className={`ph ${TYPE_ICON[n.type] || 'ph-info'}`} style={{ fontSize: 18, color: TYPE_COLOR[n.type] || 'var(--blue)', marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>{n.body}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}