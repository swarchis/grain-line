import React, { useState, useEffect } from 'react';
import { useAuth } from '../App.jsx';
import { admin as adminApi, locations as locationsApi } from '../lib/api.js';
import { AGENT_META } from '@restaurantos/shared';

// ── Permission matrix constants ───────────────────────────────────────────────
const ROLES = [
  { key: 'owner',   label: 'Owner',   color: 'var(--gold)',  desc: 'Full access to everything' },
  { key: 'manager', label: 'Manager', color: 'var(--blue)',  desc: 'Can edit data, manage staff' },
  { key: 'staff',   label: 'Staff',   color: 'var(--green)', desc: 'View only by default' },
];

const PERM_LEVELS = [
  { key: 'none',  label: 'No access', color: 'var(--ink4)' },
  { key: 'view',  label: 'View only', color: 'var(--blue)' },
  { key: 'edit',  label: 'Full edit', color: 'var(--green)' },
];

// ── Permission cell ───────────────────────────────────────────────────────────
function PermCell({ agentId, userId, value, onChange, disabled }) {
  const current = PERM_LEVELS.find(p => p.key === (value || 'none')) || PERM_LEVELS[0];
  return (
    <select
      value={value || 'none'}
      onChange={e => onChange(agentId, e.target.value)}
      disabled={disabled}
      style={{
        fontSize: 11, padding: '3px 6px', borderRadius: 4,
        border: '1px solid var(--border)', background: 'var(--bg)',
        color: current.color, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
    >
      {PERM_LEVELS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}

// ── User row ─────────────────────────────────────────────────────────────────
function UserRow({ user, locs, agents, onSave, onDeactivate, currentUserId, currentRole }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({
    name:              user.name,
    role:              user.role,
    active:            user.active,
    location_ids:      user.location_ids || [],
    agent_permissions: user.agent_permissions || {},
    password:          '',
  });
  const [saving, setSaving] = useState(false);

  const setPermission = (agentId, level) => {
    setForm(f => ({ ...f, agent_permissions: { ...f.agent_permissions, [agentId]: level } }));
  };

  const toggleLocation = (locId) => {
    setForm(f => ({
      ...f,
      location_ids: f.location_ids.includes(locId)
        ? f.location_ids.filter(id => id !== locId)
        : [...f.location_ids, locId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name, role: form.role, active: form.active,
        location_ids: form.location_ids,
        agent_permissions: form.agent_permissions,
      };
      if (form.password) payload.password = form.password;
      await onSave(user.id, payload);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const isOwner  = user.role === 'owner';
  const isSelf   = user.id === currentUserId;
  const canEdit  = currentRole === 'owner' || (!isOwner && !isSelf);
  const roleInfo = ROLES.find(r => r.key === user.role);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 10, overflow: 'hidden' }}>
      {/* User header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--card)' }}>
        {/* Avatar */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: roleInfo?.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: roleInfo?.color, flexShrink: 0 }}>
          {user.name?.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{user.name} {isSelf && <span style={{ fontSize: 10, color: 'var(--ink3)' }}>(you)</span>}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{user.email}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: roleInfo?.color + '18', color: roleInfo?.color }}>
          {roleInfo?.label}
        </span>
        {!user.active && <span className="tag tag-red">Deactivated</span>}
        <div style={{ fontSize: 10, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
          {user.last_login_at ? `Last: ${new Date(user.last_login_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : 'Never logged in'}
        </div>
        {canEdit && (
          <button className="btn btn-sm" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={{ padding: '16px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 12 }}/>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} disabled={isOwner || currentRole !== 'owner'}>
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Reset password (optional)</label>
              <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Leave blank to keep current" style={{ fontSize: 12 }}/>
            </div>
          </div>

          {/* Location access */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
              Location access {form.role === 'owner' && <span style={{ fontWeight: 400, textTransform: 'none' }}>(owners access all locations)</span>}
            </div>
            {form.role === 'owner' ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>All {locs.length} locations</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {locs.map(loc => (
                  <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${form.location_ids.includes(loc.id) ? 'var(--gold-border)' : 'var(--border)'}`, background: form.location_ids.includes(loc.id) ? 'var(--gold-bg)' : 'var(--card)', cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={form.location_ids.includes(loc.id)} onChange={() => toggleLocation(loc.id)} style={{ marginRight: 2 }}/>
                    {loc.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Agent permissions matrix */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
              Agent permissions {form.role === 'owner' && <span style={{ fontWeight: 400, textTransform: 'none' }}>(owners have full edit on all agents)</span>}
            </div>
            {form.role === 'owner' ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>Full edit access to all agents</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {agents.map(([id, meta]) => (
                  <div key={id} style={{ background: 'var(--card)', borderRadius: 'var(--r-sm)', padding: '8px 10px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{meta.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink2)' }}>{meta.name}</span>
                    </div>
                    <PermCell
                      agentId={id}
                      userId={user.id}
                      value={form.agent_permissions[id]}
                      onChange={setPermission}
                      disabled={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save / deactivate */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 120 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {!isSelf && !isOwner && user.active && currentRole === 'owner' && (
              <button className="btn btn-danger btn-sm" onClick={() => onDeactivate(user.id)}>
                Deactivate user
              </button>
            )}
            {!isSelf && !isOwner && !user.active && currentRole === 'owner' && (
              <button className="btn btn-sm" onClick={() => onSave(user.id, { active: true })}>
                Reactivate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────────
function InviteModal({ locs, agents, onClose, onInvited }) {
  const [form, setForm] = useState({
    name: '', email: '', role: 'staff', password: '',
    location_ids: [], agent_permissions: {},
  });
  const [saving, setSaving]   = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const setPermission = (agentId, level) => setForm(f => ({ ...f, agent_permissions: { ...f.agent_permissions, [agentId]: level } }));
  const toggleLocation = (locId) => setForm(f => ({ ...f, location_ids: f.location_ids.includes(locId) ? f.location_ids.filter(id=>id!==locId) : [...f.location_ids, locId] }));

  const handleInvite = async () => {
    if (!form.name || !form.email) return setError('Name and email required');
    if (!form.password || form.password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true); setError('');
    try {
      const data = await adminApi.createUser(form);
      setResult(data);
      onInvited();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,21,16,.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, paddingTop: 48, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card-raised)', borderRadius: 'var(--r-lg)', width: 640, maxWidth: '95vw', boxShadow: 'var(--shadow-lg)', margin: '0 16px 48px', border: '1px solid var(--border)' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontStyle: 'italic' }}>+ Add team member</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink3)' }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', maxHeight: '75vh', overflowY: 'auto' }}>
          {result ? (
            <div>
              <div className="alert alert-green" style={{ marginBottom: 16 }}>
                <span>✓</span>
                <div>
                  <strong>{result.name}</strong> has been added. Share these credentials:
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    Email: {result.email}<br/>
                    Password: {result.tempPassword}
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Chef Tathagat"/>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="chef@fitoor.com"/>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    {ROLES.filter(r => r.key !== 'owner').map(r => <option key={r.key} value={r.key}>{r.label} — {r.desc}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Initial password</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder="Min 8 characters"/>
                </div>
              </div>

              {/* Location access */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>Location access</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {locs.map(loc => (
                    <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${form.location_ids.includes(loc.id)?'var(--gold-border)':'var(--border)'}`, background: form.location_ids.includes(loc.id)?'var(--gold-bg)':'var(--card)', cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={form.location_ids.includes(loc.id)} onChange={()=>toggleLocation(loc.id)} style={{ marginRight: 2 }}/>
                      {loc.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Agent permissions */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>Agent permissions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {agents.map(([id, meta]) => (
                    <div key={id} style={{ background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: '8px 10px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{meta.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink2)' }}>{meta.name}</span>
                      </div>
                      <PermCell agentId={id} userId="new" value={form.agent_permissions[id]} onChange={setPermission} disabled={false}/>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠</span>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleInvite} disabled={saving}>
                {saving ? 'Creating…' : 'Add team member'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers]       = useState([]);
  const [locs, setLocs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [toast, setToast]       = useState(null);
  const [activeTab, setActiveTab] = useState('users');

  const agents = Object.entries(AGENT_META);
  const showToast = (msg, err = false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3000); };

  const load = async () => {
    setLoading(true);
    try {
      const [usersData, locsData] = await Promise.all([adminApi.users(), locationsApi.list()]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setLocs(Array.isArray(locsData) ? locsData : []);
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (userId, data) => {
    try {
      await adminApi.updateUser(userId, data);
      showToast('User updated');
      await load();
    } catch(e) { showToast(e.message, true); }
  };

  const handleDeactivate = async (userId) => {
    if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
    try {
      await adminApi.deleteUser(userId);
      showToast('User deactivated');
      await load();
    } catch(e) { showToast(e.message, true); }
  };

  // Import locationsApi for use in this component
  const { locations: locationsApi } = { locations: { list: () => import('../lib/api.js').then(m => m.locations.list()) } };

  const tabs = [
    { key: 'users',  label: 'Team members' },
    { key: 'roles',  label: 'Role reference' },
  ];

  const activeCount  = users.filter(u => u.active).length;
  const ownerCount   = users.filter(u => u.role === 'owner').length;
  const managerCount = users.filter(u => u.role === 'manager').length;
  const staffCount   = users.filter(u => u.role === 'staff').length;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Administration</h1>
          <div className="page-sub">{activeCount} active members · {ownerCount} owners · {managerCount} managers · {staffCount} staff</div>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={load}>↻ Refresh</button>
          {user?.role === 'owner' && (
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Add team member</button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        {tabs.map(t => <button key={t.key} className={`tab-item${activeTab===t.key?' active':''}`} onClick={()=>setActiveTab(t.key)}>{t.label}</button>)}
      </div>

      <div className="content">
        {/* ── TEAM MEMBERS ── */}
        {activeTab === 'users' && (
          <>
            {loading ? <div className="spinner"/> : (
              <>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Total members', val: users.length, color: 'var(--ink)' },
                    { label: 'Owners', val: ownerCount, color: 'var(--gold)' },
                    { label: 'Managers', val: managerCount, color: 'var(--blue)' },
                    { label: 'Staff', val: staffCount, color: 'var(--green)' },
                  ].map((s,i) => (
                    <div key={i} className="stat-card">
                      <div className="stat-label">{s.label}</div>
                      <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {users.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <div className="empty-state-title">No team members yet</div>
                    <div className="empty-state-sub" style={{ marginBottom: 16 }}>Add managers and staff to give them access to the platform</div>
                    <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Add first team member</button>
                  </div>
                ) : (
                  users.map(u => (
                    <UserRow
                      key={u.id}
                      user={u}
                      locs={locs}
                      agents={agents}
                      onSave={handleSave}
                      onDeactivate={handleDeactivate}
                      currentUserId={user?.id}
                      currentRole={user?.role}
                    />
                  ))
                )}
              </>
            )}
          </>
        )}

        {/* ── ROLE REFERENCE ── */}
        {activeTab === 'roles' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {ROLES.map(role => (
              <div key={role.key} className="card-raised">
                <div className="card-header" style={{ borderLeft: `3px solid ${role.color}` }}>
                  <span className="card-title" style={{ color: role.color }}>{role.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{role.desc}</span>
                </div>
                <div className="card-body">
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      {[
                        ['View all agents', role.key !== 'staff' ? '✓' : 'Per permission'],
                        ['Edit financial data', role.key === 'owner' ? '✓' : role.key === 'manager' ? '✓' : 'Per permission'],
                        ['Generate AI content', role.key !== 'staff' ? '✓' : 'Per permission'],
                        ['Manage team', role.key === 'owner' ? '✓' : role.key === 'manager' ? 'Staff only' : '✗'],
                        ['Settings & billing', role.key === 'owner' ? '✓' : '✗'],
                        ['All locations', role.key === 'owner' ? '✓' : 'Assigned only'],
                        ['Invite users', role.key === 'owner' ? '✓' : '✗'],
                      ].map(([label, val]) => (
                        <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 0', color: 'var(--ink3)' }}>{label}</td>
                          <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 500, color: val === '✓' ? 'var(--green)' : val === '✗' ? 'var(--red)' : 'var(--amber)' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          locs={locs}
          agents={agents}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}

      {toast && <div className="toast" style={{ background: toast.err ? 'var(--red)' : 'var(--ink)' }}>{toast.err ? '⚠' : '✓'} {toast.msg}</div>}
    </>
  );
}
