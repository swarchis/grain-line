import React, { useRef, useState } from 'react';
import { blobToBase64, base64ToDataUrl, base64ToBlob, uploadDesignImage } from '../../lib/designImages.js';

const TOOLS = [
  { mode: 'sketch-to-design', label: 'Sketch to Design', icon: 'ph-magic-wand', desc: 'Render the current sketch as a polished design.', promptPlaceholder: 'Style direction (e.g. "matte black nylon, oversized fit")' },
  { mode: 'ai-edit', label: 'AI Edit', icon: 'ph-pencil-simple', desc: 'Describe any change in plain English.', promptPlaceholder: 'e.g. "make the sleeves longer"', promptRequired: true },
  { mode: 'bg-remove', label: 'Background Remover', icon: 'ph-image', desc: 'Strip the background to plain white.' },
  { mode: 'recolor', label: 'Recolor', icon: 'ph-palette', desc: 'Change the garment color, keep everything else.', promptPlaceholder: 'Target color (e.g. "sage green")', promptRequired: true },
  { mode: 'fabric-swap', label: 'Fabric Swap', icon: 'ph-scissors', desc: 'Swap the fabric while keeping the silhouette.', promptPlaceholder: 'Target fabric (e.g. "ribbed cotton knit")', promptRequired: true },
  { mode: 'pattern', label: 'Pattern Generator', icon: 'ph-squares-four', desc: 'Generate a standalone tileable pattern swatch.', promptPlaceholder: 'e.g. "small floral print, pastel palette"', promptRequired: true, noImageNeeded: true },
  { mode: 'logo-placement', label: 'Logo Placement', icon: 'ph-stamp', desc: 'Composite an uploaded logo onto the design.', promptPlaceholder: 'Placement (e.g. "left chest")', needsLogoUpload: true },
  { mode: 'mockup', label: 'Mockup Generator', icon: 'ph-camera', desc: 'Turn the design into a product photo mockup.', promptPlaceholder: 'Style (e.g. "on a model, studio lighting")' },
  { mode: 'flat-sketch', label: 'Flat Sketch', icon: 'ph-ruler', desc: 'Clean technical line-art, tech-pack style.' },
  { mode: 'view', label: 'Generate a View', icon: 'ph-arrows-clockwise', desc: 'Generate another angle of this exact garment.', promptPlaceholder: 'Which view (e.g. "back", "side")', promptRequired: true },
];

function ToolCard({ tool, productId, onCapture, onApplyToCanvas, canUseAI, aiRemaining, logUsage, onVersionSaved }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { base64, mimeType }
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef(null);

  const promptMissing = tool.promptRequired && !prompt.trim();

  const generate = async () => {
    if (!canUseAI) { setError('Upgrade your plan to use AI image tools.'); return; }
    if (promptMissing) { setError('This tool needs a short description first.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const images = [];
      if (!tool.noImageNeeded) {
        images.push(await onCapture());
      }
      if (tool.needsLogoUpload) {
        if (!logoFile) throw new Error('Upload a logo image first.');
        images.push(await blobToBase64(logoFile));
      }
      const res = await fetch('http://localhost:3001/api/design/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: tool.mode, prompt: prompt.trim() || null, images }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage(`design-studio-${tool.mode}`);
      setResult({ base64: data.imageBase64, mimeType: data.mimeType });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyToCanvas = () => {
    if (!result) return;
    onApplyToCanvas(base64ToDataUrl(result.base64, result.mimeType));
  };

  const saveAsVersion = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const blob = await base64ToBlob(result.base64, result.mimeType);
      const url = await uploadDesignImage(blob, productId, tool.mode);
      const { supabase } = await import('../../lib/supabase.js');
      const { error: insertError } = await supabase.from('design_versions').insert([{
        product_id: productId, image_url: url, label: tool.label, source: tool.mode,
      }]);
      if (insertError) throw insertError;
      onVersionSaved?.();
    } catch (err) {
      setError('Could not save version: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-raised" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ph ${tool.icon}`} style={{ fontSize: 15, color: 'var(--c-design)' }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{tool.label}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tool.desc}</div>
        </div>
        <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ color: 'var(--ink-4)' }} />
      </div>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(tool.promptPlaceholder) && (
            <input className="form-input" placeholder={tool.promptPlaceholder} value={prompt} onChange={e => setPrompt(e.target.value)} />
          )}
          {tool.needsLogoUpload && (
            <div>
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setLogoFile(e.target.files?.[0] || null)} />
              <button className="btn btn-sm" onClick={() => logoInputRef.current?.click()}>
                <i className="ph ph-upload-simple" /> {logoFile ? logoFile.name : 'Upload logo'}
              </button>
            </div>
          )}

          {!canUseAI ? (
            <div className="form-hint" style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)' }}>
              <i className="ph ph-lock-simple" style={{ marginRight: 4 }} /> Upgrade your plan to use AI image tools.
            </div>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={generate} disabled={loading || promptMissing} style={{ alignSelf: 'flex-start' }}>
              {loading ? <><i className="ph ph-circle-notch ph-spin" /> Generating…</> : <><i className="ph ph-sparkle" /> Generate ({aiRemaining} left)</>}
            </button>
          )}

          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

          {result && (
            <div>
              <img src={base64ToDataUrl(result.base64, result.mimeType)} alt="AI result" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-2)', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={applyToCanvas}><i className="ph ph-arrow-square-in" /> Apply to canvas</button>
                <button className="btn btn-sm" onClick={saveAsVersion} disabled={saving}>{saving ? 'Saving…' : <><i className="ph ph-clock-counter-clockwise" /> Save as version</>}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIStudioTab({ productId, onCapture, onApplyToCanvas, canUseAI, aiRemaining, logUsage, onVersionSaved }) {
  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="form-hint" style={{ marginBottom: 16 }}>
        <i className="ph ph-info" style={{ marginRight: 4 }} /> Every tool here reads the current canvas, so capture your sketch first. Results can be applied straight to the canvas or saved as a version without overwriting your current work.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {TOOLS.map(tool => (
          <ToolCard
            key={tool.mode}
            tool={tool}
            productId={productId}
            onCapture={onCapture}
            onApplyToCanvas={onApplyToCanvas}
            canUseAI={canUseAI}
            aiRemaining={aiRemaining}
            logUsage={logUsage}
            onVersionSaved={onVersionSaved}
          />
        ))}
      </div>
    </div>
  );
}
