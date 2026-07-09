import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { brands, activeBrandId, notifications } from '../data/mockData.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WaxSeal } from './decor.jsx';

// Grouped to mirror the atelier reference (Navigation / Production / Analytics / Tools),
// but only real routes appear here — the reference's Sampling/Final Check/Calendar/Tasks/
// Messages/Files don't map to anything this app actually does, so they're left out rather
// than added as dead links.
const NAV_GROUPS = [
  { label: 'Navigation', items: [
    { path: '/', icon: 'ph-house', label: 'Home', color: 'var(--c-home)' },
    { path: '/collections', icon: 'ph-stack', label: 'Collections', color: 'var(--c-organization)' },
    { path: '/design', icon: 'ph-pencil-simple', label: 'Designs', color: 'var(--c-design)' },
    { path: '/tech-packs', icon: 'ph-ruler', label: 'Tech Packs', color: 'var(--c-techpack)' },
    { path: '/materials', icon: 'ph-flask', label: 'Material Library', color: 'var(--c-materials)' },
    { path: '/vendors', icon: 'ph-handshake', label: 'Vendors', color: 'var(--c-vendors)' },
    { path: '/quotes', icon: 'ph-file-text', label: 'Quotes & Pricing', color: 'var(--c-vendors)' },
  ] },
  { label: 'Production', items: [
    { path: '/production', icon: 'ph-package', label: 'Production Orders', color: 'var(--c-materials)' },
    { path: '/readiness', icon: 'ph-check-circle', label: 'Readiness Review', color: 'var(--c-finalcheck)' },
  ] },
  { label: 'Analytics', items: [
    { path: '/sales', icon: 'ph-chart-line-up', label: 'Dashboard', color: 'var(--c-analytics)' },
  ] },
  { label: 'Tools', items: [
    { path: '/content', icon: 'ph-megaphone', label: 'Content Hub', color: 'var(--c-content)' },
    { path: '/notifications', icon: 'ph-bell', label: 'Notifications', color: 'var(--c-settings)' },
  ] },
];

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('grainline_theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('grainline_theme', theme);
  }, [theme]);
  return { isDark: theme === 'dark', toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) };
}

function GrainlineMark({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 8h9m4 0h9M14 8l-4-4m0 8 4-4M10 8l4-4m-4 4 4 4" stroke="var(--sb-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar() {
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const [brandOpen, setBrandOpen] = useState(false);
  const { user, logOut } = useAuth();
  const [activeBrand, setActiveBrand] = useState(brands.find(b => b.id === activeBrandId));
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('grainline_nav_collapsed')) || []; } catch { return []; }
  });
  const unread = notifications.filter(n => !n.read).length;

  const displayName = user?.email
    ? user.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Founder';
  const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'F';

  const toggleGroup = label => setCollapsed(prev => {
    const next = prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label];
    try { localStorage.setItem('grainline_nav_collapsed', JSON.stringify(next)); } catch {}
    return next;
  });

  return (
    <nav
      style={{
        width: 'var(--sidebar-w)', flexShrink: 0,
        backgroundColor: 'var(--sb-bg)',
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.045 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\"), linear-gradient(190deg, color-mix(in srgb, var(--sb-bg) 92%, #fff) 0%, var(--sb-bg) 22%, var(--sb-bg) 78%, var(--charcoal) 100%)",
        boxShadow: '6px 0 24px rgba(0,0,0,0.22)',
        borderRight: '1px solid var(--sb-border)', display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0, overflowY: 'auto', zIndex: 5,
      }}
    >
      {/* Wordmark + bell */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--sb-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GrainlineMark />
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 23, fontWeight: 500, color: 'var(--sb-ink)', letterSpacing: '-0.01em' }}>
              Grainline
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--sb-ink-3)', marginTop: 7, fontFamily: 'var(--sans)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
            Production OS
          </div>
        </div>
        <button className="bell-btn" onClick={() => navigate('/notifications')} title="Notifications">
          <i className="ph ph-bell" style={{ fontSize: 14 }} />
          {unread > 0 && <span className="bell-dot" />}
        </button>
      </div>

      {/* Brand switcher */}
      <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--sb-border)', position: 'relative' }}>
        <div
          onClick={() => setBrandOpen(o => !o)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WaxSeal initials={activeBrand.name.split(' ').map(w => w[0]).slice(0, 2).join('')} size={30} />
            <div>
              <div style={{ fontSize: 9, color: 'var(--sb-ink-3)', fontFamily: 'var(--sans)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                Brand
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--sb-ink)' }}>{activeBrand.name}</div>
            </div>
          </div>
          <i className="ph ph-caret-up-down" style={{ fontSize: 13, color: 'var(--sb-ink-3)' }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <span className="tag" style={{ background: 'var(--sb-hover)', borderColor: 'var(--sb-border)', color: 'var(--sb-accent)' }}>{activeBrand.globalRisk} · default risk</span>
        </div>

        {brandOpen && (
          <div className="brand-switch-panel">
            {brands.map(b => (
              <div
                key={b.id}
                className="brand-switch-item"
                onClick={() => { setActiveBrand(b); setBrandOpen(false); }}
              >
                <span style={{ fontWeight: b.id === activeBrand.id ? 600 : 400 }}>{b.name}</span>
                {b.id === activeBrand.id && <i className="ph ph-check" style={{ color: 'var(--accent)' }} />}
              </div>
            ))}
            <div className="brand-switch-item" style={{ color: 'var(--sb-ink-3)', borderTop: '1px solid var(--sb-border)' }}>
              <i className="ph ph-plus" style={{ marginRight: 8 }} /> Add a brand
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '4px 0 8px' }}>
        {NAV_GROUPS.map(group => {
          const isCollapsed = collapsed.includes(group.label);
          return (
            <div key={group.label}>
              <div className="nav-group-label" onClick={() => toggleGroup(group.label)}>
                <span className={`nav-caret ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
                <span style={{ flex: 1 }}>{group.label}</span>
              </div>
              {!isCollapsed && group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className="nav-item"
                  style={({ isActive }) => ({
                    color: isActive ? 'var(--sb-ink)' : 'var(--sb-ink-2)',
                    background: isActive ? 'var(--sb-hover)' : 'transparent',
                    borderLeft: isActive ? `2.5px solid ${item.color}` : '2.5px solid transparent',
                    borderRadius: '0 7px 7px 0',
                  })}
                >
                  <i className={`ph ${item.icon} nav-item-icon`} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid var(--sb-border)' }}>
        <NavLink to="/settings" className="nav-item" style={({ isActive }) => ({
          color: isActive ? 'var(--sb-ink)' : 'var(--sb-ink-2)',
          background: isActive ? 'var(--sb-hover)' : 'transparent',
          border: '1px solid transparent',
          margin: '1px 0 8px',
        })}>
          <i className="ph ph-gear-six nav-item-icon" style={{ color: 'var(--sb-ink-3)' }} />
          <span>Profile & Settings</span>
        </NavLink>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--sb-accent), color-mix(in srgb, var(--sb-accent) 55%, #7A6C8E))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600, fontSize: 13, color: 'var(--charcoal)',
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sb-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            <div style={{ fontSize: 10.5, color: 'var(--sb-ink-3)' }}>Founder</div>
          </div>
          <button onClick={toggle} title={isDark ? 'Switch to light' : 'Switch to dark'} style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sb-ink-3)',
          }}>
            <i className={`ph ${isDark ? 'ph-moon' : 'ph-sun'}`} style={{ fontSize: 14 }} />
          </button>
          <button onClick={logOut} title="Sign out" style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sb-ink-3)',
          }}>
            <i className="ph ph-sign-out" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>
    </nav>
  );
}
