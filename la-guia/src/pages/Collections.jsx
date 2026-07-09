import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { currency, swatchGradient } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { PhotoPanel } from '../components/decor.jsx';
import EmptyState from '../components/EmptyState.jsx';

const COVER_TONES = ['gold', 'sage', 'clay', 'ink'];

export default function Collections() {
  const navigate = useNavigate();
  const { products, collections, createCollection } = useProducts();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', launchWindow: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createCollection({ name: form.name, launchWindow: form.launchWindow });
      setShowNew(false);
      setForm({ name: '', launchWindow: '' });
    } catch (err) {
      alert("Failed to create collection: " + err.message);
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

        {(!collections || collections.length === 0) ? (
          <EmptyState 
            icon="ph-stack" 
            title="No collections yet" 
            sub="Organize your products into seasonal drops to track budgets and launch readiness across multiple pieces."
            cta="Create your first collection"
            color="var(--c-organization)"
            onCta={() => setShowNew(true)}
          />
        ) : (
          <div className="grid-2">
            {collections.map((c, ci) => {
              const members = products.filter(p => p.collection_id === c.id);
              const totalCost = members.reduce((s, p) => s + p.budget, 0);
              return (
                <div className="card-raised card-hover" key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/collections/${c.id}`)}>
                  <PhotoPanel variant="weave" tone={COVER_TONES[ci % COVER_TONES.length]} aspect="16 / 6" label={c.name} icon="ph-stack" style={{ borderRadius: 'var(--r) var(--r) 0 0', border: 'none', borderBottom: '1px solid var(--border)' }} />
                  <div className="corner-fold" style={{ '--fold-color': 'var(--c-organization)' }} />
                  <div className="card-header">
                    <span className="card-title">{c.name}</span>
                    {c.timeline_conflict && <span className="tag tag-amber">Timeline conflict</span>}
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      <div>
                        <div className="stat-label">Total cost</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 500 }}>{currency(totalCost)}</div>
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
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}