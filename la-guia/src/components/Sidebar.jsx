import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useNotifications } from '../context/NotificationsContext.jsx';
import { useUserPreferences } from '../context/UserPreferencesContext.jsx';
import { useOnboarding } from '../context/OnboardingContext.jsx';
import { useAppUI } from '../context/AppUIContext.jsx';
import { useTheme } from '../lib/useTheme.js';
import { WaxSeal } from './decor.jsx';
import SidebarSearch from './SidebarSearch.jsx';

const NAV_GROUPS = [
  { label: 'Navigation', tourId: 'nav-navigation', items: [
    { path: '/', icon: 'ph-house', label: 'Home', color: 'var(--c-home)' },
    { path: '/collections', icon: 'ph-stack', label: 'Collections', color: 'var(--c-organization)' },
    { path: '/design', icon: 'ph-pencil-simple', label: 'Designs', color: 'var(--c-design)' },
    { path: '/tech-packs', icon: 'ph-ruler', label: 'Tech Packs', color: 'var(--c-techpack)' },
    { path: '/materials', icon: 'ph-flask', label: 'Material Library', color: 'var(--c-materials)' },
    { path: '/vendors', icon: 'ph-handshake', label: 'Vendors', color: 'var(--c-vendors)' },
    { path: '/quotes', icon: 'ph-file-text', label: 'Quotes & Pricing', color: 'var(--c-vendors)' },
  ] },
  { label: 'Production', tourId: 'nav-production', items: [
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
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const { user, logOut } = useAuth();
  const { activeBrand, brands, switchBrand, createBrand } = useProducts();
  const { notifications } = useNotifications();
  const { preferences } = useUserPreferences();
  const { start: startTour } = useOnboarding();
  const { openHelp } = useAppUI();

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('grainline_nav_collapsed')) || []; } catch { return []; }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const displayName = preferences.full_name || (user?.email
    ? user.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Founder');
  const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'F';

  const toggleGroup = label => setCollapsed(prev => {
    const next = prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label];
    try { localStorage.setItem('grainline_nav_collapsed', JSON.stringify(next)); } catch {}
    return next;
  });

  const handleCreateBrand = async (e) => {
    e.preventDefault();
    const name = newBrandName.trim();
    if (!name) return;
    try {
      await createBrand(name);
      setNewBrandName('');
      setAddingBrand(false);
      setBrandOpen(false);
    } catch (err) {
      alert('Could not create brand: ' + err.message);
    }
  };

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
        <button className="bell-btn" data-tour="sidebar-bell" onClick={() => navigate('/notifications')} title="Notifications">
          <i className="ph ph-bell" style={{ fontSize: 14 }} />
          {unreadCount > 0 && <span className="bell-dot" />}
        </button>
      </div>

      <div data-tour="brand-switcher" style={{ padding: '15px 18px', borderBottom: '1px solid var(--sb-border)', position: 'relative' }}>
        <div
          onClick={() => setBrandOpen(o => !o)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <WaxSeal initials={activeBrand ? activeBrand.name.split(' ').map(w => w[0]).slice(0, 2).join('') : '—'} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--sb-ink-3)', fontFamily: 'var(--sans)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                Brand {brands.length > 1 ? `(${brands.length})` : ''}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--sb-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeBrand ? activeBrand.name : 'No brand loaded'}
              </div>
            </div>
          </div>
          <i className="ph ph-caret-up-down" style={{ fontSize: 13, color: 'var(--sb-ink-3)', flexShrink: 0 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          {activeBrand ? (
            <span className="tag" style={{ background: 'var(--sb-hover)', borderColor: 'var(--sb-border)', color: 'var(--sb-accent)' }}>{activeBrand.global_risk || 'Balanced'} · default risk</span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--sb-ink-3)' }}>Check your Supabase migrations — see README.</span>
          )}
        </div>

        {brandOpen && (
          <div className="brand-switch-panel">
            {brands.map(b => (
              <div
                key={b.id}
                className="brand-switch-item"
                onClick={() => { switchBrand(b.id); setBrandOpen(false); }}
              >
                <span style={{ fontWeight: b.id === activeBrand?.id ? 600 : 400 }}>{b.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {b.memberRole && b.memberRole !== 'owner' && <span style={{ fontSize: 10, color: 'var(--ink-4)', textTransform: 'capitalize' }}>{b.memberRole}</span>}
                  {b.id === activeBrand?.id && <i className="ph ph-check" style={{ color: 'var(--accent)' }} />}
                </div>
              </div>
            ))}
            {addingBrand ? (
              <form onSubmit={handleCreateBrand} style={{ padding: '10px 14px', borderTop: '1px solid var(--sb-border)', display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <input
                  autoFocus className="form-input" style={{ padding: '6px 9px', fontSize: 12.5 }}
                  placeholder="Brand name" value={newBrandName} onChange={e => setNewBrandName(e.target.value)}
                />
                <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '6px 10px' }}><i className="ph ph-check" /></button>
              </form>
            ) : (
              <div className="brand-switch-item" style={{ color: 'var(--sb-ink-3)', borderTop: '1px solid var(--sb-border)' }} onClick={(e) => { e.stopPropagation(); setAddingBrand(true); }}>
                <i className="ph ph-plus" style={{ marginRight: 8 }} /> Add a brand
              </div>
            )}
          </div>
        )}
      </div>

      <SidebarSearch />

      <div style={{ flex: 1, padding: '4px 0 8px' }}>
        {NAV_GROUPS.map(group => {
          const isCollapsed = collapsed.includes(group.label);
          return (
            <div key={group.label} data-tour={group.tourId}>
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

      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid var(--sb-border)' }}>
        <NavLink to="/settings" className="nav-item" style={({ isActive }) => ({
          color: isActive ? 'var(--sb-ink)' : 'var(--sb-ink-2)',
          background: isActive ? 'var(--sb-hover)' : 'transparent',
          border: '1px solid transparent',
          margin: '1px 0 2px',
        })}>
          <i className="ph ph-gear-six nav-item-icon" style={{ color: 'var(--sb-ink-3)' }} />
          <span>Profile & Settings</span>
        </NavLink>
        <div className="nav-item" onClick={startTour} style={{ color: 'var(--sb-ink-2)', cursor: 'pointer', margin: '1px 0' }}>
          <i className="ph ph-compass nav-item-icon" style={{ color: 'var(--sb-ink-3)' }} />
          <span>Take a tour</span>
        </div>
        <div className="nav-item" data-tour="keyboard-shortcuts-btn" onClick={openHelp} style={{ color: 'var(--sb-ink-2)', cursor: 'pointer', margin: '1px 0 8px' }}>
          <i className="ph ph-keyboard nav-item-icon" style={{ color: 'var(--sb-ink-3)' }} />
          <span>Keyboard shortcuts</span>
        </div>
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
            <div style={{ fontSize: 10.5, color: 'var(--sb-ink-3)', textTransform: 'capitalize' }}>{activeBrand?.memberRole || 'Owner'}</div>
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
