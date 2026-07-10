import React, { useState, useEffect } from 'react';
import TabBar from '../components/TabBar.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUserPreferences } from '../context/UserPreferencesContext.jsx';
import { useTeam } from '../context/TeamContext.jsx';
import { useTheme } from '../lib/useTheme.js';
import BillingTab from '../components/BillingTab.jsx';
import { getPlan } from '../data/plans.js';

const TABS = [
  { key: 'profile', label: 'Profile', icon: 'ph-user-circle' },
  { key: 'brand', label: 'Brand Details', icon: 'ph-storefront' },
  { key: 'team', label: 'Team', icon: 'ph-users-three' },
  { key: 'billing', label: 'Billing & Plan', icon: 'ph-credit-card' },
  { key: 'preferences', label: 'Preferences', icon: 'ph-sliders' },
  { key: 'notifications', label: 'Notifications', icon: 'ph-bell' },
  { key: 'risk', label: 'Risk Tolerance', icon: 'ph-gauge' },
];

const RISK_LEVELS = ['Conservative', 'Balanced', 'Aggressive'];
const ROLES = ['admin', 'editor', 'viewer'];

function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative',
        background: on ? 'var(--accent)' : 'var(--bg-3)', transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
      }} />
    </button>
  );
}

function TeamTab() {
  const { members, loading, myRole, canManage, inviteMember, updateMemberRole, removeMember } = useTeam();
  const { activeBrand } = useProducts();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);

  const plan = getPlan(activeBrand?.plan_tier || 'free');
  const seatsUsed = members.length + 1; // + you
  const atSeatLimit = seatsUsed >= plan.limits.teamMembers;

  const handleInvite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    setError(null);
    try {
      await inviteMember(trimmed, role);
      setEmail('');
    } catch (err) {
      setError(err.message.includes('duplicate') ? 'That email is already invited to this brand.' : err.message);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {canManage && (
        <div className="card-raised" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Invite a teammate</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{seatsUsed} / {plan.limits.teamMembers} seats used</span>
          </div>
          <div className="card-body">
            {atSeatLimit ? (
              <div className="form-hint" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)' }}>
                <i className="ph ph-warning" style={{ marginRight: 4 }} /> You're at your {plan.name} plan's limit of {plan.limits.teamMembers} team member{plan.limits.teamMembers === 1 ? '' : 's'} — upgrade in the Billing tab to invite more.
              </div>
            ) : (
              <>
                <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" placeholder="teammate@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                    <label className="form-label">Role</label>
                    <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={inviting}>
                    {inviting ? 'Inviting…' : 'Invite'}
                  </button>
                </form>
                {error && <div className="form-hint" style={{ color: 'var(--red)', marginTop: 8 }}>{error}</div>}
                <div className="form-hint" style={{ marginTop: 10 }}>
                  This creates a real pending invite — as soon as that person signs up or logs in with this email, they're added automatically. There's no email notification sent yet, so let them know yourself.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="section-label">Members</div>
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch ph-spin" /></div>
      ) : (
        <div className="card">
          <div className="list-row">
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>You</span>
            <span className="tag tag-accent" style={{ textTransform: 'capitalize' }}>{myRole}</span>
          </div>
          {members.map(m => (
            <div className="list-row" key={m.id}>
              <div>
                <div style={{ fontSize: 13.5 }}>{m.invited_email}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{m.status === 'active' ? 'Active' : 'Invite pending'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {canManage ? (
                  <select className="form-select" style={{ padding: '6px 26px 6px 10px', fontSize: 12.5 }} value={m.role} onChange={e => updateMemberRole(m.id, e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                  </select>
                ) : (
                  <span className="tag tag-neutral" style={{ textTransform: 'capitalize' }}>{m.role}</span>
                )}
                {canManage && (
                  <button className="btn btn-sm" onClick={() => window.confirm(`Remove ${m.invited_email}?`) && removeMember(m.id)} title="Remove">
                    <i className="ph ph-x" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {members.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 13 }}>No teammates yet.</div>}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const { activeBrand, updateBrand } = useProducts();
  const { user } = useAuth();
  const { preferences, updatePreferences } = useUserPreferences();
  const { isDark, setTheme } = useTheme();

  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [form, setForm] = useState({
    name: '',
    target_customer: '',
    quality_tier: 'Premium contemporary',
    budget_philosophy: '',
    sustainability: '',
    manufacturer_preferences: '',
    global_risk: 'Balanced',
    notification_settings: {
      readiness: true,
      quotes: true,
      materials: true,
      timeline: true
    }
  });

  useEffect(() => {
    if (activeBrand) {
      setForm({
        name: activeBrand.name || '',
        target_customer: activeBrand.target_customer || '',
        quality_tier: activeBrand.quality_tier || 'Premium contemporary',
        budget_philosophy: activeBrand.budget_philosophy || '',
        sustainability: activeBrand.sustainability || '',
        manufacturer_preferences: activeBrand.manufacturer_preferences || '',
        global_risk: activeBrand.global_risk || 'Balanced',
        notification_settings: activeBrand.notification_settings || {
          readiness: true, quotes: true, materials: true, timeline: true
        }
      });
    }
  }, [activeBrand]);

  useEffect(() => { setFullName(preferences.full_name || ''); }, [preferences.full_name]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleNotification = (key) => {
    const nextSettings = { ...form.notification_settings, [key]: !form.notification_settings[key] };
    f('notification_settings', nextSettings);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBrand(form);
      alert("✓ Brand settings successfully updated.");
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    setSavingName(true);
    try {
      await updatePreferences({ full_name: fullName.trim() || null });
    } finally {
      setSavingName(false);
    }
  };

  if (!activeBrand) return (
    <div className="content" style={{ textAlign: 'center', padding: 40 }}>
      <i className="ph ph-spinner ph-spin" style={{ fontSize: 24 }} />
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-settings)' }}>Profile & Settings</div>
            <h1 className="page-title">Settings</h1>
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-settings)" dataTour="settings-tabs" />

      <div className="content">
        {tab === 'profile' && (
          <div className="card-raised" style={{ maxWidth: 520 }}>
            <div className="card-header"><span className="card-title">Account summary</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Display name</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" placeholder="Add your name" value={fullName} onChange={e => setFullName(e.target.value)} />
                  <button className="btn btn-sm" onClick={saveName} disabled={savingName || fullName === (preferences.full_name || '')}>
                    {savingName ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <div className="form-hint">Shown in the sidebar and greeting instead of your email.</div>
              </div>
              <div className="list-row" style={{ padding: '10px 0' }}><span>Email</span><strong>{user?.email}</strong></div>
              <div className="list-row" style={{ padding: '10px 0' }}><span>Role</span><strong style={{ textTransform: 'capitalize' }}>{activeBrand.memberRole || 'Owner'}</strong></div>
              <div className="list-row" style={{ padding: '10px 0' }}><span>Member since</span><strong>{new Date(user?.created_at || Date.now()).toLocaleDateString()}</strong></div>
              <div className="list-row" style={{ padding: '10px 0' }}><span>Active brand</span><strong>{activeBrand.name}</strong></div>
            </div>
          </div>
        )}

        {tab === 'brand' && (
          <div className="grid-2">
            <div className="card-raised">
              <div className="card-header"><span className="card-title">Identity</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Brand name</label>
                  <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Target customer</label>
                  <textarea className="form-textarea" value={form.target_customer} onChange={e => f('target_customer', e.target.value)} placeholder="e.g. Gen Z streetwear enthusiasts looking for heavyweight basics." />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Quality tier</label>
                  <select className="form-select" value={form.quality_tier} onChange={e => f('quality_tier', e.target.value)}>
                    <option value="Value / accessible">Value / accessible</option>
                    <option value="Premium contemporary">Premium contemporary</option>
                    <option value="Luxury / made-to-order">Luxury / made-to-order</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="card-raised">
              <div className="card-header"><span className="card-title">Production philosophy</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Budget philosophy</label>
                  <textarea className="form-textarea" value={form.budget_philosophy} onChange={e => f('budget_philosophy', e.target.value)} placeholder="e.g. Willing to pay more for higher MOQ if quality is unmatched." />
                </div>
                <div className="form-group">
                  <label className="form-label">Sustainability preferences</label>
                  <input className="form-input" value={form.sustainability} onChange={e => f('sustainability', e.target.value)} placeholder="e.g. Requires GOTS certified cotton." />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Manufacturer preferences</label>
                  <input className="form-input" value={form.manufacturer_preferences} onChange={e => f('manufacturer_preferences', e.target.value)} placeholder="e.g. Strong preference for Portugal or Italy." />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'team' && <TeamTab />}

        {tab === 'billing' && <BillingTab />}

        {tab === 'preferences' && (
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="list-row">
              <div>
                <div style={{ fontSize: 13.5 }}>Dark mode</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Syncs across your devices</div>
              </div>
              <Toggle on={isDark} onToggle={() => setTheme(isDark ? 'light' : 'dark')} />
            </div>
            <div className="list-row">
              <div>
                <div style={{ fontSize: 13.5 }}>Keyboard shortcut hints</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Show shortcut keys in tooltips around the app</div>
              </div>
              <Toggle on={preferences.show_shortcut_hints} onToggle={() => updatePreferences({ show_shortcut_hints: !preferences.show_shortcut_hints })} />
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="list-row">
              <span style={{ fontSize: 13.5 }}>Readiness score changes</span>
              <Toggle on={form.notification_settings.readiness} onToggle={() => toggleNotification('readiness')} />
            </div>
            <div className="list-row">
              <span style={{ fontSize: 13.5 }}>Vendor quote received</span>
              <Toggle on={form.notification_settings.quotes} onToggle={() => toggleNotification('quotes')} />
            </div>
            <div className="list-row">
              <span style={{ fontSize: 13.5 }}>Material price alerts</span>
              <Toggle on={form.notification_settings.materials} onToggle={() => toggleNotification('materials')} />
            </div>
            <div className="list-row">
              <span style={{ fontSize: 13.5 }}>Timeline conflicts</span>
              <Toggle on={form.notification_settings.timeline} onToggle={() => toggleNotification('timeline')} />
            </div>
          </div>
        )}

        {tab === 'risk' && (
          <div className="card-raised" style={{ maxWidth: 560 }}>
            <div className="card-header"><span className="card-title">Global risk setting</span></div>
            <div className="card-body">
              <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.7 }}>
                Applied as the default to every new product workspace. Editing a specific product's risk setting
                overrides it locally — it never changes this default or any other product.
              </p>
              <div className="pill-group">
                {RISK_LEVELS.map(level => (
                  <button
                    key={level}
                    className={`pill ${form.global_risk === level ? 'active' : ''}`}
                    data-risk={level}
                    onClick={() => f('global_risk', level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
