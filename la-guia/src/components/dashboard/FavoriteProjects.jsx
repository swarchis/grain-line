import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductsContext.jsx';
import { readinessColor, stageLink, swatchGradient } from '../../lib/format.js';

export default function FavoriteProjects() {
  const navigate = useNavigate();
  const { products, toggleFavorite } = useProducts();
  const favorites = products.filter(p => p.is_favorite);

  return (
    <div data-tour="favorites-widget" className="card-raised" style={{ padding: 20 }}>
      <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 12 }}>
        Favorite projects
      </div>
      {favorites.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', padding: '14px 0' }}>
          Star a product from its card below to pin it here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {favorites.map(p => (
            <div
              key={p.id}
              className="card-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
              onClick={() => navigate(stageLink(p.stage, p.id))}
            >
              <div style={{ width: 24, height: 24, borderRadius: 6, background: swatchGradient(p.id), flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: readinessColor(p.readiness) }}>{p.readiness}% ready</div>
              </div>
              <button
                title="Unstar"
                onClick={e => { e.stopPropagation(); toggleFavorite(p.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 14, flexShrink: 0 }}
              >
                <i className="ph-fill ph-star" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
