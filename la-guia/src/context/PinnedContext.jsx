import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const PinnedContext = createContext(null);

// A unified pin concept across entity types, superseding the two separate,
// differently-named is_favorite (products)/favorited (vendors) booleans —
// those columns stay in place, unused, rather than a destructive rename.
// Anything can be pinned by passing its entity_type ('product' | 'vendor' |
// 'material' | 'tech_pack' | 'collection' | ...) and id.
export function PinnedProvider({ children }) {
  const { activeBrand } = useProducts();
  const [pinned, setPinned] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!activeBrand) { setPinned([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('pinned_items').select('*').eq('brand_id', activeBrand.id).order('pinned_at', { ascending: false });
    if (!error) setPinned(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeBrand]);

  const isPinned = (entityType, entityId) => pinned.some(p => p.entity_type === entityType && p.entity_id === entityId);

  const togglePin = async (entityType, entityId) => {
    const existing = pinned.find(p => p.entity_type === entityType && p.entity_id === entityId);
    if (existing) {
      await supabase.from('pinned_items').delete().eq('id', existing.id);
      setPinned(prev => prev.filter(p => p.id !== existing.id));
    } else {
      const { data, error } = await supabase.from('pinned_items').insert([{ brand_id: activeBrand.id, entity_type: entityType, entity_id: entityId }]).select().single();
      if (!error) setPinned(prev => [data, ...prev]);
    }
  };

  return (
    <PinnedContext.Provider value={{ pinned, loading, isPinned, togglePin, refresh: load }}>
      {children}
    </PinnedContext.Provider>
  );
}

export function usePinned() {
  const ctx = useContext(PinnedContext);
  if (!ctx) throw new Error('usePinned must be used inside PinnedProvider');
  return ctx;
}
