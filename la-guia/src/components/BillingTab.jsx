import React, { useEffect, useState } from 'react';
import { PLANS, getPlan, planIndex } from '../data/plans.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';

export default function BillingTab() {
  const { activeBrand, updateBrand } = useProducts();
  const { user } = useAuth();
  const { usedThisMonth, limit } = useAIUsage();

  const [confirming, setConfirming] = useState(false);
  const [banner, setBanner] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [devSwitching, setDevSwitching] = useState(null);

  const currentTier = activeBrand?.plan_tier || 'free';
  const currentPlan = getPlan(currentTier);

  // On return from Stripe Checkout, verify the session server-side, then
  // write the new plan under the user's own session (RLS-respecting) —
  // never trust the redirect URL alone.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('billing');
    if (!status || !activeBrand) return;

    if (status === 'success') {
      const sessionId = params.get('session_id');
      setConfirming(true);
      fetch('http://localhost:3001/api/confirm-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
        .then(r => r.json())
        .then(async (data) => {
          if (!data.ok) throw new Error(data.error);
          await updateBrand({ plan_tier: data.plan, stripe_customer_id: data.customerId, stripe_subscription_id: data.subscriptionId });
          setBanner({ type: 'success', text: `You're now on the ${getPlan(data.plan).name} plan.` });
        })
        .catch(err => setBanner({ type: 'error', text: 'Could not confirm your upgrade: ' + err.message }))
        .finally(() => setConfirming(false));
    } else if (status === 'cancelled') {
      setBanner({ type: 'info', text: 'Checkout cancelled — your plan is unchanged.' });
    }
    window.history.replaceState({}, '', '/settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // No webhook is wired up to catch a cancellation made through the Stripe
  // portal, so reconcile against the real subscription status whenever this
  // tab loads for a brand that has one on file — catches "cancelled last
  // week, still shows Premium" within one page load instead of never.
  useEffect(() => {
    if (!activeBrand?.stripe_subscription_id || activeBrand.plan_tier === 'free') return;
    fetch('http://localhost:3001/api/subscription-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: activeBrand.stripe_subscription_id }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        if (!data.active && activeBrand.plan_tier !== 'free') {
          updateBrand({ plan_tier: 'free' });
          setBanner({ type: 'info', text: 'Your subscription is no longer active — you\'ve been moved back to the Free plan.' });
        } else if (data.active && data.plan && data.plan !== activeBrand.plan_tier) {
          updateBrand({ plan_tier: data.plan });
        }
      })
      .catch(() => {}); // best-effort — don't block the page on this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id, activeBrand?.stripe_subscription_id]);

  const startCheckout = async (planId) => {
    setCheckoutLoading(planId);
    try {
      const res = await fetch('http://localhost:3001/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, brandId: activeBrand.id, brandEmail: user?.email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setCheckoutLoading(null);
    }
  };

  // Local-testing-only shortcut to try every plan's gating without paying
  // Stripe for it — writes plan_tier directly, bypassing Checkout entirely.
  // Never rendered in a production build (see import.meta.env.DEV guard below).
  const devSetPlan = async (planId) => {
    setDevSwitching(planId);
    try {
      await updateBrand({ plan_tier: planId });
      setBanner({ type: 'info', text: `Dev override: plan set to ${getPlan(planId).name} (no Stripe involved).` });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setDevSwitching(null);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: activeBrand.stripe_customer_id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {(confirming || banner) && (
        <div className="form-hint" style={{
          marginBottom: 18, padding: '10px 14px', borderRadius: 8,
          background: banner?.type === 'error' ? 'var(--red-bg)' : banner?.type === 'success' ? 'var(--green-bg)' : 'var(--bg-3)',
          border: `1px solid ${banner?.type === 'error' ? 'var(--red-border)' : banner?.type === 'success' ? 'var(--green-border)' : 'var(--border-2)'}`,
          color: banner?.type === 'error' ? 'var(--red)' : banner?.type === 'success' ? 'var(--green)' : 'var(--ink-2)',
        }}>
          {confirming ? <><i className="ph ph-circle-notch ph-spin" /> Confirming your upgrade…</> : banner.text}
        </div>
      )}

      <div className="card-raised" style={{ marginBottom: 22 }}>
        <div className="card-header"><span className="card-title">Current plan</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{currentPlan.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{currentPlan.price}{currentPlan.priceSuffix ? ` ${currentPlan.priceSuffix}` : ''}</div>
              {currentTier !== 'free' && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                  AI usage this month: <strong style={{ color: 'var(--ink-2)' }}>{usedThisMonth} / {limit}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="tag tag-accent" style={{ textTransform: 'capitalize' }}>{currentTier}</span>
              {currentTier !== 'free' && activeBrand?.stripe_customer_id && (
                <button className="btn btn-sm" onClick={openPortal} disabled={portalLoading}>
                  {portalLoading ? 'Opening…' : 'Manage subscription'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section-label">Plans</div>
      <div className="grid-3" style={{ marginBottom: 20, alignItems: 'stretch' }}>
        {PLANS.map(p => {
          const isCurrent = p.id === currentTier;
          const isUpgrade = planIndex(p.id) > planIndex(currentTier);
          const isExpanded = expanded === p.id;
          return (
            <div key={p.id} className="card-raised" style={{ padding: 20, display: 'flex', flexDirection: 'column', border: isCurrent ? '1.5px solid var(--accent)' : undefined }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, minHeight: 32 }}>{p.tagline}</div>
              <div style={{ margin: '10px 0 14px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700 }}>{p.price}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}> {p.priceSuffix}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                {(isExpanded ? p.features : p.summary.map(text => ({ text }))).map((feat, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 7 }}>
                    <i className="ph ph-check" style={{ color: 'var(--green)', marginTop: 2, flexShrink: 0 }} />
                    <span>{feat.text}{feat.roadmap && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber)', border: '1px solid var(--amber-border)', borderRadius: 99, padding: '1px 6px' }}>Coming soon</span>}</span>
                  </li>
                ))}
              </ul>
              <button className="btn btn-sm" style={{ marginBottom: 8, background: 'none', border: 'none', color: 'var(--ink-3)', textDecoration: 'underline', boxShadow: 'none' }} onClick={() => setExpanded(isExpanded ? null : p.id)}>
                {isExpanded ? 'Show summary' : `See all ${p.features.length} features`}
              </button>
              {isCurrent ? (
                <button className="btn btn-sm" disabled style={{ width: '100%', justifyContent: 'center', opacity: 0.6 }}>Current plan</button>
              ) : p.id === 'free' ? (
                <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} disabled title="Use the Stripe customer portal to downgrade">
                  Downgrade via portal
                </button>
              ) : (
                <button
                  className={`btn btn-sm ${isUpgrade ? 'btn-primary' : ''}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => startCheckout(p.id)}
                  disabled={checkoutLoading === p.id}
                >
                  {checkoutLoading === p.id ? 'Redirecting…' : isUpgrade ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="form-hint">
        <i className="ph ph-info" style={{ marginRight: 4 }} /> Some Premium features are marked "Coming soon" — they're on the roadmap but not built into the app yet.
      </div>

      {import.meta.env.DEV && (
        <div className="card-raised" style={{ marginTop: 22, padding: 18, border: '1px dashed var(--amber-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <i className="ph ph-flask" style={{ color: 'var(--amber)' }} />
            <span className="card-title">Developer tools</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
            Local dev build only — jumps this brand straight to a plan tier so you can test its gating without going through Stripe. Never shown in production.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {PLANS.map(p => (
              <button
                key={p.id}
                className="btn btn-sm"
                disabled={devSwitching === p.id || currentTier === p.id}
                onClick={() => devSetPlan(p.id)}
                style={{ opacity: currentTier === p.id ? 0.5 : 1 }}
              >
                {devSwitching === p.id ? 'Setting…' : `Force ${p.name}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
