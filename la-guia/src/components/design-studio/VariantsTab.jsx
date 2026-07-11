import React, { useState } from 'react';
import { base64ToBlob, uploadDesignImage } from '../../lib/designImages.js';

export default function VariantsTab({ productId, variants, onChange, onCapture, onApplyToCanvas, canUseAI, aiRemaining, logUsage }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    if (!canUseAI) { setError('Upgrade your plan to generate variants.'); return; }
    if (!prompt.trim()) { setError('Describe the variation first (e.g. "cropped length, contrast trim").'); return; }
    setLoading(true);
    setError(null);
    try {
      const image = await onCapture();
      const res = await fetch('http://localhost:3001/api/design/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'variant', prompt: prompt.trim(), images: [image] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('design-variant');
      const blob = await base64ToBlob(data.imageBase64, data.mimeType);
      const url = await uploadDesignImage(blob, productId, 'variant');
      onChange([{ url, label: prompt.trim(), createdAt: new Date().toISOString() }, ...variants]);
      setPrompt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = (url) => onChange(variants.filter(v => v.url !== url));

  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="card-raised" style={{ padding: 18, marginBottom: 16 }}>
        <span className="card-title" style={{ display: 'block', marginBottom: 12 }}>Generate a variant</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" placeholder='e.g. "cropped length, contrast trim"' value={prompt} onChange={e => setPrompt(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-sm btn-primary" onClick={generate} disabled={loading || !canUseAI}>
            {loading ? 'Generating…' : <><i className="ph ph-sparkle" /> Generate ({aiRemaining} left)</>}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
      </div>

      {variants.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>No variants yet — generate a few colorway or detail variations to compare side by side.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {variants.map(v => (
            <div key={v.url} className="card-raised" style={{ overflow: 'hidden' }}>
              <img src={v.url} alt={v.label} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover' }} />
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8, minHeight: 32 }}>{v.label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onApplyToCanvas(v.url)}>Use this</button>
                  <button className="btn btn-sm" onClick={() => remove(v.url)} style={{ color: 'var(--red)' }}><i className="ph ph-trash" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
