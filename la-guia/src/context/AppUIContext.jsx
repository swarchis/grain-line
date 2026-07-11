import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useProducts } from './ProductsContext.jsx';

// Small shared UI state that needs to be reachable from both the Sidebar
// (which owns the actual search input and renders the shortcuts button) and
// anywhere else in the app that wants to trigger them (Ctrl+K, Home's search
// icon, the '?' key).
const AppUIContext = createContext(null);

// Real "recently viewed" tracking for the Home dashboard's "Continue where
// you left off" widget — every visit to a product/tech-pack/vendor/material/
// collection/production-order detail page is recorded, most-recent first.
// Scoped per brand and kept in localStorage (per-browser, not synced across
// devices — there's no server-side "last viewed" column to write to).
const ENTITY_PATTERNS = [
  { re: /^\/design\/([^/]+)$/, type: 'product' },
  { re: /^\/tech-packs\/([^/]+)$/, type: 'techpack' },
  { re: /^\/vendors\/([^/]+)$/, type: 'vendor' },
  { re: /^\/materials\/([^/]+)$/, type: 'material' },
  { re: /^\/collections\/([^/]+)$/, type: 'collection' },
  { re: /^\/production\/([^/]+)$/, type: 'production' },
  { re: /^\/products\/([^/]+)\/performance$/, type: 'performance' },
];

function recentKey(brandId) {
  return `grainline_recent_${brandId}`;
}

export function AppUIProvider({ children }) {
  const searchFocusRef = useRef(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const { activeBrand } = useProducts();
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (!activeBrand) { setRecent([]); return; }
    try { setRecent(JSON.parse(localStorage.getItem(recentKey(activeBrand.id))) || []); } catch { setRecent([]); }
  }, [activeBrand?.id]);

  useEffect(() => {
    if (!activeBrand) return;
    const match = ENTITY_PATTERNS.find(p => p.re.test(location.pathname));
    if (!match) return;
    const id = match.re.exec(location.pathname)[1];
    setRecent(prev => {
      const next = [
        { type: match.type, id, path: location.pathname, ts: Date.now() },
        ...prev.filter(r => !(r.type === match.type && r.id === id)),
      ].slice(0, 8);
      try { localStorage.setItem(recentKey(activeBrand.id), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [location.pathname, activeBrand?.id]);

  return (
    <AppUIContext.Provider value={{
      registerSearchFocus: (fn) => { searchFocusRef.current = fn; },
      focusSearch: () => searchFocusRef.current?.(),
      helpOpen,
      openHelp: () => setHelpOpen(true),
      closeHelp: () => setHelpOpen(false),
      recent,
    }}>
      {children}
    </AppUIContext.Provider>
  );
}

export function useAppUI() {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error('useAppUI must be used inside AppUIProvider');
  return ctx;
}
