import React, { useMemo, useState } from 'react';
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
  { key: 'saved', label: 'Favorites', icon: 'ph-star' },
  { key: 'blocked', label: 'Blocked', icon: 'ph-prohibit' },
];

const EMPTY_FORM = { name: '', category: '', location: '', specialties: '', sourceNote: '', moq: '', leadTime: '' };

function VendorRow({ v, onClick, onToggleFavorite }) {
  return (
    <div className="list-row" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(v); }}
          title={v.favorited ? 'Unfavorite' : 'Favorite'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: v.favorited ? 'var(--c-vendors)' : 'var(--ink-4)', padding: 4 }}
        >
          <i className={v.favorited ? 'ph-fill ph-star' : 'ph ph-star'} />
        </button>
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
  const { vendors, loading, addVendor, toggleFavorite } = useVendors();
  const [tab, setTab] = useState('discover');
  const [mode, setMode] = useState('import');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [filters, setFilters] = useState({ category: '', location: '', maxMoq: '', label: '' });

  const visible = vendors.filter(v => !v.blocked);
  const favorites = vendors.filter(v => v.favorited && !v.blocked);
  const blocked = vendors.filter(v => v.blocked);

  const categories = useMemo(() => [...new Set(visible.map(v => v.category).filter(Boolean))], [visible]);
  const locations = useMemo(() => [...new Set(visible.map(v => v.location).filter(Boolean))], [visible]);

  const filteredVendors = visible.filter(v => {
    if (filters.category && v.category !== filters.category) return false;
    if (filters.location && v.location !== filters.location) return false;
    if (filters.maxMoq && v.moq && v.moq > Number(filters.maxMoq)) return false;
    if (filters.label && v.label !== filters.label) return false;
    return true;
  });

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch('http://localhost:3001/api/parse-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setForm(f => ({
        ...f,
        name: data.vendor.name || f.name,
        category: data.vendor.category || f.category,
        location: data.vendor.location || f.location,
        specialties: (data.vendor.specialties || []).join(', '),
        moq: data.vendor.moq != null ? String(data.vendor.moq) : f.moq,
        leadTime: data.vendor.leadTime || f.leadTime,
        sourceNote: pasteText,
      }));
    } catch (err) {
      setParseError(err.message || 'Could not parse that — try filling the fields in manually below.');
    } finally {
      setParsing(false);
    }
  };

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
        moq: form.moq ? Number(form.moq) : null,
        leadTime: form.leadTime.trim() || null,
      });
      setForm(EMPTY_FORM);
      setPasteText('');
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
                  <div className="form-group">
                    <label className="form-label">Paste a link, email, or notes — AI will pre-fill the fields below</label>
                    <textarea
                      className="form-textarea" style={{ minHeight: 60 }}
                      placeholder="e.g. an Alibaba listing URL, a forwarded vendor email, or a screenshot's transcribed text"
                      value={pasteText} onChange={e => setPasteText(e.target.value)}
                    />
                    <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={handleParse} disabled={parsing || !pasteText.trim()}>
                      <i className="ph ph-magic-wand" /> {parsing ? 'Reading…' : 'Auto-fill with AI'}
                    </button>
                    {parseError && <div className="form-hint" style={{ color: 'var(--red)' }}>{parseError}</div>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'var(--ink-4)' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span className="section-label" style={{ marginBottom: 0 }}>or fill in manually</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

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
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">Specialties</label>
                      <input className="form-input" placeholder="Comma-separated" value={form.specialties} onChange={e => setForm(f => ({ ...f, specialties: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">MOQ</label>
                      <input className="form-input" type="number" placeholder="e.g. 300" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Lead time</label>
                      <input className="form-input" placeholder="e.g. 45 days" value={form.leadTime} onChange={e => setForm(f => ({ ...f, leadTime: e.target.value }))} />
                    </div>
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
                      <select className="form-select" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
                        <option value="">Any category</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Location</label>
                      <select className="form-select" value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}>
                        <option value="">Any location</option>
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Max MOQ</label>
                      <input className="form-input" type="number" placeholder="e.g. 500 units" value={filters.maxMoq} onChange={e => setFilters(f => ({ ...f, maxMoq: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
                    <label className="form-label">Trust label</label>
                    <select className="form-select" value={filters.label} onChange={e => setFilters(f => ({ ...f, label: e.target.value }))}>
                      <option value="">Any</option>
                      {TRUST_LABELS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-hint" style={{ marginTop: 10 }}>Public vendor search isn't connected yet — this filters vendors you've already added via Import.</div>
                </div>
              </div>
            )}

            <div className="section-label">{mode === 'search' ? `${filteredVendors.length} matching vendors` : 'All vendors'}</div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch" /> Loading…</div>
            ) : filteredVendors.length ? (
              <div className="card" style={{ marginBottom: 24 }}>
                {filteredVendors.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} onToggleFavorite={toggleFavorite} />)}
              </div>
            ) : (
              <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 24 }}>
                {vendors.length === 0 ? 'No vendors yet — add your first one above.' : 'No vendors match those filters.'}
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
          favorites.length ? (
            <div className="card">
              {favorites.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} onToggleFavorite={toggleFavorite} />)}
            </div>
          ) : (
            <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              No favorites yet — star a vendor to keep it here.
            </div>
          )
        )}

        {tab === 'blocked' && (
          blocked.length ? (
            <div className="card">
              {blocked.map(v => (
                <div className="list-row" key={v.id}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{v.category || 'Uncategorized'}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => navigate(`/vendors/${v.id}`)}>View & unblock</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              No blocked vendors. Blocked vendors won't show up in search or your main list.
            </div>
          )
        )}
      </div>
    </>
  );
}
