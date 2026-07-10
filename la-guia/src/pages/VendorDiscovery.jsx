import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { trustTagClass } from '../lib/format.js';
import TabBar from '../components/TabBar.jsx';
import { getPlan } from '../data/plans.js';

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

function SearchResultCard({ result, onAdd, adding, added }) {
  const isReview = result.sourceType === 'review';
  return (
    <div className="card-raised" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{result.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{result.category || 'Uncategorized'} · {result.location || 'Location unknown'}</div>
        </div>
        <span className={trustTagClass(isReview ? 'amber' : 'neutral')}>{isReview ? 'Via review source' : 'External source'}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>{result.description}</p>
      {(result.moq || result.leadTime || (result.specialties || []).length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {result.moq && <span className="tag tag-neutral">MOQ {result.moq}</span>}
          {result.leadTime && <span className="tag tag-neutral">{result.leadTime}</span>}
          {(result.specialties || []).map(s => <span key={s} className="tag tag-neutral">{s}</span>)}
        </div>
      )}
      {isReview && (
        <div style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ph ph-info" /> This link goes to a third party talking about the vendor, not the vendor's own page.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {result.sourceUrl && (
            <a href={result.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ph ph-arrow-square-out" /> {isReview ? 'Review source' : 'Vendor site'}
            </a>
          )}
          {result.reviewUrl && result.reviewUrl !== result.sourceUrl && (
            <a href={result.reviewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)' }}>
              <i className="ph ph-instagram-logo" /> See review
            </a>
          )}
        </div>
        <button className="btn btn-sm" onClick={() => onAdd(result)} disabled={adding || added}>
          {added ? <><i className="ph ph-check" /> Added</> : adding ? 'Adding…' : <><i className="ph ph-plus" /> Add to my vendors</>}
        </button>
      </div>
    </div>
  );
}

export default function VendorDiscovery() {
  const navigate = useNavigate();
  const { vendors, loading, addVendor, toggleFavorite } = useVendors();
  const { activeBrand } = useProducts();
  const plan = getPlan(activeBrand?.plan_tier || 'free');
  const searchLocked = plan.id === 'free';
  const [tab, setTab] = useState('discover');
  const [mode, setMode] = useState('import');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);

  // Live web search — no local database involved in finding these.
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState(null); // { recommended: [], broader: [] }
  const [addingKey, setAddingKey] = useState(null);
  const [addedUrls, setAddedUrls] = useState([]);

  const visible = vendors.filter(v => !v.blocked);
  const favorites = vendors.filter(v => v.favorited && !v.blocked);
  const blocked = vendors.filter(v => v.blocked);

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

  const handleSearch = async e => {
    e.preventDefault();
    if (!query.trim()) return;
    if (searchLocked) { setSearchError('Vendor search needs the Basic plan or higher — upgrade in Settings > Billing.'); return; }
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const res = await fetch('http://localhost:3001/api/search-vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResults({ recommended: data.recommended || [], broader: data.broader || [] });
    } catch (err) {
      setSearchError(err.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddResult = async (result, key) => {
    setAddingKey(key);
    try {
      await addVendor({
        name: result.name,
        category: result.category,
        location: result.location,
        specialties: result.specialties || [],
        moq: result.moq ?? null,
        leadTime: result.leadTime || null,
        sourceNote: result.reviewUrl || result.sourceUrl,
        label: result.sourceType === 'review' ? 'Unverified' : 'External source',
      });
      setAddedUrls(prev => [...prev, result.sourceUrl]);
    } catch (err) {
      alert('Could not add vendor: ' + err.message);
    } finally {
      setAddingKey(null);
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

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-vendors)" dataTour="vendor-tabs" />

      <div className="content">
        {tab === 'discover' && (
          <>
            <div className="pill-group" style={{ marginBottom: 20 }}>
              <button className={`pill ${mode === 'import' ? 'active' : ''}`} onClick={() => setMode('import')}>Import</button>
              <button className={`pill ${mode === 'search' ? 'active' : ''}`} onClick={() => setMode('search')}>
                Search {searchLocked && <i className="ph ph-lock-simple" style={{ marginLeft: 4 }} />}
              </button>
            </div>
            {mode === 'search' && searchLocked && (
              <div className="form-hint" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)' }}>
                <i className="ph ph-warning" style={{ marginRight: 4 }} /> Vendor search needs the Basic plan or higher.{' '}
                <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/settings')}>Upgrade</span> to search the web for manufacturers.
              </div>
            )}

            {mode === 'import' ? (
              <>
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

                <div className="section-label">All vendors</div>
                {loading ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}><i className="ph ph-circle-notch" /> Loading…</div>
                ) : visible.length ? (
                  <div className="card" style={{ marginBottom: 24 }}>
                    {visible.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} onToggleFavorite={toggleFavorite} />)}
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
            ) : (
              <>
                <form className="card-raised" style={{ marginBottom: 24 }} onSubmit={handleSearch}>
                  <div className="card-body">
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Describe what you're looking for</label>
                      <input
                        className="form-input"
                        placeholder="e.g. Sustainable organic cotton hoodie manufacturers in Portugal, MOQ under 300, target $18/unit"
                        value={query} onChange={e => setQuery(e.target.value)}
                        disabled={searchLocked}
                      />
                      <div className="form-hint">
                        The more specific you are, the better the match — try to include <strong>material</strong>, <strong>quantity/MOQ</strong>, <strong>target price</strong>, and <strong>location</strong>. A vague search gets vague results.
                        Runs a real web search, then AI extracts candidate vendors from actual results — nothing here is pre-loaded or made up.
                      </div>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={searching || !query.trim() || searchLocked}>
                      <i className="ph ph-magnifying-glass" /> {searching ? 'Searching…' : 'Search the web'}
                    </button>
                  </div>
                </form>

                {searchError && (
                  <div className="alert" style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 13, marginBottom: 20 }}>
                    <i className="ph ph-warning" style={{ marginTop: 1 }} />
                    {searchError}
                  </div>
                )}

                {results && (
                  <>
                    <div className="section-label">
                      {results.recommended.length} recommended, {results.broader.length} broader — all unverified, review before contacting
                    </div>
                    {results.recommended.length === 0 && results.broader.length === 0 ? (
                      <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
                        No clear vendor matches — try a broader or differently-worded query.
                      </div>
                    ) : (
                      <>
                        {results.recommended.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-vendors)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ph ph-target" /> RECOMMENDED — CLOSEST MATCH TO YOUR SEARCH
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {results.recommended.map((r, i) => (
                                <SearchResultCard key={`rec-${i}`} result={r} onAdd={res => handleAddResult(res, `rec-${i}`)} adding={addingKey === `rec-${i}`} added={addedUrls.includes(r.sourceUrl)} />
                              ))}
                            </div>
                          </div>
                        )}
                        {results.broader.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ph ph-circles-three" /> ALSO WORTH A LOOK — IN CASE THE ABOVE AREN'T RIGHT
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {results.broader.map((r, i) => (
                                <SearchResultCard key={`br-${i}`} result={r} onAdd={res => handleAddResult(res, `br-${i}`)} adding={addingKey === `br-${i}`} added={addedUrls.includes(r.sourceUrl)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
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
