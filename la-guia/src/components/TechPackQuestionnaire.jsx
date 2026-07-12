import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const FIELDS = [
  { key: 'bom', label: 'Materials (BOM)', placeholder: 'e.g. "14oz cotton twill body, poly-cotton lining, matte YKK zipper"' },
  { key: 'measurements', label: 'Sizing', placeholder: 'e.g. "Sizes XS–XL, true to size, oversized fit"' },
  { key: 'construction', label: 'Stitch construction', placeholder: 'e.g. "Flatlock seams on body, 5-thread overlock on side seams, topstitched hem"' },
  { key: 'printPlacements', label: 'Print / graphic placements', placeholder: 'e.g. "Chest logo, screen print, 4in wide, centered 3in below collar"' },
  { key: 'trims', label: 'Trims', placeholder: 'e.g. "Metal zipper pull, drawcord with metal tips, 4 matte buttons"' },
  { key: 'labels', label: 'Label placement', placeholder: 'e.g. "Main label center back neck, care label left side seam"' },
  { key: 'packaging', label: 'Packaging specifications', placeholder: 'e.g. "Individually polybagged, folded, branded hang tag"' },
  { key: 'materialUsage', label: 'Material usage', placeholder: 'e.g. "~1.4 yards body fabric per unit, 8% wastage allowance"' },
  { key: 'manufacturingNotes', label: 'Manufacturing notes', placeholder: 'Anything the factory needs to know that doesn\'t fit above' },
  { key: 'complianceNotes', label: 'Compliance notes', placeholder: 'e.g. "CPSIA compliant, no lead-based components, country-of-origin label required"' },
  { key: 'other', label: 'Other — anything else to include (or leave out)', placeholder: 'e.g. "No care label needed, we handle that separately" or "Add a reinforced hem detail"' },
];

export default function TechPackQuestionnaire({ open, onClose, category, onComplete, canUseAI, logUsage }) {
  const [answers, setAnswers] = useState({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  if (!open) return null;

  const setField = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  const generateWithAI = async () => {
    if (!canUseAI) { setError('Upgrade your plan to use AI tech pack generation.'); return; }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/generate-tech-pack-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, answers }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage?.('generate-tech-pack-full');
      onComplete({ ...data.techPackData, questionnaire: answers, aiGenerated: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // No AI — seed each section with a single row from whatever was typed, so
  // the founder lands on a real (if sparse) starting point instead of a
  // totally blank table, and can build it out with the existing add-row UI.
  const startManually = () => {
    setStarting(true);
    const seeded = {
      bom: answers.bom ? [{ id: 'bom-1', material: answers.bom, supplier: '', qtyPerUnit: '', unitCost: '' }] : [],
      construction: answers.construction ? [{ id: 'con-1', section: 'General', stitchType: '', notes: answers.construction }] : [],
      printPlacements: answers.printPlacements ? [{ id: 'pp-1', name: 'Placement 1', placement: answers.printPlacements, size: '', technique: '', notes: '' }] : [],
      trims: answers.trims ? [{ id: 'trim-1', name: answers.trims, supplier: '', quantity: '', unitCost: '', notes: '' }] : [],
      labels: answers.labels ? [{ id: 'label-1', type: 'Label', placement: '', content: answers.labels }] : [],
      packaging: answers.packaging ? [{ id: 'pack-1', item: 'Packaging', spec: answers.packaging, notes: '' }] : [],
      materialUsage: answers.materialUsage ? [{ id: 'mu-1', material: answers.materialUsage, consumptionPerUnit: '', unit: '', wastagePercent: '' }] : [],
      manufacturingNotes: answers.manufacturingNotes || '',
      complianceNotes: answers.complianceNotes || '',
    };
    onComplete({ ...seeded, questionnaire: answers, aiGenerated: false });
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,12,0.6)' }} />
      <div className="card-raised enter" style={{ position: 'relative', width: 640, maxHeight: '86vh', overflowY: 'auto', padding: '26px 28px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 21 }}>Tell us about this tech pack</span>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Every tech pack is different — answer what you know, leave the rest blank.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16 }}><i className="ph ph-x" /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0' }}>
          {FIELDS.map(f => (
            <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{f.label}</label>
              <textarea
                className="form-input"
                style={{ minHeight: 44, resize: 'vertical', fontSize: 13 }}
                placeholder={f.placeholder}
                value={answers[f.key] || ''}
                onChange={e => setField(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}

        <div className="form-hint" style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)' }}>
          <i className="ph ph-warning" style={{ marginRight: 4 }} /> AI-generated info won't always be accurate to what you actually want — review every section before sending this to a factory.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button className="btn btn-sm" onClick={startManually} disabled={generating || starting}>
            {starting ? 'Starting…' : 'Start blank / from my answers'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={generateWithAI} disabled={generating || starting || !canUseAI} title={!canUseAI ? 'Upgrade your plan to use AI tech pack generation' : undefined}>
            {generating ? <><i className="ph ph-circle-notch ph-spin" /> Generating…</> : !canUseAI ? <><i className="ph ph-lock-simple" /> Upgrade to use AI</> : <><i className="ph ph-sparkle" /> Generate with AI</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
