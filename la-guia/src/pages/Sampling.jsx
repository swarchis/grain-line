import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSampling } from '../context/SamplingContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { toast } from '../lib/toast.js';

const TECHPACK_STAGES = ['techpack', 'sourcing', 'sampling', 'production', 'launched'];
const STATUS_TAG = {
  Requested: 'tag-neutral', 'In Production': 'tag-amber', Shipped: 'tag-blue', Received: 'tag-blue',
  'Under Review': 'tag-amber', 'Revision Requested': 'tag-red', Approved: 'tag-green', Rejected: 'tag-red',
};

export default function Sampling() {
  const navigate = useNavigate();
  const { samples, loading, loadError, createSampleRequest } = useSampling();
  const { products } = useProducts();
  const { vendors } = useVendors();

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ productId: '', vendorId: '', requestNotes: '', expectedDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const techPackProducts = products.filter(p => TECHPACK_STAGES.includes(p.stage));

  // One row per product — its most recent round represents where sampling
  // currently stands, but the round count/link takes you to the full history.
  const byProduct = new Map();
  samples.forEach(s => {
    const existing = byProduct.get(s.product_id);
    if (!existing || new Date(s.created_at) > new Date(existing.created_at)) byProduct.set(s.product_id, s);
  });
  const rows = Array.from(byProduct.values()).map(latest => ({
    latest,
    roundCount: samples.filter(s => s.product_id === latest.product_id).length,
  })).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));

  const handleCreate = async e => {
    e.preventDefault();
    if (!form.productId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createSampleRequest(form);
      toast.success('Sample requested.');
      setShowNew(false);
      setForm({ productId: '', vendorId: '', requestNotes: '', expectedDate: '' });
      navigate(`/sampling/${created.product_id}`);
    } catch (err) {
      setError(err.message || 'Could not request that sample.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-finalcheck)' }}>Production</div>
            <h1 className="page-title">Sampling</h1>
          </div>
          <div className="page-sub">Sample requests, rounds, fit feedback, and approvals — per product</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => setShowNew(s => !s)}>
            <i className="ph ph-plus" /> Request sample
          </button>
        </div>
      </div>

      <div className="content">
        {showNew && (
          <form className="card-raised enter" style={{ marginBottom: 24 }} onSubmit={handleCreate}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-finalcheck)' }} />
            <div className="card-header"><span className="card-title">Request a sample</span></div>
            <div className="card-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Product</label>
                  <select className="form-select" value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} required>
                    <option value="" disabled>Choose a product</option>
                    {techPackProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {techPackProducts.length === 0 && <div className="form-hint">No products have a tech pack yet — convert a design first.</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor (optional)</label>
                  <select className="form-select" value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                    <option value="">Not chosen yet</option>
                    {vendors.filter(v => !v.blocked).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Expected date</label>
                <input className="form-input" type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">What are you asking for</label>
                <textarea className="form-textarea" placeholder="e.g. First fit sample in size M, standard colorway" value={form.requestNotes} onChange={e => setForm(f => ({ ...f, requestNotes: e.target.value }))} />
              </div>
              {error && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={saving || !form.productId}>
                {saving ? 'Requesting…' : 'Request sample'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch ph-spin" /> Loading…</div>
        ) : loadError ? (
          <EmptyState icon="ph-warning" color="var(--red)" title="Couldn't load samples" sub={loadError} />
        ) : rows.length === 0 ? (
          <EmptyState icon="ph-t-shirt" color="var(--c-finalcheck)" title="No samples yet" sub="Request your first sample once a product has a tech pack." cta="Request sample" onCta={() => setShowNew(true)} />
        ) : (
          <div className="card">
            {rows.map(({ latest, roundCount }) => (
              <div className="list-row" key={latest.product_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/sampling/${latest.product_id}`)}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{latest.products?.name || 'Unknown product'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    {latest.vendors?.name || 'No vendor chosen'} · round {latest.round_number} of {roundCount}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className={`tag ${STATUS_TAG[latest.status] || 'tag-neutral'}`}>{latest.status}</span>
                  <i className="ph ph-caret-right" style={{ color: 'var(--ink-4)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
