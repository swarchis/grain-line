import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { supabase } from '../lib/supabase.js';
import GarmentSilhouette, { CustomSilhouette } from '../components/GarmentSilhouette.jsx';
import PhotopeaEditor from '../components/PhotopeaEditor.jsx';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import AIStudioTab from '../components/design-studio/AIStudioTab.jsx';
import InspirationTab from '../components/design-studio/InspirationTab.jsx';
import VariantsTab from '../components/design-studio/VariantsTab.jsx';
import HistoryTab from '../components/design-studio/HistoryTab.jsx';
import { blobToBase64 } from '../lib/designImages.js';

const SEVERITY_ICON = { amber: 'ph-warning', blue: 'ph-info', green: 'ph-check-circle', red: 'ph-x-circle' };
const CANVAS_STATUS = {
  loading: { label: 'Canvas ready', color: 'var(--green)' },
  ready: { label: 'Canvas ready', color: 'var(--green)' },
  error: { label: 'Could not load canvas', color: 'var(--red)' },
};
const TABS = [
  { key: 'canvas', label: 'Canvas', icon: 'ph-pencil-simple' },
  { key: 'ai-studio', label: 'AI Studio', icon: 'ph-sparkle' },
  { key: 'inspiration', label: 'Inspiration', icon: 'ph-images' },
  { key: 'variants', label: 'Variants', icon: 'ph-shuffle' },
  { key: 'history', label: 'History & Comments', icon: 'ph-clock-counter-clockwise' },
];

export default function DesignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, designs, getUploadedFile, deleteProduct } = useProducts();
  const { canUse: canUseAI, remaining: aiRemaining, logUsage } = useAIUsage();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingTP, setGeneratingTP] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState(null);
  const [canvasStatus, setCanvasStatus] = useState('ready');
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [captureError, setCaptureError] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [tab, setTab] = useState('canvas');
  const [moodboard, setMoodboard] = useState([]);
  const [palette, setPalette] = useState([]);
  const [variants, setVariants] = useState([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const photopeaRef = useRef(null);

  const product = products.find(p => p.id === id);
  const design = designs[id];
  const uploadedFile = getUploadedFile(id);

  // Moodboard/palette/variants live on the `designs` row but aren't part of
  // ProductsContext's designs map (kept lean for what every page needs) —
  // loaded directly here, same pattern TechPackDetail uses for tech_packs.
  useEffect(() => {
    async function loadStudioData() {
      const { data } = await supabase.from('designs').select('moodboard, palette, variants').eq('product_id', id).single();
      if (data) {
        setMoodboard(data.moodboard || []);
        setPalette(data.palette || []);
        setVariants(data.variants || []);
      }
    }
    loadStudioData();
  }, [id]);

  const persistStudioField = async (field, value) => {
    await supabase.from('designs').update({ [field]: value }).eq('product_id', id);
  };

  const captureCanvasBase64 = async () => {
    const url = await photopeaRef.current.capture();
    const blob = await fetch(url).then(r => r.blob());
    return blobToBase64(blob);
  };

  const applyResultToCanvas = (url) => {
    photopeaRef.current?.openImage(url);
    setTab('canvas');
  };

  // Non-destructive counterpart — adds an AI Studio "addition" result as its
  // own new layer instead of replacing everything already on the canvas.
  const addLayerToCanvas = (url) => {
    photopeaRef.current?.addLayer(url);
    setTab('canvas');
  };

  const svgMarkup = useMemo(() => {
    if (!design || design.baseType === 'upload') return null;
    if (design.baseType === 'ai-silhouette' && design.aiPaths?.paths?.length) {
      return renderToStaticMarkup(<CustomSilhouette paths={design.aiPaths.paths} accents={design.aiPaths.accents} size={900} strokeWidth={4} color="#1a1a1a" />);
    }
    return renderToStaticMarkup(<GarmentSilhouette type={design.silhouette || 'tee'} size={900} strokeWidth={4} color="#1a1a1a" />);
  }, [design]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = e => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [expanded]);

  if (!product || !design) {
    return (
      <div className="content">
        <EmptyState icon="ph-magnifying-glass" title="Design not found" sub="This workspace doesn't exist yet." />
      </div>
    );
  }

  const analysis = localAnalysis || design.analysis;
  const statusMeta = CANVAS_STATUS[canvasStatus] || CANVAS_STATUS.ready;

  const captureAndAnalyze = async () => {
    if (!canUseAI) { setCaptureError('AI design analysis is not available on your current plan — upgrade in Settings > Billing.'); return; }
    setCaptureError(null);
    setAnalyzing(true);

    try {
      const url = await photopeaRef.current.capture();
      setSnapshot(url);

      const response = await fetch(url);
      const blob = await response.blob();
      
      const base64data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
          
      const apiRes = await fetch('http://localhost:3001/api/analyze-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64data })
      });
      
      const data = await apiRes.json();
      if (data.ok) {
        await logUsage('analyze-design');
        setLocalAnalysis(data.analysis);
        await supabase.from('designs').update({ analysis: data.analysis }).eq('product_id', id);

        setTimeout(() => {
          document.getElementById('analysis-result-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConvertToTechPack = async () => {
    if (!canUseAI) { setCaptureError('AI tech pack generation is not available on your current plan — upgrade in Settings > Billing.'); return; }
    setGeneratingTP(true);
    setCaptureError(null);
    try {
      let base64data;
      let blobToUpload;
      
      if (!snapshot) {
        const url = await photopeaRef.current.capture();
        setSnapshot(url);
        const response = await fetch(url);
        blobToUpload = await response.blob();
        base64data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blobToUpload);
        });
      } else {
        const response = await fetch(snapshot);
        blobToUpload = await response.blob();
        base64data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blobToUpload);
        });
      }

      // 1. UPLOAD IMAGE TO SUPABASE STORAGE
      const fileName = `${id}-${Date.now()}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('mockups')
        .upload(fileName, blobToUpload, { contentType: 'image/png', upsert: true });

      if (uploadError) throw new Error("Image Upload Failed: " + uploadError.message);

      // Get the permanent public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mockups')
        .getPublicUrl(fileName);
      
      // 2. ASK AI TO GENERATE TECH PACK
      const apiRes = await fetch('http://localhost:3001/api/generate-tech-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64data })
      });
      
      const data = await apiRes.json();
      if (!data.ok) throw new Error(data.error);
      await logUsage('generate-tech-pack');

      // 3. SAVE EVERYTHING TO DB
      await supabase.from('tech_packs').upsert({
        product_id: id,
        image_url: publicUrl, // Save the permanent image link!
        bom: data.techPackData.bom,
        measurements: data.techPackData.measurements,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' });

      await supabase.from('products').update({ stage: 'techpack' }).eq('id', id);
      navigate(`/tech-packs/${id}`);

    } catch (err) {
      setCaptureError("Tech Pack Error: " + err.message);
      setGeneratingTP(false);
    }
  };

  const toggleExpand = async () => {
    setToggling(true);
    try {
      const url = await photopeaRef.current.capture();
      const blob = await fetch(url).then(r => r.blob());
      setRestoreFile(new File([blob], 'canvas.png', { type: 'image/png' }));
    } catch {}
    setToggling(false);
    setExpanded(e => !e);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-design)' }}>Design Studio</div>
            <h1 className="page-title">{product.name}</h1>
          </div>
          <div className="page-sub">{product.category}</div>
        </div>
        <div className="topbar-right">
          <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete design" style={{ color: 'var(--red)' }}>
            <i className="ph ph-trash" />
          </button>
          <button className="btn btn-primary" onClick={handleConvertToTechPack} disabled={generatingTP || analyzing || !canUseAI} title={!canUseAI ? 'Upgrade your plan to use AI tech pack generation' : undefined}>
            {generatingTP ? <><i className="ph ph-spinner ph-spin" /> Saving & Generating...</> : !canUseAI ? <><i className="ph ph-lock-simple" /> Upgrade for AI Tech Pack</> : <><i className="ph ph-magic-wand" /> Auto-Generate Tech Pack</>}
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        itemLabel="design"
        itemName={product.name}
        warning="Its tech pack, measurements, and BOM will be deleted with it."
        onConfirm={async () => { await deleteProduct(id); navigate('/design'); }}
      />

      <div style={{ padding: '14px 30px 0' }}>
        <FlowStepper productId={id} current="design" />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-design)" />

      <div className="content">
        {captureError && (
          <div className="alert" style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
            <i className="ph ph-warning" style={{ marginTop: 1 }} />
            <div><strong>Error:</strong> {captureError}</div>
          </div>
        )}

        {/* Kept mounted (display:none, not unmounted) when other tabs are active so
            the Photopea iframe never reloads and in-progress canvas work survives
            switching to AI Studio/Inspiration/etc. and back. */}
        <div style={{ display: tab === 'canvas' ? 'block' : 'none' }}>
        {analysis && (
          <div style={{ maxWidth: 1080, marginBottom: 16 }} id="analysis-result-card">
            <div className="card-raised">
              <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <span className="card-title">AI Design Analysis</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  {snapshot && <img src={snapshot} alt="Captured canvas snapshot" style={{ width: 64, height: 64, objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1.5px solid var(--border-2)', flexShrink: 0 }} />}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: analysis.score >= 80 ? 'var(--green)' : 'var(--amber)' }}>
                    {analysis.score}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Factory Readiness Score</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(analysis.notes || []).map((note, i) => (
                    <div key={i} className={`alert alert-${note.severity}`} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 8, fontSize: 13 }}>
                      <i className={SEVERITY_ICON[note.severity] || "ph ph-info"} style={{ marginTop: 2 }} />
                      <div>{note.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 1080, display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0, height: expanded ? 0 : 600 }}>
            <div className={`canvas-panel ${expanded ? 'expanded' : ''}`} style={{ '--cp-accent': 'var(--c-design)' }}>
              <div className="canvas-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Canvas</span>
                  <span className="canvas-panel-badge">
                    <span className="canvas-panel-dot" style={{ background: statusMeta.color }} />
                    {statusMeta.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={captureAndAnalyze} disabled={analyzing || generatingTP || !canUseAI} title={!canUseAI ? 'Upgrade your plan to use AI design analysis' : `${aiRemaining} AI generations left this month`}>
                    {analyzing ? 'Analyzing...' : !canUseAI ? <><i className="ph ph-lock-simple" /> Upgrade</> : 'Analyze Design'}
                  </button>
                  <button className="canvas-icon-btn" onClick={toggleExpand} disabled={toggling}>
                    <i className={`ph ${expanded ? 'ph-corners-in' : 'ph-corners-out'}`} />
                  </button>
                </div>
              </div>
              
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ display: toggling ? 'flex' : 'none', position: 'absolute', inset: 0, background: 'var(--bg-2)', zIndex: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ph ph-spinner ph-spin" style={{ fontSize: 24, color: 'var(--ink-3)' }} />
                </div>
                <PhotopeaEditor 
                  ref={photopeaRef} 
                  svgMarkup={restoreFile ? null : svgMarkup} 
                  file={restoreFile || uploadedFile} 
                  onStatusChange={setCanvasStatus} 
                />
              </div>
            </div>
          </div>

          <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-raised">
              <div className="card-header"><span className="card-title">Details</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Garment type</label>
                  <div style={{ fontSize: 13.5 }}>{design.garmentType}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Colorway</label>
                  <input className="form-input" defaultValue={design.colorway} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Status</label>
                  <span className="tag tag-accent">{design.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        {tab === 'ai-studio' && (
          <AIStudioTab
            productId={id}
            onCapture={captureCanvasBase64}
            onApplyToCanvas={applyResultToCanvas}
            onAddLayer={addLayerToCanvas}
            canUseAI={canUseAI}
            aiRemaining={aiRemaining}
            logUsage={logUsage}
            onVersionSaved={() => setHistoryRefreshKey(k => k + 1)}
          />
        )}

        {tab === 'inspiration' && (
          <InspirationTab
            productId={id}
            category={design.garmentType}
            moodboard={moodboard}
            onMoodboardChange={v => { setMoodboard(v); persistStudioField('moodboard', v); }}
            palette={palette}
            onPaletteChange={v => { setPalette(v); persistStudioField('palette', v); }}
            onCapture={captureCanvasBase64}
            canUseAI={canUseAI}
            aiRemaining={aiRemaining}
            logUsage={logUsage}
          />
        )}

        {tab === 'variants' && (
          <VariantsTab
            productId={id}
            variants={variants}
            onChange={v => { setVariants(v); persistStudioField('variants', v); }}
            onCapture={captureCanvasBase64}
            onApplyToCanvas={applyResultToCanvas}
            canUseAI={canUseAI}
            aiRemaining={aiRemaining}
            logUsage={logUsage}
          />
        )}

        {tab === 'history' && (
          <HistoryTab key={historyRefreshKey} productId={id} onApplyToCanvas={applyResultToCanvas} />
        )}
      </div>
    </>
  );
}