import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

// Assistant is a top-level nav item, not an agent
const ASSISTANT_NAV = { path: '/assistant', icon: '✦', label: 'Sage' };

const AGENT_GROUPS = [
  {
    label: 'Front of House',
    agents: [
      { path: '/marketing', id: 'agent_1_marketing', icon: '◎', label: 'Business Growth & Marketing', defaultTab: 'calendar', subs: [
        { divider: 'Plan & create' },
        { tab: 'calendar', label: 'Content calendar' }, { tab: 'media', label: 'Media library' },
        { tab: 'trends', label: 'Trends based Post Generation' }, { tab: 'queue', label: 'Post queue' },
        { divider: 'Publish and Insights' },
        { tab: 'insights', label: 'Social Media Insights' }, { tab: 'newsletter', label: 'Newsletter' },
        { tab: 'text', label: 'Text marketing' }, { tab: 'ads', label: 'Ads' },
      ] },
      { path: '/reviews',   id: 'agent_4_reviews',   icon: '◐', label: 'Reputation Management' },
      { path: '/seo',       id: 'agent_7_seo',       icon: '◓', label: 'Local Visibility & SEO' },
      { path: '/loyalty',   id: 'agent_8_loyalty',   icon: '◔', label: 'Loyalty & Customer Incentives', defaultTab: 'members', subs: [
        { tab: 'members', label: 'Members' }, { tab: 'campaigns', label: 'Campaigns' },
        { tab: 'rewards', label: 'Rewards' }, { tab: 'challenges', label: 'Challenges' },
        { tab: 'leaderboard', label: 'Leaderboard' },
      ] },
      { path: '/menu',      id: 'agent_11_menu',     icon: '🍽️', label: 'Menu Engineering' },
    ],
  },
  {
    label: 'Back of House',
    agents: [
      { path: '/financial',     id: 'agent_2_financial', icon: '◈', label: 'Business Health & KPIs', defaultTab: 'overview', subs: [
        { tab: 'overview', label: 'Overview' }, { tab: 'sales', label: 'Sales' },
        { tab: 'costs', label: 'Costs' }, { tab: 'cash', label: 'Cash' },
        { tab: 'ratings', label: 'Ratings' }, { tab: 'events', label: 'Events' },
        { tab: 'history', label: 'All weeks' },
      ] },
      { path: '/cashpl',        id: 'agent_5_cashpl',    icon: '◑', label: 'Cash Flow & Profitability', defaultTab: 'monthly', subs: [
        { tab: 'monthly', label: 'Monthly P&L' }, { tab: 'transactions', label: 'Transactions' },
        { tab: 'rules', label: 'Rules' }, { tab: 'accounts', label: 'Accounts' },
      ] },
      { path: '/labor',         id: 'agent_9_labor',     icon: '◑', label: 'Labor & Scheduling' },
      { path: '/inventory',     id: 'agent_3_inventory', icon: '◉', label: 'Inventory Management', defaultTab: 'invoices', subs: [
        { divider: 'Purchasing' },
        { tab: 'invoices', label: 'Invoices' }, { tab: 'email', label: 'Email queue' },
        { tab: 'vendors', label: 'Vendors' }, { tab: 'orders', label: 'Order lists' },
        { divider: 'Stock' },
        { tab: 'catalog', label: 'Item catalog' }, { tab: 'counts', label: 'Physical counts' },
        { divider: 'Costing' },
        { tab: 'cogs', label: 'COGS' }, { tab: 'costwatch', label: 'Cost watch' },
        { tab: 'recipes', label: 'Recipes & costing' },
      ] },
      { path: '/training',      id: 'agent_6_training',  icon: '🛡️', label: 'Compliance & Governance' },
      { path: '/training-perf', id: 'agent_10_training', icon: '🏆', label: 'Training & Performance' },
    ],
  },
  {
    label: 'Reports',
    agents: [
      { path: '/reports', id: 'reports', icon: '📊', label: 'Reports' },
    ],
  },
  {
    label: 'Getting started',
    agents: [
      { path: '/setup', id: 'setup', icon: '🚀', label: 'Setup' },
    ],
  },
];
// Flat list for any code that needs it
const AGENTS = AGENT_GROUPS.flatMap(g => g.agents);

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('ros_theme');
    if (s) return s;
    return 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ros_theme', theme);
  }, [theme]);
  return { isDark: theme === 'dark', toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

export default function Sidebar() {
  const { user, logout, location: selectedLoc, setLocation, canViewAgent, isManagerPlus } = useAuth();
  const { isDark, toggle } = useTheme();
  const routerLoc = useLocation();
  const navigate = useNavigate();
  const [locs, setLocs] = useState([]);

  // Collapsible groups (persisted) + accordion agent expansion
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ros_nav_collapsed')) || []; } catch { return []; }
  });
  const toggleGroup = (label) => setCollapsedGroups(prev => {
    const next = prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label];
    try { localStorage.setItem('ros_nav_collapsed', JSON.stringify(next)); } catch {}
    return next;
  });
  const [openAgent, setOpenAgent] = useState(null);
  useEffect(() => {
    for (const g of AGENT_GROUPS) for (const a of g.agents)
      if (a.subs && (routerLoc.pathname === a.path || routerLoc.pathname.startsWith(a.path + '/'))) { setOpenAgent(a.id); return; }
  }, [routerLoc.pathname]);
  const _tabMatch = routerLoc.pathname.match(/^\/[^/]+\/([^/]+)/);
  const currentTab = _tabMatch ? _tabMatch[1] : null;

  useEffect(() => {
    import('../lib/api.js').then(({ locations }) => {
      locations.list().then(d => setLocs(Array.isArray(d) ? d : [])).catch(() => {});
    });
  }, []);

  const navStyle = (active, locked) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    margin: '1px 6px',
    borderRadius: '5px',
    fontSize: 12,
    fontWeight: 500,
    color: locked ? 'var(--ink-4)' : active ? 'var(--ink)' : 'var(--ink-3)',
    background: active ? 'var(--bg-3)' : 'transparent',
    border: active ? '1px solid var(--border-2)' : '1px solid transparent',
    textDecoration: 'none',
    cursor: locked ? 'not-allowed' : 'pointer',
    pointerEvents: locked ? 'none' : 'auto',
    transition: 'all 0.1s',
    letterSpacing: '0.01em',
  });

  const sectionLabel = (text) => (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--ink-3)',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      padding: '18px 18px 6px',
      fontFamily: 'var(--mono)',
    }}>
      {text}
    </div>
  );

  const activeIcon = (path) => routerLoc.pathname === path;

  return (
    <nav style={{
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* Logo */}
      <div style={{
        padding: '20px 18px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 1,
          fontFamily: 'var(--display, var(--serif))',
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}>
          <span>p</span>
          <svg width="28" height="20" viewBox="0 0 44 30" fill="none" style={{margin:'0 1px'}}>
            <defs><linearGradient id="pbeat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F59E0B"/><stop offset="1" stopColor="#E2570F"/></linearGradient></defs>
            <path d="M2 15 h8 l5 -11 l8 22 l5 -11 h12" stroke="url(#pbeat)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>lse</span>
        </div>
        <div style={{
          fontSize: 9,
          color: 'var(--ink-4)',
          marginTop: 4,
          fontFamily: 'var(--mono)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Multi-agent platform
        </div>
      </div>

      {/* Location picker */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <select
          value={selectedLoc || ''}
          onChange={e => setLocation(e.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--bg-3)',
            border: '1px solid var(--border-2)',
            borderRadius: '4px',
            padding: '7px 10px',
            fontSize: 11,
            color: 'var(--ink-2)',
            fontFamily: 'var(--sans)',
            fontWeight: 500,
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666260' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 9px center',
            paddingRight: '26px',
          }}
        >
          <option value="">All locations</option>
          {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, paddingBottom: 8 }}>
        {/* Pulse Assistant — top of nav */}
        <NavLink to="/" end style={({ isActive }) => ({
          display:'flex', alignItems:'center', gap:10,
          padding:'9px 12px', textDecoration:'none', borderRadius:8,
          margin:'4px 6px 2px',
          background: isActive ? 'var(--gold)' : 'var(--bg-2)',
          color: isActive ? '#000' : 'var(--ink)',
          fontWeight: 700, fontSize: 12,
          border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
          transition: 'all .12s',
        })}>
          <span style={{ fontSize:14 }}>✦</span>
          <span style={{ flex:1 }}>Sage</span>
        </NavLink>

        {AGENT_GROUPS.map(group => {
          const isCollapsed = collapsedGroups.includes(group.label);
          return (
            <div key={group.label}>
              <div onClick={() => toggleGroup(group.label)} style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none',
                fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase',
                letterSpacing: '0.12em', padding: '18px 18px 6px', fontFamily: 'var(--mono)',
              }}>
                <span style={{ fontSize: 9, display: 'inline-block', transition: 'transform .12s',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▾</span>
                {group.label}
              </div>
              {!isCollapsed && group.agents.map(agent => {
                const locked = !canViewAgent(agent.id);
                const isAgentActive = routerLoc.pathname === agent.path || routerLoc.pathname.startsWith(agent.path + '/');
                const isOpen = !locked && agent.subs && openAgent === agent.id;
                const row = (
                  <div
                    onClick={() => {
                      if (locked) return;
                      if (agent.subs) setOpenAgent(prev => (prev === agent.id && isAgentActive) ? null : agent.id);
                      if (!isAgentActive) navigate(agent.path);
                    }}
                    title={locked ? 'Access restricted' : undefined}
                    style={navStyle(isAgentActive, locked)}
                  >
                    <span style={{ fontSize: 16, fontFamily: 'var(--mono)', lineHeight: 1, opacity: locked ? 0.3 : 0.9,
                      color: 'var(--gold)', width: 18, textAlign: 'center', flexShrink: 0 }}>
                      {agent.icon}
                    </span>
                    <span style={{ flex: 1 }}>{agent.label}</span>
                    {locked && (
                      <span style={{ fontSize: 9, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>🔒</span>
                    )}
                    {!locked && agent.subs && (
                      <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'inline-block',
                        transition: 'transform .12s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                    )}
                  </div>
                );
                return (
                  <div key={agent.id}>
                    {row}
                    {isOpen && (
                      <div style={{ margin: '0 6px 4px 19px', borderLeft: '1px solid var(--border-2)', paddingBottom: 2 }}>
                        {agent.subs.map((sub, i) => sub.divider ? (
                          <div key={'d' + i} style={{ display: 'flex', alignItems: 'center', gap: 7,
                            padding: '11px 10px 3px 14px', fontSize: 10.5, fontWeight: 700,
                            letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)',
                            fontFamily: 'var(--mono)', cursor: 'default', userSelect: 'none' }}>
                            <span>{sub.divider}</span>
                            <span style={{ flex: 1, height: 1, background: 'var(--border-2)', minWidth: 8 }} />
                          </div>
                        ) : (() => {
                          const isSubActive = isAgentActive && (currentTab || agent.defaultTab) === sub.tab;
                          return (
                            <div key={sub.tab}
                              onClick={() => navigate(`${agent.path}/${sub.tab}`)}
                              style={{
                                padding: '4px 10px 4px 14px', fontSize: 11.5, cursor: 'pointer',
                                color: isSubActive ? 'var(--gold)' : 'var(--ink-3)',
                                fontWeight: isSubActive ? 600 : 400,
                                borderLeft: isSubActive ? '2px solid var(--gold)' : '2px solid transparent',
                                marginLeft: -1, letterSpacing: '0.01em',
                              }}
                              onMouseEnter={e => { if (!isSubActive) e.currentTarget.style.color = 'var(--ink)'; }}
                              onMouseLeave={e => { if (!isSubActive) e.currentTarget.style.color = 'var(--ink-3)'; }}
                            >
                              {sub.label}
                            </div>
                          );
                        })())}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {isManagerPlus() && (
          <>
            {sectionLabel('Admin')}
            <NavLink to="/dashboard" style={({ isActive }) => navStyle(isActive, false)}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>▣</span>
              Dashboard
            </NavLink>
            <NavLink to="/admin" style={({ isActive }) => navStyle(isActive, false)}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>⊞</span>
              Team & permissions
            </NavLink>
            <NavLink to="/settings" style={({ isActive }) => navStyle(isActive, false)}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>⊟</span>
              Settings
            </NavLink>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* Theme toggle */}
        <button onClick={toggle} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'var(--bg-3)',
          border: '1px solid var(--border-2)',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--sans)',
          letterSpacing: '0.01em',
        }}>
          <span>{isDark ? 'Dark' : 'Light'}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{isDark ? '◑' : '◐'}</span>
        </button>

        {/* User */}
        <div style={{ padding: '6px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.3 }}>
            {user?.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {user?.role}
          </div>
        </div>

        <button onClick={logout} style={{
          padding: '6px 10px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--ink-4)',
          fontFamily: 'var(--sans)',
          textAlign: 'left',
          transition: 'color 0.1s, border-color 0.1s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red-border)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-4)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
