import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';
import { getPlan } from '../data/plans.js';
import { creditCost } from '../data/aiCredits.js';

// AI credit balance for the active brand. Credits are granted by subscription
// (Stripe invoice.paid) and debited server-side per AI call; this context just
// reads the balance for display/gating. The hook name and several fields are
// kept from the old count-based version so existing consumers keep working.
const AIUsageContext = createContext(null);

export function AIUsageProvider({ children }) {
  const { activeBrand } = useProducts();
  const [subscriptionCredits, setSubscriptionCredits] = useState(0);
  const [topupCredits, setTopupCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBrand) { setSubscriptionCredits(0); setTopupCredits(0); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('brand_ai_credits')
        .select('subscription_credits, topup_credits')
        .eq('brand_id', activeBrand.id)
        .maybeSingle();
      if (error) throw error;
      setSubscriptionCredits(data?.subscription_credits ?? 0);
      setTopupCredits(data?.topup_credits ?? 0);
    } catch (err) {
      console.error('Error loading AI credits:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBrand?.id]);

  useEffect(() => { load(); }, [load]);

  const plan = getPlan(activeBrand?.plan_tier || 'free');
  const limit = plan.limits.creditsPerMonth ?? 0;
  const credits = subscriptionCredits + topupCredits;
  const costOf = (feature) => creditCost(feature);
  const canAfford = (feature) => credits >= creditCost(feature);
  const canUse = credits > 0;

  // The server debits credits atomically now; this just re-reads the balance so
  // the UI updates after a call. Kept async + same name for existing callers.
  const logUsage = useCallback(async () => { await load(); }, [load]);

  const value = {
    // credit-native
    credits, subscriptionCredits, topupCredits, costOf, canAfford,
    // back-compat with existing consumers (count-era field names)
    limit, remaining: credits, canUse, usedThisMonth: Math.max(0, limit - subscriptionCredits),
    loading, plan, logUsage, refresh: load,
  };

  return <AIUsageContext.Provider value={value}>{children}</AIUsageContext.Provider>;
}

export function useAIUsage() {
  const ctx = useContext(AIUsageContext);
  if (!ctx) throw new Error('useAIUsage must be used inside AIUsageProvider');
  return ctx;
}
