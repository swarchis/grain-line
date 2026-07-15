import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const ProductionContext = createContext(null);

export function ProductionProvider({ children }) {
  const { activeBrand } = useProducts();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuesByOrder, setIssuesByOrder] = useState({});
  const [updatesByOrder, setUpdatesByOrder] = useState({});
  const [paymentsByOrder, setPaymentsByOrder] = useState({}); // NEW
  const [allPayments, setAllPayments] = useState([]); // brand-wide, for Financial Tools / Analytics

  const loadOrders = async () => {
    if (!activeBrand) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, products(name), vendors(name)')
        .eq('brand_id', activeBrand.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPayments = async () => {
    if (!activeBrand) { setAllPayments([]); return; }
    const { data, error } = await supabase
      .from('production_payments')
      .select('*, production_orders(product_id, vendor_id)')
      .eq('brand_id', activeBrand.id)
      .order('paid_at', { ascending: true });
    if (error) { console.error('Error loading brand payments:', error); return; }
    setAllPayments(data || []);
  };

  useEffect(() => {
    loadOrders();
    loadAllPayments();
  }, [activeBrand]);

  const createOrder = async (orderData) => {
    const { data, error } = await supabase
      .from('production_orders')
      .insert([{
        brand_id: activeBrand.id,
        ...orderData,
        checkpoints: [
          { id: `cp-cutting`, label: 'Cutting', status: 'pending' },
          { id: `cp-sewing`, label: 'Sewing', status: 'pending' },
          { id: `cp-qc`, label: 'Quality Control', status: 'pending' },
          { id: `cp-packing`, label: 'Packing', status: 'pending' }
        ]
      }])
      .select('*, products(name), vendors(name)')
      .single();

    if (error) throw error;
    setOrders(prev => [data, ...prev]);
    return data;
  };

  const updateOrderStage = async (id, stage) => {
    const updates = { stage, delivered_at: stage === 'Delivered' ? new Date().toISOString() : null };
    let { error } = await supabase.from('production_orders').update(updates).eq('id', id);
    if (error) {
      ({ error } = await supabase.from('production_orders').update({ stage }).eq('id', id));
      if (error) throw error;
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, stage } : o)));
      return;
    }
    setOrders(prev => prev.map(o => (o.id === id ? { ...o, ...updates } : o)));
  };

  const updateOrder = async (id, updates) => {
    const { data, error } = await supabase
      .from('production_orders')
      .update(updates)
      .eq('id', id)
      .select('*, products(name), vendors(name)')
      .single();

    if (error) throw error;
    setOrders(prev => prev.map(o => o.id === id ? data : o));
    return data;
  };

  const loadIssues = async (orderId) => {
    const { data, error } = await supabase.from('production_issues').select('*').eq('production_order_id', orderId).order('created_at', { ascending: false });
    if (error) { console.error('Error loading issues:', error); return issuesByOrder[orderId] || []; }
    setIssuesByOrder(prev => ({ ...prev, [orderId]: data || [] }));
    return data || [];
  };

  const addIssue = async (orderId, { severity, description }) => {
    const { data, error } = await supabase.from('production_issues').insert([{ production_order_id: orderId, severity: severity || 'Medium', description }]).select().single();
    if (error) throw error;
    setIssuesByOrder(prev => ({ ...prev, [orderId]: [data, ...(prev[orderId] || [])] }));
    return data;
  };

  const toggleIssueResolved = async (issue) => {
    const { data, error } = await supabase.from('production_issues').update({ resolved: !issue.resolved }).eq('id', issue.id).select().single();
    if (error) throw error;
    setIssuesByOrder(prev => ({ ...prev, [issue.production_order_id]: (prev[issue.production_order_id] || []).map(i => (i.id === issue.id ? data : i)) }));
    return data;
  };

  const loadUpdates = async (orderId) => {
    const { data, error } = await supabase.from('production_updates').select('*').eq('production_order_id', orderId).order('created_at', { ascending: false });
    if (error) { console.error('Error loading updates:', error); return updatesByOrder[orderId] || []; }
    setUpdatesByOrder(prev => ({ ...prev, [orderId]: data || [] }));
    return data || [];
  };

  const addUpdate = async (orderId, note) => {
    const { data, error } = await supabase.from('production_updates').insert([{ production_order_id: orderId, note }]).select().single();
    if (error) throw error;
    setUpdatesByOrder(prev => ({ ...prev, [orderId]: [data, ...(prev[orderId] || [])] }));
    return data;
  };

  // --- NEW: Payment Ledger Functions ---
  const loadPayments = async (orderId) => {
    const { data, error } = await supabase.from('production_payments').select('*').eq('production_order_id', orderId).order('paid_at', { ascending: false });
    if (error) { console.error('Error loading payments:', error); return paymentsByOrder[orderId] || []; }
    setPaymentsByOrder(prev => ({ ...prev, [orderId]: data || [] }));
    return data || [];
  };

  const addPayment = async (orderId, { amount, paid_at, note }) => {
    if (!activeBrand) throw new Error('No active brand');
    const { data, error } = await supabase.from('production_payments').insert([{
      brand_id: activeBrand.id,
      production_order_id: orderId,
      amount: Number(amount),
      paid_at,
      note: note || null
    }]).select().single();
    if (error) throw error;
    setPaymentsByOrder(prev => ({ ...prev, [orderId]: [data, ...(prev[orderId] || [])].sort((a,b) => new Date(b.paid_at) - new Date(a.paid_at)) }));
    loadAllPayments();
    return data;
  };

  const deletePayment = async (paymentId, orderId) => {
    const { error } = await supabase.from('production_payments').delete().eq('id', paymentId);
    if (error) throw error;
    setPaymentsByOrder(prev => ({ ...prev, [orderId]: (prev[orderId] || []).filter(p => p.id !== paymentId) }));
    setAllPayments(prev => prev.filter(p => p.id !== paymentId));
  };

  return (
    <ProductionContext.Provider value={{
      orders, loading, createOrder, updateOrderStage, updateOrder, refresh: loadOrders,
      issuesByOrder, loadIssues, addIssue, toggleIssueResolved,
      updatesByOrder, loadUpdates, addUpdate,
      paymentsByOrder, loadPayments, addPayment, deletePayment, // NEW
      allPayments, // brand-wide, for Financial Tools / Analytics
    }}>
      {children}
    </ProductionContext.Provider>
  );
}

export function useProduction() {
  const ctx = useContext(ProductionContext);
  if (!ctx) throw new Error('useProduction must be used inside ProductionProvider');
  return ctx;
}