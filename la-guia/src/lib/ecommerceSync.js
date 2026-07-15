// Per-platform adapters for pulling orders/inventory from a connected
// storefront. One sync engine, not a copy-pasted syncSales() per platform
// — SalesDashboard.jsx calls these and does the SKU-matching/aggregation
// itself (same shape as the original Shopify-only sync), so every
// platform's raw order format gets normalized in one place per adapter
// rather than leaking platform-specific fields further into the app.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Normalizes a WooCommerce order into the same shape syncSales() already
// expects from Shopify: { created_at, total_price, line_items: [{ sku, price, quantity }] }.
function normalizeWooOrder(o) {
  return {
    created_at: o.date_created,
    total_price: o.total,
    line_items: (o.line_items || []).map(li => ({ sku: li.sku, price: li.price, quantity: li.quantity })),
  };
}

// Etsy access tokens expire hourly. Refreshes ~1 minute before expiry and
// hands the new token back via onRefreshed so the caller can persist it
// to store_connections — this module has no Supabase access itself, by
// design (it stays a pure per-platform API adapter).
async function ensureFreshEtsyToken(conn, onRefreshed) {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60 * 1000) return conn;
  const { accessToken, refreshToken, expiresIn } = await postJSON('/api/etsy/refresh-token', { refreshToken: conn.refresh_token });
  const refreshed = { ...conn, access_token: accessToken, refresh_token: refreshToken, token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() };
  if (onRefreshed) await onRefreshed(refreshed);
  return refreshed;
}

export const platformAdapters = {
  woocommerce: {
    label: 'WooCommerce',
    async validate(conn) {
      await postJSON('/api/woocommerce/validate', { storeUrl: conn.shop_domain, consumerKey: conn.api_key, consumerSecret: conn.access_token });
    },
    async fetchOrders(conn) {
      const { orders } = await postJSON('/api/woocommerce/fetch-orders', { storeUrl: conn.shop_domain, consumerKey: conn.api_key, consumerSecret: conn.access_token });
      return (orders || []).map(normalizeWooOrder);
    },
    async fetchInventory(conn) {
      const { products } = await postJSON('/api/woocommerce/fetch-inventory', { storeUrl: conn.shop_domain, consumerKey: conn.api_key, consumerSecret: conn.access_token });
      return products || [];
    },
  },
  etsy: {
    label: 'Etsy',
    async fetchOrders(conn, onRefreshed) {
      const fresh = await ensureFreshEtsyToken(conn, onRefreshed);
      const { receipts } = await postJSON('/api/etsy/fetch-orders', { shopId: fresh.shop_domain, accessToken: fresh.access_token });
      return receipts || [];
    },
    async fetchInventory(conn, onRefreshed) {
      const fresh = await ensureFreshEtsyToken(conn, onRefreshed);
      const { listings } = await postJSON('/api/etsy/fetch-inventory', { shopId: fresh.shop_domain, accessToken: fresh.access_token });
      return listings || [];
    },
  },
};
