import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import { useMaterials } from '../context/MaterialsContext.jsx';
import { useNotifications } from '../context/NotificationsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { useAppUI } from '../context/AppUIContext.jsx';
import { NAV_PAGES } from '../data/navPages.js';

// Real content search — every field checked is an actual field a founder
// reads on that entity's own page, not just its name. Shows which field
// matched so a hit reads as "found this on the page", not a generic filter.
function firstMatch(fieldPairs, q) {
  for (const [label, value] of fieldPairs) {
    if (value == null) continue;
    const str = Array.isArray(value) ? value.join(', ') : String(value);
    if (str.toLowerCase().includes(q)) return `${label}: ${str}`;
  }
  return null;
}

export default function SidebarSearch() {
  const navigate = useNavigate();
  const { products, collections } = useProducts();
  const { vendors, quotes } = useVendors();
  const { materials } = useMaterials();
  const { notifications } = useNotifications();
  const { orders } = useProduction();
  const { registerSearchFocus } = useAppUI();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    registerSearchFocus(() => { inputRef.current?.focus(); inputRef.current?.select(); });
  }, [registerSearchFocus]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];

    // Sidebar pages themselves — matches the page name or a synonym/keyword
    // for what's on it, so "billing" finds Settings and "sketch" finds
    // Designs even though neither word is in the nav label.
    NAV_PAGES.forEach(page => {
      const snippet = firstMatch([['page', page.label], ['also known as', page.keywords]], q);
      if (snippet) out.push({ id: `page-${page.path}`, group: 'Pages', icon: page.icon, title: page.label, snippet, path: page.path });
    });

    products.forEach(p => {
      const snippet = firstMatch([['name', p.name], ['category', p.category], ['stage', p.stage], ['risk', p.risk]], q);
      if (snippet) out.push({ id: `p-${p.id}`, group: 'Products', icon: 'ph-t-shirt', title: p.name, snippet, path: `/design/${p.id}` });
    });
    vendors.forEach(v => {
      const snippet = firstMatch([['name', v.name], ['category', v.category], ['location', v.location], ['specialties', v.specialties], ['notes', v.notes]], q);
      if (snippet) out.push({ id: `v-${v.id}`, group: 'Vendors', icon: 'ph-handshake', title: v.name, snippet, path: `/vendors/${v.id}` });
    });
    materials.forEach(m => {
      const snippet = firstMatch([['name', m.name], ['category', m.category], ['warning', m.warning], ['handling', m.handling_notes]], q);
      if (snippet) out.push({ id: `m-${m.id}`, group: 'Materials', icon: 'ph-flask', title: m.name, snippet, path: `/materials/${m.id}` });
    });
    collections.forEach(c => {
      const snippet = firstMatch([['name', c.name], ['launch window', c.launch_window]], q);
      if (snippet) out.push({ id: `c-${c.id}`, group: 'Collections', icon: 'ph-stack', title: c.name, snippet, path: `/collections/${c.id}` });
    });
    (quotes || []).forEach(qu => {
      const snippet = firstMatch([['product', qu.products?.name], ['vendor', qu.vendors?.name], ['status', qu.status]], q);
      if (snippet) out.push({ id: `q-${qu.id}`, group: 'Quotes', icon: 'ph-file-text', title: qu.products?.name || 'Quote', snippet, path: '/quotes' });
    });
    (orders || []).forEach(o => {
      const snippet = firstMatch([['PO number', o.po_number], ['product', o.products?.name], ['vendor', o.vendors?.name], ['stage', o.stage]], q);
      if (snippet) out.push({ id: `o-${o.id}`, group: 'Production', icon: 'ph-package', title: o.products?.name || o.po_number || 'Order', snippet, path: `/production/${o.id}` });
    });
    notifications.forEach(n => {
      const snippet = firstMatch([['title', n.title], ['detail', n.body]], q);
      if (snippet) out.push({ id: `n-${n.id}`, group: 'Notifications', icon: 'ph-bell', title: n.title, snippet, path: '/notifications' });
    });

    return out.slice(0, 30);
  }, [query, products, vendors, materials, collections, quotes, orders, notifications]);

  const grouped = useMemo(() => {
    const g = {};
    results.forEach(r => (g[r.group] = g[r.group] || []).push(r));
    return g;
  }, [results]);

  useEffect(() => { setActive(0); }, [query]);

  const go = (r) => {
    if (!r) return;
    navigate(r.path);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  let runningIndex = -1;

  return (
    <div style={{ padding: '12px 18px 2px', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <i className="ph ph-magnifying-glass" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, color: 'var(--sb-ink-3)' }} />
        <input
          ref={inputRef}
          data-tour="sidebar-search"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Search everything…"
          style={{
            width: '100%', padding: '8px 28px 8px 30px', fontSize: 12.5, borderRadius: 8,
            border: '1px solid var(--sb-border)', background: 'var(--sb-bg-2)', color: 'var(--sb-ink)', outline: 'none',
          }}
        />
        {query && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--sb-ink-3)', cursor: 'pointer', fontSize: 12 }}
          >
            <i className="ph ph-x" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 18, right: 18, marginTop: 6, zIndex: 50,
          background: 'var(--sb-bg-2)', border: '1px solid var(--sb-border)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', maxHeight: 380, overflowY: 'auto', padding: '6px 0',
        }}>
          {results.length === 0 && (
            <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--sb-ink-3)', fontStyle: 'italic' }}>No matches anywhere.</div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: '7px 14px 3px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sb-ink-3)' }}>{group}</div>
              {items.map(r => {
                runningIndex += 1;
                const isActive = runningIndex === active;
                return (
                  <div
                    key={r.id}
                    onMouseEnter={() => setActive(runningIndex)}
                    onMouseDown={() => go(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', cursor: 'pointer', background: isActive ? 'var(--sb-hover)' : 'transparent' }}
                  >
                    <i className={`ph ${r.icon}`} style={{ fontSize: 13, color: 'var(--sb-ink-3)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--sb-ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--sb-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
