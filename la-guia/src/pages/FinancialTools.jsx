import React, { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../context/ProductsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { useSales } from '../context/SalesContext.jsx';
import { supabase } from '../lib/supabase.js';
import { currency, percent } from '../lib/format.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import RevenueChart from '../components/RevenueChart.jsx';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';

const TABS = [
  { key: 'cost', label: 'Cost & Profit', icon: 'ph-calculator' },
  { key: 'breakeven', label: 'Break-Even & Pricing', icon: 'ph-target' },
  { key: 'moq', label: 'MOQ Optimization', icon: 'ph-stack' },
  { key: 'cashflow', label: 'Cash Flow & Forecast', icon: 'ph-chart-line-up' },
  { key: 'history', label: 'Manufacturing Cost History', icon: 'ph-clock-counter-clockwise' },
];

const num = v => parseFloat(v) || 0;
const monthKey = d => new Date(d).toISOString().slice(0, 7);
const monthLabel = key => new Date(key + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

export default function FinancialTools() {
  const { products } = useProducts();
  const { orders, allPayments } = useProduction();
  const { monthlySales } = useSales();

  const [tab, setTab] = useState('cost');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [bomCost, setBomCost] = useState(0);
  const [bomLoading, setBomLoading] = useState(false);

  const [costForm, setCostForm] = useState({ cmtCost: '', shippingCost: '', retailPrice: '', wholesalePrice: '' });
  const [fixedCosts, setFixedCosts] = useState('');
  const [targetMargin, setTargetMargin] = useState('65');

  const selectedProduct = products.find(p => p.id === selectedProductId) || null;

  // Load real BOM cost + prefill the scratch form from the product's saved
  // financial model when a product is picked — still editable, still
  // freeform, this page never writes back (that's ProductInsights' job).
  useEffect(() => {
    if (!selectedProductId) { setBomCost(0); return; }
    setBomLoading(true);
    supabase.from('tech_packs').select('bom').eq('product_id', selectedProductId).single()
      .then(({ data }) => {
        const total = (data?.bom || []).reduce((sum, item) => sum + ((parseFloat(item.qtyPerUnit) || 0) * (parseFloat(item.unitCost) || 0)), 0);
        setBomCost(total);
      })
      .finally(() => setBomLoading(false));

    if (selectedProduct?.financials) {
      setCostForm({
        cmtCost: selectedProduct.financials.cmtCost || '',
        shippingCost: selectedProduct.financials.shippingCost || '',
        retailPrice: selectedProduct.financials.retailPrice || '',
        wholesalePrice: selectedProduct.financials.wholesalePrice || '',
      });
      setFixedCosts(selectedProduct.financials.fixedCosts || '');
    } else {
      setCostForm({ cmtCost: '', shippingCost: '', retailPrice: '', wholesalePrice: '' });
      setFixedCosts('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  const landedCost = bomCost + num(costForm.cmtCost) + num(costForm.shippingCost);
  const retailProfit = num(costForm.retailPrice) - landedCost;
  const retailMargin = num(costForm.retailPrice) > 0 ? (retailProfit / num(costForm.retailPrice)) * 100 : 0;
  const wholesaleProfit = num(costForm.wholesalePrice) - landedCost;
  const wholesaleMargin = num(costForm.wholesalePrice) > 0 ? (wholesaleProfit / num(costForm.wholesalePrice)) * 100 : 0;

  // Real spend for the selected product, from the brand-wide payment ledger
  // (allPayments already carries production_orders.product_id via its join).
  const productPayments = useMemo(
    () => (allPayments || []).filter(p => p.production_orders?.product_id === selectedProductId),
    [allPayments, selectedProductId]
  );
  const actualProductionSpend = productPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalCostToRecover = actualProductionSpend + num(fixedCosts);
  const breakEvenUnits = retailProfit > 0 ? Math.ceil(totalCostToRecover / retailProfit) : 0;

  const targetMarginSuggestedRetail = num(targetMargin) < 100 && num(targetMargin) > 0 ? landedCost / (1 - num(targetMargin) / 100) : 0;

  const f = (k, v) => setCostForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-analytics)' }}>Financial Tools</div>
            <h1 className="page-title">Cost, Pricing & Cash Flow</h1>
          </div>
          <div className="page-sub">Deterministic math over your real product, production and sales data — nothing here is AI-estimated.</div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-analytics)" />

      <div className="content">
        {(tab === 'cost' || tab === 'breakeven') && (
          <div className="card" style={{ marginBottom: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Product</label>
            <select className="form-select" style={{ maxWidth: 320 }} value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
              <option value="">Freeform — no product selected</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedProductId && <span className="form-hint" style={{ margin: 0 }}>BOM, spend and margin pull from {selectedProduct?.name}'s real data.</span>}
          </div>
        )}

        {tab === 'cost' && (
          <>
            <div className="stats-row">
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Landed Cost / Unit</div>
                <div className="stat-value">{bomLoading ? '…' : currency(landedCost)}</div>
                <div className="stat-delta delta-muted">BOM + CMT + shipping</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--green)' }}>
                <div className="stat-label">Retail Margin</div>
                <div className="stat-value" style={{ color: retailMargin >= 60 ? 'var(--green)' : retailMargin >= 40 ? 'var(--amber)' : 'var(--red)' }}>{percent(retailMargin)}</div>
                <div className="stat-delta delta-muted">Industry standard is 60-70%</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Retail Profit / Unit</div>
                <div className="stat-value" style={{ color: retailProfit > 0 ? 'var(--green)' : 'var(--red)' }}>{currency(retailProfit)}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-design)' }}>
                <div className="stat-label">Wholesale Margin</div>
                <div className="stat-value">{percent(wholesaleMargin)}</div>
                <div className="stat-delta delta-muted">{currency(wholesaleProfit)} profit / unit</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Variable Costs (Per Unit)</span></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Raw Materials (BOM)</label>
                    <div style={{ padding: '11px 13px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{currency(bomCost)}</div>
                    <div className="form-hint">{selectedProductId ? 'Auto-calculated from this product\'s Bill of Materials.' : 'Select a product above to pull a real BOM cost, or leave at $0 for a freeform estimate.'}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Factory Labor (Cut, Make, Trim)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={costForm.cmtCost} onChange={e => f('cmtCost', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Shipping, Duties & Misc</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={costForm.shippingCost} onChange={e => f('shippingCost', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-raised">
                <div className="card-header"><span className="card-title">Pricing Strategy</span></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Target Retail Price (D2C)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--c-analytics)' }} placeholder="0.00" value={costForm.retailPrice} onChange={e => f('retailPrice', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Target Wholesale Price</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={costForm.wholesalePrice} onChange={e => f('wholesalePrice', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'breakeven' && (
          <div className="grid-2">
            <div className="card-raised">
              <div className="card-header"><span className="card-title">Break-Even</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Actual Factory Payments</label>
                  <div style={{ padding: '11px 13px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', color: 'var(--c-materials)', fontWeight: 600 }}>{currency(actualProductionSpend)}</div>
                  <div className="form-hint">{selectedProductId ? 'From this product\'s real production payment ledger.' : 'Select a product to pull real spend, or model against $0.'}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Other Development Costs</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                    <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={fixedCosts} onChange={e => setFixedCosts(e.target.value)} />
                  </div>
                  <div className="form-hint">Patternmaking, photoshoots, marketing, etc.</div>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  <span>Total Cost to Recover</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{currency(totalCostToRecover)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                  <span>Break-Even Point</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--c-analytics)' }}>{retailProfit > 0 ? `${breakEvenUnits} units` : 'Set a retail price on the Cost & Profit tab'}</span>
                </div>
              </div>
            </div>

            <div className="card-raised">
              <div className="card-header"><span className="card-title">Pricing Suggestions</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Target Margin</label>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type="number" style={{ paddingRight: 24, fontFamily: 'var(--mono)' }} placeholder="65" value={targetMargin} onChange={e => setTargetMargin(e.target.value)} />
                    <span style={{ position: 'absolute', right: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>%</span>
                  </div>
                  <div className="form-hint">Against a landed cost of {currency(landedCost)}.</div>
                </div>
                <div style={{ padding: '11px 13px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 700, letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Suggested Retail Price</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--c-analytics)', marginTop: 4 }}>{targetMarginSuggestedRetail > 0 ? currency(targetMarginSuggestedRetail) : '—'}</div>
                </div>
                <div className="form-hint" style={{ marginTop: 10 }}>Price = landed cost ÷ (1 − target margin). Reverse math: your current entered price implies a {percent(retailMargin)} margin.</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'moq' && <MOQTab baseUnitCost={landedCost} />}
        {tab === 'cashflow' && <CashFlowTab payments={allPayments} monthlySales={monthlySales} />}
        {tab === 'history' && <CostHistoryTab products={products} payments={allPayments} orders={orders} />}
      </div>
    </>
  );
}

function MOQTab({ baseUnitCost }) {
  const [tiers, setTiers] = useState([
    { qty: '', unitCost: baseUnitCost > 0 ? baseUnitCost.toFixed(2) : '' },
    { qty: '', unitCost: '' },
    { qty: '', unitCost: '' },
  ]);

  const setTier = (i, k, v) => setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [k]: v } : t));
  const addTier = () => setTiers(prev => [...prev, { qty: '', unitCost: '' }]);
  const removeTier = i => setTiers(prev => prev.filter((_, idx) => idx !== i));

  const filled = tiers.filter(t => num(t.qty) > 0 && num(t.unitCost) > 0).map(t => ({ qty: num(t.qty), unitCost: num(t.unitCost), capital: num(t.qty) * num(t.unitCost) }));
  const cheapest = filled.length ? Math.min(...filled.map(t => t.unitCost)) : 0;
  const maxCapital = filled.length ? Math.max(...filled.map(t => t.capital)) : 1;

  return (
    <>
      <div className="card-raised" style={{ marginBottom: 18 }}>
        <div className="card-header"><span className="card-title">Quantity Tiers</span></div>
        <div className="card-body">
          <div className="form-hint" style={{ marginBottom: 14 }}>Enter the per-unit price your vendor quoted at each order quantity. Vendor records only carry a single MOQ, so this is manual — it's the tradeoff between unit cost and the cash you'd need to tie up upfront.</div>
          {tiers.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <input className="form-input" type="number" placeholder="Quantity (e.g. 100)" value={t.qty} onChange={e => setTier(i, 'qty', e.target.value)} />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                <input className="form-input" type="number" style={{ paddingLeft: 24 }} placeholder="Unit cost at this tier" value={t.unitCost} onChange={e => setTier(i, 'unitCost', e.target.value)} />
              </div>
              <button className="btn btn-sm" onClick={() => removeTier(i)} disabled={tiers.length <= 1}><i className="ph ph-x" /></button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={addTier}><i className="ph ph-plus" /> Add tier</button>
        </div>
      </div>

      {filled.length === 0 ? (
        <EmptyState icon="ph-stack" color="var(--c-analytics)" title="No tiers entered yet" sub="Add at least one quantity/unit-cost tier above to compare capital vs. per-unit savings." />
      ) : (
        <div className="card">
          {filled.sort((a, b) => a.qty - b.qty).map((t, i) => (
            <div className="list-row" key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.qty.toLocaleString()} units</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                  {currency(t.unitCost)}/unit
                  {t.unitCost > cheapest && <span style={{ color: 'var(--ink-3)' }}> ({percent(((t.unitCost - cheapest) / t.unitCost) * 100)} more than your cheapest tier)</span>}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(t.capital / maxCapital) * 100}%`, height: '100%', background: 'var(--c-analytics)' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{currency(t.capital)} capital required upfront</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CashFlowTab({ payments, monthlySales }) {
  const outflowByMonth = useMemo(() => {
    const map = {};
    (payments || []).forEach(p => { const k = monthKey(p.paid_at); map[k] = (map[k] || 0) + Number(p.amount); });
    return map;
  }, [payments]);

  const inflowByMonth = useMemo(() => {
    const map = {};
    (monthlySales || []).forEach(m => { map[m.month] = (map[m.month] || 0) + Number(m.revenue); });
    return map;
  }, [monthlySales]);

  const months = useMemo(() => [...new Set([...Object.keys(outflowByMonth), ...Object.keys(inflowByMonth)])].sort(), [outflowByMonth, inflowByMonth]);

  let running = 0;
  const rows = months.map(m => {
    const inflow = inflowByMonth[m] || 0;
    const outflow = outflowByMonth[m] || 0;
    const net = inflow - outflow;
    running += net;
    return { month: m, inflow, outflow, net, running };
  });

  const chartData = rows.map(r => ({ month: monthLabel(r.month), revenue: r.running }));

  const recentRevs = (monthlySales || []).slice(-3).map(m => Number(m.revenue));
  const trailingAvg = recentRevs.length ? recentRevs.reduce((a, b) => a + b, 0) / recentRevs.length : 0;
  const canForecast = (monthlySales || []).length >= 2;

  if (rows.length === 0) {
    return <EmptyState icon="ph-chart-line-up" color="var(--c-analytics)" title="No cash flow data yet" sub="Log production payments (Production Orders → Payments tab) and sync sales (Analytics → Connections) to see real cash flow here." />;
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card" style={{ '--stat-accent': 'var(--green)' }}>
          <div className="stat-label">Total Inflow</div>
          <div className="stat-value">{currency(rows.reduce((s, r) => s + r.inflow, 0))}</div>
          <div className="stat-delta delta-muted">Real sales revenue</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--red)' }}>
          <div className="stat-label">Total Outflow</div>
          <div className="stat-value">{currency(rows.reduce((s, r) => s + r.outflow, 0))}</div>
          <div className="stat-delta delta-muted">Real factory payments</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
          <div className="stat-label">Net Cash Position</div>
          <div className="stat-value" style={{ color: running >= 0 ? 'var(--green)' : 'var(--red)' }}>{currency(running)}</div>
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="card-raised" style={{ marginBottom: 18 }}>
          <div className="card-header"><span className="card-title">Cumulative Cash Position</span></div>
          <div className="card-body"><RevenueChart data={chartData} accent="var(--c-analytics)" /></div>
        </div>
      )}

      <div className="card-raised" style={{ marginBottom: 18 }}>
        <div className="card-header"><span className="card-title">Revenue Forecast</span></div>
        <div className="card-body">
          {!canForecast ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>Sync at least 2 months of sales data to see a projection.</div>
          ) : (
            <>
              <div className="stats-row" style={{ boxShadow: 'none', border: 'none', background: 'transparent' }}>
                <div className="stat-card" style={{ padding: '0 22px 0 0' }}>
                  <div className="stat-label">Next Month (Projected)</div>
                  <div className="stat-value">{currency(trailingAvg)}</div>
                </div>
                <div className="stat-card" style={{ padding: '0 22px' }}>
                  <div className="stat-label">Next 3 Months (Projected)</div>
                  <div className="stat-value">{currency(trailingAvg * 3)}</div>
                </div>
              </div>
              <div className="form-hint" style={{ marginTop: 10 }}>Projected from your trailing {recentRevs.length}-month sales average — a simple trend estimate, not an AI prediction.</div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Monthly Cash Flow</span></div>
        {rows.slice().reverse().map(r => (
          <div className="list-row" key={r.month}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(r.month)}</span>
            <div style={{ display: 'flex', gap: 20, fontFamily: 'var(--mono)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--green)' }}>+{currency(r.inflow)}</span>
              <span style={{ color: 'var(--red)' }}>-{currency(r.outflow)}</span>
              <span style={{ fontWeight: 700 }}>{currency(r.running)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CostHistoryTab({ products, payments, orders }) {
  const [selectedProductId, setSelectedProductId] = useState('');

  const productPayments = useMemo(
    () => (payments || []).filter(p => p.production_orders?.product_id === selectedProductId).sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at)),
    [payments, selectedProductId]
  );

  const points = productPayments.map(p => ({ date: p.paid_at, amount: Number(p.amount) }));
  const productOrderCount = orders.filter(o => o.product_id === selectedProductId).length;

  const byProductTotals = useMemo(() => {
    const map = {};
    (payments || []).forEach(p => {
      const pid = p.production_orders?.product_id;
      if (!pid) return;
      map[pid] = (map[pid] || 0) + Number(p.amount);
    });
    return map;
  }, [payments]);

  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Product</label>
        <select className="form-select" style={{ maxWidth: 320 }} value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
          <option value="">All products — spend totals</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProductId ? (
        productPayments.length === 0 ? (
          <EmptyState icon="ph-clock-counter-clockwise" color="var(--c-analytics)" title="No payments logged for this product" sub="Log payments against its production orders to build a real cost-over-time trend." />
        ) : (
          <div className="card-raised">
            <div className="card-header"><span className="card-title">Spend Over Time</span></div>
            <div className="card-body">
              <div className="stats-row" style={{ boxShadow: 'none', border: 'none', background: 'transparent', marginBottom: 16 }}>
                <div className="stat-card" style={{ padding: '0 22px 0 0' }}>
                  <div className="stat-label">Total Spend</div>
                  <div className="stat-value">{currency(productPayments.reduce((s, p) => s + Number(p.amount), 0))}</div>
                </div>
                <div className="stat-card" style={{ padding: '0 22px' }}>
                  <div className="stat-label">Payments Logged</div>
                  <div className="stat-value">{productPayments.length}</div>
                </div>
                <div className="stat-card" style={{ padding: '0 0 0 22px', borderRight: 'none' }}>
                  <div className="stat-label">Production Orders</div>
                  <div className="stat-value">{productOrderCount}</div>
                </div>
              </div>
              {points.length >= 2 ? <PriceHistoryChart points={points} /> : <div className="form-hint">Log at least 2 payments to chart a trend.</div>}
            </div>
          </div>
        )
      ) : (
        Object.keys(byProductTotals).length === 0 ? (
          <EmptyState icon="ph-clock-counter-clockwise" color="var(--c-analytics)" title="No manufacturing spend logged yet" sub="Payments logged against your production orders will build a real cost history here." />
        ) : (
          <div className="card">
            <div className="card-header"><span className="card-title">Total Spend by Product</span></div>
            {Object.entries(byProductTotals).sort((a, b) => b[1] - a[1]).map(([pid, total]) => {
              const p = products.find(pr => pr.id === pid);
              return (
                <div className="list-row" key={pid}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p?.name || 'Unknown product'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{currency(total)}</span>
                </div>
              );
            })}
          </div>
        )
      )}
    </>
  );
}
