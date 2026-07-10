import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const SalesContext = createContext(null);

export function SalesProvider({ children }) {
  const { activeBrand } = useProducts();
  const [connection, setConnection] = useState(null);
  const [monthlySales, setMonthlySales] = useState([]);
  const [productSales, setProductSales] = useState({});
  const [loading, setLoading] = useState(true);

  const loadSalesData = async () => {
    if (!activeBrand) {
      setConnection(null);
      setMonthlySales([]);
      setProductSales({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: conn } = await supabase
        .from('store_connections')
        .select('*')
        .eq('brand_id', activeBrand.id)
        .eq('platform', 'shopify')
        .maybeSingle();
      
      setConnection(conn);

      if (conn) {
        const { data: sales } = await supabase
          .from('sales_data')
          .select('month, revenue, orders_count, product_id')
          .eq('brand_id', activeBrand.id)
          .order('month', { ascending: true });

        const aggregated = [];
        const byProduct = {};

        (sales || []).forEach(row => {
          // Aggregate total brand revenue
          const existing = aggregated.find(a => a.month === row.month);
          if (existing) {
            existing.revenue += Number(row.revenue);
            existing.orders_count += Number(row.orders_count);
          } else {
            aggregated.push({ month: row.month, revenue: Number(row.revenue), orders_count: Number(row.orders_count) });
          }

          // Group by specific products for ProductInsights
          if (row.product_id) {
            if (!byProduct[row.product_id]) byProduct[row.product_id] = [];
            byProduct[row.product_id].push({ month: row.month, revenue: Number(row.revenue), orders_count: Number(row.orders_count) });
          }
        });

        setMonthlySales(aggregated);
        setProductSales(byProduct);
      } else {
        setMonthlySales([]);
        setProductSales({});
      }
    } catch (err) {
      console.error("Error loading sales data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSalesData(); }, [activeBrand]);

  const disconnectStore = async () => {
    if (!connection) return;
    await supabase.from('store_connections').delete().eq('id', connection.id);
    await supabase.from('sales_data').delete().eq('brand_id', activeBrand.id);
    setConnection(null);
    setMonthlySales([]);
    setProductSales({});
  };

  return (
    <SalesContext.Provider value={{ connection, monthlySales, productSales, loading, disconnectStore, refresh: loadSalesData }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used inside SalesProvider');
  return ctx;
}