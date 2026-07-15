import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trustTagClass } from '../lib/format.js';
import { PhotoPanel } from '../components/decor.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import { useMaterials } from '../context/MaterialsContext.jsx';
import { ContextMenuTarget } from '../components/ContextMenu.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import HoverPreview from '../components/HoverPreview.jsx';

const SWATCH_TONES = ['clay', 'gold', 'sage', 'ink'];
const TYPES = ['All', 'Fabric', 'Trim', 'Notion'];
const AVAILABILITY_TAG = { 'In Stock': 'tag-green', 'Low Stock': 'tag-amber', Backordered: 'tag-red', Discontinued: 'tag-neutral', Unknown: 'tag-neutral' };
const EMPTY_FORM = { name: '', category: '', type: 'fabric', riskLevel: '', warning: '' };
const RISK_RANK = { red: 0, amber: 1, green: 2 };
const SORTS = {
  Name: (a, b) => a.name.localeCompare(b.name),
  Category: (a, b) => (a.category || '').localeCompare(b.category || ''),
  Risk: (a, b) => (RISK_RANK[a.risk_level] ?? 3) - (RISK_RANK[b.risk_level] ?? 3),
  Availability: (a, b) => (a.availability || 'Unknown').localeCompare(b.availability || 'Unknown'),
};
const VIEWS = [
  { key: 'cards', label: 'Cards', icon: 'ph-squares-four' },
  { key: 'table', label: 'Table', icon: 'ph-table' },
];

export default function MaterialLibrary() {
  const navigate = useNavigate();
  const { materials, loading, deleteMaterial, createMaterial } = useMaterials();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState('Name');
  const [view, setView] = useState('cards');

  const filtered = materials.filter(m =>
    (typeFilter === 'All' || (m.type || 'fabric').toLowerCase() === typeFilter.toLowerCase()) &&
    (m.name.toLowerCase().includes(search.toLowerCase()) || (m.category || '').toLowerCase().includes(search.toLowerCase()))
  ).sort(SORTS[sortBy]);

  const handleAdd = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createMaterial(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err) {
      alert('Could not add material: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Materials & Production</div>
            <h1 className="page-title">Material Library</h1>
          </div>
          <div className="page-sub">Shared risk, sustainability, and sourcing reference for apparel production</div>
        </div>
        <div className="topbar-right">
          <select className="form-select" style={{ width: 140 }} value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort by">
            {Object.keys(SORTS).map(s => <option key={s} value={s}>Sort: {s}</option>)}
          </select>
          <div className="pill-group">
            {VIEWS.map(v => (
              <button key={v.key} className={`pill ${view === v.key ? 'active' : ''}`} onClick={() => setView(v.key)} title={v.label}>
                <i className={`ph ${v.icon}`} style={{ marginRight: 6 }} /> {v.label}
              </button>
            ))}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input
              className="form-input"
              placeholder="Search materials..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
            <i className="ph ph-plus" /> Add material
          </button>
        </div>
      </div>

      <div className="content">
        {showAdd && (
          <form className="card-raised enter" style={{ marginBottom: 24 }} onSubmit={handleAdd}>
            <div className="card-header"><span className="card-title">Add a material</span></div>
            <div className="card-body">
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" placeholder="e.g. Organic Cotton Jersey" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input className="form-input" placeholder="e.g. Knit" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="fabric">Fabric</option>
                    <option value="trim">Trim</option>
                    <option value="notion">Notion</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Warning / thing to watch</label>
                <input className="form-input" placeholder="Optional — e.g. Shrinks up to 5% if not preshrunk" value={form.warning} onChange={e => setForm(f => ({ ...f, warning: e.target.value }))} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>{saving ? 'Adding…' : 'Add material'}</button>
            </div>
          </form>
        )}

        <div className="pill-group" style={{ marginBottom: 18 }}>
          {TYPES.map(t => (
            <button key={t} className={`pill ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="grid-cards">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="ph-flask" title="No materials found" sub="Try a different search term or filter." />
        ) : view === 'cards' ? (
          <div className="grid-cards" data-tour="material-library">
            {filtered.map((m, mi) => (
              <ContextMenuTarget key={m.id} items={[{ label: 'Delete', icon: 'ph-trash', danger: true, onClick: () => setDeleteTarget(m) }]}>
                <HoverPreview content={
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: (m.certifications || []).length ? 8 : 0 }}>
                      {m.sustainability_info || 'No sustainability notes on file.'}
                    </div>
                    {(m.certifications || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {m.certifications.map(c => <span key={c} className="tag tag-green" style={{ fontSize: 10 }}>{c}</span>)}
                      </div>
                    )}
                  </div>
                }>
                  <div className="card-raised card-hover" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/materials/${m.id}`)}>
                    <div className="corner-fold" style={{ '--fold-color': 'var(--c-materials)' }} />
                    <button
                      className="piece-move-btn"
                      title="Delete material"
                      onClick={e => { e.stopPropagation(); setDeleteTarget(m); }}
                      style={{ color: 'var(--red)' }}
                    >
                      <i className="ph ph-trash" />
                    </button>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      <PhotoPanel variant="weave" tone={SWATCH_TONES[mi % SWATCH_TONES.length]} aspect="1 / 1" style={{ width: 44, flexShrink: 0, borderRadius: 'var(--r-sm)' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{m.category}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span className={trustTagClass(m.risk_level)}>
                        {m.risk_level === 'green' ? 'Low risk' : m.risk_level === 'red' ? 'High risk' : 'Watch'}
                      </span>
                      <span className={`tag ${AVAILABILITY_TAG[m.availability] || 'tag-neutral'}`}>{m.availability || 'Unknown'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{m.warning}</div>
                  </div>
                </HoverPreview>
              </ContextMenuTarget>
            ))}
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Risk</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>Availability</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} className="card-hover" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }} onClick={() => navigate(`/materials/${m.id}`)}>
                    <td style={{ padding: '10px 20px', fontWeight: 700 }}>{m.name}</td>
                    <td style={{ padding: '10px 20px', color: 'var(--ink-3)' }}>{m.category || '—'}</td>
                    <td style={{ padding: '10px 20px' }}>
                      <span className={trustTagClass(m.risk_level)}>{m.risk_level === 'green' ? 'Low risk' : m.risk_level === 'red' ? 'High risk' : 'Watch'}</span>
                    </td>
                    <td style={{ padding: '10px 20px' }}>
                      <span className={`tag ${AVAILABILITY_TAG[m.availability] || 'tag-neutral'}`}>{m.availability || 'Unknown'}</span>
                    </td>
                    <td style={{ padding: '10px 20px 10px 0', textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget(m); }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 15, opacity: 0.7 }}>
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
        itemLabel="material"
        itemName={deleteTarget?.name || ''}
        warning="Any tech pack BOM lines referencing it by name will stop matching it, but won't be deleted themselves."
        onConfirm={async () => { await deleteMaterial(deleteTarget.id); }}
      />
    </>
  );
}
