import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';
import { getPlan } from '../data/plans.js';

const AIUsageContext = createContext(null);

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function AIUsageProvider({ children }) {
  const { activeBrand } = useProducts();
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!activeBrand) { setUsedThisMonth(0); setLoading(false); return; }
    setLoading(true);
    try {
      const { count, error } = await supabase
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', activeBrand.id)
        .gte('created_at', monthStartISO());
      if (error) throw error;
      setUsedThisMonth(count || 0);
    } catch (err) {
      console.error('Error loading AI usage:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeBrand?.id]);

  const plan = getPlan(activeBrand?.plan_tier || 'free');
  const limit = plan.limits.aiPerMonth;
  const remaining = Math.max(0, limit - usedThisMonth);
  const canUse = remaining > 0;

  // Call right before an AI request; logs immediately (optimistic) since the
  // point is to cap usage, not perfectly reconcile against failed calls.
  const logUsage = async (feature) => {
    if (!activeBrand) return;
    setUsedThisMonth(u => u + 1);
    const { error } = await supabase.from('ai_usage_log').insert([{ brand_id: activeBrand.id, feature }]);
    if (error) console.error('Failed to log AI usage', error);
  };

  return (
    <AIUsageContext.Provider value={{ usedThisMonth, limit, remaining, canUse, loading, plan, logUsage, refresh: load }}>
      {children}
    </AIUsageContext.Provider>
  );
}

export function useAIUsage() {
  const ctx = useContext(AIUsageContext);
  if (!ctx) throw new Error('useAIUsage must be used inside AIUsageProvider');
  return ctx;
}
