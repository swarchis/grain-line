import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesData } from '../data/mockData.js';
import { currency } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-chart-line-up' },
  { key: 'connections', label: 'Connections', icon: 'ph-plug' },
];

export default function SalesDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const { products, loading } = useProducts();
  
  const maxRevenue = Math.max(...salesData.monthly.map(m => m.revenue));

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-analytics)' }}>Analytics & Sales</div>
            <h1 className="page-title">Sales Dashboard</h1>
          </div>
          <div className="page-sub">{salesData.connectedStore}</div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-analytics)" />

      <div className="content">
        {tab === 'overview' && (
          <>
            <div className="stats-row">
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Total revenue</div>
                <div className="stat-value">{currency(salesData.totalRevenue)}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Total orders</div>
                <div className="stat-value">{salesData.totalOrders}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Active Designs</div>
                <div className="stat-value">{products.length}</div>
              </div>
              <div className="stat-card" style={{ '--stat-accent': 'var(--c-analytics)' }}>
                <div className="stat-label">Avg. order value</div>
                <div className="stat-value">{currency(Math.round(salesData.totalRevenue / salesData.totalOrders))}</div>
              </div>
            </div>

            <div className="card-raised" style={{ marginBottom: 24 }}>
              <div className="card-header"><span className="card-title">Revenue by month</span></div>
              <div className="card-body">
                <div className="bar-chart">
                  {salesData.monthly.map(m => (
                    <div className="bar-chart-col" key={m.month}>
                      <div className="bar-chart-bar" style={{ height: `${(m.revenue / maxRevenue) * 100}%` }} />
                      <div className="bar-chart-label">{m.month}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="section-label">Your Products (Financial Modeling)</div>
            <div className="card">
              {loading ? (
                <div style={{ padding: 20, textAlign: 'center' }}><i className="ph ph-spinner ph-spin" /> Loading products...</div>
              ) : products.length === 0 ? (
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
            <div className="card-raised" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <span className="card-title">Shopify</span>
                <span className="tag tag-green">Connected</span>
              </div>
              <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{salesData.connectedStore}</div>
                <button className="btn btn-sm">Manage</button>
              </div>
            </div>
            <EmptyState icon="ph-plug" color="var(--c-analytics)" title="No other integrations yet" sub="TikTok Shop and other storefronts will connect here once available." />
          </>
        )}
      </div>
    </>
  );
}