import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { supabase } from '../lib/supabase.js';
import { trustTagClass } from '../lib/format.js';
import { TRUST_LABELS } from './VendorDiscovery.jsx';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';
import EmptyState from '../components/EmptyState.jsx';

const TECHPACK_STAGES = ['techpack', 'sourcing', 'sampling', 'production', 'launched'];
const SEVERITY_ICON = { amber: 'ph-warning', blue: 'ph-info', green: 'ph-check-circle', red: 'ph-x-circle' };

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vendors, quotes, requestQuote, updateVendor, toggleFavorite, toggleBlock } = useVendors();
  const { products, activeBrand, updateProduct } = useProducts();

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

  const [notes, setNotes] = useState(null); // null = not yet edited this session
  const [savingNotes, setSavingNotes] = useState(false);

  const [showEmail, setShowEmail] = useState(false);
  const [emailAsk, setEmailAsk] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState(null);

  const vendor = vendors.find(v => v.id === id);
  const vendorQuotes = quotes.filter(q => q.vendor_id === id);
  const techPackProducts = products.filter(p => TECHPACK_STAGES.includes(p.stage));
  const pricePoints = vendorQuotes.filter(q => q.amount != null).map(q => ({ date: q.requested_at, amount: Number(q.amount) }));

  if (!vendor) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Vendor not found" sub="This vendor profile doesn't exist yet." /></div>;
  }

  const handleSend = async e => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSending(true);
    try {
      const preferences = {};
      if (quantity) preferences.quantity = quantity;
      if (targetCost) preferences.targetUnitCost = targetCost;
      if (deadline) preferences.deadline = deadline;
      await requestQuote({ vendorId: vendor.id, productId: selectedProduct, message, preferences });
      setShowRequest(false);
      setSelectedProduct(''); setQuantity(''); setTargetCost(''); setDeadline(''); setMessage('');
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

  const handleBlock = async () => {
    try {
      await toggleBlock(vendor);
      if (!vendor.blocked) navigate('/vendors');
    } catch (err) {
      alert('Could not update vendor: ' + err.message);
    }
  };

  const draftEmail = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const selectedProductObj = products.find(p => p.id === selectedProduct);
      const res = await fetch('http://localhost:3001/api/draft-vendor-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: vendor.name,
          productName: selectedProductObj?.name,
          garmentType: selectedProductObj?.category,
          preferences: { quantity, targetUnitCost: targetCost, deadline },
          ask: emailAsk,
        }),
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
    setAnalyzingFit(true);
    setFitError(null);
    try {
      const budgetValue = fitBudget ? Number(fitBudget) : 0;
      let productObj = products.find(p => p.id === fitProduct);

      // Persist the budget back to the product if it changed — this is the only
      // place in the app a founder can actually set it, so it shouldn't vanish
      // after this one analysis.
      if (productObj && budgetValue !== productObj.budget) {
        productObj = await updateProduct(fitProduct, { budget: budgetValue });
      }

      // Materials matter a lot for whether a vendor can actually make this —
      // pull the tech pack's BOM in directly rather than just the product category.
      const { data: techPack } = await supabase
        .from('tech_packs')
        .select('bom')
        .eq('product_id', fitProduct)
        .single();

      const productQuotes = vendorQuotes
        .filter(q => q.product_id === fitProduct)
        .map(q => ({ status: q.status, amount: q.amount, preferences: q.preferences }));

      const res = await fetch('http://localhost:3001/api/analyze-vendor-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor,
          product: { ...productObj, budget: budgetValue },
          brand: activeBrand,
          quoteHistory: productQuotes,
          bom: techPack?.bom || [],
        }),
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
                  <button className="btn btn-primary" onClick={draftEmail} disabled={drafting}>
                    <i className="ph ph-magic-wand" /> {drafting ? 'Drafting…' : 'Draft with AI'}
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
                <select className="form-select" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} required>
                  <option value="" disabled>Choose a tech pack</option>
                  {techPackProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              <button className="btn btn-primary" type="submit" disabled={sending || !selectedProduct}>
                <i className="ph ph-paper-plane-tilt" /> {sending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}

        <div className="grid-2" style={{ marginBottom: 28 }}>
          <div>
            <div className="section-label">Specialties</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(vendor.specialties || []).length
                ? vendor.specialties.map(s => <span key={s} className="tag tag-neutral">{s}</span>)
                : <span style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>None added yet</span>}
            </div>
          </div>
          <div>
            <div className="section-label">Your notes</div>
            <textarea
              className="form-textarea" style={{ minHeight: 60 }}
              placeholder="Private notes — quality preferences, past issues, anything worth remembering"
              value={notes === null ? (vendor.notes || '') : notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => notes !== null && notes !== (vendor.notes || '') && saveNotes()}
            />
            {savingNotes && <div className="form-hint">Saving…</div>}
          </div>
        </div>

        {pricePoints.length >= 2 && (
          <>
            <div className="section-label">Price over time</div>
            <div className="card-raised" style={{ marginBottom: 28, padding: 18 }}>
              <PriceHistoryChart points={pricePoints} />
            </div>
          </>
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
      </div>
    </>
  );
}
