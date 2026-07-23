import React, { useEffect, useState } from 'react';
import { useProducts } from '../../context/ProductsContext.jsx';
import { supabase } from '../../lib/supabase.js';
import { PSD_VERSION_LABEL } from '../../lib/designImages.js';

// Merges several real per-entity logs (product_stage_history,
// production_updates, design_versions, tech_pack_versions) into one
// chronological feed — each of those already exists as its own real log,
// this is the first place they're shown together.
export default function ActivityFeed() {
  const { activeBrand, products } = useProducts();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBrand) { setItems([]); setLoading(false); return; }
    const productIds = products.map(p => p.id);
    const productName = (id) => products.find(p => p.id === id)?.name || 'Unknown product';

    Promise.all([
      supabase.from('product_stage_history').select('*').in('product_id', productIds).order('created_at', { ascending: false }).limit(10),
      supabase.from('production_updates').select('*, production_orders(product_id, po_number)').order('created_at', { ascending: false }).limit(10),
      // Rolling autosave + working-file rows churn every couple of minutes —
      // they'd bury the feed, so only deliberate versions show here.
      supabase.from('design_versions').select('*, designs(product_id)').neq('label', 'Autosave').neq('label', PSD_VERSION_LABEL).order('created_at', { ascending: false }).limit(10),
      supabase.from('tech_pack_versions').select('*, tech_packs(product_id)').order('created_at', { ascending: false }).limit(10),
    ]).then(([stageHistory, updates, designVersions, tpVersions]) => {
      const merged = [
        ...(stageHistory.data || []).map(r => ({ id: `stage-${r.id}`, date: r.created_at, icon: 'ph-flag', color: 'var(--c-organization)', text: `${productName(r.product_id)} moved to ${r.stage}` })),
        ...(updates.data || []).map(r => ({ id: `update-${r.id}`, date: r.created_at, icon: 'ph-note', color: 'var(--c-materials)', text: `${productName(r.production_orders?.product_id)}: ${r.note}` })),
        ...(designVersions.data || []).map(r => ({ id: `dv-${r.id}`, date: r.created_at, icon: 'ph-pencil-simple', color: 'var(--c-design)', text: `${productName(r.designs?.product_id)} design updated (${r.source || 'manual'})` })),
        ...(tpVersions.data || []).map(r => ({ id: `tp-${r.id}`, date: r.created_at, icon: 'ph-ruler', color: 'var(--c-techpack)', text: `${productName(r.tech_packs?.product_id)} tech pack version saved` })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
      setItems(merged);
      setLoading(false);
    });
  }, [activeBrand, products]);

  return (
    <div className="card-raised" style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>Recent activity</span>
      </div>
      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Nothing logged yet — stage changes, factory updates, and saved versions will show up here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <i className={`ph ${it.icon}`} style={{ color: it.color, fontSize: 14, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{it.text}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>{new Date(it.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
