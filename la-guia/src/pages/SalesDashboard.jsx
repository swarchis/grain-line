import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { currency } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useSales } from '../context/SalesContext.jsx';
import { supabase } from '../lib/supabase.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import RevenueChart from '../components/RevenueChart.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-chart-line-up' },
  { key: 'connections', label: 'Connections', icon: 'ph-plug' },
];

export default function SalesDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('overview');
  const { products, activeBrand, loading: productsLoading } = useProducts();
  const { connection, monthlySales, loading: salesLoading, disconnectStore, refresh: refreshSales } = useSales();
  const [shopDomain, setShopDomain] = useState('');
  
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // 1. Catch OAuth Returns
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('shopify_success');
    const error = params.get('shopify_error');
    
    if (success === 'true' && activeBrand) {
      const shop = params.get('shop');
      const token = params.get('token');
      const brandId = params.get('brandId');

      if (brandId === activeBrand.id) {
        supabase.from('store_connections').upsert({
          brand_id: activeBrand.id,
          platform: 'shopify',
          shop_domain: shop,
          access_token: token,
        }, { onConflict: 'brand_id, platform' }).then(() => {
          refreshSales();
          window.history.replaceState({}, '', '/sales');
          setTab('connections');
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

  // 2. Fetch from Shopify via Backend Proxy and Save to Supabase
  // 2. Fetch from Shopify via Backend Proxy and Save to Supabase
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

      // Fetch all SKUs for this brand to map Shopify items to Atelier product IDs
      const productIds = products.map(p => p.id);
      let skuMap = {};
      if (productIds.length > 0) {
         const { data: variants } = await supabase
           .from('product_variants')
           .select('sku, product_id')
           .in('product_id', productIds);
         (variants || []).forEach(v => {
           if (v.sku) skuMap[v.sku] = v.product_id;
         });
      }

      // Aggregate raw Shopify orders by Month (YYYY-MM)
      const aggregates = {};
      data.orders.forEach(order => {
        const month = order.created_at.substring(0, 7); // "YYYY-MM"
        if (!aggregates[month]) {
          aggregates[month] = { brandLevel: { revenue: 0, count: 0 }, products: {} };
        }

        // Add to brand-level totals
        aggregates[month].brandLevel.revenue += parseFloat(order.total_price || 0);
        aggregates[month].brandLevel.count += 1;

        // Track which products were in this order so we don't double-count the order
        const productsInThisOrder = new Set();
        
        // Loop through line items to assign product-level revenue
        (order.line_items || []).forEach(item => {
           const sku = item.sku;
           const prodId = skuMap[sku];
           
           if (prodId) {
              if (!aggregates[month].products[prodId]) {
                 aggregates[month].products[prodId] = { revenue: 0, count: 0 };
              }
              // Add gross item revenue
              aggregates[month].products[prodId].revenue += parseFloat(item.price || 0) * parseInt(item.quantity || 1);
              
              // Increment the order count for this product if we haven't already for this specific order
              if (!productsInThisOrder.has(prodId)) {
                 aggregates[month].products[prodId].count += 1;
                 productsInThisOrder.add(prodId);
              }
           }
        });
      });

      // Format for Supabase Insertion
      const toInsert = [];
      Object.keys(aggregates).forEach(month => {
         // 1. Insert Brand-level row (product_id is null)
         toInsert.push({
           brand_id: activeBrand.id,
           product_id: null,
           month: month,
           revenue: aggregates[month].brandLevel.revenue,
           orders_count: aggregates[month].brandLevel.count
         });
         
         // 2. Insert Product-level rows
         Object.keys(aggregates[month].products).forEach(prodId => {
           toInsert.push({
             brand_id: activeBrand.id,
             product_id: prodId,
             month: month,
             revenue: aggregates[month].products[prodId].revenue,
             orders_count: aggregates[month].products[prodId].count
           });
         });
      });

      // Insert in chunks of 50 to respect Supabase limits
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error } = await supabase.from('sales_data').upsert(chunk, { onConflict: 'brand_id, product_id, month' });
        if (error) console.error("Upsert chunk error:", error);
      }

      await refreshSales();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
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
          <div className="page-sub">{connection ? connection.shop_domain : 'No store connected'}</div>
        </div>
        <div className="topbar-right">
          {connection && (
            <button className="btn btn-primary" onClick={syncSales} disabled={syncing}>
              {syncing ? <><i className="ph ph-spinner ph-spin"/> Syncing...</> : <><i className="ph ph-arrows-clockwise"/> Sync Sales</>}
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
            {!connection ? (
              <EmptyState 
                icon="ph-plug" 
                color="var(--c-analytics)" 
                title="Shopify Not Connected" 
                sub="Connect your store in the Connections tab to unlock live sales data and profitability tracking." 
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
                  <button className="btn btn-sm" onClick={disconnectStore}>Disconnect</button>
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
            <EmptyState icon="ph-plug" color="var(--c-analytics)" title="No other integrations yet" sub="TikTok Shop and other storefronts will connect here once available." />
          </>
        )}
      </div>
    </>
  );
}