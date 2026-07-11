import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const MaterialsContext = createContext(null);

// Materials are a shared reference library, not brand-scoped — load once per
// session rather than per-brand. Used by MaterialLibrary/MaterialDetail and
// by the command palette's global search.
export function MaterialsProvider({ children }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('materials').select('*').order('name', { ascending: true });
      if (!error) setMaterials(data || []);
      else console.error('Error loading materials:', error);
      setLoading(false);
    }
    load();
  }, []);

  const deleteMaterial = async (id) => {
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw error;
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  return (
    <MaterialsContext.Provider value={{ materials, loading, deleteMaterial }}>
      {children}
    </MaterialsContext.Provider>
  );
}

export function useMaterials() {
  const ctx = useContext(MaterialsContext);
  if (!ctx) throw new Error('useMaterials must be used inside MaterialsProvider');
  return ctx;
}
