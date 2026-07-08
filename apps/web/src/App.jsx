import Setup from './pages/Setup.jsx';
import Reports from './pages/Reports.jsx';
import StaffApp from './pages/StaffApp.jsx';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { auth, setToken, clearToken } from './lib/api.js';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import LoyaltyPortal from './pages/LoyaltyPortal.jsx';
import Onboarding from './pages/Onboarding.jsx';
import SuperAdmin from './pages/SuperAdmin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Settings from './pages/Settings.jsx';
import Agent1Marketing_Content from './pages/agents/Agent1Marketing_Content.jsx';
import Agent2Financial_KPI from './pages/agents/Agent2Financial_KPI.jsx';
import Agent3Inventory from './pages/agents/Agent3Inventory.jsx';
import Agent4Reviews from './pages/agents/Agent4Reviews.jsx';
import Agent5Cash_PL from './pages/agents/Agent5Cash_PL.jsx';
import Agent6Training_Compliance from './pages/agents/Agent6Training_Compliance.jsx';
import Agent9Labor_Scheduling       from './pages/agents/Agent9Labor_Scheduling.jsx';
import Agent10Training_Performance  from './pages/agents/Agent10Training_Performance.jsx';
import Assistant                from './pages/Assistant.jsx';
import Agent11Menu_Management        from './pages/agents/Agent11Menu_Management.jsx';
import Agent7Local_SEO_GBP from './pages/agents/Agent7Local_SEO_GBP.jsx';
import Agent8Loyalty_Referral from './pages/agents/Agent8Loyalty_Referral.jsx';

// ── Auth context ──────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

function AuthProvider({ children }) {
  const [user,     setUser]     = useState(auth.getUser);
  const [loading,  setLoading]  = useState(false);
  const [location, setLocation] = useState(null);

  const googleLogin = async (credential, tenantName) => {
    setLoading(true);
    try {
      const res = await auth.googleLogin(credential, tenantName);
      setToken(res.token);
      auth.setUser(res.user);
      setUser(res.user);
      return res;
    } finally { setLoading(false); }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await auth.login(email, password);
      setToken(res.token);
      auth.setUser(res.user);
      setUser(res.user);
      return res;
    } finally { setLoading(false); }
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setLocation(null);
    window.location.href = '/login';
  };

  // Helper: get this user's permission level for an agent
  const getAgentPermission = (agentId) => {
    if (!user) return 'none';
    if (user.role === 'owner') return 'edit'; // owners always have full edit
    if (user.role === 'manager') return 'edit'; // managers edit by default
    // Staff: check agent_permissions
    const perms = user.agentPermissions || {};
    return perms[agentId] || 'none';
  };

  const canViewAgent  = (agentId) => ['view','edit'].includes(getAgentPermission(agentId));
  const canEditAgent  = (agentId) => getAgentPermission(agentId) === 'edit';
  const isOwner       = () => user?.role === 'owner';
  const isManagerPlus = () => ['owner','manager'].includes(user?.role);

  return (
    <AuthContext.Provider value={{
      user, loading, login, googleLogin, logout, location, setLocation,
      getAgentPermission, canViewAgent, canEditAgent, isOwner, isManagerPlus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

// ── Agent guard — blocks access based on permissions ─────────────────────────
function AgentRoute({ agentId, children }) {
  const { canViewAgent, user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canViewAgent(agentId)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 48 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', marginBottom: 8 }}>Access restricted</h2>
          <p style={{ color: 'var(--ink3)', fontSize: 13 }}>You don't have permission to view this agent.<br/>Contact your administrator.</p>
        </div>
      </div>
    );
  }
  return children;
}


// ── Subscription banner ───────────────────────────────────────────────────────
function SubscriptionBanner() {
  const { user } = useAuth();
  const status = user?.subscriptionStatus;
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;
  if (!status || status === 'active' || status === 'trialing') return null;

  const messages = {
    trial:     { text: 'You\'re on a free trial. Add billing to keep access when it ends.', cta: 'Add billing', color: '#E8A020', bg: '#2A2010' },
    past_due:  { text: 'Your payment failed. Update your billing to avoid losing access.', cta: 'Fix billing', color: '#F26C6C', bg: '#2A1010' },
    canceled:  { text: 'Your subscription was canceled. Resubscribe to restore full access.', cta: 'Resubscribe', color: '#F26C6C', bg: '#2A1010' },
  };

  const msg = messages[status] || messages.trial;

  return (
    <div style={{ background: msg.bg, borderBottom: `1px solid ${msg.color}30`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: msg.color, fontSize: 16 }}>⚠</span>
        <span style={{ color: '#CCC' }}>{msg.text}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <a href="/onboarding/billing" style={{ padding: '5px 14px', background: msg.color, color: '#000', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>{msg.cta} →</a>
        <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main-content">
        <SubscriptionBanner />
        <Routes>
          <Route path="/"          element={<Assistant />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/admin"     element={<Admin />} />
          <Route path="/settings"  element={<Settings />} />
          <Route path="/marketing/:tab?" element={<AgentRoute agentId="agent_1_marketing"><Agent1Marketing_Content /></AgentRoute>} />
          <Route path="/financial/:tab?" element={<AgentRoute agentId="agent_2_financial"><Agent2Financial_KPI /></AgentRoute>} />
          <Route path="/inventory/:tab?" element={<AgentRoute agentId="agent_3_inventory"><Agent3Inventory /></AgentRoute>} />
          <Route path="/reviews"   element={<AgentRoute agentId="agent_4_reviews"><Agent4Reviews /></AgentRoute>} />
          <Route path="/cashpl/:tab?"    element={<AgentRoute agentId="agent_5_cashpl"><Agent5Cash_PL /></AgentRoute>} />
          <Route path="/training"  element={<AgentRoute agentId="agent_6_training"><Agent6Training_Compliance /></AgentRoute>} />
          <Route path="/seo"       element={<AgentRoute agentId="agent_7_seo"><Agent7Local_SEO_GBP /></AgentRoute>} />
          <Route path="/labor"          element={<AgentRoute agentId="agent_9_labor"><Agent9Labor_Scheduling /></AgentRoute>} />
          <Route path="/training-perf"  element={<AgentRoute agentId="agent_10_training"><Agent10Training_Performance /></AgentRoute>} />
          <Route path="/menu"           element={<AgentRoute agentId="agent_11_menu"><Agent11Menu_Management /></AgentRoute>} />
          <Route path="/assistant"      element={<Assistant />} />
          <Route path="/loyalty/:tab?"   element={<AgentRoute agentId="agent_8_loyalty"><Agent8Loyalty_Referral /></AgentRoute>} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/onboarding/success" element={<Onboarding />} />
          <Route path="/onboarding/billing" element={<Onboarding />} />
          <Route path="/member/:code" element={<LoyaltyPortal />} />
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/staff" element={<StaffApp />} />
          <Route path="/staff/*" element={<StaffApp />} />

          <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
