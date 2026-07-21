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

// POST to a metered AI endpoint with the Supabase JWT + active brandId injected.
// `body` is merged over { brandId } (so a caller can still override brandId).
// Returns the raw fetch Response.
export async function aiPost(path, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || null;
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ brandId: activeBrandId, ...body }),
  });
}
