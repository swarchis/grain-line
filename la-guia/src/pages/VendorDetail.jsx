import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import CreditCost from '../components/CreditCost.jsx';
import { supabase } from '../lib/supabase.js';
import { trustTagClass } from '../lib/format.js';
import { TRUST_LABELS, ONBOARDING_STAGES } from './VendorDiscovery.jsx';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';
import EmptyState from '../components/EmptyState.jsx';
import CommentsPanel from '../components/CommentsPanel.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { aiPost } from '../lib/aiApi.js';

const TECHPACK_STAGES = ['techpack', 'sourcing', 'sampling', 'production', 'launched'];
const SEVERITY_ICON = { amber: 'ph-warning', blue: 'ph-info', green: 'ph-check-circle', red: 'ph-x-circle' };
const ORDER_STAGE_TAG = { Sampling: 'tag-blue', 'In production': 'tag-amber', Shipped: 'tag-accent', Delivered: 'tag-green' };

function TagEditor({ values, onAdd, onRemove, placeholder, tagClass = 'tag tag-neutral' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onAdd(v);
    setDraft('');
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: values.length ? 10 : 0 }}>
        {values.length
          ? values.map(v => (
              <span key={v} className={tagClass} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {v}
                <button onClick={() => onRemove(v)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
              </span>
            ))
          : <span style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>None added yet</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="form-input" style={{ fontSize: 12.5, padding: '6px 10px' }} placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn btn-sm" onClick={add} disabled={!draft.trim()}><i className="ph ph-plus" /></button>
      </div>
    </div>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vendors, quotes, requestQuote, updateVendor, toggleFavorite, toggleBlock } = useVendors();
  const { products, activeBrand, updateProduct } = useProducts();
  const { orders } = useProduction();
  const { canAfford, openTopup } = useAIUsage();

  const [fitProduct, setFitProduct] = useState('');
  const [fitBudget, setFitBudget] = useState('');
  const [analyzingFit, setAnalyzingFit] = useState(false);
  const [fitResult, setFitResult] = useState(null);
  const [fitError, setFitError] = useState(null);

  const [showRequest, setShowRequest] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [targetCost, setTargetCost] = useState('');
  const [deadline, setDeadline] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [overrideGate, setOverrideGate] = useState(false);

  const [notes, setNotes] = useState(null); 
  const [savingNotes, setSavingNotes] = useState(false);

  const [showEmail, setShowEmail] = useState(false);
  const [emailAsk, setEmailAsk] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState(null);

  const [priceDraft, setPriceDraft] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');

  const vendor = vendors.find(v => v.id === id);
  const vendorQuotes = quotes.filter(q => q.vendor_id === id);
  const vendorOrders = orders.filter(o => o.vendor_id === id);
  const techPackProducts = products.filter(p => TECHPACK_STAGES.includes(p.stage));
  const pricePoints = vendorQuotes.filter(q => q.amount != null).map(q => ({ date: q.requested_at, amount: Number(q.amount) }));
  const acceptedQuotes = vendorQuotes.filter(q => q.status === 'Accepted').length;

  // Check the Hard Gate readiness requirement for Quoting — same opt-in
  // override as ProductionOrders.jsx, so a founder who's sure can proceed.
  const selectedProductObjForQuote = products.find(p => p.id === selectedProduct);
  const belowThresholdForQuote = selectedProductObjForQuote && selectedProductObjForQuote.readiness < 80;
  const isQuoteBlocked = belowThresholdForQuote && !overrideGate;

  if (!vendor) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Vendor not found" sub="This vendor profile doesn't exist yet." /></div>;
  }

  const handleSend = async e => {
    e.preventDefault();
    if (!selectedProduct || isQuoteBlocked) return;
    setSending(true);
    try {
      const preferences = {};
      if (quantity) preferences.quantity = quantity;
      if (targetCost) preferences.targetUnitCost = targetCost;
      if (deadline) preferences.deadline = deadline;
      await requestQuote({ vendorId: vendor.id, productId: selectedProduct, message, preferences });
      setShowRequest(false);
      setSelectedProduct(''); setQuantity(''); setTargetCost(''); setDeadline(''); setMessage(''); setOverrideGate(false);
    } catch (err) {
      alert('Could not send request: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateVendor(vendor.id, { notes });
    } catch (err) {
      alert('Could not save notes: ' + err.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const savePriceRange = async () => {
    try {
      await updateVendor(vendor.id, { price_range: priceDraft.trim() || null });
    } catch (err) {
      alert('Could not save price range: ' + err.message);
    }
  };

  const addTag = async (field, value) => {
    try {
      await updateVendor(vendor.id, { [field]: [...(vendor[field] || []), value] });
    } catch (err) {
      alert(`Could not update ${field}: ` + err.message);
    }
  };

  const removeTag = async (field, value) => {
    try {
      await updateVendor(vendor.id, { [field]: (vendor[field] || []).filter(v => v !== value) });
    } catch (err) {
      alert(`Could not update ${field}: ` + err.message);
    }
  };

  const confirmVerified = async () => {
    try {
      await updateVendor(vendor.id, { verified: true, verified_notes: verifyNotes.trim() || null });
      setVerifying(false);
      setVerifyNotes('');
    } catch (err) {
      alert('Could not update vendor: ' + err.message);
    }
  };

  const unmarkVerified = async () => {
    try {
      await updateVendor(vendor.id, { verified: false });
    } catch (err) {
      alert('Could not update vendor: ' + err.message);
    }
  };

  const handleBlock = async () => {
    try {
      await toggleBlock(vendor);
      if (!vendor.blocked) navigate('/vendors');
    } catch (err) {
      alert('Could not update vendor: ' + err.message);
    }
  };

  const draftEmail = async () => {
    if (!canAfford('draft-vendor-email')) { openTopup(); return; }
    setDrafting(true);
    setDraftError(null);
    try {
      const selectedProductObj = products.find(p => p.id === selectedProduct);
      const res = await aiPost('/api/draft-vendor-email', {
          vendorName: vendor.name,
          productName: selectedProductObj?.name,
          garmentType: selectedProductObj?.category,
          preferences: { quantity, targetUnitCost: targetCost, deadline },
          ask: emailAsk,
        });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDraft(data.draft);
    } catch (err) {
      setDraftError(err.message || 'Could not draft that email.');
    } finally {
      setDrafting(false);
    }
  };

  const openInMailClient = () => {
    if (!draft) return;
    const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.location.href = mailto;
  };

  const selectFitProduct = productId => {
    setFitProduct(productId);
    setFitResult(null);
    const productObj = products.find(p => p.id === productId);
    setFitBudget(productObj?.budget ? String(productObj.budget) : '');
  };

  const analyzeFit = async () => {
    if (!fitProduct) return;
    if (!canAfford('analyze-vendor-fit')) { openTopup(); return; }
    setAnalyzingFit(true);
    setFitError(null);
    try {
      const budgetValue = fitBudget ? Number(fitBudget) : 0;
      let productObj = products.find(p => p.id === fitProduct);

      if (productObj && budgetValue !== productObj.budget) {
        productObj = await updateProduct(fitProduct, { budget: budgetValue });
      }

      const { data: techPack } = await supabase
        .from('tech_packs')
        .select('bom')
        .eq('product_id', fitProduct)
        .single();

      const productQuotes = vendorQuotes
        .filter(q => q.product_id === fitProduct)
        .map(q => ({ status: q.status, amount: q.amount, preferences: q.preferences }));

      const res = await aiPost('/api/analyze-vendor-fit', {
          vendor,
          product: { ...productObj, budget: budgetValue },
          brand: activeBrand,
          quoteHistory: productQuotes,
          bom: techPack?.bom || [],
        });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFitResult(data.analysis);
    } catch (err) {
      setFitError(err.message || 'Could not analyze fit.');
    } finally {
      setAnalyzingFit(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <Breadcrumbs items={[{ label: 'Home', path: '/' }, { label: 'Vendors', path: '/vendors' }, { label: vendor.name }]} />
            <div className="page-eyebrow" style={{ color: 'var(--c-vendors)' }}>Vendor</div>
            <h1 className="page-title">{vendor.name}</h1>
          </div>
          <div className="page-sub">{vendor.category || 'Uncategorized'} · {vendor.location || 'Unknown location'}</div>
        </div>
        <div className="topbar-right">
          <button className="canvas-icon-btn" title={vendor.favorited ? 'Unfavorite' : 'Favorite'} onClick={() => toggleFavorite(vendor)} style={{ color: vendor.favorited ? 'var(--c-vendors)' : 'var(--ink-3)' }}>
            <i className={vendor.favorited ? 'ph-fill ph-star' : 'ph ph-star'} />
          </button>
          <button className="canvas-icon-btn" title={vendor.blocked ? 'Unblock' : 'Block vendor'} onClick={handleBlock} style={{ color: vendor.blocked ? 'var(--red)' : 'var(--ink-3)' }}>
            <i className="ph ph-prohibit" />
          </button>
          <span className={trustTagClass(TRUST_LABELS.find(t => t.label === vendor.label)?.tone)}>{vendor.label}</span>
          <button className="btn btn-sm" onClick={() => setShowEmail(s => !s)}><i className="ph ph-envelope" /> Draft email</button>
          <button className="btn btn-primary" onClick={() => setShowRequest(s => !s)}><i className="ph ph-file-text" /> Request a quote</button>
        </div>
      </div>

      <div className="content">
        {vendor.blocked && (
          <div className="alert" style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
            <i className="ph ph-prohibit" style={{ marginTop: 1 }} />
            This vendor is blocked and won't appear in your main vendor list or search results.
          </div>
        )}

        <div className="card-raised" style={{ marginBottom: 20, padding: '20px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 6 }}>Price range</div>
            <input
              className="form-input"
              style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--c-vendors)', border: 'none', background: 'transparent', padding: 0, minWidth: 260 }}
              placeholder="Add a price range, e.g. $8-$12/unit"
              value={priceDraft === null ? (vendor.price_range || '') : priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onBlur={() => priceDraft !== null && priceDraft.trim() !== (vendor.price_range || '') && savePriceRange()}
            />
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label" style={{ marginBottom: 6 }}>Onboarding</div>
              <select
                className="form-select"
                value={vendor.onboarding_stage || 'prospect'}
                onChange={e => updateVendor(vendor.id, { onboarding_stage: e.target.value }).catch(err => alert('Could not update vendor: ' + err.message))}
              >
                {ONBOARDING_STAGES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Verification</div>
              {vendor.verified ? (
                <>
                  <button className="btn btn-sm" onClick={unmarkVerified} style={{ color: 'var(--green)' }}>
                    <i className="ph-fill ph-seal-check" /> Verified by you
                  </button>
                  {vendor.verified_notes && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6, maxWidth: 220 }}>{vendor.verified_notes}</div>}
                </>
              ) : verifying ? (
                <div style={{ maxWidth: 240 }}>
                  <textarea
                    className="form-textarea" style={{ minHeight: 50, fontSize: 12.5, marginBottom: 6 }}
                    placeholder="What did you verify? (business registration, factory visit, referral...)"
                    value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-primary" onClick={confirmVerified}>Confirm</button>
                    <button className="btn btn-sm" onClick={() => setVerifying(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-sm" onClick={() => setVerifying(true)}><i className="ph ph-seal-check" /> Mark as verified</button>
              )}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: -12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ph ph-info" /> Verification is a manual judgment you make yourself — Atelier never marks a vendor verified automatically.
        </div>

        <div className="stats-row">
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Rating</div>
            <div className="stat-value">{vendor.rating ? `${vendor.rating}★` : '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">MOQ</div>
            <div className="stat-value">{vendor.moq ?? '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Lead time</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{vendor.lead_time || '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Quotes exchanged</div>
            <div className="stat-value">{vendorQuotes.length}</div>
          </div>
        </div>

        <div className="card-raised" style={{ marginBottom: 24 }}>
          <div className="corner-fold" style={{ '--fold-color': 'var(--c-finalcheck)' }} />
          <div className="card-header"><span className="card-title">AI fit &amp; profitability</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: fitResult ? 18 : 0 }}>
              <div className="form-group" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
                <label className="form-label">Assess fit for which product?</label>
                <select className="form-select" value={fitProduct} onChange={e => selectFitProduct(e.target.value)}>
                  <option value="" disabled>Choose a product</option>
                  {techPackProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                <label className="form-label">Budget for this product</label>
                <input
                  className="form-input" type="number" placeholder="e.g. 18500"
                  value={fitBudget} onChange={e => setFitBudget(e.target.value)}
                  disabled={!fitProduct}
                />
              </div>
              <button className="btn btn-primary" onClick={analyzeFit} disabled={analyzingFit || !fitProduct}>
                {analyzingFit ? <><i className="ph ph-circle-notch" /> Analyzing…</> : <><i className="ph ph-magic-wand" /> Analyze fit</>}
                {!analyzingFit && <CreditCost feature="analyze-vendor-fit" style={{ marginLeft: 6, color: 'inherit', opacity: 0.8 }} />}
              </button>
            </div>
            {fitProduct && !fitBudget && <div className="form-hint" style={{ marginTop: 8, color: 'var(--amber)' }}>No budget set — the analysis will have nothing to compare cost against. Worth entering one.</div>}
            {techPackProducts.length === 0 && <div className="form-hint" style={{ marginTop: 8 }}>No products have a tech pack yet — convert a design first.</div>}
            {fitError && <div className="form-hint" style={{ color: 'var(--red)', marginTop: 8 }}>{fitError}</div>}

            {fitResult && (
              <div className="enter">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: fitResult.score >= 80 ? 'var(--green)' : fitResult.score >= 55 ? 'var(--amber)' : 'var(--red)' }}>
                    {fitResult.score}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    Fit &amp; profitability estimate<br />based on category match, MOQ-vs-budget economics, and risk tolerance
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {fitResult.notes.map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 8, background: `var(--${n.severity}-bg)`, border: `1px solid var(--${n.severity}-border)`, color: `var(--${n.severity})`, fontSize: 13.5 }}>
                      <i className={`ph ${SEVERITY_ICON[n.severity]}`} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{n.text}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ph ph-warning" /> AI-generated estimate, not a verified judgment — it can be wrong, especially with limited vendor data. Treat as a starting point.
                </div>
              </div>
            )}
          </div>
        </div>

        {showEmail && (
          <div className="card-raised enter" style={{ marginBottom: 24 }}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-vendors)' }} />
            <div className="card-header"><span className="card-title">Draft an email</span></div>
            <div className="card-body">
              {!draft ? (
                <>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">What do you want to say or ask?</label>
                    <textarea className="form-textarea" placeholder="e.g. Introduce the brand and ask if they can do a 300-unit run of heavyweight fleece hoodies" value={emailAsk} onChange={e => setEmailAsk(e.target.value)} />
                    <div className="form-hint">Uses whatever quantity / target cost / deadline you've entered in the quote form above, if any. AI-written — review before sending.</div>
                  </div>
                  {draftError && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 12 }}>{draftError}</div>}
                  <button className="btn btn-primary" onClick={draftEmail} disabled={drafting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span><i className="ph ph-magic-wand" /> {drafting ? 'Drafting…' : 'Draft with AI'}</span>
                    {!drafting && <CreditCost feature="draft-vendor-email" style={{ color: 'inherit', opacity: 0.8 }} />}
                  </button>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <input className="form-input" value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Body</label>
                    <textarea className="form-textarea" style={{ minHeight: 160 }} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={openInMailClient}><i className="ph ph-paper-plane-tilt" /> Open in email app</button>
                    <button className="btn btn-sm" onClick={() => setDraft(null)}>Start over</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showRequest && (
          <form className="card-raised enter" style={{ marginBottom: 24 }} onSubmit={handleSend}>
            <div className="corner-fold" style={{ '--fold-color': 'var(--c-vendors)' }} />
            <div className="card-header"><span className="card-title">Quote request</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Tech pack</label>
                <select className="form-select" value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setOverrideGate(false); }} required>
                  <option value="" disabled>Choose a tech pack</option>
                  {techPackProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.readiness}%)</option>)}
                </select>
                {techPackProducts.length === 0 && <div className="form-hint">No products have a tech pack yet — convert a design first.</div>}
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input className="form-input" placeholder="e.g. 300 units" value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Target unit cost</label>
                  <input className="form-input" placeholder="e.g. $18.00" value={targetCost} onChange={e => setTargetCost(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Deadline</label>
                  <input className="form-input" placeholder="e.g. Sept 15" value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Anything else the vendor should know</label>
                <textarea className="form-textarea" placeholder="Optional notes" value={message} onChange={e => setMessage(e.target.value)} />
              </div>
              
              <div style={{ marginTop: 8 }}>
                {belowThresholdForQuote && (
                  <div className="form-hint" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', marginBottom: 14 }}>
                    <i className="ph ph-lock-key" style={{ marginRight: 4 }} />
                    <strong>Hard Gate:</strong> {selectedProductObjForQuote.name} is only at {selectedProductObjForQuote.readiness}% factory readiness. A score of 80%+ is required to request a professional quote.
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontWeight: 500 }}>
                      <input type="checkbox" checked={overrideGate} onChange={e => setOverrideGate(e.target.checked)} />
                      I understand the risks and want to request a quote anyway
                    </label>
                  </div>
                )}
                <button className="btn btn-primary" type="submit" disabled={sending || !selectedProduct || isQuoteBlocked}>
                  <i className="ph ph-paper-plane-tilt" /> {sending ? 'Sending…' : overrideGate && belowThresholdForQuote ? 'Send Request Anyway' : 'Send request'}
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div>
            <div className="section-label">Specialties</div>
            <TagEditor values={vendor.specialties || []} onAdd={v => addTag('specialties', v)} onRemove={v => removeTag('specialties', v)} placeholder="Add a specialty" />
          </div>
          <div>
            <div className="section-label">Certifications</div>
            <TagEditor values={vendor.certifications || []} onAdd={v => addTag('certifications', v)} onRemove={v => removeTag('certifications', v)} placeholder="e.g. GOTS" tagClass="tag tag-green" />
          </div>
          <div>
            <div className="section-label">Capabilities</div>
            <TagEditor values={vendor.capabilities || []} onAdd={v => addTag('capabilities', v)} onRemove={v => removeTag('capabilities', v)} placeholder="e.g. in-house printing" tagClass="tag tag-blue" />
          </div>
        </div>

        <div className="section-label">Your notes</div>
        <textarea
          className="form-textarea" style={{ minHeight: 60, marginBottom: 28 }}
          placeholder="Private notes — quality preferences, past issues, anything worth remembering"
          value={notes === null ? (vendor.notes || '') : notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => notes !== null && notes !== (vendor.notes || '') && saveNotes()}
        />
        {savingNotes && <div className="form-hint" style={{ marginTop: -22, marginBottom: 28 }}>Saving…</div>}

        {pricePoints.length >= 2 && (
          <>
            <div className="section-label">Price over time</div>
            <div className="card-raised" style={{ marginBottom: 28, padding: 18 }}>
              <PriceHistoryChart points={pricePoints} />
            </div>
          </>
        )}

        <div className="section-label">Performance history</div>
        <div className="stats-row" style={{ marginBottom: vendorOrders.length ? 16 : 28 }}>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Quotes requested</div>
            <div className="stat-value">{vendorQuotes.length}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Quotes accepted</div>
            <div className="stat-value">{acceptedQuotes}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Acceptance rate</div>
            <div className="stat-value">{vendorQuotes.length ? `${Math.round((acceptedQuotes / vendorQuotes.length) * 100)}%` : '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Production orders</div>
            <div className="stat-value">{vendorOrders.length}</div>
          </div>
        </div>
        {vendorOrders.length > 0 && (
          <div className="card" style={{ marginBottom: 28 }}>
            {vendorOrders.map(o => (
              <div className="list-row" key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/production/${o.id}`)}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o.products?.name || 'Deleted product'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{o.po_number} · {o.units || '—'} units</div>
                </div>
                <span className={`tag ${ORDER_STAGE_TAG[o.stage] || 'tag-neutral'}`}>{o.stage}</span>
              </div>
            ))}
          </div>
        )}

        <div className="section-label">Quote history</div>
        {vendorQuotes.length ? (
          <div className="card">
            {vendorQuotes.map(q => (
              <div className="list-row" key={q.id}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{q.products?.name || 'Unknown product'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    Requested {new Date(q.requested_at).toLocaleDateString()}
                    {q.preferences?.quantity && ` · ${q.preferences.quantity}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {q.amount && <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>${Number(q.amount).toFixed(2)}/unit</span>}
                  <span className={q.status === 'Accepted' ? 'tag tag-green' : q.status === 'Declined' ? 'tag tag-red' : q.status === 'Received' ? 'tag tag-blue' : 'tag tag-neutral'}>{q.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon="ph-file-text" color="var(--c-vendors)" title="No quotes yet" sub="Requested and received quotes with this vendor will show up here." />}

        <div style={{ marginTop: 24 }}>
          <CommentsPanel brandId={activeBrand?.id} entityType="vendor" entityId={id} />
        </div>
      </div>
    </>
  );
}