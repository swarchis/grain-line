import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const VendorsContext = createContext(null);

export function VendorsProvider({ children }) {
  const { activeBrand } = useProducts();
  const [vendors, setVendors] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [negotiationsByQuote, setNegotiationsByQuote] = useState({});
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

      // Defensive: rfqs may not exist yet (migration 017 not run) — never let
      // that break vendor/quote loading, which the rest of the app depends on.
      const rfqRes = await supabase.from('rfqs').select('*').eq('brand_id', activeBrand.id).order('created_at', { ascending: false });
      setRfqs(rfqRes.error ? [] : (rfqRes.data || []));
    } catch (err) {
      console.error('Error loading vendors/quotes:', err);
    } finally {
      setLoading(false);
    }
  }

  const addVendor = async ({ name, category, location, specialties, sourceNote, moq, leadTime, label, certifications, capabilities, priceRange }) => {
    const baseRow = {
      brand_id: activeBrand.id,
      name,
      category: category || null,
      location: location || null,
      label: label || 'Imported by user',
      specialties: specialties || [],
      source_note: sourceNote || null,
      moq: moq ?? null,
      lead_time: leadTime || null,
    };
    let { data, error } = await supabase
      .from('vendors')
      .insert([{ ...baseRow, certifications: certifications || [], capabilities: capabilities || [], price_range: priceRange || null }])
      .select()
      .single();
    if (error) {
      // Falls back to the pre-015 columns if migration 015 hasn't been run
      // yet, so adding a vendor never hard-fails over the newer optional fields.
      ({ data, error } = await supabase.from('vendors').insert([baseRow]).select().single());
    }
    if (error) throw error;
    setVendors(prev => [data, ...prev]);
    return data;
  };

  const requestQuote = async ({ vendorId, productId, message, preferences }) => {
    const { data, error } = await supabase
      .from('quotes')
      .insert([{
        brand_id: activeBrand.id,
        vendor_id: vendorId,
        product_id: productId,
        status: 'Requested',
        message: message || null,
        preferences: preferences || {},
      }])
      .select('*, vendors(name), products(name)')
      .single();
    if (error) throw error;
    setQuotes(prev => [data, ...prev]);
    // A quote request is a meaningful engagement — bump the vendor off the default label.
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor && vendor.label === 'Imported by user') {
      updateVendor(vendorId, { label: 'Previously quoted' }).catch(() => {});
    }
    return data;
  };

  // Fans one RFQ out to any number of vendors at once — one `rfqs` row plus
  // one `quotes` row per vendor, all sharing the same preferences so the
  // Compare Matrix and Cost tools see a consistent quantity/target/deadline
  // across every vendor that was asked.
  const createRFQ = async ({ productId, vendorIds, quantity, targetUnitCost, deadline, message }) => {
    if (!activeBrand) throw new Error('No active brand');
    if (!vendorIds || vendorIds.length === 0) throw new Error('Select at least one vendor');

    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .insert([{
        brand_id: activeBrand.id,
        product_id: productId,
        quantity: quantity || null,
        target_unit_cost: targetUnitCost ? Number(targetUnitCost) : null,
        deadline: deadline || null,
        message: message || null,
      }])
      .select()
      .single();
    if (rfqError) throw rfqError;

    const preferences = {};
    if (quantity) preferences.quantity = quantity;
    if (targetUnitCost) preferences.targetUnitCost = targetUnitCost;
    if (deadline) preferences.deadline = deadline;

    const rows = vendorIds.map(vendorId => ({
      brand_id: activeBrand.id,
      vendor_id: vendorId,
      product_id: productId,
      rfq_id: rfq.id,
      status: 'Requested',
      message: message || null,
      preferences,
    }));
    const { data: newQuotes, error: quotesError } = await supabase
      .from('quotes')
      .insert(rows)
      .select('*, vendors(name), products(name)');
    if (quotesError) throw quotesError;

    setRfqs(prev => [rfq, ...prev]);
    setQuotes(prev => [...newQuotes, ...prev]);

    vendorIds.forEach(vendorId => {
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor && vendor.label === 'Imported by user') {
        updateVendor(vendorId, { label: 'Previously quoted' }).catch(() => {});
      }
    });

    return { rfq, quotes: newQuotes };
  };

  const loadNegotiations = async (quoteId) => {
    const { data, error } = await supabase
      .from('quote_negotiations')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error loading negotiations:', error); return negotiationsByQuote[quoteId] || []; }
    setNegotiationsByQuote(prev => ({ ...prev, [quoteId]: data || [] }));
    return data || [];
  };

  // 'counter' = what the founder proposed back to the vendor; 'response' =
  // what the founder heard back — both are the founder's own record-keeping,
  // since vendors aren't Atelier users and can't post into this directly.
  const addNegotiation = async (quoteId, { direction, amount, note }) => {
    const { data, error } = await supabase
      .from('quote_negotiations')
      .insert([{ quote_id: quoteId, direction: direction || 'counter', amount: amount != null && amount !== '' ? Number(amount) : null, note: note || null }])
      .select()
      .single();
    if (error) throw error;
    setNegotiationsByQuote(prev => ({ ...prev, [quoteId]: [...(prev[quoteId] || []), data] }));
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

  const updateVendor = async (id, updates) => {
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setVendors(prev => prev.map(v => (v.id === id ? data : v)));
    return data;
  };

  const toggleFavorite = vendor => updateVendor(vendor.id, { favorited: !vendor.favorited });
  const toggleBlock = vendor => updateVendor(vendor.id, { blocked: !vendor.blocked });

  return (
    <VendorsContext.Provider value={{
      vendors, quotes, rfqs, loading, addVendor, requestQuote, createRFQ, updateQuote, updateVendor, toggleFavorite, toggleBlock,
      negotiationsByQuote, loadNegotiations, addNegotiation, refresh: loadData,
    }}>
      {children}
    </VendorsContext.Provider>
  );
}

export function useVendors() {
  const ctx = useContext(VendorsContext);
  if (!ctx) throw new Error('useVendors must be used inside VendorsProvider');
  return ctx;
}
