import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduction } from '../context/ProductionContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';

const STAGE_TAG = { 
  Sampling: 'tag-blue', 
  'In production': 'tag-amber', 
  Shipped: 'tag-accent', 
  Delivered: 'tag-green' 
};

export default function ProductionOrders() {
  const navigate = useNavigate();
  const { orders, loading, createOrder } = useProduction();
  const { products } = useProducts();
  const { vendors } = useVendors();

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ productId: '', vendorId: '', units: '', dueDate: '', poNumber: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createOrder({
        product_id: form.productId,
        vendor_id: form.vendorId,
        units: parseInt(form.units),
        due_date: form.dueDate,
        po_number: form.poNumber || `PO-${Date.now().toString().slice(-6)}`
      });
      setShowNew(false);
      setForm({ productId: '', vendorId: '', units: '', dueDate: '', poNumber: '' });
    } catch (err) {
      alert("Failed to create order: " + err.message);
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
            <h1 className="page-title">Production Orders</h1>
          </div>
          <div className="page-sub">{orders.length} active production jobs</div>
        </div>
        <div className="topbar-right">
          <button data-tour="production-orders" className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
            <i className="ph ph-plus" /> New Order
          </button>
        </div>
      </div>

      <div className="content">
        {showNew && (
          <div className="card-raised enter" style={{ marginBottom: 28 }}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-materials)' }} />
            <div className="card-header"><span className="card-title">Initiate New Production Order</span></div>
            <form className="card-body" onSubmit={handleCreate}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Product</label>
                  <select className="form-select" value={form.productId} onChange={e => setForm({...form, productId: e.target.value})} required>
                    <option value="">Select a product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor</label>
                  <select className="form-select" value={form.vendorId} onChange={e => setForm({...form, vendorId: e.target.value})} required>
                    <option value="">Select a manufacturer</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Units</label>
                  <input className="form-input" type="number" placeholder="e.g. 300" value={form.units} onChange={e => setForm({...form, units: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input className="form-input" type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">PO Number (Optional)</label>
                  <input className="form-input" placeholder="Auto-generated if blank" value={form.poNumber} onChange={e => setForm({...form, poNumber: e.target.value})} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Order'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><i className="ph ph-spinner ph-spin" /> Loading orders...</div>
        ) : orders.length === 0 ? (
          <EmptyState 
            icon="ph-package" 
            title="No production orders" 
            sub="Start your first production run by connecting a product to a vendor."
            cta="New Order"
            onCta={() => setShowNew(true)}
          />
        ) : (
          <div className="card">
            {orders.map(o => (
              <div className="list-row" key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/production/${o.id}`)}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{o.products?.name || 'Deleted Product'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{o.vendors?.name || 'Unknown Vendor'} · {o.po_number}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{o.units || '—'} units</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>Due {o.due_date}</span>
                  <span className={`tag ${STAGE_TAG[o.stage]}`}>{o.stage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}