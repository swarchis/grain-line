import React, { useRef, useState } from 'react';
import { base64ToDataUrl, base64ToBlob, uploadDesignImage } from '../../lib/designImages.js';
import { aiPost } from '../../lib/aiApi.js';
import { useAIUsage } from '../../context/AIUsageContext.jsx';
import CreditCost from '../CreditCost.jsx';

// "Transform" tools edit the founder's actual existing design (Gemini's
// image model, which can take a reference image) — the result replaces the
// canvas outright, since changing a garment's color/fabric/angle IS a
// whole-image change, there's no meaningful "layer" for that.
const TRANSFORM_TOOLS = [
  { mode: 'sketch-to-design', label: 'Sketch to Design', icon: 'ph-magic-wand', desc: 'Render the current sketch as a polished design.', promptPlaceholder: 'Style direction (e.g. "matte black nylon, oversized fit")' },
  { mode: 'ai-edit', label: 'AI Edit', icon: 'ph-pencil-simple', desc: 'Describe any change in plain English.', promptPlaceholder: 'e.g. "make the sleeves longer"', promptRequired: true },
  { mode: 'bg-remove', label: 'Background Remover', icon: 'ph-image', desc: 'Strip the background to plain white.' },
  { mode: 'recolor', label: 'Recolor', icon: 'ph-palette', desc: 'Change the garment color, keep everything else.', promptPlaceholder: 'Target color (e.g. "sage green")', promptRequired: true },
  { mode: 'fabric-swap', label: 'Fabric Swap', icon: 'ph-scissors', desc: 'Swap the fabric while keeping the silhouette.', promptPlaceholder: 'Target fabric (e.g. "ribbed cotton knit")', promptRequired: true },
  { mode: 'mockup', label: 'Mockup Generator', icon: 'ph-camera', desc: 'Turn the design into a product photo mockup.', promptPlaceholder: 'Style (e.g. "on a model, studio lighting")' },
  { mode: 'flat-sketch', label: 'Flat Sketch', icon: 'ph-ruler', desc: 'Clean technical line-art, tech-pack style.' },
  { mode: 'view', label: 'Generate a View', icon: 'ph-arrows-clockwise', desc: 'Generate another angle of this exact garment.', promptPlaceholder: 'Which view (e.g. "back", "side")', promptRequired: true },
];

// "Addition" tools generate a brand new, isolated element with nothing to
// composite against (Stable Diffusion via Pixazo — free/fast SD XL
// Lightning, since these are meant to be regenerated a few times before one
// lands). Nothing here ever touches the founder's existing artwork — the
// result is either added as its own new layer (Photopea) or downloaded as a
// transparent PNG to drop into Photoshop/Illustrator/whatever they actually
// use, never baked into a flattened replacement of the canvas.
const ADDITION_TOOLS = [
  { mode: 'add-element', label: 'Add Element', icon: 'ph-stamp', desc: 'Generate a logo/graphic and add it as its own layer.', promptPlaceholder: 'e.g. "minimalist mountain line-art logo"', promptRequired: true },
  { mode: 'pattern', label: 'Pattern Generator', icon: 'ph-squares-four', desc: 'Generate a standalone tileable pattern swatch.', promptPlaceholder: 'e.g. "small floral print, pastel palette"', promptRequired: true },
];

function downloadPng(base64, mimeType, filename) {
  const a = document.createElement('a');
  a.href = base64ToDataUrl(base64, mimeType);
  a.download = filename;
  a.click();
}

function ToolCard({ tool, kind, productId, onCapture, onApplyToCanvas, onAddLayer, logUsage, onVersionSaved }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { base64, mimeType }
  const [saving, setSaving] = useState(false);
  const { canAfford, openTopup } = useAIUsage();
  const feature = kind === 'addition' ? 'design-generate-element' : 'design-ai-image';

  const promptMissing = tool.promptRequired && !prompt.trim();

  const generate = async () => {
    if (!canAfford(feature)) { openTopup(); return; }
    if (promptMissing) { setError('This tool needs a short description first.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const endpoint = kind === 'addition' ? '/api/design/generate-element' : '/api/design/ai-image';
      const body = kind === 'addition'
        ? { mode: tool.mode, prompt: prompt.trim() || null }
        : { mode: tool.mode, prompt: prompt.trim() || null, images: [await onCapture()] };
      const res = await aiPost(endpoint, body);
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
          <i className={`ph ${tool.icon}`} style={{ fontSize: 15, color: kind === 'addition' ? 'var(--c-vendors)' : 'var(--c-design)' }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{tool.label}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tool.desc}</div>
        </div>
        <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ color: 'var(--ink-4)' }} />
      </div>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tool.promptPlaceholder && (
            <input className="form-input" placeholder={tool.promptPlaceholder} value={prompt} onChange={e => setPrompt(e.target.value)} />
          )}

          <button className="btn btn-sm btn-primary" onClick={generate} disabled={loading || promptMissing} style={{ alignSelf: 'flex-start' }}>
            {loading ? <><i className="ph ph-circle-notch ph-spin" /> Generating…</> : <><i className="ph ph-sparkle" /> Generate</>}
            {!loading && <CreditCost feature={feature} style={{ marginLeft: 6, color: 'inherit', opacity: 0.8 }} />}
          </button>

          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

          {result && (
            <div>
              <img
                src={base64ToDataUrl(result.base64, result.mimeType)} alt="AI result"
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-2)', marginBottom: 8, background: kind === 'addition' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 14px 14px' : undefined }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {kind === 'addition' ? (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => onAddLayer(base64ToDataUrl(result.base64, result.mimeType))}><i className="ph ph-stack-plus" /> Add as layer</button>
                    <button className="btn btn-sm" onClick={() => downloadPng(result.base64, result.mimeType, `${tool.mode}.png`)}><i className="ph ph-download-simple" /> Download PNG</button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => onApplyToCanvas(base64ToDataUrl(result.base64, result.mimeType))}><i className="ph ph-arrow-square-in" /> Apply to canvas</button>
                )}
                <button className="btn btn-sm" onClick={saveAsVersion} disabled={saving}>{saving ? 'Saving…' : <><i className="ph ph-clock-counter-clockwise" /> Save as version</>}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIStudioTab({ productId, onCapture, onApplyToCanvas, onAddLayer, logUsage, onVersionSaved }) {
  const shared = { productId, onCapture, onApplyToCanvas, onAddLayer, logUsage, onVersionSaved };
  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="form-hint" style={{ marginBottom: 16 }}>
        <i className="ph ph-info" style={{ marginRight: 4 }} /> Transform tools edit the current canvas — capture your sketch first, then apply or discard the result. Addition tools generate a brand-new element that never touches your existing artwork — add it as its own layer, or download it to use in Photoshop/Illustrator.
      </div>

      <div className="section-label" style={{ marginBottom: 10 }}>Transform your design</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
        {TRANSFORM_TOOLS.map(tool => <ToolCard key={tool.mode} tool={tool} kind="transform" {...shared} />)}
      </div>

      <div className="section-label" style={{ marginBottom: 10 }}>Add a new element</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {ADDITION_TOOLS.map(tool => <ToolCard key={tool.mode} tool={tool} kind="addition" {...shared} />)}
      </div>
    </div>
  );
}
