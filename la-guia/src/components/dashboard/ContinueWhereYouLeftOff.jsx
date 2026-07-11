import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppUI } from '../../context/AppUIContext.jsx';
import { useProducts } from '../../context/ProductsContext.jsx';
import { useVendors } from '../../context/VendorsContext.jsx';
import { useMaterials } from '../../context/MaterialsContext.jsx';
import { useProduction } from '../../context/ProductionContext.jsx';

const TYPE_META = {
  product: { icon: 'ph-t-shirt', label: 'Design' },
  techpack: { icon: 'ph-ruler', label: 'Tech Pack' },
  vendor: { icon: 'ph-handshake', label: 'Vendor' },
  material: { icon: 'ph-flask', label: 'Material' },
  collection: { icon: 'ph-stack', label: 'Collection' },
  production: { icon: 'ph-package', label: 'Production Order' },
  performance: { icon: 'ph-chart-line-up', label: 'Performance' },
};

// Resolves a raw {type, id} recent-visit entry into a real, current title —
// entries pointing at something that's since been deleted are dropped rather
// than shown as a dead link.
function resolveTitle(entry, { products, vendors, materials, collections, orders }) {
  switch (entry.type) {
    case 'product': case 'techpack': case 'performance':
      return products.find(p => p.id === entry.id)?.name;
    case 'vendor':
      return vendors.find(v => v.id === entry.id)?.name;
    case 'material':
      return materials.find(m => m.id === entry.id)?.name;
    case 'collection':
      return collections.find(c => c.id === entry.id)?.name;
    case 'production': {
      const o = orders.find(o => o.id === entry.id);
      return o?.products?.name || o?.po_number;
    }
    default:
      return null;
  }
}

export default function ContinueWhereYouLeftOff() {
  const navigate = useNavigate();
  const { recent } = useAppUI();
  const { products, collections } = useProducts();
  const { vendors } = useVendors();
  const { materials } = useMaterials();
  const { orders } = useProduction();

  const resolved = recent
    .map(entry => ({ ...entry, title: resolveTitle(entry, { products, vendors, materials, collections, orders }) }))
    .filter(entry => entry.title)
    .slice(0, 4);

  return (
    <div data-tour="continue-widget" className="card-raised" style={{ padding: 20 }}>
      <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 12 }}>
        Continue where you left off
      </div>
      {resolved.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', padding: '14px 0' }}>
          Visit a product, vendor, or tech pack and it'll show up here next time.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {resolved.map(entry => {
            const meta = TYPE_META[entry.type] || { icon: 'ph-file', label: 'Item' };
            return (
              <div
                key={`${entry.type}-${entry.id}`}
                className="card-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                onClick={() => navigate(entry.path)}
              >
                <i className={`ph ${meta.icon}`} style={{ fontSize: 15, color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{meta.label}</div>
                </div>
                <i className="ph ph-arrow-right" style={{ fontSize: 12, color: 'var(--ink-4)' }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
