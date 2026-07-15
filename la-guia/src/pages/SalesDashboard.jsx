import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { currency, percent } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useSales } from '../context/SalesContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { supabase } from '../lib/supabase.js';
import { exportCSV } from '../lib/csvExport.js';
import { consumeOAuthHandoff } from '../lib/oauthHandoff.js';
import { platformAdapters } from '../lib/ecommerceSync.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import RevenueChart from '../components/RevenueChart.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-chart-line-up' },
  { key: 'vendors', label: 'Vendors', icon: 'ph-handshake' },
  { key: 'manufacturing', label: 'Manufacturing', icon: 'ph-package' },
  { key: 'inventory', label: 'Inventory', icon: 'ph-cube' },
  { key: 'marketing', label: 'Marketing', icon: 'ph-megaphone' },
  { key: 'reports', label: 'Reports', icon: 'ph-file-text' },
  { key: 'connections', label: 'Connections', icon: 'ph-plug' },
];

const STAGE_TAG = { Sampling: 'tag-blue', 'In production': 'tag-amber', Shipped: 'tag-accent', Delivered: 'tag-green' };
const STAGES_LIST = ['Sampling', 'In production', 'Shipped', 'Delivered'];
const SEVERITY_TAG = { Low: 'tag-neutral', Medium: 'tag-amber', High: 'tag-red', Critical: 'tag-red' };

export default function SalesDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('overview');
  const { products, activeBrand, loading: productsLoading } = useProducts();
  const { connection, connections, monthlySales, productSales, loading: salesLoading, disconnectStore, refresh: refreshSales } = useSales();
  const { vendors, quotes } = useVendors();
  const { orders } = useProduction();
  const [shopDomain, setShopDomain] = useState('');

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const wooConnection = connections.find(c => c.platform === 'woocommerce') || null;
  const [wooForm, setWooForm] = useState({ storeUrl: '', consumerKey: '', consumerSecret: '' });
  const [wooConnecting, setWooConnecting] = useState(false);
  const [wooError, setWooError] = useState(null);

  // 1. Catch OAuth Returns
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('shopify_success');
    const error = params.get('shopify_error');
    
    if (success === 'true' && activeBrand) {
      const handoffCode = params.get('handoff');
      const brandId = params.get('brandId');

      if (brandId === activeBrand.id && handoffCode) {
        consumeOAuthHandoff(handoffCode)
          .then(({ shop, accessToken }) => supabase.from('store_connections').upsert({
            brand_id: activeBrand.id,
            platform: 'shopify',
            shop_domain: shop,
            access_token: accessToken,
          }, { onConflict: 'brand_id, platform' }))
          .then(() => {
            refreshSales();
            window.history.replaceState({}, '', '/sales');
            setTab('connections');
          })
          .catch(err => {
            setSyncError(err.message);
            window.history.replaceState({}, '', '/sales');
          });
      }
    } else if (error === 'true') {
      alert("Failed to connect Shopify store.");
      window.history.replaceState({}, '', '/sales');
    }
  }, [location.search, activeBrand]);

  const totalRevenue = monthlySales.reduce((sum, m) => sum + m.revenue, 0);
  const totalOrders = monthlySales.reduce((sum, m) => sum + m.orders_count, 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const lastMonth = monthlySales[monthlySales.length - 1];
  const prevMonth = monthlySales[monthlySales.length - 2];
  const monthDelta = (lastMonth && prevMonth && prevMonth.revenue > 0)
    ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
    : null;

  const chartData = monthlySales.map(m => {
    const d = new Date(m.month + '-01T00:00:00');
    return {
      month: d.toLocaleDateString(undefined, { month: 'short' }),
      revenue: m.revenue
    };
  });

  const handleConnect = (e) => {
    e.preventDefault();
    const domain = shopDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain) return;
    if (!domain.includes('.myshopify.com')) {
      alert('Please enter your full .myshopify.com domain.');
      return;
    }
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/shopify/auth?shop=${domain}&brandId=${activeBrand?.id}`;
  };

  // Shared by every platform's sync — orders already normalized to
  // { created_at, total_price, line_items: [{ sku, price, quantity }] }
  // (see ecommerceSync.js's normalizeWooOrder for the WooCommerce side;
  // Shopify's raw order shape already matches this natively).
  const aggregateAndUpsertOrders = async (orders, platform) => {
    const productIds = products.map(p => p.id);
    let skuMap = {};
    if (productIds.length > 0) {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('sku, product_id')
        .in('product_id', productIds);
      (variants || []).forEach(v => { if (v.sku) skuMap[v.sku] = v.product_id; });
    }

    const aggregates = {};
    orders.forEach(order => {
      if (!order.created_at) return;
      const month = order.created_at.substring(0, 7); // "YYYY-MM"
      if (!aggregates[month]) aggregates[month] = { brandLevel: { revenue: 0, count: 0 }, products: {} };

      aggregates[month].brandLevel.revenue += parseFloat(order.total_price || 0);
      aggregates[month].brandLevel.count += 1;

      const productsInThisOrder = new Set();
      (order.line_items || []).forEach(item => {
        const prodId = skuMap[item.sku];
        if (!prodId) return;
        if (!aggregates[month].products[prodId]) aggregates[month].products[prodId] = { revenue: 0, count: 0 };
        aggregates[month].products[prodId].revenue += parseFloat(item.price || 0) * parseInt(item.quantity || 1);
        if (!productsInThisOrder.has(prodId)) {
          aggregates[month].products[prodId].count += 1;
          productsInThisOrder.add(prodId);
        }
      });
    });

    const toInsert = [];
    Object.keys(aggregates).forEach(month => {
      toInsert.push({ brand_id: activeBrand.id, product_id: null, month, platform, revenue: aggregates[month].brandLevel.revenue, orders_count: aggregates[month].brandLevel.count });
      Object.keys(aggregates[month].products).forEach(prodId => {
        toInsert.push({ brand_id: activeBrand.id, product_id: prodId, month, platform, revenue: aggregates[month].products[prodId].revenue, orders_count: aggregates[month].products[prodId].count });
      });
    });

    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { error } = await supabase.from('sales_data').upsert(chunk, { onConflict: 'brand_id, product_id, month, platform' });
      if (error) console.error("Upsert chunk error:", error);
    }
  };

  const syncSales = async () => {
    if (!connection) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/shopify/fetch-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: connection.shop_domain, token: connection.access_token })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await aggregateAndUpsertOrders(data.orders, 'shopify');
      await refreshSales();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const syncWooCommerce = async () => {
    if (!wooConnection) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const orders = await platformAdapters.woocommerce.fetchOrders(wooConnection);
      await aggregateAndUpsertOrders(orders, 'woocommerce');
      await refreshSales();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const syncAll = async () => {
    if (connection) await syncSales();
    if (wooConnection) await syncWooCommerce();
  };

  const handleWooConnect = async (e) => {
    e.preventDefault();
    setWooConnecting(true);
    setWooError(null);
    try {
      await platformAdapters.woocommerce.validate({ shop_domain: wooForm.storeUrl, api_key: wooForm.consumerKey, access_token: wooForm.consumerSecret });
      const { error } = await supabase.from('store_connections').upsert({
        brand_id: activeBrand.id,
        platform: 'woocommerce',
        shop_domain: wooForm.storeUrl.trim(),
        api_key: wooForm.consumerKey.trim(),
        access_token: wooForm.consumerSecret.trim(),
      }, { onConflict: 'brand_id, platform' });
      if (error) throw error;
      setWooForm({ storeUrl: '', consumerKey: '', consumerSecret: '' });
      await refreshSales();
    } catch (err) {
      setWooError(err.message);
    } finally {
      setWooConnecting(false);
    }
  };

  if (salesLoading || productsLoading) {
    return <div className="content" style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-analytics)' }}>Analytics & Sales</div>
            <h1 className="page-title">Sales Dashboard</h1>
          </div>
          <div className="page-sub">{connections.length > 0 ? `${connections.length} store${connections.length > 1 ? 's' : ''} connected` : 'No store connected'}</div>
        </div>
        <div className="topbar-right">
          {connections.length > 0 && (
            <button className="btn btn-primary" onClick={syncAll} disabled={syncing}>
              {syncing ? <><i className="ph ph-spinner ph-spin"/> Syncing...</> : <><i className="ph ph-arrows-clockwise"/> Sync All Stores</>}
            </button>
          )}
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-analytics)" />

      <div className="content">
        {syncError && (
          <div className="alert" style={{ padding: '11px 13px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-border)', marginBottom: 16 }}>
            <strong>Sync Error:</strong> {syncError}
          </div>
        )}

        {tab === 'overview' && (
          <>
            {connections.length === 0 ? (
              <EmptyState
                icon="ph-plug"
                color="var(--c-analytics)"
                title="No store connected"
                sub="Connect Shopify or WooCommerce in the Connections tab to unlock live sales data and profitability tracking."
                cta="Go to Connections"
                onCta={() => setTab('connections')}
              />
            ) : (
              <>
                <div className="stats-row">
                  <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                    <div className="stat-label">Total revenue</div>
                    <div className="stat-value">{currency(totalRevenue)}</div>
                  </div>
                  <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                    <div className="stat-label">Total orders</div>
                    <div className="stat-value">{totalOrders}</div>
                  </div>
                  <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                    <div className="stat-label">Active Designs</div>
                    <div className="stat-value">{products.length}</div>
                  </div>
                  <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                    <div className="stat-label">Avg. order value</div>
                    <div className="stat-value">{currency(avgOrderValue)}</div>
                  </div>
                </div>

                <div className="card-raised" data-tour="sales-dashboard" style={{ marginBottom: 24 }}>
                  <div className="card-header">
                    <span className="card-title">Revenue by month</span>
                    {monthDelta !== null && (
                      <span style={{ fontSize: 12, color: monthDelta >= 0 ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className={`ph ${monthDelta >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`} />
                        {Math.abs(monthDelta).toFixed(0)}% vs {new Date(prevMonth.month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    {chartData.length >= 2 ? (
                      <RevenueChart data={chartData} accent="var(--c-analytics)" />
                    ) : (
                      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Sync recent sales or wait for more historical data to chart.</div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="section-label" style={{ marginTop: 24 }}>Your Products (Financial Modeling)</div>
            <div className="card">
              {products.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)' }}>No products created yet.</div>
              ) : (
                products.map(p => (
                  <div 
                    className="list-row" 
                    key={p.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/products/${p.id}/performance`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ph ph-tag" style={{ color: 'var(--c-analytics)' }} />
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{p.category}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ textAlign: 'right', marginRight: 16 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 700 }}>Landed Cost</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{p.financials?.cmtCost ? 'Calculated' : 'Not set'}</div>
                      </div>
                      <button className="btn btn-sm">Manage Model <i className="ph ph-arrow-right" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'vendors' && <VendorsTab vendors={vendors} quotes={quotes} orders={orders} navigate={navigate} />}
        {tab === 'manufacturing' && <ManufacturingTab orders={orders} />}
        {tab === 'inventory' && <InventoryTab products={products} orders={orders} productSales={productSales} navigate={navigate} />}
        {tab === 'marketing' && (
          <EmptyState
            icon="ph-megaphone"
            color="var(--c-content)"
            title="Not connected yet"
            sub="There's no real engagement or reach data flowing in from any channel yet, so this stays empty rather than showing invented numbers. Once a real ad or social integration lands, its metrics will show up here."
            cta="Go to Content Hub"
            onCta={() => navigate('/content')}
          />
        )}
        {tab === 'reports' && <ReportsTab products={products} orders={orders} vendors={vendors} quotes={quotes} monthlySales={monthlySales} productSales={productSales} />}

        {tab === 'connections' && (
          <>
            {connection ? (
              <div className="card-raised" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">Shopify</span>
                  <span className="tag tag-green">Connected</span>
                </div>
                <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{connection.shop_domain}</div>
                  <button className="btn btn-sm" onClick={() => disconnectStore('shopify')}>Disconnect</button>
                </div>
              </div>
            ) : (
              <form className="card-raised" style={{ marginBottom: 20 }} onSubmit={handleConnect}>
                <div className="card-header">
                  <span className="card-title">Connect Shopify</span>
                </div>
                <div className="card-body">
                   <div className="form-group" style={{ marginBottom: 0 }}>
                     <label className="form-label">Store Domain</label>
                     <div style={{ display: 'flex', gap: 10 }}>
                       <input className="form-input" placeholder="e.g. my-brand.myshopify.com" value={shopDomain} onChange={e => setShopDomain(e.target.value)} required />
                       <button type="submit" className="btn btn-primary" disabled={!shopDomain.trim()}>Connect Store</button>
                     </div>
                     <div className="form-hint" style={{ marginTop: 8 }}>You will be redirected to Shopify to authorize Atelier. NOTE: You must add your Shopify API Keys to your `api/.env` file first.</div>
                   </div>
                </div>
              </form>
            )}

            {wooConnection ? (
              <div className="card-raised" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">WooCommerce</span>
                  <span className="tag tag-green">Connected</span>
                </div>
                <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{wooConnection.shop_domain}</div>
                  <button className="btn btn-sm" onClick={() => disconnectStore('woocommerce')}>Disconnect</button>
                </div>
              </div>
            ) : (
              <form className="card-raised" style={{ marginBottom: 20 }} onSubmit={handleWooConnect}>
                <div className="card-header">
                  <span className="card-title">Connect WooCommerce</span>
                </div>
                <div className="card-body">
                  {wooError && (
                    <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 14, fontSize: 13, border: '1px solid var(--red-border)' }}>{wooError}</div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Store URL</label>
                    <input className="form-input" placeholder="https://your-store.com" value={wooForm.storeUrl} onChange={e => setWooForm(f => ({ ...f, storeUrl: e.target.value }))} required />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Consumer Key</label>
                      <input className="form-input" placeholder="ck_..." value={wooForm.consumerKey} onChange={e => setWooForm(f => ({ ...f, consumerKey: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Consumer Secret</label>
                      <input className="form-input" type="password" placeholder="cs_..." value={wooForm.consumerSecret} onChange={e => setWooForm(f => ({ ...f, consumerSecret: e.target.value }))} required />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={wooConnecting || !wooForm.storeUrl.trim() || !wooForm.consumerKey.trim() || !wooForm.consumerSecret.trim()}>
                    {wooConnecting ? 'Verifying…' : 'Connect Store'}
                  </button>
                  <div className="form-hint" style={{ marginTop: 8 }}>Generate a key in your own wp-admin under WooCommerce &gt; Settings &gt; Advanced &gt; REST API — give it Read access at minimum. No OAuth, no app review, no redirect.</div>
                </div>
              </form>
            )}

            <EmptyState icon="ph-plug" color="var(--c-analytics)" title="Etsy and TikTok Shop coming up next" sub="A few more storefronts will connect here as they're built out." />
          </>
        )}
      </div>
    </>
  );
}

function VendorsTab({ vendors, quotes, orders, navigate }) {
  const rows = vendors.map(v => {
    const vendorQuotes = quotes.filter(q => q.vendor_id === v.id);
    const accepted = vendorQuotes.filter(q => q.status === 'Accepted').length;
    const vendorOrders = orders.filter(o => o.vendor_id === v.id);
    const delivered = vendorOrders.filter(o => o.stage === 'Delivered' && o.delivered_at && o.due_date);
    const onTime = delivered.filter(o => new Date(o.delivered_at) <= new Date(o.due_date)).length;
    return {
      vendor: v,
      quotesRequested: vendorQuotes.length,
      accepted,
      acceptanceRate: vendorQuotes.length ? (accepted / vendorQuotes.length) * 100 : null,
      orderCount: vendorOrders.length,
      onTimeRate: delivered.length ? (onTime / delivered.length) * 100 : null,
    };
  }).filter(r => r.quotesRequested > 0 || r.orderCount > 0);

  if (rows.length === 0) {
    return <EmptyState icon="ph-handshake" color="var(--c-vendors)" title="No vendor activity yet" sub="Request a quote or place a production order with a vendor to see performance here." />;
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Vendor Performance</span></div>
      {rows.sort((a, b) => b.orderCount - a.orderCount).map(r => (
        <div className="list-row" key={r.vendor.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/vendors/${r.vendor.id}`)}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r.vendor.name}</span>
          <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-3)' }}>
            <span>{r.quotesRequested} quoted</span>
            <span>{r.acceptanceRate != null ? percent(r.acceptanceRate) : '—'} accepted</span>
            <span>{r.orderCount} orders</span>
            <span style={{ color: r.onTimeRate != null && r.onTimeRate < 70 ? 'var(--amber)' : 'var(--ink-2)' }}>{r.onTimeRate != null ? percent(r.onTimeRate) : '—'} on-time</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ManufacturingTab({ orders }) {
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    const orderIds = orders.map(o => o.id);
    if (orderIds.length === 0) { setIssues([]); return; }
    supabase.from('production_issues').select('severity').in('production_order_id', orderIds)
      .then(({ data, error }) => { if (!error) setIssues(data || []); });
  }, [orders]);

  if (orders.length === 0) {
    return <EmptyState icon="ph-package" color="var(--c-materials)" title="No production orders yet" sub="Place a production order to see manufacturing analytics here." />;
  }

  const delivered = orders.filter(o => o.stage === 'Delivered');
  const onTimeCount = delivered.filter(o => o.delivered_at && o.due_date && new Date(o.delivered_at) <= new Date(o.due_date)).length;
  const onTimeRate = delivered.length ? Math.round((onTimeCount / delivered.length) * 100) : null;
  const avgDays = delivered.length
    ? Math.round(delivered.reduce((sum, o) => sum + (new Date(o.delivered_at) - new Date(o.created_at)) / 86400000, 0) / delivered.length)
    : null;
  const unitsInProgress = orders.filter(o => o.stage !== 'Delivered').reduce((sum, o) => sum + (o.units || 0), 0);

  const severityCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  issues.forEach(i => { if (severityCounts[i.severity] != null) severityCounts[i.severity]++; });

  return (
    <>
      <div className="stats-row">
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
          <div className="stat-label">Units In Progress</div>
          <div className="stat-value">{unitsInProgress}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
          <div className="stat-label">Avg. Days to Delivery</div>
          <div className="stat-value">{avgDays != null ? avgDays : '—'}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--green)' }}>
          <div className="stat-label">On-Time Rate</div>
          <div className="stat-value" style={{ color: onTimeRate != null && onTimeRate < 70 ? 'var(--amber)' : undefined }}>{onTimeRate != null ? `${onTimeRate}%` : '—'}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-design)' }}>
          <div className="stat-label">Delivered</div>
          <div className="stat-value">{delivered.length}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Orders by Stage</span></div>
          {STAGES_LIST.map(stage => (
            <div className="list-row" key={stage}>
              <span className={`tag ${STAGE_TAG[stage]}`}>{stage}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5 }}>{orders.filter(o => o.stage === stage).length}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Issues by Severity</span></div>
          {issues.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No issues logged.</div>
          ) : (
            Object.entries(severityCounts).filter(([, count]) => count > 0).map(([severity, count]) => (
              <div className="list-row" key={severity}>
                <span className={`tag ${SEVERITY_TAG[severity]}`}>{severity}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5 }}>{count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function InventoryTab({ products, orders, productSales, navigate }) {
  const rows = products.map(p => {
    const produced = orders.filter(o => o.product_id === p.id && o.stage === 'Delivered').reduce((s, o) => s + (o.units || 0), 0);
    const sold = (productSales[p.id] || []).reduce((s, m) => s + m.orders_count, 0);
    const stock = Math.max(0, produced - sold);
    const activeMonths = (productSales[p.id] || []).length || 1;
    const dailyVelocity = sold / (activeMonths * 30);
    const daysRemaining = dailyVelocity > 0 ? Math.floor(stock / dailyVelocity) : null;
    return { product: p, produced, sold, stock, daysRemaining };
  }).filter(r => r.produced > 0);

  if (rows.length === 0) {
    return <EmptyState icon="ph-cube" color="var(--c-materials)" title="No delivered production yet" sub="Once a production order is marked Delivered, its units show up here against real sales." />;
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Estimated Stock on Hand</span></div>
      {rows.sort((a, b) => a.stock - b.stock).map(r => (
        <div className="list-row" key={r.product.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/products/${r.product.id}/performance`)}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r.product.name}</span>
          <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-3)' }}>
            <span>{r.produced} produced</span>
            <span>{r.sold} sold</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.stock} in stock</span>
            <span>{r.daysRemaining != null ? `${r.daysRemaining}d runway` : '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const REPORT_SOURCES = {
  sales: {
    label: 'Sales (by month)',
    rows: ({ monthlySales }) => monthlySales,
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'orders_count', label: 'Orders' },
    ],
  },
  production: {
    label: 'Production Orders',
    rows: ({ orders }) => orders.map(o => ({ po_number: o.po_number || o.id, product: o.products?.name || '', vendor: o.vendors?.name || '', stage: o.stage, units: o.units, due_date: o.due_date, delivered_at: o.delivered_at })),
    columns: [
      { key: 'po_number', label: 'PO Number' },
      { key: 'product', label: 'Product' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'stage', label: 'Stage' },
      { key: 'units', label: 'Units' },
      { key: 'due_date', label: 'Due Date' },
      { key: 'delivered_at', label: 'Delivered At' },
    ],
  },
  vendors: {
    label: 'Vendors',
    rows: ({ vendors, quotes, orders }) => vendors.map(v => {
      const vq = quotes.filter(q => q.vendor_id === v.id);
      const accepted = vq.filter(q => q.status === 'Accepted').length;
      return { name: v.name, quotes_requested: vq.length, quotes_accepted: accepted, orders: orders.filter(o => o.vendor_id === v.id).length, price_range: v.price_range || '' };
    }),
    columns: [
      { key: 'name', label: 'Vendor' },
      { key: 'quotes_requested', label: 'Quotes Requested' },
      { key: 'quotes_accepted', label: 'Quotes Accepted' },
      { key: 'orders', label: 'Orders' },
      { key: 'price_range', label: 'Price Range' },
    ],
  },
  inventory: {
    label: 'Inventory',
    rows: ({ products, orders, productSales }) => products.map(p => {
      const produced = orders.filter(o => o.product_id === p.id && o.stage === 'Delivered').reduce((s, o) => s + (o.units || 0), 0);
      const sold = (productSales[p.id] || []).reduce((s, m) => s + m.orders_count, 0);
      return { product: p.name, produced, sold, stock: Math.max(0, produced - sold) };
    }),
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'produced', label: 'Produced' },
      { key: 'sold', label: 'Sold' },
      { key: 'stock', label: 'Stock' },
    ],
  },
};

function ReportsTab({ products, orders, vendors, quotes, monthlySales, productSales }) {
  const [source, setSource] = useState('sales');
  const config = REPORT_SOURCES[source];
  const allRows = useMemo(() => config.rows({ products, orders, vendors, quotes, monthlySales, productSales }), [source, products, orders, vendors, quotes, monthlySales, productSales]);
  const [enabledCols, setEnabledCols] = useState(() => new Set(config.columns.map(c => c.key)));
  const [search, setSearch] = useState('');

  const changeSource = key => { setSource(key); setEnabledCols(new Set(REPORT_SOURCES[key].columns.map(c => c.key))); setSearch(''); };
  const toggleCol = key => setEnabledCols(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const filteredRows = search.trim()
    ? allRows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.trim().toLowerCase())))
    : allRows;
  const activeColumns = config.columns.filter(c => enabledCols.has(c.key));

  return (
    <>
      <div className="card-raised" style={{ marginBottom: 18 }}>
        <div className="card-header"><span className="card-title">Build a Report</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Data Source</label>
            <select className="form-select" value={source} onChange={e => changeSource(e.target.value)}>
              {Object.entries(REPORT_SOURCES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Columns</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {config.columns.map(c => (
                <label key={c.key} className="pill" style={{ cursor: 'pointer', opacity: enabledCols.has(c.key) ? 1 : 0.45 }}>
                  <input type="checkbox" checked={enabledCols.has(c.key)} onChange={() => toggleCol(c.key)} style={{ marginRight: 6 }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Filter</label>
              <input className="form-input" placeholder="Search across all columns" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button
              className="btn btn-primary"
              disabled={filteredRows.length === 0 || activeColumns.length === 0}
              onClick={() => exportCSV(`${source}-report`, activeColumns, filteredRows)}
            >
              <i className="ph ph-download-simple" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {filteredRows.length === 0 || activeColumns.length === 0 ? (
        <EmptyState icon="ph-file-text" color="var(--c-analytics)" title="Nothing to show" sub="Pick at least one column, or clear your filter, to preview rows." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {activeColumns.map(c => (
                  <th key={c.key} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', fontFamily: 'var(--mono)', borderBottom: '1.5px solid var(--border-2)' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 200).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {activeColumns.map(c => (
                    <td key={c.key} style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'var(--mono)' }}>{String(r[c.key] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 200 && <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Showing first 200 of {filteredRows.length} rows — export CSV for the full set.</div>}
        </div>
      )}
    </>
  );
}