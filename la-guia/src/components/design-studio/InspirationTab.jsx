import React, { useRef, useState } from 'react';
import { blobToBase64, uploadDesignImage } from '../../lib/designImages.js';
import { aiPost } from '../../lib/aiApi.js';
import { supabase } from '../../lib/supabase.js';
import { useAIUsage } from '../../context/AIUsageContext.jsx';
import CreditCost from '../CreditCost.jsx';

function Moodboard({ productId, moodboard, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of files) {
        const url = await uploadDesignImage(file, productId, 'moodboard');
        uploaded.push({ url, name: file.name, addedAt: new Date().toISOString() });
      }
      onChange([...moodboard, ...uploaded]);
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (url) => {
    const fileName = url.split('/').pop();
    await supabase.storage.from('mockups').remove([fileName]);
    onChange(moodboard.filter(m => m.url !== url));
  };

  return (
    <div className="card-raised" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="card-title">Moodboard</span>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : <><i className="ph ph-upload-simple" /> Upload inspiration</>}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
      {moodboard.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Upload reference photos, fabric shots, or inspiration images to keep them next to the design.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {moodboard.map(m => (
            <div key={m.url} style={{ position: 'relative' }}>
              <img src={m.url} alt={m.name} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-2)' }} />
              <button
                onClick={() => remove(m.url)}
                title="Remove"
                style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(20,17,12,0.65)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i className="ph ph-x" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPalette({ palette, onChange, onCapture, logUsage }) {
  const { canAfford, openTopup } = useAIUsage();
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async (fromCanvas) => {
    if (!canAfford('design-color-palette')) { openTopup(); return; }
    setLoading(true);
    setError(null);
    try {
      const body = fromCanvas ? { imageBase64: await onCapture() } : { brief: brief.trim() };
      if (!fromCanvas && !brief.trim()) throw new Error('Describe the product or collection first.');
      const res = await aiPost('/api/design/color-palette', body);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('color-palette');
      onChange(data.palette);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-raised" style={{ padding: 18 }}>
      <span className="card-title" style={{ display: 'block', marginBottom: 12 }}>Color Palette</span>
      {palette.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {palette.map((c, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: c.hex, border: '1px solid var(--border-2)' }} title={c.hex} />
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, maxWidth: 56 }}>{c.name}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="form-input" placeholder='Or describe it: "coastal resort capsule"' value={brief} onChange={e => setBrief(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-sm btn-primary" onClick={() => generate(true)} disabled={loading}>
          {loading ? 'Generating…' : <><i className="ph ph-sparkle" /> From canvas</>}
          {!loading && <CreditCost feature="design-color-palette" style={{ marginLeft: 6, color: 'inherit', opacity: 0.8 }} />}
        </button>
        <button className="btn btn-sm" onClick={() => generate(false)} disabled={loading}>
          From description <CreditCost feature="design-color-palette" style={{ marginLeft: 4 }} />
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function TrendInspiration({ category, logUsage }) {
  const { canAfford, openTopup } = useAIUsage();
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cacheKey = `grainline_trends_${category}_${new Date().toISOString().slice(0, 10)}`;

  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setTrends(JSON.parse(cached));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const fetchTrends = async () => {
    if (!canAfford('design-trend-inspiration')) { openTopup(); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await aiPost('/api/design/trend-inspiration', { category });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('trend-inspiration');
      setTrends(data.trends);
      try { localStorage.setItem(cacheKey, JSON.stringify(data.trends)); } catch {}
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-raised" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="card-title">Trend Inspiration</span>
        <button className="btn btn-sm" onClick={fetchTrends} disabled={loading}>
          {loading ? 'Searching…' : <><i className="ph ph-sparkle" /> {trends ? 'Refresh' : 'Get trends'}</>}
          {!loading && <CreditCost feature="design-trend-inspiration" style={{ marginLeft: 6 }} />}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {!trends && !loading && <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Real-time trend research for "{category}", pulled from the web.</div>}
      {trends && trends.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Nothing solid found — try again later or broaden the category.</div>}
      {trends && trends.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trends.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 9 }}>
              <span className="tag tag-accent" style={{ height: 'fit-content', flexShrink: 0, textTransform: 'capitalize' }}>{t.category}</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.theme}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{t.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InspirationTab({ productId, category, moodboard, onMoodboardChange, palette, onPaletteChange, onCapture, logUsage }) {
  return (
    <div style={{ maxWidth: 1080, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Moodboard productId={productId} moodboard={moodboard} onChange={onMoodboardChange} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ColorPalette palette={palette} onChange={onPaletteChange} onCapture={onCapture} logUsage={logUsage} />
        <TrendInspiration category={category} logUsage={logUsage} />
      </div>
    </div>
  );
}
