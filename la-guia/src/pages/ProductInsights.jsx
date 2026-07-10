import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { currency, percent, riskTagClass } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useSales } from '../context/SalesContext.jsx';
import { supabase } from '../lib/supabase.js';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';

const TABS = [
  { key: 'financial', label: 'Financial Model', icon: 'ph-calculator' },
  { key: 'performance', label: 'Live Performance', icon: 'ph-chart-line-up' },
];

export default function ProductInsights() {
  const { id } = useParams();
  const { products, updateProduct } = useProducts();
  const { connection, productSales } = useSales();
  const [tab, setTab] = useState('financial');
  
  const product = products.find(p => p.id === id);
  const thisProductSales = productSales[id] || [];
  
  const [bomCost, setBomCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cmtCost: '',
    shippingCost: '',
    retailPrice: '',
    wholesalePrice: '',
    fixedCosts: '',
  });

  useEffect(() => {
    async function loadData() {
      if (!product) return;
      try {
        const { data: tpData } = await supabase.from('tech_packs').select('bom').eq('product_id', id).single();
        if (tpData && tpData.bom) {
          const totalBom = tpData.bom.reduce((sum, item) => sum + ((parseFloat(item.qtyPerUnit) || 0) * (parseFloat(item.unitCost) || 0)), 0);
          setBomCost(totalBom);
        }

        if (product.financials) {
          setForm({
            cmtCost: product.financials.cmtCost || '',
            shippingCost: product.financials.shippingCost || '',
            retailPrice: product.financials.retailPrice || '',
            wholesalePrice: product.financials.wholesalePrice || '',
            fixedCosts: product.financials.fixedCosts || '',
          });
        }
      } catch (err) {
        console.error('Error loading financials:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, product]);

  if (!product) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Product not found" sub="This workspace doesn't exist yet." /></div>;
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProduct(id, { financials: form });
    } catch (err) {
      alert("Failed to save financial model: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const num = val => parseFloat(val) || 0;
  
  const landedCost = bomCost + num(form.cmtCost) + num(form.shippingCost);
  const retailProfit = num(form.retailPrice) - landedCost;
  const retailMargin = num(form.retailPrice) > 0 ? (retailProfit / num(form.retailPrice)) * 100 : 0;
  const wholesaleProfit = num(form.wholesalePrice) - landedCost;
  const wholesaleMargin = num(form.wholesalePrice) > 0 ? (wholesaleProfit / num(form.wholesalePrice)) * 100 : 0;
  
  // Break Even & Progress
  const breakEvenUnits = retailProfit > 0 ? Math.ceil(num(form.fixedCosts) / retailProfit) : 0;
  const totalSold = thisProductSales.reduce((s, m) => s + m.orders_count, 0);
  const totalRev = thisProductSales.reduce((s, m) => s + m.revenue, 0);
  const breakEvenProgress = breakEvenUnits > 0 ? Math.min((totalSold / breakEvenUnits) * 100, 100) : 0;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-analytics)' }}>Analytics & Sales</div>
            <h1 className="page-title">{product.name}</h1>
          </div>
          <div className="page-sub">{product.category}</div>
        </div>
        <div className="topbar-right">
          <span className={riskTagClass(product.risk)} style={{ marginRight: 8 }}>{product.risk}</span>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
            <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save Model'}
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 30px 0' }}>
        <FlowStepper productId={product.id} current="sales" />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-analytics)" />

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-3)' }}>
            <i className="ph ph-spinner ph-spin" style={{ fontSize: 24, marginBottom: 10 }} />
            <div>Loading financial data...</div>
          </div>
        ) : tab === 'financial' ? (
          <>
            <div className="stats-row">
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                <div className="stat-label">Total Landed Cost</div>
                <div className="stat-value">{currency(landedCost)}</div>
                <div className="stat-delta delta-muted">Per unit to your door</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--green)' }}>
                <div className="stat-label">Retail Margin</div>
                <div className="stat-value" style={{ color: retailMargin >= 60 ? 'var(--green)' : retailMargin >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                  {percent(retailMargin)}
                </div>
                <div className="stat-delta delta-muted">Industry standard is 60-70%</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Retail Profit / Unit</div>
                <div className="stat-value" style={{ color: retailProfit > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {currency(retailProfit)}
                </div>
                <div className="stat-delta delta-muted">Net cash per D2C sale</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-design)' }}>
                <div className="stat-label">Break-Even Point</div>
                <div className="stat-value">{breakEvenUnits} units</div>
                <div className="stat-delta delta-muted">To recover fixed costs</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Variable Costs (Per Unit)</span></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Raw Materials (BOM)</span>
                      <a href={`/tech-packs/${id}`} style={{ fontSize: 10, textTransform: 'none', letterSpacing: 'normal' }}>Edit Tech Pack</a>
                    </label>
                    <div style={{ padding: '11px 13px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                      {currency(bomCost)}
                    </div>
                    <div className="form-hint">Auto-calculated from your Bill of Materials.</div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Factory Labor (Cut, Make, Trim)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={form.cmtCost} onChange={e => f('cmtCost', e.target.value)} />
                    </div>
                    <div className="form-hint">The cost the manufacturer quoted to assemble one unit.</div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Shipping, Duties & Misc</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                      <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={form.shippingCost} onChange={e => f('shippingCost', e.target.value)} />
                    </div>
                    <div className="form-hint">Estimated freight and import taxes per unit.</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="card-raised">
                  <div className="card-header"><span className="card-title">Pricing Strategy</span></div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label">Target Retail Price (D2C)</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                        <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: 'var(--c-analytics)' }} placeholder="0.00" value={form.retailPrice} onChange={e => f('retailPrice', e.target.value)} />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Target Wholesale Price</span>
                        <span style={{ color: wholesaleMargin > 0 ? 'var(--green)' : 'var(--ink-4)', textTransform: 'none', letterSpacing: 'normal' }}>{percent(wholesaleMargin)} margin</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                        <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={form.wholesalePrice} onChange={e => f('wholesalePrice', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-raised">
                  <div className="card-header"><span className="card-title">Fixed Development Costs</span></div>
                  <div className="card-body">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Total Sunk Cost</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                        <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={form.fixedCosts} onChange={e => f('fixedCosts', e.target.value)} />
                      </div>
                      <div className="form-hint">Sum of patternmaking, fit samples, grading, and photoshoots. You must sell <strong>{breakEvenUnits} units</strong> to pay this off.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          !connection ? (
            <EmptyState icon="ph-plug" color="var(--c-analytics)" title="Shopify Not Connected" sub="Live sell-through, inventory risk, and real-time sales data will appear here once you connect your storefront in the Sales Dashboard." />
          ) : thisProductSales.length === 0 ? (
            <EmptyState icon="ph-chart-line-up" color="var(--c-analytics)" title="No Sales Data Yet" sub="Shopify is connected, but no sales for this specific product have synced yet." />
          ) : (
            <div className="grid-2">
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Break-Even Tracking</span></div>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{totalSold} units sold</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Target: {breakEvenUnits} units</span>
                  </div>
                  <div className="readiness" style={{ marginBottom: 16 }}>
                    <div className="readiness-track" style={{ height: 12, borderRadius: 6 }}>
                      <div className="readiness-fill" style={{ width: `${breakEvenProgress}%`, background: breakEvenProgress >= 100 ? 'var(--green)' : 'var(--c-analytics)', borderRadius: 6 }} />
                    </div>
                  </div>
                  {breakEvenProgress >= 100 ? (
                    <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}><i className="ph ph-check-circle" /> Product is officially profitable!</div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>You need to sell {Math.max(0, breakEvenUnits - totalSold)} more units to cover development costs.</div>
                  )}
                </div>
              </div>

              <div className="card-raised">
                <div className="card-header"><span className="card-title">Revenue Contribution</span></div>
                <div className="card-body">
                  <div className="stat-card" style={{ padding: 0, border: 'none' }}>
                    <div className="stat-label">Total Product Revenue</div>
                    <div className="stat-value" style={{ fontSize: 36 }}>{currency(totalRev)}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}