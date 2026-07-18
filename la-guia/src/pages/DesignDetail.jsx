import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { useProducts } from '../context/ProductsContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { supabase } from '../lib/supabase.js';
import GarmentSilhouette, { CustomSilhouette, VectorSilhouette } from '../components/GarmentSilhouette.jsx';
import PhotopeaEditor from '../components/PhotopeaEditor.jsx';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import AIStudioTab from '../components/design-studio/AIStudioTab.jsx';
import InspirationTab from '../components/design-studio/InspirationTab.jsx';
import VariantsTab from '../components/design-studio/VariantsTab.jsx';
import HistoryTab from '../components/design-studio/HistoryTab.jsx';
import SkuVariantsTab from '../components/design-studio/SkuVariantsTab.jsx';
import { blobToBase64 } from '../lib/designImages.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import Splitter from '../components/Splitter.jsx';
import AssetsTab from '../components/design-studio/AssetsTab.jsx';

const SEVERITY_ICON = { amber: 'ph-warning', blue: 'ph-info', green: 'ph-check-circle', red: 'ph-x-circle' };
const DESIGN_STATUSES = ['Sketching', 'Refining', 'Ready'];
const FABRIC_TAG_TYPES = [
  { key: 'composition', label: 'Composition', color: 'var(--c-materials)' },
  { key: 'care', label: 'Care', color: 'var(--c-vendors)' },
  { key: 'origin', label: 'Origin', color: 'var(--c-organization)' },
  { key: 'certification', label: 'Certification', color: 'var(--green)' },
];
const CANVAS_STATUS = {
  loading: { label: 'Canvas ready', color: 'var(--green)' },
  ready: { label: 'Canvas ready', color: 'var(--green)' },
  error: { label: 'Could not load canvas', color: 'var(--red)' },
};
const TABS = [
  { key: 'canvas', label: 'Canvas', icon: 'ph-pencil-simple' },
  { key: 'ai-studio', label: 'AI Studio', icon: 'ph-sparkle' },
  { key: 'inspiration', label: 'Inspiration', icon: 'ph-images' },
  { key: 'image-variants', label: 'Image Variants', icon: 'ph-shuffle' },
  { key: 'skus', label: 'SKUs & Variants', icon: 'ph-barcode' },
  { key: 'history', label: 'History & Comments', icon: 'ph-clock-counter-clockwise' },
  { key: 'assets', label: 'Assets & Media', icon: 'ph-folder-open' },
];

export default function DesignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, designs, getUploadedFile, deleteProduct, updateProduct, activeBrand, categories, duplicateProduct, setProductStatus, updateDesignStatus, updateDesignFabricTags } = useProducts();
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
  const [tagDraft, setTagDraft] = useState('');
  const [tagType, setTagType] = useState('composition');
  const [savingStatus, setSavingStatus] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [splitWidth, setSplitWidth] = useState(560);
  const [duplicating, setDuplicating] = useState(false);
  const [findingVendors, setFindingVendors] = useState(false);
  const [tab, setTab] = useState('canvas');
  const [moodboard, setMoodboard] = useState([]);
  const [palette, setPalette] = useState([]);
  const [variants, setVariants] = useState([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const photopeaRef = useRef(null);
  const canvasPanelRef = useRef(null);

  const product = products.find(p => p.id === id);
  const design = designs[id];
  const uploadedFile = getUploadedFile(id);
  // Canvas + AI Studio used to be mutually-exclusive tabs — this is the one
  // place a real side-by-side split exists between them.
  const showSplitStudio = splitView && (tab === 'canvas' || tab === 'ai-studio');

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

  const [templateFile, setTemplateFile] = useState(null);
  const [svgFallback, setSvgFallback] = useState(null);

  useEffect(() => {
    if (!design || design.baseType === 'upload') {
      setTemplateFile(null);
      setSvgFallback(null);
      return;
    }

    // AI generated paths are purely SVG
    if (design.baseType === 'ai-silhouette' && design.aiPaths?.paths?.length) {
      setSvgFallback(renderToStaticMarkup(
        <CustomSilhouette paths={design.aiPaths.paths} accents={design.aiPaths.accents} size={900} strokeWidth={4} color="#1a1a1a" />
      ));
      setTemplateFile(null);
      return;
    }

    const type = design.silhouette || 'tee';
    let cancelled = false;

    // Attempt to load the Custom jpeg. If it fails, fall back to the Vector shapes.
    fetch(`/silhouettes/${type}.jpeg`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        setTemplateFile(new File([blob], `${type}.jpeg`, { type: 'image/jpeg' }));
        setSvgFallback(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSvgFallback(renderToStaticMarkup(
          <VectorSilhouette type={type} size={900} strokeWidth={4} color="#1a1a1a" />
        ));
        setTemplateFile(null);
      });

    return () => { cancelled = true; };
  }, [design?.silhouette, design?.baseType, design?.aiPaths]);

  // Native Fullscreen Listener: Synchronizes the UI state instantly
  // even if the user exits fullscreen using the physical Escape key.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setExpanded(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
          
      const apiRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/analyze-design`, {
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
      const fileName = `${id}-${Date.now()}.jpeg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('mockups')
        .upload(fileName, blobToUpload, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw new Error("Image Upload Failed: " + uploadError.message);

      // Get the permanent public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mockups')
        .getPublicUrl(fileName);
      
      // 2. ASK AI TO GENERATE TECH PACK
      const apiRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/generate-tech-pack`, {
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
      setRestoreFile(new File([blob], 'canvas.jpeg', { type: 'image/jpeg' }));
    } catch {}
    setToggling(false);

    // Call the browser's native OS-level Fullscreen API
    if (!document.fullscreenElement) {
      canvasPanelRef.current?.requestFullscreen().catch(err => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error("Error exiting fullscreen:", err);
      });
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const newId = await duplicateProduct(id);
      navigate(`/design/${newId}`);
    } catch (err) {
      setCaptureError('Duplicate failed: ' + err.message);
      setDuplicating(false);
    }
  };

  const handleFindVendors = async () => {
    setFindingVendors(true);
    try {
      let imageBase64 = null;
      try { imageBase64 = await captureCanvasBase64(); } catch { /* search still works without the image */ }
      navigate('/vendors', {
        state: {
          fromDesign: true,
          keywords: design.garmentType,
          category: product.category,
          productName: product.name,
          imageBase64,
        },
      });
    } finally {
      setFindingVendors(false);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await setProductStatus(id, status);
      // Archived products drop out of the main `products` list, so staying
      // on this page would immediately hit the "not found" empty state —
      // head back to the list instead, same as after a delete.
      if (status === 'archived') navigate('/design');
    } catch (err) {
      setCaptureError('Failed to update status: ' + err.message);
    }
  };

  const handleDesignStatusChange = async (status) => {
    setSavingStatus(true);
    try {
      await updateDesignStatus(id, status);
    } catch (err) {
      setCaptureError('Failed to update design status: ' + err.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const addFabricTag = async () => {
    const label = tagDraft.trim();
    if (!label) return;
    const next = [...(design.fabricTags || []), { type: tagType, label }];
    setTagDraft('');
    try {
      await updateDesignFabricTags(id, next);
    } catch (err) {
      setCaptureError('Failed to save tag: ' + err.message);
    }
  };

  const removeFabricTag = async (index) => {
    const next = (design.fabricTags || []).filter((_, i) => i !== index);
    try {
      await updateDesignFabricTags(id, next);
    } catch (err) {
      setCaptureError('Failed to remove tag: ' + err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <Breadcrumbs items={[{ label: 'Home', path: '/' }, { label: 'Design Studio', path: '/design' }, { label: product.name }]} />
            <div className="page-eyebrow" style={{ color: 'var(--c-design)' }}>Design Studio</div>
            <h1 className="page-title">{product.name}</h1>
          </div>
          <div className="page-sub">{product.category}</div>
        </div>
        <div className="topbar-right">
          {(tab === 'canvas' || tab === 'ai-studio') && (
            <button className="btn btn-sm" onClick={() => setSplitView(s => !s)} title={splitView ? 'Show one panel at a time' : 'Show canvas and AI Studio side by side'}>
              <i className={`ph ${splitView ? 'ph-columns' : 'ph-square-split-horizontal'}`} /> {splitView ? 'Split view on' : 'Split view'}
            </button>
          )}
          <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete design" style={{ color: 'var(--red)' }}>
            <i className="ph ph-trash" />
          </button>
          <button className="canvas-icon-btn" onClick={handleDuplicate} disabled={duplicating} title="Duplicate design">
            <i className={`ph ${duplicating ? 'ph-spinner ph-spin' : 'ph-copy'}`} />
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
            switching to AI Studio/Inspiration/etc. and back. Also shown while on the
            AI Studio tab in split view, since the canvas needs to render beside it. */}
        <div style={{ display: (tab === 'canvas' || showSplitStudio) ? 'block' : 'none' }}>
        {analysis && (
          <div style={{ maxWidth: 1080, marginBottom: 16 }} id="analysis-result-card">
            <div className="card-raised">
              <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <span className="card-title">AI Design Critique</span>
              </div>
              <div className="card-body">
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>A real critique of this exact canvas snapshot — not general advice. Score and notes come straight from Gemini looking at the image, nothing pre-scripted.</div>
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

        <div className="canvas-row" style={{ maxWidth: showSplitStudio ? 'none' : 1080, display: 'flex', gap: showSplitStudio ? 0 : 16, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: showSplitStudio ? '0 0 auto' : 1, width: showSplitStudio ? splitWidth : undefined, minWidth: 0, height: expanded ? 0 : 600 }}>
            <div ref={canvasPanelRef} className={`canvas-panel ${expanded ? 'expanded' : ''}`} style={{ '--cp-accent': 'var(--c-design)' }}>
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
                  svgMarkup={restoreFile ? null : svgFallback} 
                  file={restoreFile || uploadedFile || templateFile} 
                  onStatusChange={setCanvasStatus} 
                />
              </div>
            </div>
          </div>

          {showSplitStudio ? (
            <>
              <Splitter width={splitWidth} onWidthChange={setSplitWidth} min={360} max={900} />
              <div style={{ flex: 1, minWidth: 0 }}>
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
              </div>
            </>
          ) : (
          <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-raised">
              <div className="card-header"><span className="card-title">Details</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Garment type</label>
                  <div style={{ fontSize: 13.5 }}>{design.garmentType}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={product.category || ''} onChange={e => updateProduct(id, { category: e.target.value })}>
                    {product.category && !categories.some(c => c.name === product.category) && (
                      <option value={product.category}>{product.category}</option>
                    )}
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Colorway (sketch)</label>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>{design.colorway || '—'}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Product status</label>
                  <select className="form-input" value={product.status || 'active'} onChange={e => handleStatusChange(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="discontinued">Discontinued</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Design status</label>
                  <select className="form-input" value={design.status || 'Sketching'} onChange={e => handleDesignStatusChange(e.target.value)} disabled={savingStatus}>
                    {DESIGN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Fabric tags</label>
                  {(design.fabricTags || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {design.fabricTags.map((t, i) => {
                        const meta = FABRIC_TAG_TYPES.find(ft => ft.key === t.type) || FABRIC_TAG_TYPES[0];
                        return (
                          <span key={i} className="tag" style={{ background: 'transparent', borderColor: meta.color, color: meta.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {t.label}
                            <button onClick={() => removeFabricTag(i)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="form-input" style={{ width: 108, fontSize: 12 }} value={tagType} onChange={e => setTagType(e.target.value)}>
                      {FABRIC_TAG_TYPES.map(ft => <option key={ft.key} value={ft.key}>{ft.label}</option>)}
                    </select>
                    <input
                      className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="e.g. 100% GOTS cotton"
                      value={tagDraft} onChange={e => setTagDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFabricTag(); } }}
                    />
                    <button className="btn btn-sm" onClick={addFabricTag} disabled={!tagDraft.trim()}><i className="ph ph-plus" /></button>
                  </div>
                </div>
                <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setTab('skus')}>
                  <i className="ph ph-barcode" /> Manage SKUs & Variants
                </button>
                <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={handleFindVendors} disabled={findingVendors}>
                  <i className={`ph ${findingVendors ? 'ph-spinner ph-spin' : 'ph-handshake'}`} /> {findingVendors ? 'Capturing design…' : 'Find Vendors for this Design'}
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
        </div>

        {tab === 'ai-studio' && !showSplitStudio && (
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

        {tab === 'image-variants' && (
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

        {tab === 'skus' && (
          <SkuVariantsTab
            productId={id}
            product={product}
            brandName={activeBrand?.name}
            onUpdateProduct={updates => updateProduct(id, updates)}
          />
        )}

        {tab === 'assets' && (
          <AssetsTab productId={id} />
        )}
        
        {tab === 'history' && (
          <HistoryTab key={historyRefreshKey} productId={id} onApplyToCanvas={applyResultToCanvas} />
        )}
      </div>
    </>
  );
}