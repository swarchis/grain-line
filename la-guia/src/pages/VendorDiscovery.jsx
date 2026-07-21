import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { trustTagClass } from '../lib/format.js';
import TabBar from '../components/TabBar.jsx';
import { getPlan } from '../data/plans.js';
import HoverPreview from '../components/HoverPreview.jsx';
import { SkeletonRow } from '../components/Skeleton.jsx';
import { aiPost } from '../lib/aiApi.js';

const SORTS = {
  Name: (a, b) => a.name.localeCompare(b.name),
  Category: (a, b) => (a.category || '').localeCompare(b.category || ''),
  Rating: (a, b) => (b.rating || 0) - (a.rating || 0),
};

export const TRUST_LABELS = [
  { label: 'Imported by user', tone: 'neutral' },
  { label: 'External source', tone: 'neutral' },
  { label: 'Unverified', tone: 'amber' },
  { label: 'Verified partner', tone: 'green' },
  { label: 'Previously quoted', tone: 'blue' },
  { label: 'Sample completed', tone: 'blue' },
  { label: 'Production completed', tone: 'green' },
];

export const ONBOARDING_STAGES = ['prospect', 'contacted', 'sampling', 'onboarded'];

const TABS = [
  { key: 'discover', label: 'Discover & Compare', icon: 'ph-magnifying-glass' },
  { key: 'saved', label: 'Favorites', icon: 'ph-star' },
  { key: 'compare', label: 'Compare', icon: 'ph-scales' },
  { key: 'blocked', label: 'Blocked', icon: 'ph-prohibit' },
];

const EMPTY_FORM = { name: '', category: '', location: '', specialties: '', sourceNote: '', moq: '', leadTime: '', certifications: '', capabilities: '', priceRange: '' };
const EMPTY_FILTERS = { keywords: '', category: '', location: '', quantity: '', moq: '', targetPrice: '', certifications: '' };

const COMPARE_ROWS = [
  { key: 'rating', label: 'Rating', render: v => (v.rating ? `${v.rating}★` : '—') },
  { key: 'moq', label: 'MOQ', render: v => v.moq ?? '—' },
  { key: 'leadTime', label: 'Lead time', render: v => v.lead_time || '—' },
  { key: 'category', label: 'Category', render: v => v.category || '—' },
  { key: 'location', label: 'Location', render: v => v.location || '—' },
  {
    key: 'certifications', label: 'Certifications',
    render: v => (v.certifications || []).length
      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{v.certifications.map(c => <span key={c} className="tag tag-green" style={{ fontSize: 10.5 }}>{c}</span>)}</div>
      : '—',
  },
  {
    key: 'capabilities', label: 'Capabilities',
    render: v => (v.capabilities || []).length
      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{v.capabilities.map(c => <span key={c} className="tag tag-neutral" style={{ fontSize: 10.5 }}>{c}</span>)}</div>
      : '—',
  },
  {
    key: 'specialties', label: 'Specialties',
    render: v => (v.specialties || []).length
      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{v.specialties.map(c => <span key={c} className="tag tag-neutral" style={{ fontSize: 10.5 }}>{c}</span>)}</div>
      : '—',
  },
  { key: 'onboarding', label: 'Onboarding', render: v => <span style={{ textTransform: 'capitalize' }}>{v.onboarding_stage || 'prospect'}</span> },
  { key: 'verified', label: 'Verified', render: v => v.verified ? <span className="tag tag-green"><i className="ph-fill ph-seal-check" /> Verified</span> : <span style={{ color: 'var(--ink-4)' }}>Not verified</span> },
  { key: 'trust', label: 'Trust label', render: v => <span className={trustTagClass(TRUST_LABELS.find(t => t.label === v.label)?.tone)}>{v.label}</span> },
];

function PriceTag({ value, size = 13 }) {
  if (!value) return null;
  return (
    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: size, color: 'var(--c-vendors)' }}>{value}</span>
  );
}

function VendorRow({ v, onClick, onToggleFavorite, compareIds, onToggleCompare }) {
  const inCompare = compareIds.includes(v.id);
  const hasHoverInfo = v.moq || v.lead_time || (v.certifications || []).length > 0 || (v.capabilities || []).length > 0 || (v.specialties || []).length > 0;
  return (
    <HoverPreview width={260} content={hasHoverInfo ? (
      <div style={{ fontSize: 12 }}>
        {v.moq && <div style={{ marginBottom: 4 }}><strong>MOQ:</strong> {v.moq}</div>}
        {v.lead_time && <div style={{ marginBottom: 6 }}><strong>Lead time:</strong> {v.lead_time}</div>}
        {(v.certifications || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
            {v.certifications.map(c => <span key={c} className="tag tag-green" style={{ fontSize: 10 }}>{c}</span>)}
          </div>
        )}
        {(v.capabilities || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
            {v.capabilities.map(c => <span key={c} className="tag tag-blue" style={{ fontSize: 10 }}>{c}</span>)}
          </div>
        )}
        {(v.specialties || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {v.specialties.map(s => <span key={s} className="tag tag-neutral" style={{ fontSize: 10 }}>{s}</span>)}
          </div>
        )}
      </div>
    ) : null}>
    <div className="list-row" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(v); }}
          title={v.favorited ? 'Unfavorite' : 'Favorite'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: v.favorited ? 'var(--c-vendors)' : 'var(--ink-4)', padding: 4 }}
        >
          <i className={v.favorited ? 'ph-fill ph-star' : 'ph ph-star'} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onToggleCompare(v.id); }}
          title={inCompare ? 'Remove from comparison' : compareIds.length >= 5 ? 'Comparison is full (5 max)' : 'Add to comparison'}
          disabled={!inCompare && compareIds.length >= 5}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: inCompare ? 'var(--c-vendors)' : 'var(--ink-4)', padding: 4, opacity: (!inCompare && compareIds.length >= 5) ? 0.35 : 1 }}
        >
          <i className={inCompare ? 'ph-fill ph-check-square' : 'ph ph-square'} />
        </button>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--c-vendors)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ph ph-buildings" style={{ fontSize: 17 }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {v.name}
            {v.verified && <i className="ph-fill ph-seal-check" style={{ color: 'var(--green)', fontSize: 13 }} title="Verified by you" />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{v.category || 'Uncategorized'} · {v.location || 'Unknown location'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <PriceTag value={v.price_range} />
        {v.rating && <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}><i className="ph-fill ph-star" style={{ color: 'var(--c-vendors)', marginRight: 3 }} />{v.rating}</span>}
        <span className={trustTagClass(TRUST_LABELS.find(t => t.label === v.label)?.tone)}>{v.label}</span>
      </div>
    </div>
    </HoverPreview>
  );
}

function SearchResultCard({ result, onAdd, adding, added }) {
  const isReview = result.sourceType === 'review';
  return (
    <div className="card-raised" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{result.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{result.category || 'Uncategorized'} · {result.location || 'Location unknown'}</div>
        </div>
        <span className={trustTagClass(isReview ? 'amber' : 'neutral')}>{isReview ? 'Via review source' : 'External source'}</span>
      </div>
      {result.priceRange && (
        <div style={{ margin: '2px 0 10px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 24, color: 'var(--c-vendors)' }}>{result.priceRange}</span>
        </div>
      )}
      <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>{result.description}</p>
      {(result.moq || result.leadTime || (result.certifications || []).length > 0 || (result.capabilities || []).length > 0 || (result.specialties || []).length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {result.moq && <span className="tag tag-neutral">MOQ {result.moq}</span>}
          {result.leadTime && <span className="tag tag-neutral">{result.leadTime}</span>}
          {(result.certifications || []).map(c => <span key={c} className="tag tag-green">{c}</span>)}
          {(result.capabilities || []).map(c => <span key={c} className="tag tag-blue">{c}</span>)}
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
  const location = useLocation();
  const { vendors, quotes, loading, addVendor, toggleFavorite, createRFQ } = useVendors();
  const { activeBrand, products } = useProducts();
  const techPackProducts = products.filter(p => ['techpack', 'sourcing', 'sampling', 'production', 'launched'].includes(p.stage));
  const { canUse: canUseAI, remaining: aiRemaining, logUsage } = useAIUsage();
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
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchImage, setSearchImage] = useState(null); // { base64, productName }
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState(null); // { recommended: [], broader: [] }
  const [addingKey, setAddingKey] = useState(null);
  const [addedUrls, setAddedUrls] = useState([]);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompareRFQ, setShowCompareRFQ] = useState(false);
  const [compareRfqForm, setCompareRfqForm] = useState({ productId: '', quantity: '', targetUnitCost: '', deadline: '', message: '' });
  const [compareRfqSending, setCompareRfqSending] = useState(false);
  const [compareRfqError, setCompareRfqError] = useState(null);
  const [compareRfqOverrideGate, setCompareRfqOverrideGate] = useState(false);
  const [sortBy, setSortBy] = useState('Name');

  const visible = vendors.filter(v => !v.blocked).sort(SORTS[sortBy]);
  const favorites = vendors.filter(v => v.favorited && !v.blocked).sort(SORTS[sortBy]);
  const blocked = vendors.filter(v => v.blocked);
  const compareVendors = compareIds.map(id => vendors.find(v => v.id === id)).filter(Boolean);
  const compareRfqProduct = techPackProducts.find(p => p.id === compareRfqForm.productId);
  const compareRfqBelowThreshold = compareRfqProduct && compareRfqProduct.readiness < 80;
  const compareRfqBlocked = compareRfqBelowThreshold && !compareRfqOverrideGate;

  const toggleCompare = id => setCompareIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 5 ? prev : [...prev, id])));

  const submitCompareRFQ = async e => {
    e.preventDefault();
    if (!compareRfqForm.productId || compareIds.length === 0 || compareRfqBlocked) return;
    setCompareRfqSending(true);
    setCompareRfqError(null);
    try {
      await createRFQ({ ...compareRfqForm, vendorIds: compareIds });
      setShowCompareRFQ(false);
      setCompareRfqForm({ productId: '', quantity: '', targetUnitCost: '', deadline: '', message: '' });
      setCompareRfqOverrideGate(false);
      navigate('/quotes');
    } catch (err) {
      setCompareRfqError(err.message || 'Could not send that RFQ.');
    } finally {
      setCompareRfqSending(false);
    }
  };

  // A design's "Find Vendors" action hands off here via navigation state —
  // pre-fills the search with the design's category and, if a canvas
  // snapshot was captured, attaches it so AI factors in the actual garment.
  useEffect(() => {
    if (!location.state?.fromDesign) return;
    setTab('discover');
    setMode('search');
    setFilters(f => ({ ...f, keywords: location.state.keywords || f.keywords, category: location.state.category || f.category }));
    if (location.state.imageBase64) {
      setSearchImage({ base64: location.state.imageBase64, productName: location.state.productName || 'design' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await aiPost('/api/parse-vendor', { text: pasteText });
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
        certifications: (data.vendor.certifications || []).join(', '),
        capabilities: (data.vendor.capabilities || []).join(', '),
        priceRange: data.vendor.priceRange || f.priceRange,
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
        certifications: form.certifications.split(',').map(s => s.trim()).filter(Boolean),
        capabilities: form.capabilities.split(',').map(s => s.trim()).filter(Boolean),
        priceRange: form.priceRange.trim() || null,
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

  const hasAnyFilter = Object.values(filters).some(v => v.trim());

  const handleSearch = async e => {
    e.preventDefault();
    if (!hasAnyFilter) return;
    if (searchLocked) { setSearchError('Vendor search needs the Basic plan or higher — upgrade in Settings > Billing.'); return; }
    if (!canUseAI) { setSearchError("You've used all your AI generations for this month — upgrade for more in Settings > Billing."); return; }
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const res = await aiPost('/api/search-vendors', { ...filters, imageBase64: searchImage?.base64 || null });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('vendor-search');
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
        certifications: result.certifications || [],
        capabilities: result.capabilities || [],
        priceRange: result.priceRange || null,
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

      <div className="content" style={{ paddingBottom: compareIds.length > 0 && tab !== 'compare' ? 70 : undefined }}>
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
                    <div className="grid-3">
                      <div className="form-group">
                        <label className="form-label">Certifications</label>
                        <input className="form-input" placeholder="Comma-separated, e.g. GOTS, OEKO-TEX" value={form.certifications} onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Capabilities</label>
                        <input className="form-input" placeholder="Comma-separated, e.g. in-house printing" value={form.capabilities} onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Price range</label>
                        <input className="form-input" placeholder="e.g. $8-$12/unit" value={form.priceRange} onChange={e => setForm(f => ({ ...f, priceRange: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>
                      <i className="ph ph-plus" /> {saving ? 'Adding…' : 'Add vendor'}
                    </button>
                  </div>
                </form>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div className="section-label" style={{ marginBottom: 0 }}>All vendors</div>
                  <select className="form-select" style={{ width: 150 }} value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort by">
                    {Object.keys(SORTS).map(s => <option key={s} value={s}>Sort: {s}</option>)}
                  </select>
                </div>
                {loading ? (
                  <div className="card" style={{ marginBottom: 24 }}>{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</div>
                ) : visible.length ? (
                  <div className="card" style={{ marginBottom: 24 }}>
                    {visible.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} onToggleFavorite={toggleFavorite} compareIds={compareIds} onToggleCompare={toggleCompare} />)}
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
                {searchImage && (
                  <div className="card-raised" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 16 }}>
                    <img src={`data:image/png;base64,${searchImage.base64}`} alt="Design snapshot" style={{ width: 44, height: 44, objectFit: 'contain', background: '#fff', borderRadius: 6, border: '1px solid var(--border-2)', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)' }}>
                      Searching with your <strong>{searchImage.productName}</strong> design attached — AI will factor in its garment category, fabric weight, and construction complexity.
                    </div>
                    <button className="btn btn-sm" onClick={() => setSearchImage(null)}>Remove image</button>
                  </div>
                )}

                <form className="card-raised" style={{ marginBottom: 24 }} onSubmit={handleSearch}>
                  <div className="card-body">
                    <div className="grid-3" style={{ marginBottom: 4 }}>
                      <div className="form-group">
                        <label className="form-label">Material / style keywords</label>
                        <input className="form-input" placeholder="e.g. sustainable organic cotton hoodie" value={filters.keywords} onChange={e => setFilters(f => ({ ...f, keywords: e.target.value }))} disabled={searchLocked} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Category</label>
                        <input className="form-input" placeholder="e.g. Hoodies, Denim" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} disabled={searchLocked} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Location</label>
                        <input className="form-input" placeholder="e.g. Portugal" value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} disabled={searchLocked} />
                      </div>
                    </div>

                    <button type="button" className="btn btn-sm" style={{ margin: '12px 0' }} onClick={() => setShowAdvanced(s => !s)}>
                      <i className={`ph ${showAdvanced ? 'ph-caret-up' : 'ph-caret-down'}`} /> Advanced filters
                    </button>

                    {showAdvanced && (
                      <div className="grid-3" style={{ marginBottom: 12 }}>
                        <div className="form-group">
                          <label className="form-label">Quantity needed</label>
                          <input className="form-input" type="number" placeholder="e.g. 300 units" value={filters.quantity} onChange={e => setFilters(f => ({ ...f, quantity: e.target.value }))} disabled={searchLocked} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Max MOQ</label>
                          <input className="form-input" type="number" placeholder="e.g. 300" value={filters.moq} onChange={e => setFilters(f => ({ ...f, moq: e.target.value }))} disabled={searchLocked} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Target unit price ($)</label>
                          <input className="form-input" type="number" step="0.01" placeholder="e.g. 18.00" value={filters.targetPrice} onChange={e => setFilters(f => ({ ...f, targetPrice: e.target.value }))} disabled={searchLocked} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                          <label className="form-label">Certifications wanted</label>
                          <input className="form-input" placeholder="e.g. GOTS, OEKO-TEX" value={filters.certifications} onChange={e => setFilters(f => ({ ...f, certifications: e.target.value }))} disabled={searchLocked} />
                        </div>
                      </div>
                    )}

                    <div className="form-hint" style={{ marginBottom: 12 }}>
                      Fill in as many fields as you can — each one sharpens the search. Runs a real web search, then AI extracts candidate vendors from actual results — nothing here is pre-loaded or made up.
                      {canUseAI && !searchLocked && <span style={{ color: 'var(--ink-4)' }}> ({aiRemaining} AI searches left this month)</span>}
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={searching || !hasAnyFilter || searchLocked || !canUseAI}>
                      {searching ? <><i className="ph ph-spinner ph-spin" /> Searching…</> : !canUseAI && !searchLocked ? <><i className="ph ph-lock-simple" /> Upgrade for more AI searches</> : <><i className="ph ph-magnifying-glass" /> Search the web</>}
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
                        No clear vendor matches — try broadening a field or removing one of the constraints.
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
              {favorites.map(v => <VendorRow key={v.id} v={v} onClick={() => navigate(`/vendors/${v.id}`)} onToggleFavorite={toggleFavorite} compareIds={compareIds} onToggleCompare={toggleCompare} />)}
            </div>
          ) : (
            <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              No favorites yet — star a vendor to keep it here.
            </div>
          )
        )}

        {tab === 'compare' && (
          compareVendors.length === 0 ? (
            <div className="card-raised" style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
              Nothing selected yet — check up to 5 vendors from Discover or Favorites to compare them side by side.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <button className="btn btn-primary" onClick={() => setShowCompareRFQ(s => !s)}>
                  <i className="ph ph-paper-plane-tilt" /> Request quotes from these {compareVendors.length}
                </button>
              </div>

              {showCompareRFQ && (
                <form className="card-raised enter" style={{ marginBottom: 18 }} onSubmit={submitCompareRFQ}>
                  <div className="card-header"><span className="card-title">Send an RFQ to {compareVendors.map(v => v.name).join(', ')}</span></div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label">Tech pack</label>
                      <select className="form-select" value={compareRfqForm.productId} onChange={e => { setCompareRfqForm(f => ({ ...f, productId: e.target.value })); setCompareRfqOverrideGate(false); }} required>
                        <option value="" disabled>Choose a tech pack</option>
                        {techPackProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.readiness}%)</option>)}
                      </select>
                      {techPackProducts.length === 0 && <div className="form-hint">No products have a tech pack yet — convert a design first.</div>}
                    </div>
                    <div className="grid-3">
                      <div className="form-group">
                        <label className="form-label">Quantity</label>
                        <input className="form-input" placeholder="e.g. 300 units" value={compareRfqForm.quantity} onChange={e => setCompareRfqForm(f => ({ ...f, quantity: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Target unit cost</label>
                        <input className="form-input" placeholder="e.g. $18.00" value={compareRfqForm.targetUnitCost} onChange={e => setCompareRfqForm(f => ({ ...f, targetUnitCost: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Deadline</label>
                        <input className="form-input" placeholder="e.g. Sept 15" value={compareRfqForm.deadline} onChange={e => setCompareRfqForm(f => ({ ...f, deadline: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Anything else every vendor should know</label>
                      <textarea className="form-textarea" placeholder="Optional notes" value={compareRfqForm.message} onChange={e => setCompareRfqForm(f => ({ ...f, message: e.target.value }))} />
                    </div>
                    {compareRfqBelowThreshold && (
                      <div className="form-hint" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', marginBottom: 14 }}>
                        <i className="ph ph-lock-key" style={{ marginRight: 4 }} />
                        <strong>Hard Gate:</strong> {compareRfqProduct.name} is only at {compareRfqProduct.readiness}% factory readiness. A score of 80%+ is required to send an RFQ.
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontWeight: 500 }}>
                          <input type="checkbox" checked={compareRfqOverrideGate} onChange={e => setCompareRfqOverrideGate(e.target.checked)} />
                          I understand the risks and want to send it anyway
                        </label>
                      </div>
                    )}
                    {compareRfqError && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 12 }}>{compareRfqError}</div>}
                    <button className="btn btn-primary" type="submit" disabled={compareRfqSending || !compareRfqForm.productId || compareRfqBlocked}>
                      <i className="ph ph-paper-plane-tilt" /> {compareRfqSending ? 'Sending…' : `Send to ${compareVendors.length} vendor${compareVendors.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </form>
              )}

            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', width: 140 }}>Vendor</th>
                    {compareVendors.map(v => (
                      <th key={v.id} style={{ textAlign: 'left', padding: '12px 16px', minWidth: 200 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/vendors/${v.id}`)}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{v.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginTop: 2 }}>{v.category || 'Uncategorized'}</div>
                          </div>
                          <button onClick={() => toggleCompare(v.id)} title="Remove from comparison" style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 15 }}>
                            <i className="ph ph-x" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--accent-bg)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--ink-2)' }}>Price</td>
                    {compareVendors.map(v => (
                      <td key={v.id} style={{ padding: '14px 16px', fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: v.price_range ? 'var(--c-vendors)' : 'var(--ink-4)' }}>
                        {v.price_range || '—'}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontSize: 12 }}>Quotes exchanged</td>
                    {compareVendors.map(v => (
                      <td key={v.id} style={{ padding: '10px 16px' }}>{quotes.filter(q => q.vendor_id === v.id).length}</td>
                    ))}
                  </tr>
                  {COMPARE_ROWS.map(row => (
                    <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontSize: 12 }}>{row.label}</td>
                      {compareVendors.map(v => (
                        <td key={v.id} style={{ padding: '10px 16px' }}>{row.render(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
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

      {compareIds.length > 0 && tab !== 'compare' && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--bg-1)', border: '1.5px solid var(--border-2)', borderRadius: 999, padding: '10px 10px 10px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{compareIds.length}/5 selected</span>
          <button className="btn btn-sm btn-primary" onClick={() => setTab('compare')}><i className="ph ph-scales" /> Compare</button>
          <button className="btn btn-sm" onClick={() => setCompareIds([])}>Clear</button>
        </div>
      )}
    </>
  );
}
