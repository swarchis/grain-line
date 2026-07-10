import React, { useState } from 'react';
import { useVendors } from '../context/VendorsContext.jsx';

const STATUSES = ['All', 'Requested', 'Received', 'Accepted', 'Declined'];

function QuoteRow({ q, onUpdate }) {
  const [amount, setAmount] = useState(q.amount || '');
  const [busy, setBusy] = useState(false);

  const run = async (updates) => {
    setBusy(true);
    try { await onUpdate(q.id, updates); } catch (err) { alert('Could not update quote: ' + err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="list-row">
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{q.products?.name || 'Unknown product'}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{q.vendors?.name || 'Unknown vendor'} · requested {new Date(q.requested_at).toLocaleDateString()}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {q.status === 'Requested' && (
          <>
            <input
              className="form-input"
              style={{ width: 100, padding: '6px 10px', fontSize: 12.5 }}
              type="number" step="0.01" placeholder="$/unit"
              value={amount} onChange={e => setAmount(e.target.value)}
            />
            <button className="btn btn-sm" disabled={busy || !amount} onClick={() => run({ status: 'Received', amount: parseFloat(amount) })}>
              Mark received
            </button>
          </>
        )}
        {q.status === 'Received' && (
          <>
            {q.amount && <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5 }}>${Number(q.amount).toFixed(2)}/unit</span>}
            <button className="btn btn-sm" disabled={busy} onClick={() => run({ status: 'Accepted' })}>Accept</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => run({ status: 'Declined' })}>Decline</button>
          </>
        )}
        {(q.status === 'Accepted' || q.status === 'Declined') && q.amount && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5 }}>${Number(q.amount).toFixed(2)}/unit</span>
        )}
        <span className={q.status === 'Accepted' ? 'tag tag-green' : q.status === 'Declined' ? 'tag tag-red' : q.status === 'Received' ? 'tag tag-blue' : 'tag tag-neutral'}>{q.status}</span>
      </div>
    </div>
  );
}

export default function QuoteTracker() {
  const { quotes, loading, updateQuote } = useVendors();
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? quotes : quotes.filter(q => q.status === filter);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-vendors)' }}>Vendors</div>
            <h1 className="page-title">Quote Tracker</h1>
          </div>
          <div className="page-sub">Status of every outstanding and received quote, across vendors</div>
        </div>
      </div>

      <div className="content">
        <div className="pill-group" data-tour="quote-tracker" style={{ marginBottom: 22 }}>
          {STATUSES.map(s => (
            <button key={s} className={`pill ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch" /> Loading…</div>
        ) : filtered.length ? (
          <div className="card">
            {filtered.map(q => <QuoteRow key={q.id} q={q} onUpdate={updateQuote} />)}
          </div>
        ) : (
          <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
            No quotes yet — request one from a vendor's page.
          </div>
        )}
      </div>
    </>
  );
}
