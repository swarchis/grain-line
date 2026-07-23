import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduction } from '../context/ProductionContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import GanttChart from '../components/GanttChart.jsx';
import { SkeletonRow } from '../components/Skeleton.jsx';
import { toast } from '../lib/toast.js';

const STAGE_TAG = {
  Sampling: 'tag-blue',
  'In production': 'tag-amber',
  Shipped: 'tag-accent',
  Delivered: 'tag-green'
};
const STAGE_COLOR = {
  Sampling: 'var(--blue)',
  'In production': 'var(--amber)',
  Shipped: 'var(--accent)',
  Delivered: 'var(--green)',
};
const STAGES_LIST = ['Sampling', 'In production', 'Shipped', 'Delivered'];

export default function ProductionOrders() {
  const navigate = useNavigate();
  const { orders, loading, createOrder } = useProduction();
  const { products } = useProducts();
  const { vendors } = useVendors();

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ productId: '', vendorId: '', units: '', dueDate: '', poNumber: '' });
  const [saving, setSaving] = useState(false);
  const [overrideGate, setOverrideGate] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'analytics' | 'gantt'

  // Check the Hard Gate readiness requirement — an explicit, opt-in override
  // lets a founder proceed anyway ("I'm sure"), so this isn't a true hard
  // block, just a deliberate extra step before shipping something under-ready.
  const selectedProductObj = products.find(p => p.id === form.productId);
  const belowThreshold = selectedProductObj && selectedProductObj.readiness < 80;
  const isBlocked = belowThreshold && !overrideGate;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (isBlocked) return;
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
      setOverrideGate(false);
      toast.success('Production order created.');
    } catch (err) {
      toast.error("Failed to create order: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const delivered = orders.filter(o => o.stage === 'Delivered');
  const onTimeCount = delivered.filter(o => o.delivered_at && o.due_date && new Date(o.delivered_at) <= new Date(o.due_date)).length;
  const onTimeRate = delivered.length ? Math.round((onTimeCount / delivered.length) * 100) : null;
  const avgDays = delivered.length
    ? Math.round(delivered.reduce((sum, o) => sum + (new Date(o.delivered_at) - new Date(o.created_at)) / 86400000, 0) / delivered.length)
    : null;
  const unitsInProgress = orders.filter(o => o.stage !== 'Delivered').reduce((sum, o) => sum + (o.units || 0), 0);

  // Only orders with both a created_at and a due_date can plot a real bar —
  // skipped rather than guessed for the (rare) order missing a due date.
  const ganttItems = orders
    .filter(o => o.created_at && o.due_date)
    .map(o => ({
      id: o.id,
      label: `${o.products?.name || 'Deleted product'} · ${o.po_number}`,
      start: new Date(o.created_at),
      end: new Date(o.due_date),
      color: STAGE_COLOR[o.stage],
      tag: o.stage,
    }));

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
                  <select className="form-select" value={form.productId} onChange={e => { setForm({...form, productId: e.target.value}); setOverrideGate(false); }} required>
                    <option value="">Select a product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.readiness}%)</option>)}
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
              
              <div style={{ marginTop: 8 }}>
                {belowThreshold && (
                  <div className="form-hint" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', marginBottom: 14 }}>
                    <i className="ph ph-lock-key" style={{ marginRight: 4 }} />
                    <strong>Hard Gate:</strong> {selectedProductObj.name} is only at {selectedProductObj.readiness}% factory readiness. A score of 80%+ is required to start production. Review its Tech Pack to clear the gate.
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontWeight: 500 }}>
                      <input type="checkbox" checked={overrideGate} onChange={e => setOverrideGate(e.target.checked)} />
                      I understand the risks and want to start production anyway
                    </label>
                  </div>
                )}
                <button className="btn btn-primary" type="submit" disabled={saving || isBlocked || !form.productId}>
                  {saving ? 'Creating...' : overrideGate && belowThreshold ? 'Create Order Anyway' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        )}

        {orders.length > 0 && (
          <div className="pill-group" style={{ marginBottom: 18 }}>
            <button className={`pill ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <i className="ph ph-list-dashes" style={{ marginRight: 6 }} /> List
            </button>
            <button className={`pill ${viewMode === 'analytics' ? 'active' : ''}`} onClick={() => setViewMode('analytics')}>
              <i className="ph ph-chart-bar" style={{ marginRight: 6 }} /> Analytics
            </button>
            <button className={`pill ${viewMode === 'gantt' ? 'active' : ''}`} onClick={() => setViewMode('gantt')}>
              <i className="ph ph-chart-bar-horizontal" style={{ marginRight: 6 }} /> Gantt
            </button>
          </div>
        )}

        {loading ? (
          <div className="card">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon="ph-package"
            title="No production orders"
            sub="Start your first production run by connecting a product to a vendor."
            cta="New Order"
            onCta={() => setShowNew(true)}
          />
        ) : viewMode === 'analytics' ? (
          <>
            <div className="stats-row" style={{ marginBottom: 18 }}>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Units in progress</div>
                <div className="stat-value">{unitsInProgress}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Avg. days to delivery</div>
                <div className="stat-value">{avgDays != null ? avgDays : '—'}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">On-time delivery rate</div>
                <div className="stat-value" style={{ color: onTimeRate != null && onTimeRate < 70 ? 'var(--amber)' : undefined }}>{onTimeRate != null ? `${onTimeRate}%` : '—'}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Delivered orders</div>
                <div className="stat-value">{delivered.length}</div>
              </div>
            </div>
            <div className="section-label">Orders by stage</div>
            <div className="card">
              {STAGES_LIST.map(stage => (
                <div className="list-row" key={stage}>
                  <span className={`tag ${STAGE_TAG[stage]}`}>{stage}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5 }}>{orders.filter(o => o.stage === stage).length}</span>
                </div>
              ))}
            </div>
          </>
        ) : viewMode === 'gantt' ? (
          ganttItems.length === 0 ? (
            <div className="card-raised" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              No orders have both a start and due date to plot yet.
            </div>
          ) : (
            <div className="card-raised" style={{ padding: 20 }}>
              <GanttChart items={ganttItems} />
              <div style={{ display: 'flex', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
                {STAGES_LIST.map(stage => (
                  <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: STAGE_COLOR[stage] }} />
                    {stage}
                  </div>
                ))}
              </div>
            </div>
          )
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