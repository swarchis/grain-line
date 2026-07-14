import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { supabase } from '../lib/supabase.js';
import EmptyState from '../components/EmptyState.jsx';
import CostBreakdownWheel from '../components/CostBreakdownWheel.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const STATUS_TAG = q => (q === 'Accepted' ? 'tag tag-green' : q === 'Declined' ? 'tag tag-red' : q === 'Received' ? 'tag tag-blue' : 'tag tag-neutral');

// Fixed lever list mirrored from api/index.js's COST_LEVERS — kept in sync
// manually since it's just display metadata (id/label/hint/options); the $
// deltas themselves only ever come from the AI response, never invented here.
// GSM is a "choice" lever (several mutually-exclusive fabric weights, each
// with its own estimated delta) rather than a single on/off toggle, since
// "increase the GSM" isn't one change — which weight you land on matters.
const LEVERS = [
  {
    id: 'gsm', label: 'Fabric weight (GSM)', type: 'choice',
    options: [
      { id: 'gsm-220', label: '~220 GSM (lightweight)' },
      { id: 'gsm-320', label: '~320 GSM (midweight)' },
      { id: 'gsm-380', label: '~380 GSM (standard heavyweight)' },
      { id: 'gsm-450', label: '~450 GSM (heavy)' },
      { id: 'gsm-550', label: '~550 GSM (heaviest)' },
    ],
  },
  { id: 'add-embroidery', label: 'Add embroidery or a printed detail', type: 'toggle', hint: 'one placement, standard size' },
  { id: 'organic-cotton', label: 'Switch to organic/premium cotton', type: 'toggle', hint: 'vs. standard cotton blend' },
  { id: 'move-region', label: 'Move production to a higher-cost region', type: 'toggle', hint: 'e.g. Portugal/EU instead of current sourcing' },
  { id: 'smaller-moq', label: 'Cut order quantity to a smaller MOQ tier', type: 'toggle', hint: 'per-unit cost typically rises' },
  { id: 'premium-trim', label: 'Add a premium trim (woven label, metal hardware)', type: 'toggle', hint: '' },
];

const WHEEL_COLORS = { fabric: 'var(--c-materials)', labor: 'var(--c-techpack)', shipping: 'var(--c-analytics)', packaging: 'var(--c-organization)', profit: 'var(--accent)' };

function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 36, height: 21, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        background: on ? 'var(--accent)' : 'var(--bg-3)', transition: 'background 0.15s',
      }}
    >
      <span style={{ position: 'absolute', top: 2.5, left: on ? 17 : 2.5, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { quotes, vendors, updateQuote, negotiationsByQuote, loadNegotiations, addNegotiation } = useVendors();
  const { products } = useProducts();
  const { canUse: canUseAI, remaining: aiRemaining, logUsage } = useAIUsage();

  const quote = quotes.find(q => q.id === id);
  const vendor = vendors.find(v => v.id === quote?.vendor_id);
  const product = products.find(p => p.id === quote?.product_id);
  const negotiations = negotiationsByQuote[id] || [];

  const [bom, setBom] = useState([]);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const [negDirection, setNegDirection] = useState('counter');
  const [negAmount, setNegAmount] = useState('');
  const [negNote, setNegNote] = useState('');
  const [negSaving, setNegSaving] = useState(false);

  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState(null);
  const [economics, setEconomics] = useState(null); // { breakdown, shippingEstimatePerUnit, shippingNote, dutyRatePercent, dutyNote }

  const [landedInputs, setLandedInputs] = useState(null); // null = use quote.landed_cost_inputs

  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);
  const [levers, setLevers] = useState(null); // { toggles: [{id, deltaPerUnit, note}], choices: [{id, options: [{id, deltaPerUnit, note}]}] }
  const [activeLevers, setActiveLevers] = useState([]);
  const [selectedChoices, setSelectedChoices] = useState({}); // { [choiceLeverId]: selectedOptionId }

  useEffect(() => {
    if (!id) return;
    loadNegotiations(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function loadBom() {
      if (!quote?.product_id) { setBom([]); return; }
      const { data } = await supabase.from('tech_packs').select('bom').eq('product_id', quote.product_id).single();
      setBom(data?.bom || []);
    }
    loadBom();
  }, [quote?.product_id]);

  useEffect(() => {
    if (quote?.cost_breakdown && Object.keys(quote.cost_breakdown).length) {
      setEconomics({ breakdown: quote.cost_breakdown, shippingEstimatePerUnit: quote.cost_breakdown.shippingEstimatePerUnit, shippingNote: quote.cost_breakdown.shippingNote, dutyRatePercent: quote.cost_breakdown.dutyRatePercent, dutyNote: quote.cost_breakdown.dutyNote });
    }
    if (quote?.cost_simulator && (quote.cost_simulator.toggles?.length || quote.cost_simulator.choices?.length)) setLevers(quote.cost_simulator);
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = landedInputs || quote?.landed_cost_inputs || {};
  const shippingPerUnit = Number(inputs.shippingPerUnit || 0);
  const dutyRatePercent = Number(inputs.dutyRatePercent || 0);
  const otherFeesPerUnit = Number(inputs.otherFeesPerUnit || 0);
  const baseUnitCost = quote?.amount != null ? Number(quote.amount) : 0;
  const dutyPerUnit = baseUnitCost * (dutyRatePercent / 100);
  const landedUnitCost = baseUnitCost + shippingPerUnit + dutyPerUnit + otherFeesPerUnit;

  const simulatedDelta = useMemo(() => {
    if (!levers) return 0;
    const toggleSum = activeLevers.reduce((sum, leverId) => {
      const l = (levers.toggles || []).find(x => x.id === leverId);
      return sum + (l ? Number(l.deltaPerUnit) || 0 : 0);
    }, 0);
    const choiceSum = Object.entries(selectedChoices).reduce((sum, [leverId, optionId]) => {
      const choiceLever = (levers.choices || []).find(c => c.id === leverId);
      const opt = choiceLever?.options?.find(o => o.id === optionId);
      return sum + (opt ? Number(opt.deltaPerUnit) || 0 : 0);
    }, 0);
    return toggleSum + choiceSum;
  }, [levers, activeLevers, selectedChoices]);

  if (!quote) {
    return <div className="content"><EmptyState icon="ph-file-text" title="Quote not found" sub="This quote doesn't exist yet." /></div>;
  }

  const saveInputs = async (next) => {
    setLandedInputs(next);
    try { await updateQuote(quote.id, { landed_cost_inputs: next }); } catch (err) { alert('Could not save: ' + err.message); }
  };

  const markReceived = async () => {
    if (!receivedAmount) return;
    setBusy(true);
    try { await updateQuote(quote.id, { status: 'Received', amount: parseFloat(receivedAmount) }); } catch (err) { alert('Could not update quote: ' + err.message); } finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try { await updateQuote(quote.id, { status }); } catch (err) { alert('Could not update quote: ' + err.message); } finally { setBusy(false); }
  };

  const submitNegotiation = async e => {
    e.preventDefault();
    if (!negAmount && !negNote.trim()) return;
    setNegSaving(true);
    try {
      await addNegotiation(quote.id, { direction: negDirection, amount: negAmount || null, note: negNote.trim() || null });
      setNegAmount(''); setNegNote('');
    } catch (err) {
      alert('Could not log that: ' + err.message);
    } finally {
      setNegSaving(false);
    }
  };

  const runCostBreakdown = async () => {
    if (!canUseAI) { setBreakdownError('AI cost estimates need an available plan — upgrade in Settings > Billing.'); return; }
    if (quote.amount == null) { setBreakdownError('This quote needs an amount first — mark it received with a $/unit price.'); return; }
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const res = await fetch(`${API_BASE}/api/quote-economics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, product, quote, bom }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('quote-cost-breakdown');
      const cached = { ...data.breakdown, shippingEstimatePerUnit: data.shippingEstimatePerUnit, shippingNote: data.shippingNote, dutyRatePercent: data.dutyRatePercent, dutyNote: data.dutyNote };
      setEconomics({ breakdown: data.breakdown, shippingEstimatePerUnit: data.shippingEstimatePerUnit, shippingNote: data.shippingNote, dutyRatePercent: data.dutyRatePercent, dutyNote: data.dutyNote });
      await updateQuote(quote.id, { cost_breakdown: cached });
      if (!inputs.shippingPerUnit && !inputs.dutyRatePercent) {
        await saveInputs({ ...inputs, shippingPerUnit: data.shippingEstimatePerUnit ?? inputs.shippingPerUnit, dutyRatePercent: data.dutyRatePercent ?? inputs.dutyRatePercent });
      }
    } catch (err) {
      setBreakdownError(err.message || 'Could not estimate cost breakdown.');
    } finally {
      setBreakdownLoading(false);
    }
  };

  const runCostSimulator = async () => {
    if (!canUseAI) { setSimError('AI cost estimates need an available plan — upgrade in Settings > Billing.'); return; }
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cost-simulator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, product, quote, bom }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('quote-cost-simulator');
      const cached = { toggles: data.levers, choices: data.choiceLevers };
      setLevers(cached);
      await updateQuote(quote.id, { cost_simulator: cached });
    } catch (err) {
      setSimError(err.message || 'Could not run the cost simulator.');
    } finally {
      setSimLoading(false);
    }
  };

  const toggleLever = leverId => setActiveLevers(prev => (prev.includes(leverId) ? prev.filter(x => x !== leverId) : [...prev, leverId]));
  const selectChoice = (leverId, optionId) => setSelectedChoices(prev => ({ ...prev, [leverId]: optionId }));
  const clearChoice = leverId => setSelectedChoices(prev => { const next = { ...prev }; delete next[leverId]; return next; });

  const wheelSegments = economics ? [
    { label: 'Fabric', percent: economics.breakdown.fabricPercent, color: WHEEL_COLORS.fabric },
    { label: 'Labor', percent: economics.breakdown.laborPercent, color: WHEEL_COLORS.labor },
    { label: 'Shipping', percent: economics.breakdown.shippingPercent, color: WHEEL_COLORS.shipping },
    { label: 'Packaging', percent: economics.breakdown.packagingPercent, color: WHEEL_COLORS.packaging },
    { label: 'Profit', percent: economics.breakdown.profitPercent, color: WHEEL_COLORS.profit },
  ] : [];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-vendors)' }}>
              <span style={{ cursor: 'pointer' }} onClick={() => navigate('/quotes')}><i className="ph ph-arrow-left" /> Quotes</span>
            </div>
            <h1 className="page-title">{product?.name || 'Unknown product'}</h1>
          </div>
          <div className="page-sub">
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => vendor && navigate(`/vendors/${vendor.id}`)}>{vendor?.name || 'Unknown vendor'}</span>
            {' '}· requested {new Date(quote.requested_at).toLocaleDateString()}
          </div>
        </div>
        <div className="topbar-right">
          <span className={STATUS_TAG(quote.status)} style={{ fontSize: 13 }}>{quote.status}</span>
          {quote.status === 'Received' && (
            <>
              <button className="btn btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => setStatus('Declined')}>Decline</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('Accepted')}><i className="ph ph-check-circle" /> Accept quote</button>
            </>
          )}
        </div>
      </div>

      <div className="content">
        {quote.status === 'Requested' && (
          <div className="card-raised" style={{ marginBottom: 24, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <i className="ph ph-hourglass" style={{ color: 'var(--ink-3)' }} />
            <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>Waiting on this vendor — once they've quoted a price, mark it received.</span>
            <input className="form-input" style={{ width: 110, padding: '7px 10px', fontSize: 12.5 }} type="number" step="0.01" placeholder="$/unit" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} />
            <button className="btn btn-sm btn-primary" disabled={busy || !receivedAmount} onClick={markReceived}>Mark received</button>
          </div>
        )}

        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Quoted price</div>
            <div className="stat-value">{quote.amount != null ? `$${Number(quote.amount).toFixed(2)}` : '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Quantity</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{quote.preferences?.quantity || '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Target unit cost</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{quote.preferences?.targetUnitCost ? `$${quote.preferences.targetUnitCost}` : '—'}</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
            <div className="stat-label">Deadline</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{quote.preferences?.deadline || '—'}</div>
          </div>
        </div>

        {/* ── Negotiation log ─────────────────────────────────────────── */}
        <div className="card-raised" style={{ marginBottom: 24 }}>
          <div className="card-header"><span className="card-title">Negotiation</span></div>
          <div className="card-body">
            <div className="form-hint" style={{ marginBottom: 16 }}>
              Vendors aren't on Atelier, so this is your own running record of counter-offers and what they came back with — not a live chat.
            </div>
            {negotiations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {negotiations.map(n => (
                  <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: n.direction === 'counter' ? 'var(--accent-bg)' : 'var(--bg-3)' }}>
                    <i className={`ph ${n.direction === 'counter' ? 'ph-arrow-up-right' : 'ph-arrow-down-left'}`} style={{ marginTop: 2, color: n.direction === 'counter' ? 'var(--accent)' : 'var(--ink-3)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                        {n.direction === 'counter' ? 'You countered' : 'Vendor responded'}
                        {n.amount != null && <span style={{ fontFamily: 'var(--mono)', marginLeft: 8 }}>${Number(n.amount).toFixed(2)}/unit</span>}
                      </div>
                      {n.note && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3 }}>{n.note}</div>}
                      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={submitNegotiation} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
                <label className="form-label">Entry type</label>
                <select className="form-select" value={negDirection} onChange={e => setNegDirection(e.target.value)}>
                  <option value="counter">Your counter-offer</option>
                  <option value="response">Vendor's response</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
                <label className="form-label">$/unit</label>
                <input className="form-input" type="number" step="0.01" value={negAmount} onChange={e => setNegAmount(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label className="form-label">Note</label>
                <input className="form-input" placeholder="e.g. Asked for $1 off at 500+ units" value={negNote} onChange={e => setNegNote(e.target.value)} />
              </div>
              <button className="btn btn-sm btn-primary" type="submit" disabled={negSaving || (!negAmount && !negNote.trim())}>
                {negSaving ? 'Logging…' : 'Log it'}
              </button>
            </form>
          </div>
        </div>

        {/* ── Cost breakdown wheel ────────────────────────────────────── */}
        <div className="card-raised" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Cost breakdown</span>
            <button className="btn btn-sm" onClick={runCostBreakdown} disabled={breakdownLoading || !canUseAI}>
              {breakdownLoading ? <><i className="ph ph-spinner ph-spin" /> Estimating…</> : !canUseAI ? <><i className="ph ph-lock-simple" /> Upgrade</> : <><i className="ph ph-magic-wand" /> {economics ? 'Re-estimate' : 'Estimate breakdown'}</>}
            </button>
          </div>
          <div className="card-body">
            {breakdownError && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 12 }}>{breakdownError}</div>}
            {economics ? (
              <>
                <CostBreakdownWheel segments={wheelSegments} totalAmount={quote.amount} />
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 16, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ph ph-warning" /> Fabric is real (from your tech pack's BOM). Labor, shipping, packaging, and profit are AI estimates of a typical split — not verified vendor accounting.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>Founders immediately see where the money goes — run an estimate once this quote has a price.</div>
            )}
          </div>
        </div>

        <div className="grid-2" style={{ gap: 18, marginBottom: 24, alignItems: 'stretch' }}>
          {/* ── Landed cost calculator ──────────────────────────────── */}
          <div className="card-raised">
            <div className="card-header"><span className="card-title">Landed cost calculator</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Shipping per unit ($)</label>
                <input className="form-input" type="number" step="0.01" value={inputs.shippingPerUnit ?? ''} onChange={e => saveInputs({ ...inputs, shippingPerUnit: e.target.value })} />
                {economics?.shippingNote && <div className="form-hint">{economics.shippingNote}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Duty / tariff rate (%)</label>
                <input className="form-input" type="number" step="0.1" value={inputs.dutyRatePercent ?? ''} onChange={e => saveInputs({ ...inputs, dutyRatePercent: e.target.value })} />
                {economics?.dutyNote && <div className="form-hint">{economics.dutyNote}</div>}
              </div>
              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="form-label">Other fees per unit ($)</label>
                <input className="form-input" type="number" step="0.01" placeholder="Customs broker, handling, etc." value={inputs.otherFeesPerUnit ?? ''} onChange={e => saveInputs({ ...inputs, otherFeesPerUnit: e.target.value })} />
              </div>
              <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}><span>Quoted unit price</span><span>${baseUnitCost.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}><span>+ Shipping</span><span>${shippingPerUnit.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}><span>+ Duty ({dutyRatePercent || 0}%)</span><span>${dutyPerUnit.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 }}><span>+ Other fees</span><span>${otherFeesPerUnit.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                <span>Landed unit cost</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--c-vendors)' }}>${landedUnitCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ── AI Cost Simulator ───────────────────────────────────── */}
          <div className="card-raised">
            <div className="card-header">
              <span className="card-title">AI cost simulator</span>
              <button className="btn btn-sm" onClick={runCostSimulator} disabled={simLoading || !canUseAI}>
                {simLoading ? <><i className="ph ph-spinner ph-spin" /> Estimating…</> : !canUseAI ? <><i className="ph ph-lock-simple" /> Upgrade</> : <><i className="ph ph-magic-wand" /> {levers ? 'Re-estimate' : 'Run simulator'}</>}
              </button>
            </div>
            <div className="card-body">
              {simError && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 12 }}>{simError}</div>}
              {!levers ? (
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>Move switches like configuring a car — see the estimated cost of common changes before you ask the vendor.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                    {LEVERS.map(lever => {
                      if (lever.type === 'choice') {
                        const choiceData = (levers.choices || []).find(c => c.id === lever.id);
                        const selected = selectedChoices[lever.id];
                        return (
                          <div key={lever.id}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>{lever.label}</div>
                            <div className="pill-group" style={{ flexWrap: 'wrap', rowGap: 6 }}>
                              <button type="button" className={`pill ${!selected ? 'active' : ''}`} onClick={() => clearChoice(lever.id)}>Current</button>
                              {lever.options.map(opt => {
                                const est = choiceData?.options?.find(o => o.id === opt.id);
                                return (
                                  <button
                                    type="button" key={opt.id}
                                    className={`pill ${selected === opt.id ? 'active' : ''}`}
                                    onClick={() => selectChoice(lever.id, opt.id)}
                                    title={est?.note || ''}
                                  >
                                    {opt.label}{est ? ` (${est.deltaPerUnit > 0 ? '+' : ''}$${Number(est.deltaPerUnit).toFixed(2)})` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      const est = (levers.toggles || []).find(l => l.id === lever.id);
                      const on = activeLevers.includes(lever.id);
                      return (
                        <div key={lever.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <Toggle on={on} onToggle={() => toggleLever(lever.id)} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{lever.label}</div>
                            {lever.hint && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{lever.hint}</div>}
                            {est?.note && <div style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>{est.note}</div>}
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: (est?.deltaPerUnit || 0) > 0 ? 'var(--red)' : (est?.deltaPerUnit || 0) < 0 ? 'var(--green)' : 'var(--ink-3)' }}>
                            {est ? `${est.deltaPerUnit > 0 ? '+' : ''}$${Number(est.deltaPerUnit).toFixed(2)}` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                    <span>Estimated new unit price</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--c-vendors)' }}>${(baseUnitCost + simulatedDelta).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ph ph-warning" /> AI-estimated deltas for one change at a time — combined effects can differ. Confirm with the vendor before committing.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {canUseAI && (economics || levers) && (
          <div style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'right', marginTop: -14 }}>{aiRemaining} AI estimates left this month</div>
        )}
      </div>
    </>
  );
}
