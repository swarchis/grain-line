import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduction } from '../context/ProductionContext.jsx';
import { currency } from '../lib/format.js';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { toast } from '../lib/toast.js';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'quality', label: 'Quality & Issues', icon: 'ph-check-circle' },
  { key: 'shipment', label: 'Shipment & Inventory', icon: 'ph-truck' },
  { key: 'payments', label: 'Payments', icon: 'ph-currency-dollar' }, // NEW
];

const SEVERITY_TAG = { Low: 'tag-neutral', Medium: 'tag-amber', High: 'tag-red', Critical: 'tag-red' };

export default function ProductionOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    orders, loading, updateOrder, updateOrderStage,
    issuesByOrder, loadIssues, addIssue, toggleIssueResolved,
    updatesByOrder, loadUpdates, addUpdate,
    paymentsByOrder, loadPayments, addPayment, deletePayment // NEW
  } = useProduction();
  const [updating, setUpdating] = useState(false);
  const [tab, setTab] = useState('overview');

  const order = orders.find(o => String(o.id) === id);
  const issues = issuesByOrder[id] || [];
  const updates = updatesByOrder[id] || [];
  const payments = paymentsByOrder[id] || [];

  const [newCheckpointLabel, setNewCheckpointLabel] = useState('');
  const [issueForm, setIssueForm] = useState({ severity: 'Medium', description: '' });
  const [issueSaving, setIssueSaving] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [updateSaving, setUpdateSaving] = useState(false);
  const [shipmentDraft, setShipmentDraft] = useState(null);
  const [receivedDraft, setReceivedDraft] = useState(null);

  // Payments Form State
  const [paymentForm, setPaymentForm] = useState({ amount: '', paid_at: new Date().toISOString().slice(0,10), note: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadIssues(id);
    loadUpdates(id);
    loadPayments(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;
  }
  if (!order) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Production order not found" sub="This order doesn't exist yet." /></div>;
  }

  const productName = order.products?.name || 'Unknown Product';
  const vendorName = order.vendors?.name || 'Unknown Vendor';
  const checkpoints = order.checkpoints || [];
  const doneCount = checkpoints.filter(c => c.status === 'done').length;

  const createdAt = new Date(order.created_at);
  const now = new Date();
  const progress = checkpoints.length ? doneCount / checkpoints.length : 0;
  const daysElapsed = Math.max(0, (now - createdAt) / 86400000);
  const projectedDate = progress > 0 ? new Date(createdAt.getTime() + (daysElapsed / progress) * 86400000) : null;
  const dueDate = order.due_date ? new Date(order.due_date) : null;
  const atRisk = order.stage !== 'Delivered' && projectedDate && dueDate && projectedDate > dueDate;

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const setCheckpoints = async (next) => {
    setUpdating(true);
    try {
      await updateOrder(order.id, { checkpoints: next });
    } catch (err) {
      toast.error('Could not update checklist: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const toggleCheckpoint = i => {
    const next = [...checkpoints];
    next[i] = { ...next[i], status: next[i].status === 'done' ? 'pending' : 'done' };
    setCheckpoints(next);
  };

  const addCheckpoint = () => {
    if (!newCheckpointLabel.trim()) return;
    setCheckpoints([...checkpoints, { id: `cp-${Date.now()}`, label: newCheckpointLabel.trim(), status: 'pending' }]);
    setNewCheckpointLabel('');
  };

  const removeCheckpoint = i => setCheckpoints(checkpoints.filter((_, idx) => idx !== i));

  const submitIssue = async e => {
    e.preventDefault();
    if (!issueForm.description.trim()) return;
    setIssueSaving(true);
    try {
      await addIssue(order.id, issueForm);
      setIssueForm({ severity: 'Medium', description: '' });
      toast.success('Issue logged.');
    } catch (err) {
      toast.error('Could not log that issue: ' + err.message);
    } finally {
      setIssueSaving(false);
    }
  };

  const submitUpdate = async e => {
    e.preventDefault();
    if (!updateNote.trim()) return;
    setUpdateSaving(true);
    try {
      await addUpdate(order.id, updateNote.trim());
      setUpdateNote('');
      toast.success('Update logged.');
    } catch (err) {
      toast.error('Could not log that update: ' + err.message);
    } finally {
      setUpdateSaving(false);
    }
  };

  const submitPayment = async e => {
    e.preventDefault();
    if (!paymentForm.amount || !paymentForm.paid_at) return;
    setPaymentSaving(true);
    try {
      await addPayment(order.id, paymentForm);
      setPaymentForm({ amount: '', paid_at: new Date().toISOString().slice(0,10), note: '' });
      toast.success('Payment logged.');
    } catch (err) {
      toast.error('Could not log payment: ' + err.message);
    } finally {
      setPaymentSaving(false);
    }
  };

  const shipment = shipmentDraft || { carrier: order.carrier || '', tracking_number: order.tracking_number || '', tracking_url: order.tracking_url || '', shipped_at: order.shipped_at ? order.shipped_at.slice(0, 10) : '' };
  const saveShipment = async () => {
    try {
      await updateOrder(order.id, {
        carrier: shipment.carrier || null,
        tracking_number: shipment.tracking_number || null,
        tracking_url: shipment.tracking_url || null,
        shipped_at: shipment.shipped_at || null,
      });
      setShipmentDraft(null);
      toast.success('Shipment details saved.');
    } catch (err) {
      toast.error('Could not save shipment details: ' + err.message);
    }
  };

  const receivedUnits = receivedDraft ?? (order.received_units ?? '');
  const saveReceived = async () => {
    try {
      await updateOrder(order.id, { received_units: receivedUnits === '' ? null : Number(receivedUnits) });
      setReceivedDraft(null);
      toast.success('Received units saved.');
    } catch (err) {
      toast.error('Could not save received units: ' + err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Production Order</div>
            <h1 className="page-title">{productName}</h1>
          </div>
          <div className="page-sub">{order.po_number || 'No PO Number'} · {vendorName}</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-sm" onClick={() => navigate(`/tech-packs/${order.product_id}`)}>
            <i className="ph ph-scissors" /> Sampling log
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 30px 0' }}>
        <FlowStepper productId={order.product_id} current="production" />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-materials)" />

      <div className="content">
        {tab === 'overview' && (
          <>
            <div className="stats-row">
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Stage</div>
                <div className="stat-value" style={{ fontSize: 19 }}>
                  <select
                    className="form-select"
                    style={{ fontSize: 16, padding: '4px 28px 4px 8px', border: 'none', background: 'transparent', boxShadow: 'none', margin: '-4px 0 0 -8px', cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}
                    value={order.stage}
                    onChange={e => updateOrderStage(order.id, e.target.value)}
                    disabled={updating}
                  >
                    <option value="Sampling">Sampling</option>
                    <option value="In production">In production</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Units</div>
                <div className="stat-value">{order.units || '—'}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Due date</div>
                <div className="stat-value" style={{ fontSize: 19 }}>{order.due_date || '—'}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Estimated completion</div>
                <div className="stat-value" style={{ fontSize: 15, color: atRisk ? 'var(--red)' : undefined }}>
                  {order.stage === 'Delivered' ? 'Delivered' : projectedDate ? projectedDate.toLocaleDateString() : 'Not enough progress yet'}
                </div>
                {atRisk && <div className="stat-delta" style={{ color: 'var(--red)' }}>At risk of missing due date</div>}
              </div>
            </div>

            <div className="section-label">Manufacturing timeline</div>
            <div className="card-raised" style={{ padding: '22px 26px', marginBottom: 28, overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: checkpoints.length * 140 }}>
                {checkpoints.map((c, i) => (
                  <React.Fragment key={c.id || i}>
                    {i > 0 && <div style={{ flex: 1, height: 2, background: checkpoints[i - 1].status === 'done' ? 'var(--green)' : 'var(--border-2)', minWidth: 30 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: c.status === 'done' ? 'var(--green)' : 'var(--bg-1)', color: c.status === 'done' ? '#fff' : 'var(--ink-4)',
                        border: `2px solid ${c.status === 'done' ? 'var(--green)' : 'var(--border-2)'}`,
                      }}>
                        {c.status === 'done' ? <i className="ph ph-check" style={{ fontSize: 14 }} /> : <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</span>
                    </div>
                  </React.Fragment>
                ))}
                {checkpoints.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>No milestones configured for this order.</span>}
              </div>
            </div>
          </>
        )}

        {tab === 'quality' && (
          <>
            <div className="section-label">Quality control checklist</div>
            <div className="card" style={{ marginBottom: 12 }}>
              {checkpoints.length === 0 ? (
                <div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 13.5, fontStyle: 'italic' }}>No checkpoints yet.</div>
              ) : (
                checkpoints.map((item, i) => (
                  <div className="list-row" key={item.id || i} style={{ cursor: updating ? 'wait' : 'pointer' }}>
                    <span onClick={() => toggleCheckpoint(i)} style={{ fontSize: 13.5, color: item.status === 'done' ? 'var(--ink-3)' : 'var(--ink)', textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                      {item.label}
                    </span>
                    {item.status === 'done'
                      ? <span className="tag tag-green" onClick={() => toggleCheckpoint(i)}><i className="ph ph-check" style={{ marginRight: 4 }} />Done</span>
                      : <span className="tag tag-neutral" onClick={() => toggleCheckpoint(i)}>Pending</span>}
                    <button onClick={() => removeCheckpoint(i)} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 15, marginLeft: 8 }}>
                      <i className="ph ph-x" />
                    </button>
                  </div>
                ))
              )}
              <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                <input className="form-input" style={{ flex: 1 }} placeholder="Add a QC step, e.g. Stitching inspected" value={newCheckpointLabel} onChange={e => setNewCheckpointLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCheckpoint()} />
                <button className="btn btn-sm" onClick={addCheckpoint} disabled={!newCheckpointLabel.trim()}><i className="ph ph-plus" /></button>
              </div>
            </div>

            <div className="section-label">Issues</div>
            {issues.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                {issues.map(iss => (
                  <div className="list-row" key={iss.id}>
                    <div>
                      <span style={{ fontSize: 13.5, textDecoration: iss.resolved ? 'line-through' : 'none', color: iss.resolved ? 'var(--ink-4)' : 'var(--ink-2)' }}>{iss.description}</span>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{new Date(iss.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`tag ${SEVERITY_TAG[iss.severity] || 'tag-neutral'}`}>{iss.severity}</span>
                      <button className="btn btn-sm" onClick={() => toggleIssueResolved(iss)}>{iss.resolved ? 'Reopen' : 'Resolve'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={submitIssue} className="card-raised">
              <div className="card-body" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
                  <label className="form-label">Severity</label>
                  <select className="form-select" value={issueForm.severity} onChange={e => setIssueForm(f => ({ ...f, severity: e.target.value }))}>
                    <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
                  <label className="form-label">Description</label>
                  <input className="form-input" placeholder="e.g. Color of batch 2 running lighter than approved sample" value={issueForm.description} onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <button className="btn btn-sm btn-primary" type="submit" disabled={issueSaving || !issueForm.description.trim()}>Log issue</button>
              </div>
            </form>
          </>
        )}

        {tab === 'shipment' && (
          <>
            <div className="section-label">Shipment tracking</div>
            <div className="card-raised" style={{ marginBottom: 28 }}>
              <div className="card-body">
                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">Carrier</label>
                    <input className="form-input" placeholder="e.g. DHL" value={shipment.carrier} onChange={e => setShipmentDraft({ ...shipment, carrier: e.target.value })} onBlur={saveShipment} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tracking number</label>
                    <input className="form-input" value={shipment.tracking_number} onChange={e => setShipmentDraft({ ...shipment, tracking_number: e.target.value })} onBlur={saveShipment} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shipped date</label>
                    <input className="form-input" type="date" value={shipment.shipped_at} onChange={e => setShipmentDraft({ ...shipment, shipped_at: e.target.value })} onBlur={saveShipment} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tracking link</label>
                  <input className="form-input" placeholder="https://…" value={shipment.tracking_url} onChange={e => setShipmentDraft({ ...shipment, tracking_url: e.target.value })} onBlur={saveShipment} />
                  {order.tracking_url && <div className="form-hint"><a href={order.tracking_url} target="_blank" rel="noreferrer">Open tracking page <i className="ph ph-arrow-square-out" /></a></div>}
                </div>
              </div>
            </div>

            <div className="section-label">Inventory received</div>
            <div className="card-raised" style={{ marginBottom: 28, padding: '18px 22px' }}>
              <div className="form-hint" style={{ marginBottom: 12 }}>Not connected to Shopify — log units as they physically arrive to keep a real record here.</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
                  <label className="form-label">Units received</label>
                  <input className="form-input" type="number" value={receivedUnits} onChange={e => setReceivedDraft(e.target.value)} onBlur={saveReceived} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>of {order.units || '—'} ordered</div>
              </div>
            </div>

            <div className="section-label">Factory updates</div>
            {updates.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                {updates.map(u => (
                  <div className="list-row" key={u.id}>
                    <span style={{ fontSize: 13.5 }}>{u.note}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{new Date(u.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={submitUpdate} style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="e.g. Factory confirmed cutting complete, sewing starts Monday" value={updateNote} onChange={e => setUpdateNote(e.target.value)} />
              <button className="btn btn-sm btn-primary" type="submit" disabled={updateSaving || !updateNote.trim()}>Log update</button>
            </form>
          </>
        )}

        {tab === 'payments' && (
          <>
            <div className="section-label">Payment Ledger</div>
            <div className="card-raised" style={{ marginBottom: 20, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Paid to Vendor</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700, color: 'var(--c-materials)' }}>
                    {currency(totalPaid)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Order Size</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{order.units || 0} units</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              {payments.length === 0 ? (
                <div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 13.5, fontStyle: 'italic', textAlign: 'center' }}>
                  No payments logged yet. Add your initial deposit below.
                </div>
              ) : (
                payments.map(p => (
                  <div className="list-row" key={p.id}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currency(p.amount)}</div>
                      {p.note && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{p.note}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{new Date(p.paid_at).toLocaleDateString()}</span>
                      <button onClick={() => deletePayment(p.id, order.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>
                        <i className="ph ph-trash" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={submitPayment} className="card-raised">
              <div className="card-body" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
                  <label className="form-label">Amount ($)</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, width: 150 }}>
                  <label className="form-label">Date Paid</label>
                  <input className="form-input" type="date" value={paymentForm.paid_at} onChange={e => setPaymentForm(f => ({ ...f, paid_at: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                  <label className="form-label">Note</label>
                  <input className="form-input" placeholder="e.g. 50% Upfront Deposit via Wire" value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <button className="btn btn-sm btn-primary" type="submit" disabled={paymentSaving || !paymentForm.amount || !paymentForm.paid_at}>Log Payment</button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}