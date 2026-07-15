import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';

const SalesContext = createContext(null);

export function SalesProvider({ children }) {
  const { activeBrand } = useProducts();
  const [connections, setConnections] = useState([]);
  const [monthlySales, setMonthlySales] = useState([]);
  const [productSales, setProductSales] = useState({});
  const [loading, setLoading] = useState(true);

  const loadSalesData = async () => {
    if (!activeBrand) {
      setConnections([]);
      setMonthlySales([]);
      setProductSales({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: conns } = await supabase
        .from('store_connections')
        .select('*')
        .eq('brand_id', activeBrand.id);

      setConnections(conns || []);

      if (conns && conns.length > 0) {
        const { data: sales } = await supabase
          .from('sales_data')
          .select('month, revenue, orders_count, product_id, platform')
          .eq('brand_id', activeBrand.id)
          .order('month', { ascending: true });

        const aggregated = [];
        const byProduct = {};

        (sales || []).forEach(row => {
          // Aggregate total brand revenue across every connected platform
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

  // Scoped to one platform — disconnecting Shopify must not wipe a
  // separately-connected WooCommerce/Etsy store's own connection or
  // revenue history (it used to delete every sales_data row for the
  // brand regardless of platform, back when Shopify was the only one).
  const disconnectStore = async (platform = 'shopify') => {
    const conn = connections.find(c => c.platform === platform);
    if (!conn || !activeBrand) return;
    await supabase.from('store_connections').delete().eq('id', conn.id);
    await supabase.from('sales_data').delete().eq('brand_id', activeBrand.id).eq('platform', platform);
    await loadSalesData();
  };

  const connection = connections.find(c => c.platform === 'shopify') || null;

  return (
    <SalesContext.Provider value={{ connection, connections, monthlySales, productSales, loading, disconnectStore, refresh: loadSalesData }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used inside SalesProvider');
  return ctx;
}
