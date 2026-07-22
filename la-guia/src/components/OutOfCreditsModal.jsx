import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { CREDIT_PACKS } from '../data/aiCredits.js';

// Global out-of-credits / top-up modal. Opens automatically when a metered AI
// call returns 402 (via the handler AIUsageContext registers), or manually via
// openTopup(). Rendered once inside the authenticated shell.
export default function OutOfCreditsModal() {
  const { topupOpen, closeTopup, credits, buyPack, topupLoading, topupError } = useAIUsage();
  const navigate = useNavigate();
  if (!topupOpen) return null;

  return (
    <div
      onClick={closeTopup}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-raised"
        style={{ width: '100%', maxWidth: 460, padding: 24, position: 'relative' }}
      >
        <button
          onClick={closeTopup}
          aria-label="Close"
          className="btn btn-sm"
          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', boxShadow: 'none', fontSize: 18, color: 'var(--ink-3)' }}
        >
          <i className="ph ph-x" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <i className="ph ph-lightning" style={{ color: 'var(--accent)', fontSize: 20 }} />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Out of AI credits</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 18px' }}>
          You have <strong style={{ color: 'var(--ink-2)' }}>{credits.toLocaleString()}</strong> credits left.
          Top up to keep using AI features, or upgrade your plan for a bigger monthly allowance.
        </p>

        {topupError && (
          <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{topupError}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {CREDIT_PACKS.map((p) => (
            <div
              key={p.id}
              className="card-raised"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.credits.toLocaleString()} credits</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.price}</div>
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={!!topupLoading}
                onClick={() => buyPack(p.id)}
              >
                {topupLoading === p.id ? 'Redirecting…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>

        <button
          className="btn btn-sm"
          style={{ width: '100%', justifyContent: 'center', background: 'none', border: 'none', boxShadow: 'none', color: 'var(--ink-3)', textDecoration: 'underline' }}
          onClick={() => { closeTopup(); navigate('/settings'); }}
        >
          Or upgrade your plan →
        </button>
      </div>
    </div>
  );
}
