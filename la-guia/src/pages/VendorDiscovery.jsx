import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { trustTagClass } from '../lib/format.js';
import TabBar from '../components/TabBar.jsx';

export const TRUST_LABELS = [
  { label: 'Imported by user', tone: 'neutral' },
  { label: 'External source', tone: 'neutral' },
  { label: 'Unverified', tone: 'amber' },
  { label: 'Verified partner', tone: 'green' },
  { label: 'Previously quoted', tone: 'blue' },
  { label: 'Sample completed', tone: 'blue' },
  { label: 'Production completed', tone: 'green' },
];

const TABS = [
  { key: 'discover', label: 'Discover & Compare', icon: 'ph-magnifying-glass' },
  { key: 'saved', label: 'Saved Vendors', icon: 'ph-star' },
];

function VendorRow({ v, onClick }) {
  return (
    <div className="list-row" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--c-vendors)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ph ph-buildings" style={{ fontSize: 17 }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{v.category || 'Uncategorized'} · {v.location || 'Unknown location'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {v.rating && <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}><i className="ph-fill ph-star" style={{ color: 'var(--c-vendors)', marginRight: 3 }} />{v.rating}</span>}
        <span className={trustTagClass(TRUST_LABELS.find(t => t.label === v.label)?.tone)}>{v.label}</span>
      </div>
    </div>
  );
}

export default function VendorDiscovery() {
  const navigate = useNavigate();
  const { vendors, quotes, loading, addVendor } = useVendors();
  const [tab, setTab] = useState('discover');
  const [mode, setMode] = useState('import');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', location: '', specialties: '', sourceNote: '' });

  const saved = vendors.filter(v => quotes.some(q => q.vendor_id === v.id));

  const handleAdd = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const vendor = await addVendor({
        name: form.name.trim(),
        category: form.category.trim(),
        location: form.location.trim(),
        specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean),
        sourceNote: form.sourceNote.trim(),
      });
      setForm({ name: '', category: '', location: '', specialties: '', sourceNote: '' });
      navigate(`/vendors/${vendor.id}`);
    } catch (err) {
      alert('Could not add vendor: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-vendors)' }}>Vendors</div>
            <h1 className="page-title">Vendor Hub</h1>
          </div>
          <div className="page-sub">Private workspace — nothing here is presented as officially vetted unless labeled so</div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-vendors)" />

      <div className="content">
        {tab === 'discover' && (
          <>
            <div className="pill-group" style={{ marginBottom: 20 }}>
              <button className={`pill ${mode === 'import' ? 'active' : ''}`} onClick={() => setMode('import')}>Import</button>
              <button className={`pill ${mode === 'search' ? 'active' : ''}`} onClick={() => setMode('search')}>Search</button>
            </div>

            {mode === 'import' ? (
              <form className="card-raised" style={{ marginBottom: 24 }} onSubmit={handleAdd}>
                <div className="card-body">
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">Vendor name *</label>
                      <input className="form-input" placeholder="e.g. Norte Textile Co." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <input className="form-input" placeholder="e.g. Denim" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Location</label>
                      <input className="form-input" placeholder="e.g. Guadalajara, MX" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Specialties</label>
                    <input className="form-input" placeholder="Comma-separated, e.g. Selvedge denim, Small-batch runs" value={form.specialties} onChange={e => setForm(f => ({ ...f, specialties: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Link, email, or notes</label>
                    <input className="form-input" placeholder="Paste a link, email, or anything else worth keeping" value={form.sourceNote} onChange={e => setForm(f => ({ ...f, sourceNote: e.target.value }))} />
                    <div className="form-hint">A private vendor profile gets created from this — nothing is published or shared.</div>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>
                    <i className="ph ph-plus" /> {saving ? 'Adding…' : 'Add vendor'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="card-raised" style={{ marginBottom: 24 }}>
                <div className="card-body">
                  <div className="grid-3">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Category</label>
                      <select className="form-select" disabled><option>Any category</option></select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Location</label>
                      <select className="form-select" disabled><option>Any location</option></select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Max MOQ</label>
                      <input className="form-input" placeholder="e.g. 500 units" disabled />
                    </div>
                  </div>
                  <div className="form-hint" style={{ marginTop: 10 }}>Public vendor search isn't connected yet — for now, add vendors you already know about via Import.</div>
                </div>
              </div>
            )}

            <div className="section-label">All vendors</div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch" /> Loading…</div>
            ) : vendors.length ? (
              <div className="card" style={{ marginBottom: 24 }}>
                {vendors.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} />)}
              </div>
            ) : (
              <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 24 }}>
                No vendors yet — add your first one above.
              </div>
            )}

            <div className="section-label">Trust labels</div>
            <div className="card-raised">
              <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {TRUST_LABELS.map(t => <span key={t.label} className={trustTagClass(t.tone)}>{t.label}</span>)}
              </div>
            </div>
          </>
        )}

        {tab === 'saved' && (
          saved.length ? (
            <div className="card">
              {saved.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} />)}
            </div>
          ) : (
            <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              No saved vendors yet — vendors you've requested a quote from will show up here.
            </div>
          )
        )}
      </div>
    </>
  );
}
