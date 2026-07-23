// la-guia/src/lib/aiApi.js
// Central caller for the metered AI endpoints. Attaches the user's Supabase JWT
// (the backend now requires it) and the active brand id automatically, then
// returns the raw Response so existing call sites keep their own .json() /
// { ok } handling — the only change at each site is fetch(url,{...}) -> aiPost().
import { supabase } from './supabase.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ProductsContext pushes the active brand id here whenever it changes, so this
// plain module can inject brandId without being a React hook.
let activeBrandId = null;
export function setActiveBrandId(id) { activeBrandId = id || null; }

// A callback (registered by AIUsageContext) invoked whenever a metered call
// comes back 402 out-of-credits, so the out-of-credits modal can pop from
// anywhere without every call site having to handle it.
let insufficientHandler = null;
export function setInsufficientCreditsHandler(fn) { insufficientHandler = fn; }

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Start a one-time credit-pack checkout for the active brand. Returns the
// Stripe Checkout URL to redirect to.
export async function createTopupSession(packId, brandEmail) {
  const res = await fetch(`${API_BASE}/api/create-topup-session`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ packId, brandId: activeBrandId, brandEmail }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not start checkout.');
  return data.url;
}

// Authenticated POST for non-metered endpoints (JWT attached, no brandId
// injection) — billing/account calls the backend now requires auth on.
export async function apiPost(path, body = {}) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
}

// POST to a metered AI endpoint with the Supabase JWT + active brandId injected.
// `body` is merged over { brandId } (so a caller can still override brandId).
// Returns the raw fetch Response.
export async function aiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ brandId: activeBrandId, ...body }),
  });
  // Out of credits → pop the top-up modal (if a handler is registered). The
  // response is still returned so the call site's own error handling runs too.
  if (res.status === 402 && insufficientHandler) {
    try { insufficientHandler(); } catch { /* no-op */ }
  }
  return res;
}
