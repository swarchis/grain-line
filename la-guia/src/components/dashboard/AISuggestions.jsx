import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductsContext.jsx';
import { useProduction } from '../../context/ProductionContext.jsx';
import { useTeam } from '../../context/TeamContext.jsx';
import { useAIUsage } from '../../context/AIUsageContext.jsx';
import { aiPost } from '../../lib/aiApi.js';
import CreditCost from '../CreditCost.jsx';

const CATEGORY_PATH = {
  readiness: '/readiness',
  deadline: '/production',
  vendor: '/vendors',
  budget: '/design',
  team: '/settings',
  billing: '/settings',
  design: '/design',
};

const SEVERITY_ICON = { warning: 'ph-warning', success: 'ph-check-circle', info: 'ph-lightbulb' };
const SEVERITY_COLOR = { warning: 'var(--amber)', success: 'var(--green)', info: 'var(--accent)' };

function cacheKey(brandId) {
  return `grainline_suggestions_${brandId}_${new Date().toISOString().slice(0, 10)}`;
}

export default function AISuggestions() {
  const navigate = useNavigate();
  const { activeBrand, products } = useProducts();
  const { orders } = useProduction();
  const { members } = useTeam();
  const { canAfford, openTopup, plan, logUsage, limit, usedThisMonth } = useAIUsage();

  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cached once per brand per calendar day so opening the dashboard doesn't
  // silently burn AI usage on every visit — refresh is an explicit action.
  useEffect(() => {
    if (!activeBrand) return;
    try {
      const cached = localStorage.getItem(cacheKey(activeBrand.id));
      setSuggestions(cached ? JSON.parse(cached) : null);
    } catch { setSuggestions(null); }
  }, [activeBrand?.id]);

  const gateFlags = products.filter(p => p.readiness < 80 && p.stage === 'sourcing').length;
  const upcomingDeadlines = orders
    .filter(o => o.due_date && o.stage !== 'Delivered')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5)
    .map(o => ({ product: o.products?.name || o.po_number || 'Order', due_date: o.due_date, stage: o.stage }));

  const fetchSuggestions = async () => {
    if (!activeBrand || loading) return;
    if (!canAfford('dashboard-suggestions')) { openTopup(); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await aiPost('/api/dashboard-suggestions', {
          brand: { name: activeBrand.name, plan_tier: activeBrand.plan_tier },
          products: products.map(p => ({ name: p.name, stage: p.stage, readiness: p.readiness, risk: p.risk, budget: p.budget })),
          upcomingDeadlines,
          gateFlags,
          aiUsage: { used: usedThisMonth, limit },
          seats: { used: members.length, limit: plan.limits.teamMembers },
        });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSuggestions(data.suggestions);
      try { localStorage.setItem(cacheKey(activeBrand.id), JSON.stringify(data.suggestions)); } catch {}
      logUsage('dashboard-suggestions');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-tour="ai-suggestions-widget" className="card-raised" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>AI suggestions</span>
        {suggestions && (
          <span style={{ fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer' }} onClick={fetchSuggestions}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </span>
        )}
      </div>

      {!suggestions && !loading && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', marginBottom: 10 }}>Get a quick read on what needs attention today.</div>
          <button className="btn btn-sm btn-primary" onClick={fetchSuggestions}>
            <i className="ph ph-sparkle" /> Get suggestions
            <CreditCost feature="dashboard-suggestions" style={{ marginLeft: 6, color: 'inherit', opacity: 0.8 }} />
          </button>
        </div>
      )}

      {loading && <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><i className="ph ph-circle-notch ph-spin" /> Thinking it over…</div>}

      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

      {suggestions && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 9, cursor: CATEGORY_PATH[s.category] ? 'pointer' : 'default' }}
              onClick={() => CATEGORY_PATH[s.category] && navigate(CATEGORY_PATH[s.category])}
            >
              <i className={`ph ${SEVERITY_ICON[s.severity] || 'ph-lightbulb'}`} style={{ fontSize: 14, color: SEVERITY_COLOR[s.severity] || 'var(--accent)', marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Nothing stands out — everything looks on track.</div>
      )}
    </div>
  );
}
