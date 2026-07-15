import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { currency, percent, riskTagClass } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useSales } from '../context/SalesContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { supabase } from '../lib/supabase.js';
import { useAutosave, AutosaveIndicator } from '../lib/useAutosave.jsx';
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
  const { orders } = useProduction();
  const [tab, setTab] = useState('financial');
  
  const product = products.find(p => p.id === id);
  const thisProductSales = productSales[id] || [];
  
  const [bomCost, setBomCost] = useState(0);
  const [actualProductionSpend, setActualProductionSpend] = useState(0); // NEW
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

        // Fetch real payments logged against ANY production order for this product
        const { data: payData } = await supabase
          .from('production_payments')
          .select('amount, production_orders!inner(product_id)')
          .eq('production_orders.product_id', id);
        
        if (payData) {
          const totalPay = payData.reduce((s, p) => s + Number(p.amount), 0);
          setActualProductionSpend(totalPay);
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

  // Real debounced autosave — `undefined` while still loading so the
  // initial populate-from-server doesn't itself trigger a write-back.
  const autosaveStatus = useAutosave(loading ? undefined : form, (v) => updateProduct(id, { financials: v }));

  const num = val => parseFloat(val) || 0;
  
  const landedCost = bomCost + num(form.cmtCost) + num(form.shippingCost);
  const retailProfit = num(form.retailPrice) - landedCost;
  const retailMargin = num(form.retailPrice) > 0 ? (retailProfit / num(form.retailPrice)) * 100 : 0;
  const wholesaleProfit = num(form.wholesalePrice) - landedCost;
  const wholesaleMargin = num(form.wholesalePrice) > 0 ? (wholesaleProfit / num(form.wholesalePrice)) * 100 : 0;
  
  // Break Even incorporates REAL production spend + OTHER manual sunk costs
  const totalCostToRecover = actualProductionSpend + num(form.fixedCosts);
  const breakEvenUnits = retailProfit > 0 ? Math.ceil(totalCostToRecover / retailProfit) : 0;
  const totalSold = thisProductSales.reduce((s, m) => s + m.orders_count, 0);
  const totalRev = thisProductSales.reduce((s, m) => s + m.revenue, 0);
  const breakEvenProgress = breakEvenUnits > 0 ? Math.min((totalSold / breakEvenUnits) * 100, 100) : 0;

  // --- INVENTORY RISK ENGINE MATH ---
  const productOrders = orders.filter(o => o.product_id === id && o.stage === 'Delivered');
  const totalProduced = productOrders.reduce((sum, o) => sum + (o.units || 0), 0);
  const currentStock = Math.max(0, totalProduced - totalSold);

  const activeMonths = thisProductSales.length || 1;
  const dailyVelocity = totalSold / (activeMonths * 30);

  const latestOrder = productOrders[0];
  const rawLeadTime = latestOrder?.vendors?.lead_time || '45'; 
  const leadTimeDays = parseInt(rawLeadTime.replace(/\D/g, '')) || 45;

  const reorderPoint = Math.ceil(dailyVelocity * leadTimeDays);
  const daysRemaining = dailyVelocity > 0 ? Math.floor(currentStock / dailyVelocity) : 0;
  
  let riskLevel = 'Healthy';
  let riskColor = 'var(--green)';
  if (totalProduced === 0) {
     riskLevel = 'No production logged';
     riskColor = 'var(--ink-3)';
  } else if (dailyVelocity > 0) {
    if (currentStock <= reorderPoint) {
      riskLevel = 'Critical: Reorder Now';
      riskColor = 'var(--red)';
    } else if (currentStock <= reorderPoint + (dailyVelocity * 14)) {
      riskLevel = 'Warning: Plan Reorder';
      riskColor = 'var(--amber)';
    }
  }

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
        <div className="topbar-right" style={{ gap: 12, display: 'flex', alignItems: 'center' }}>
          <span className={riskTagClass(product.risk)}>{product.risk}</span>
          <AutosaveIndicator status={autosaveStatus} />
          <button className="btn btn-sm" onClick={handleSave} disabled={saving || loading} title="Fields already autosave — this just forces it now">
            <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save Now'}
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
                <div className="stat-delta delta-muted">To recover total sunk cost</div>
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
                  <div className="card-header"><span className="card-title">Total Sunk Costs (Break-Even Target)</span></div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Actual Factory Payments</span>
                        <a href="/production" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 'normal' }}>View Ledgers</a>
                      </label>
                      <div style={{ padding: '11px 13px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', color: 'var(--c-materials)', fontWeight: 600 }}>
                        {currency(actualProductionSpend)}
                      </div>
                      <div className="form-hint">Auto-calculated from your Production Order payment ledgers.</div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Other Development Costs</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>$</span>
                        <input className="form-input" type="number" style={{ paddingLeft: 24, fontFamily: 'var(--mono)' }} placeholder="0.00" value={form.fixedCosts} onChange={e => f('fixedCosts', e.target.value)} />
                      </div>
                      <div className="form-hint">Patternmaking, photoshoots, marketing, etc.</div>
                    </div>
                    
                    <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                      <span>Total Cost to Recover</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{currency(totalCostToRecover)}</span>
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
                    <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>You need to sell {Math.max(0, breakEvenUnits - totalSold)} more units to cover development & production costs.</div>
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
              
            {/* INVENTORY RISK ENGINE CARD */}
            <div className="card-raised" style={{ marginTop: 18 }}>
              <div className="card-header">
                <span className="card-title">Inventory & Reorder Intelligence</span>
                <span className="tag" style={{ background: 'transparent', border: `1px solid ${riskColor}`, color: riskColor }}>{riskLevel}</span>
              </div>
              <div className="card-body">
                <div className="stats-row" style={{ marginBottom: 16, boxShadow: 'none', border: 'none', background: 'transparent' }}>
                   <div className="stat-card" style={{ padding: '0 22px 0 0' }}>
                     <div className="stat-label">Est. Stock on Hand</div>
                     <div className="stat-value">{currentStock}</div>
                     <div className="stat-delta delta-muted">{totalProduced} produced - {totalSold} sold</div>
                   </div>
                   <div className="stat-card" style={{ padding: '0 22px' }}>
                     <div className="stat-label">Sales Velocity</div>
                     <div className="stat-value">{dailyVelocity.toFixed(1)} <span style={{ fontSize: 14 }}>/ day</span></div>
                     <div className="stat-delta delta-muted">Based on Shopify sales</div>
                   </div>
                   <div className="stat-card" style={{ padding: '0 22px' }}>
                     <div className="stat-label">Vendor Lead Time</div>
                     <div className="stat-value">{leadTimeDays} <span style={{ fontSize: 14 }}>days</span></div>
                     <div className="stat-delta delta-muted">From {latestOrder?.vendors?.name || 'default'}</div>
                   </div>
                   <div className="stat-card" style={{ padding: '0 0 0 22px', borderRight: 'none' }}>
                     <div className="stat-label">Runway</div>
                     <div className="stat-value" style={{ color: riskColor }}>{daysRemaining} <span style={{ fontSize: 14 }}>days</span></div>
                     <div className="stat-delta delta-muted">Reorder at {reorderPoint} units</div>
                   </div>
                </div>
                
                <div className="readiness">
                  <div className="readiness-track" style={{ height: 8, borderRadius: 4, background: 'var(--bg-3)' }}>
                    <div className="readiness-fill" style={{ width: `${Math.min(100, (currentStock / (totalProduced || 1)) * 100)}%`, background: riskColor, borderRadius: 4 }} />
                    <div className="readiness-gate" style={{ left: `${Math.min(100, (reorderPoint / (totalProduced || 1)) * 100)}%`, background: 'var(--ink)', width: 3 }} title="Reorder Point" />
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>
                  <i className="ph ph-info" style={{ marginRight: 4 }} /> 
                  The black line marks your reorder point ({reorderPoint} units). If your stock dips below this, you will run out before the factory can deliver the next batch.
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