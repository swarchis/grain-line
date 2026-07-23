import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { currency, swatchGradient } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { PhotoPanel } from '../components/decor.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import { ContextMenuTarget } from '../components/ContextMenu.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { toast } from '../lib/toast.js';

const COVER_TONES = ['gold', 'sage', 'clay', 'ink'];
const VIEWS = [
  { key: 'cards', label: 'Cards', icon: 'ph-squares-four' },
  { key: 'table', label: 'Table', icon: 'ph-table' },
];

export default function Collections() {
  const navigate = useNavigate();
  const { products, collections, createCollection, deleteCollection, loading } = useProducts();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', launchWindow: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sortBy, setSortBy] = useState('Name');
  const [view, setView] = useState('cards');

  const withCost = (collections || []).map(c => ({
    ...c,
    totalCost: products.filter(p => p.collection_id === c.id).reduce((s, p) => s + p.budget, 0),
    memberCount: products.filter(p => p.collection_id === c.id).length,
  }));
  const sorted = [...withCost].sort((a, b) => {
    if (sortBy === 'Name') return a.name.localeCompare(b.name);
    if (sortBy === 'Launch window') return (a.launch_window || '').localeCompare(b.launch_window || '');
    return b.totalCost - a.totalCost;
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createCollection({ name: form.name, launchWindow: form.launchWindow });
      setShowNew(false);
      setForm({ name: '', launchWindow: '' });
      toast.success('Collection created.');
    } catch (err) {
      toast.error("Failed to create collection: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-organization)' }}>Organization</div>
            <h1 className="page-title">Collections</h1>
          </div>
          <div className="page-sub">{collections?.length || 0} groupings · track timelines and budget per drop</div>
        </div>
        <div className="topbar-right">
          <select className="form-select" style={{ width: 160 }} value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort by">
            <option value="Name">Sort: Name</option>
            <option value="Launch window">Sort: Launch window</option>
            <option value="Total cost">Sort: Total cost</option>
          </select>
          <div className="pill-group">
            {VIEWS.map(v => (
              <button key={v.key} className={`pill ${view === v.key ? 'active' : ''}`} onClick={() => setView(v.key)} title={v.label}>
                <i className={`ph ${v.icon}`} style={{ marginRight: 6 }} /> {v.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
            <i className="ph ph-plus" /> New collection
          </button>
        </div>
      </div>

      <div className="content">
        {showNew && (
          <div className="card-raised enter" style={{ marginBottom: 28 }}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-organization)' }} />
            <div className="card-header"><span className="card-title">Create a new collection</span></div>
            <form className="card-body" onSubmit={handleCreate}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Collection Name</label>
                  <input className="form-input" placeholder="e.g. Spring/Summer '26" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Launch Window</label>
                  <input className="form-input" placeholder="e.g. Q2 2026" value={form.launchWindow} onChange={e => setForm({...form, launchWindow: e.target.value})} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Creating...' : 'Create Collection'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="grid-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (!collections || collections.length === 0) ? (
          <EmptyState
            icon="ph-stack"
            title="No collections yet"
            sub="Organize your products into seasonal drops to track budgets and launch readiness across multiple pieces."
            cta="Create your first collection"
            color="var(--c-organization)"
            onCta={() => setShowNew(true)}
          />
        ) : view === 'cards' ? (
          <div className="grid-2" data-tour="collections">
            {sorted.map((c, ci) => {
              const members = products.filter(p => p.collection_id === c.id);
              return (
                <ContextMenuTarget key={c.id} items={[{ label: 'Delete', icon: 'ph-trash', danger: true, onClick: () => setDeleteTarget(c) }]}>
                  <div className="card-raised card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(`/collections/${c.id}`)}>
                    <PhotoPanel variant="weave" tone={COVER_TONES[ci % COVER_TONES.length]} aspect="16 / 6" label={c.name} icon="ph-stack" style={{ borderRadius: 'var(--r) var(--r) 0 0', border: 'none', borderBottom: '1px solid var(--border)' }} />
                    <div className="corner-fold" style={{ '--fold-color': 'var(--c-organization)' }} />
                    <button
                      className="piece-move-btn"
                      title="Delete collection"
                      onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
                      style={{ color: 'var(--red)' }}
                    >
                      <i className="ph ph-trash" />
                    </button>
                    <div className="card-header">
                      <span className="card-title">{c.name}</span>
                      {c.timeline_conflict && <span className="tag tag-amber">Timeline conflict</span>}
                    </div>
                    <div className="card-body">
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div className="stat-label">Total cost</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 500 }}>{currency(c.totalCost)}</div>
                        </div>
                        <div>
                          <div className="stat-label">Launch window</div>
                          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{c.launch_window || '—'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: -6 }}>
                        {members.slice(0, 6).map((p, i) => (
                          <div key={p.id} className="swatch" style={{ width: 30, height: 30, marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg-1)', background: swatchGradient(p.id) }} />
                        ))}
                        {members.length > 6 && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink-3)', alignSelf: 'center' }}>+{members.length - 6}</span>}
                        {members.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>No products added yet</span>}
                      </div>
                    </div>
                  </div>
                </ContextMenuTarget>
              );
            })}
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Launch window</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Products</th>
                  <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Total cost</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.id} className="card-hover" style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }} onClick={() => navigate(`/collections/${c.id}`)}>
                    <td style={{ padding: '10px 20px', fontWeight: 700 }}>{c.name}</td>
                    <td style={{ padding: '10px 20px', color: 'var(--ink-3)' }}>{c.launch_window || '—'}</td>
                    <td style={{ padding: '10px 20px', color: 'var(--ink-3)' }}>{c.memberCount}</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{currency(c.totalCost)}</td>
                    <td style={{ padding: '10px 20px 10px 0', textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget(c); }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 15, opacity: 0.7 }}>
                        <i className="ph ph-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        itemLabel="collection"
        itemName={deleteTarget?.name || ''}
        warning="Products in it won't be deleted — they'll just be un-grouped from this collection."
        onConfirm={async () => { await deleteCollection(deleteTarget.id); }}
      />
    </>
  );
}