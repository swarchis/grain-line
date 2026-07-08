import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const VendorsContext = createContext(null);

export function VendorsProvider({ children }) {
  const { activeBrand } = useProducts();
  const [vendors, setVendors] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBrand) {
      setVendors([]);
      setQuotes([]);
      setLoading(false);
      return;
    }
    loadData();
  }, [activeBrand]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: vendorData, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('brand_id', activeBrand.id)
        .order('created_at', { ascending: false });
      if (vendorError) throw vendorError;
      setVendors(vendorData || []);

      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*, vendors(name), products(name)')
        .eq('brand_id', activeBrand.id)
        .order('requested_at', { ascending: false });
      if (quoteError) throw quoteError;
      setQuotes(quoteData || []);
    } catch (err) {
      console.error('Error loading vendors/quotes:', err);
    } finally {
      setLoading(false);
    }
  }

  const addVendor = async ({ name, category, location, specialties, sourceNote }) => {
    const { data, error } = await supabase
      .from('vendors')
      .insert([{
        brand_id: activeBrand.id,
        name,
        category: category || null,
        location: location || null,
        label: 'Imported by user',
        specialties: specialties || [],
        source_note: sourceNote || null,
      }])
      .select()
      .single();
    if (error) throw error;
    setVendors(prev => [data, ...prev]);
    return data;
  };

  const requestQuote = async ({ vendorId, productId, message }) => {
    const { data, error } = await supabase
      .from('quotes')
      .insert([{
        brand_id: activeBrand.id,
        vendor_id: vendorId,
        product_id: productId,
        status: 'Requested',
        message: message || null,
      }])
      .select('*, vendors(name), products(name)')
      .single();
    if (error) throw error;
    setQuotes(prev => [data, ...prev]);
    return data;
  };

  const updateQuote = async (id, updates) => {
    const { data, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', id)
      .select('*, vendors(name), products(name)')
      .single();
    if (error) throw error;
    setQuotes(prev => prev.map(q => (q.id === id ? data : q)));
    return data;
  };

  return (
    <VendorsContext.Provider value={{ vendors, quotes, loading, addVendor, requestQuote, updateQuote, refresh: loadData }}>
      {children}
    </VendorsContext.Provider>
  );
}

export function useVendors() {
  const ctx = useContext(VendorsContext);
  if (!ctx) throw new Error('useVendors must be used inside VendorsProvider');
  return ctx;
}
