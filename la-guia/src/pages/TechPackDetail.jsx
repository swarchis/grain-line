import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { riskTagClass, readinessColor, currency } from '../lib/format.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useTeam } from '../context/TeamContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUserPreferences } from '../context/UserPreferencesContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';
import { supabase } from '../lib/supabase.js';
import FlowStepper from '../components/FlowStepper.jsx';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import EditableSectionTable from '../components/EditableSectionTable.jsx';
import TechPackQuestionnaire from '../components/TechPackQuestionnaire.jsx';
import CommentsPanel from '../components/CommentsPanel.jsx';
import { exportTechPackExcel } from '../lib/techPackExcel.js';
import { toast } from '../lib/toast.js';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'bom', label: 'Bill of Materials', icon: 'ph-list-checks' },
  { key: 'measurements', label: 'Measurements', icon: 'ph-ruler' },
  { key: 'construction', label: 'Construction', icon: 'ph-needle' },
  { key: 'print-trims', label: 'Print & Trims', icon: 'ph-stamp' },
  { key: 'labels-packaging', label: 'Labels & Packaging', icon: 'ph-package' },
  { key: 'materials-notes', label: 'Materials & Notes', icon: 'ph-note' },
  { key: 'sampling', label: 'Sampling', icon: 'ph-scissors' },
  { key: 'history', label: 'History & Approval', icon: 'ph-clock-counter-clockwise' },
];

const DEFAULT_CHECKLIST = [
  { id: 'c-proto', label: 'Proto sample approved', status: 'pending' },
  { id: 'c-fit', label: 'Fit sample approved', status: 'pending' },
  { id: 'c-sizeset', label: 'Size set approved', status: 'pending' },
  { id: 'c-pp', label: 'Pre-production (PP) sample approved', status: 'pending' }
];

const APPROVAL_META = {
  draft: { label: 'Draft', color: 'var(--ink-3)' },
  pending: { label: 'Pending approval', color: 'var(--amber)' },
  approved: { label: 'Approved', color: 'var(--green)' },
  rejected: { label: 'Rejected', color: 'var(--red)' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Generic add/update/remove trio for the list-of-objects sections
// (construction, print placements, trims, labels, packaging, material
// usage) — avoids six near-identical copies of the same three functions.
function makeListHandlers(setter) {
  return {
    update: (rowId, field, value) => setter(prev => prev.map(item => (item.id === rowId ? { ...item, [field]: value } : item))),
    add: (blank) => setter(prev => [...prev, { id: `row-${Date.now()}`, ...blank }]),
    remove: (rowId) => setter(prev => prev.filter(item => item.id !== rowId)),
  };
}

export default function TechPackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const { products, activeBrand, updateProduct } = useProducts();
  const { canManage } = useTeam();
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const { logUsage } = useAIUsage();
  const product = products.find(p => p.id === id);

  const [imageUrl, setImageUrl] = useState(null);
  const [bom, setBom] = useState([{ id: 'bom-init', material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const [measurements, setMeasurements] = useState([{ id: 'meas-init', size: 'M', chest: '', length: '', sleeve: '' }]);
  const [materialWarnings, setMaterialWarnings] = useState([]);
  const [readinessChecklist, setReadinessChecklist] = useState(DEFAULT_CHECKLIST);

  const [construction, setConstruction] = useState([]);
  const [printPlacements, setPrintPlacements] = useState([]);
  const [trims, setTrims] = useState([]);
  const [labels, setLabels] = useState([]);
  const [packaging, setPackaging] = useState([]);
  const [materialUsage, setMaterialUsage] = useState([]);
  const [manufacturingNotes, setManufacturingNotes] = useState('');
  const [complianceNotes, setComplianceNotes] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('draft');
  const [approvedByName, setApprovedByName] = useState(null);
  const [approvedAt, setApprovedAt] = useState(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [versions, setVersions] = useState([]);
  const [versionsError, setVersionsError] = useState(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hasTechPack, setHasTechPack] = useState(false);

  const constructionH = makeListHandlers(setConstruction);
  const printH = makeListHandlers(setPrintPlacements);
  const trimsH = makeListHandlers(setTrims);
  const labelsH = makeListHandlers(setLabels);
  const packagingH = makeListHandlers(setPackaging);
  const materialUsageH = makeListHandlers(setMaterialUsage);

  const applyTechPackData = (data) => {
    if (data.bom?.length) setBom(data.bom);
    if (data.measurements?.length) setMeasurements(data.measurements);
    if (data.construction) setConstruction(data.construction);
    if (data.printPlacements) setPrintPlacements(data.printPlacements);
    if (data.trims) setTrims(data.trims);
    if (data.labels) setLabels(data.labels);
    if (data.packaging) setPackaging(data.packaging);
    if (data.materialUsage) setMaterialUsage(data.materialUsage);
    if (data.manufacturingNotes) setManufacturingNotes(data.manufacturingNotes);
    if (data.complianceNotes) setComplianceNotes(data.complianceNotes);
  };

  const loadVersions = async () => {
    const { data, error } = await supabase.from('tech_pack_versions').select('*').eq('product_id', id).order('created_at', { ascending: false });
    if (error) setVersionsError(error.message);
    else setVersions(data || []);
  };

  useEffect(() => {
    async function loadTechPack() {
      if (!product) return;
      try {
        const { data, error } = await supabase
          .from('tech_packs')
          .select('*')
          .eq('product_id', id)
          .single();

        if (data) {
          setHasTechPack(true);
          if (data.image_url) setImageUrl(data.image_url);
          if (data.bom && data.bom.length > 0) setBom(data.bom);
          if (data.measurements && data.measurements.length > 0) setMeasurements(data.measurements);
          if (data.material_warnings) setMaterialWarnings(data.material_warnings);
          if (data.readiness_checklist && data.readiness_checklist.length > 0) setReadinessChecklist(data.readiness_checklist);
          setConstruction(data.construction || []);
          setPrintPlacements(data.print_placements || []);
          setTrims(data.trims || []);
          setLabels(data.labels || []);
          setPackaging(data.packaging || []);
          setMaterialUsage(data.material_usage || []);
          setManufacturingNotes(data.manufacturing_notes || '');
          setComplianceNotes(data.compliance_notes || '');
          setApprovalStatus(data.approval_status || 'draft');
          setApprovedAt(data.approved_at || null);
          setApprovalComment(data.approval_comment || '');
        } else {
          // No tech pack row yet — prompt the intake questionnaire instead of
          // dropping the founder into a blank set of tables with no context.
          setShowQuestionnaire(true);
        }
      } catch (err) {
        console.error('Error fetching tech pack:', err);
      } finally {
        setLoadingData(false);
      }
    }
    loadTechPack();
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, product]);

  if (!product) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Tech pack not found" sub="This workspace doesn't exist yet." /></div>;
  }

  // BOM Handlers
  const updateBom = (rowId, field, value) => setBom(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addBomRow = () => setBom(prev => [...prev, { id: `bom-${Date.now()}`, material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
  const removeBomRow = (rowId) => setBom(prev => prev.filter(item => item.id !== rowId));

  // Measurement Handlers
  const updateMeas = (rowId, field, value) => setMeasurements(prev => prev.map(item => item.id === rowId ? { ...item, [field]: value } : item));
  const addMeasRow = () => setMeasurements(prev => [...prev, { id: `meas-${Date.now()}`, size: '', chest: '', length: '', sleeve: '' }]);
  const removeMeasRow = (rowId) => setMeasurements(prev => prev.filter(item => item.id !== rowId));

  // Sampling Checklist Handlers
  const toggleChecklistStatus = (itemId) => setReadinessChecklist(prev => prev.map(item => item.id === itemId ? { ...item, status: item.status === 'done' ? 'pending' : 'done' } : item));
  const updateChecklistItem = (itemId, newLabel) => setReadinessChecklist(prev => prev.map(item => item.id === itemId ? { ...item, label: newLabel } : item));
  const addChecklistItem = () => setReadinessChecklist(prev => [...prev, { id: `c-${Date.now()}`, label: '', status: 'pending' }]);
  const removeChecklistItem = (itemId) => setReadinessChecklist(prev => prev.filter(item => item.id !== itemId));

  // --- Dynamic Readiness Engine --- (unchanged: still gates on the core
  // production-critical sections, not every new questionnaire field, so
  // adding this builder doesn't silently move anyone's existing gate score)
  const calculateReadiness = () => {
    let score = 0;
    if (imageUrl) score += 10;
    const validBom = bom.filter(b => b.material && b.qtyPerUnit);
    if (validBom.length > 0) {
      score += 15;
      const pricedBom = validBom.filter(b => b.unitCost);
      if (pricedBom.length === validBom.length) score += 15;
    }
    const validMeas = measurements.filter(m => m.size && m.chest && m.length);
    if (validMeas.length > 0) score += 30;
    if (readinessChecklist.length > 0) {
      const doneCount = readinessChecklist.filter(c => c.status === 'done').length;
      score += Math.floor((doneCount / readinessChecklist.length) * 30);
    }
    return score;
  };

  const buildTechPackRow = () => ({
    product_id: id,
    bom,
    measurements,
    readiness_checklist: readinessChecklist,
    construction,
    print_placements: printPlacements,
    trims,
    labels,
    packaging,
    material_usage: materialUsage,
    manufacturing_notes: manufacturingNotes,
    compliance_notes: complianceNotes,
    updated_at: new Date().toISOString(),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const newReadiness = calculateReadiness();
      const { error: tpError } = await supabase.from('tech_packs').upsert(buildTechPackRow(), { onConflict: 'product_id' });
      if (tpError) throw tpError;
      await updateProduct(id, { readiness: newReadiness });
      setHasTechPack(true);
      toast.success('Tech pack saved.');
    } catch (err) {
      toast.error("Error saving tech pack: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalBomCost = bom.reduce((sum, item) => sum + ((parseFloat(item.qtyPerUnit) || 0) * (parseFloat(item.unitCost) || 0)), 0);

  const handleDeleteTechPack = async () => {
    const { error } = await supabase.from('tech_packs').delete().eq('product_id', id);
    if (error) throw error;
    setHasTechPack(false);
    setImageUrl(null);
    setBom([{ id: 'bom-init', material: '', supplier: '', qtyPerUnit: '', unitCost: '' }]);
    setMeasurements([{ id: 'meas-init', size: 'M', chest: '', length: '', sleeve: '' }]);
    setMaterialWarnings([]);
    setReadinessChecklist(DEFAULT_CHECKLIST);
    setConstruction([]); setPrintPlacements([]); setTrims([]); setLabels([]); setPackaging([]); setMaterialUsage([]);
    setManufacturingNotes(''); setComplianceNotes(''); setApprovalStatus('draft'); setApprovedAt(null); setApprovalComment('');
  };

  const handleExportPDF = () => window.print();
  const handleExportExcel = () => exportTechPackExcel({
    product, bom, measurements, construction, printPlacements, trims, labels, packaging, materialUsage,
    manufacturingNotes, complianceNotes, readinessChecklist, totalBomCost,
  });

  const setApproval = async (status, comment) => {
    const { error } = await supabase.from('tech_packs').update({
      approval_status: status, approved_by: status === 'approved' ? user?.id : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      approval_comment: comment ?? approvalComment,
    }).eq('product_id', id);
    if (error) { toast.error('Could not update approval status: ' + error.message); return; }
    setApprovalStatus(status);
    setApprovedAt(status === 'approved' ? new Date().toISOString() : null);
    setApprovedByName(status === 'approved' ? (preferences?.full_name || user?.email) : null);
  };

  const saveVersion = async () => {
    setSavingVersion(true);
    try {
      const { error } = await supabase.from('tech_pack_versions').insert([{
        product_id: id, snapshot: buildTechPackRow(), created_by: user?.id, label: `v${versions.length + 1}`,
      }]);
      if (error) throw error;
      await loadVersions();
    } catch (err) {
      setVersionsError(err.message);
    } finally {
      setSavingVersion(false);
    }
  };

  const restoreVersion = (snapshot) => {
    applyTechPackData({
      bom: snapshot.bom, measurements: snapshot.measurements, construction: snapshot.construction,
      printPlacements: snapshot.print_placements, trims: snapshot.trims, labels: snapshot.labels,
      packaging: snapshot.packaging, materialUsage: snapshot.material_usage,
      manufacturingNotes: snapshot.manufacturing_notes, complianceNotes: snapshot.compliance_notes,
    });
    if (snapshot.readiness_checklist) setReadinessChecklist(snapshot.readiness_checklist);
    setTab('overview');
  };

  const missingSections = hasTechPack ? [
    !imageUrl && 'Design reference image',
    !bom.some(b => b.material) && 'Bill of Materials',
    !measurements.some(m => m.size) && 'Measurements',
    construction.length === 0 && 'Stitch construction',
    printPlacements.length === 0 && 'Print placements',
    trims.length === 0 && 'Trims',
    labels.length === 0 && 'Labels',
    packaging.length === 0 && 'Packaging specifications',
    materialUsage.length === 0 && 'Material usage',
    !manufacturingNotes.trim() && 'Manufacturing notes',
    !complianceNotes.trim() && 'Compliance notes',
  ].filter(Boolean) : [];

  const approvalMeta = APPROVAL_META[approvalStatus] || APPROVAL_META.draft;

  return (
    <>
      {/* ── STANDARD WEB UI (Hidden during print) ── */}
      <div className="no-print">
        <div className="topbar">
          <div className="topbar-left">
            <div>
              <div className="page-eyebrow" style={{ color: 'var(--c-techpack)' }}>Tech Pack</div>
              <h1 className="page-title">{product.name}</h1>
            </div>
            <div className="page-sub">{product.category}</div>
          </div>
          <div className="topbar-right">
            <span className="tag" style={{ background: 'transparent', borderColor: approvalMeta.color, color: approvalMeta.color, marginRight: 8 }}>{approvalMeta.label}</span>
            <span className={riskTagClass(product.risk)} style={{ marginRight: 8 }}>{product.risk}</span>
            {hasTechPack && (
              <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete tech pack data" style={{ color: 'var(--red)' }}>
                <i className="ph ph-trash" />
              </button>
            )}
            <button className="btn" onClick={handleExportExcel} disabled={loadingData}>
              <i className="ph ph-file-xls" /> Export Excel
            </button>
            <button className="btn" onClick={handleExportPDF} disabled={loadingData}>
              <i className="ph ph-file-pdf" /> Export PDF
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingData}>
              <i className="ph ph-check" /> {saving ? 'Saving...' : 'Save Tech Pack'}
            </button>
          </div>
        </div>

        <ConfirmDeleteModal
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          itemLabel="tech pack"
          itemName={product.name}
          warning="Every section (BOM, measurements, construction, trims, labels, packaging, notes) will be cleared — the design itself stays."
          onConfirm={handleDeleteTechPack}
        />

        <TechPackQuestionnaire
          open={showQuestionnaire}
          onClose={() => setShowQuestionnaire(false)}
          category={product.category}
          logUsage={logUsage}
          onComplete={(data) => { applyTechPackData(data); setShowQuestionnaire(false); }}
        />

        <div style={{ padding: '14px 30px 0' }}>
          <FlowStepper productId={product.id} current="techpack" />
        </div>

        <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-techpack)" />

        <div className="content">
          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-3)' }}>
              <i className="ph ph-spinner ph-spin" style={{ fontSize: 24, marginBottom: 10 }} />
              <div>Loading Tech Pack...</div>
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div>
                  {!hasTechPack && (
                    <div className="form-hint" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border-2)' }}>
                      No tech pack yet. <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setShowQuestionnaire(true)}>Answer the intake questionnaire</button>
                    </div>
                  )}
                  {missingSections.length > 0 && (
                    <div className="form-hint" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', color: 'var(--amber)' }}>
                      <i className="ph ph-warning" style={{ marginRight: 4 }} /> <strong>Missing information:</strong> {missingSections.join(', ')}.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                    <div style={{ width: 320, flexShrink: 0, background: 'var(--bg-1)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ width: '100%', aspectRatio: '4/5', background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                        {imageUrl ? (
                          <img src={imageUrl} alt="Garment design" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 24 }}>
                            <i className="ph ph-image" />
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/design/${id}`)}>
                          <i className="ph ph-pencil-simple" /> Edit Design
                        </button>
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        <div className="stat-card" style={{ '--stat-accent': 'var(--c-techpack)' }}>
                          <div className="stat-label">Factory readiness</div>
                          <div className="stat-value" style={{ color: readinessColor(product.readiness) }}>{product.readiness}%</div>
                          <div className="stat-delta delta-muted">Updates dynamically on save</div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
                          <div className="stat-label">Target Unit Cost</div>
                          <div className="stat-value">{currency(totalBomCost || product.budget)}</div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': 'var(--c-vendors)' }}>
                          <div className="stat-label">BOM line items</div>
                          <div className="stat-value">{bom.length}</div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': 'var(--c-finalcheck)' }}>
                          <div className="stat-label">Material warnings</div>
                          <div className="stat-value" style={{ color: materialWarnings.length > 0 ? 'var(--amber)' : 'var(--ink)' }}>{materialWarnings.length}</div>
                        </div>
                      </div>

                      {materialWarnings.length > 0 && (
                        <div className="card-raised">
                          <div className="card-header"><span className="card-title">Production Mistake Predictor</span></div>
                          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {materialWarnings.map((w, i) => (
                              <div key={i} className={`alert alert-${w.severity === 'red' ? 'red' : 'amber'}`} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 8, background: `var(--${w.severity}-bg)`, border: `1px solid var(--${w.severity}-border)`, color: `var(--${w.severity})`, fontSize: 13.5 }}>
                                <i className="ph ph-warning" style={{ marginTop: 2 }} />
                                <div><strong>{w.material}:</strong> {w.warning}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'bom' && (
                <div className="card">
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                          <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '35%' }}>Material / Component</th>
                          <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Supplier</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Qty / Unit</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Est. Cost</th>
                          <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '12%' }}>Line Total</th>
                          <th style={{ width: '4%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bom.map((b, i) => {
                          const lineTotal = (parseFloat(b.qtyPerUnit) || 0) * (parseFloat(b.unitCost) || 0);
                          return (
                            <tr key={b.id} style={{ borderBottom: i < bom.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="e.g. Cotton" value={b.material} onChange={e => updateBom(b.id, 'material', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="Supplier" value={b.supplier} onChange={e => updateBom(b.id, 'supplier', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px' }}>
                                <input className="form-input" type="number" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="1.5" value={b.qtyPerUnit} onChange={e => updateBom(b.id, 'qtyPerUnit', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', zIndex: 1 }}>$</span>
                                <input className="form-input" type="number" style={{ padding: '8px 12px 8px 20px', fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="0.00" value={b.unitCost} onChange={e => updateBom(b.id, 'unitCost', e.target.value)} />
                              </td>
                              <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>
                                {currency(lineTotal)}
                              </td>
                              <td style={{ padding: '8px 20px 8px 0', textAlign: 'right' }}>
                                <button onClick={() => removeBomRow(b.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--bg-3)', borderTop: '2px solid var(--border)' }}>
                          <td colSpan="4" style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Total BOM Cost</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: 'var(--c-techpack)' }}>{currency(totalBomCost)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm" onClick={addBomRow}><i className="ph ph-plus" /> Add Material</button>
                  </div>
                </div>
              )}

              {tab === 'measurements' && (
                <div className="card" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '20%' }}>Size (Grade)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Chest (in)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Length (in)</th>
                        <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', width: '25%' }}>Sleeve (in)</th>
                        <th style={{ width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((m, i) => (
                        <tr key={m.id} style={{ borderBottom: i < measurements.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }} placeholder="e.g. M" value={m.size} onChange={e => updateMeas(m.id, 'size', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='22.5"' value={m.chest} onChange={e => updateMeas(m.id, 'chest', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='28"' value={m.length} onChange={e => updateMeas(m.id, 'length', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px' }}><input className="form-input" style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }} placeholder='25"' value={m.sleeve} onChange={e => updateMeas(m.id, 'sleeve', e.target.value)} /></td>
                          <td style={{ padding: '8px 20px 8px 0', textAlign: 'right' }}><button onClick={() => removeMeasRow(m.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm" onClick={addMeasRow}><i className="ph ph-plus" /> Add Size</button>
                  </div>
                </div>
              )}

              {tab === 'construction' && (
                <EditableSectionTable
                  columns={[
                    { key: 'section', label: 'Garment section', placeholder: 'e.g. Side seam' },
                    { key: 'stitchType', label: 'Stitch type', placeholder: 'e.g. 5-thread overlock' },
                    { key: 'notes', label: 'Notes', placeholder: 'Any detail the factory needs', multiline: true },
                  ]}
                  rows={construction}
                  onUpdate={constructionH.update}
                  onAdd={constructionH.add}
                  onRemove={constructionH.remove}
                  addLabel="Add construction detail"
                  blankRow={{ section: '', stitchType: '', notes: '' }}
                  emptyLabel="No construction details yet."
                />
              )}

              {tab === 'print-trims' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 10 }}>Print / graphic placements</div>
                    <EditableSectionTable
                      columns={[
                        { key: 'name', label: 'Name', placeholder: 'e.g. Chest logo' },
                        { key: 'placement', label: 'Placement', placeholder: 'e.g. 3in below collar, centered' },
                        { key: 'size', label: 'Size', placeholder: 'e.g. 4in x 4in' },
                        { key: 'technique', label: 'Technique', placeholder: 'e.g. screen print' },
                      ]}
                      rows={printPlacements}
                      onUpdate={printH.update}
                      onAdd={printH.add}
                      onRemove={printH.remove}
                      addLabel="Add placement"
                      blankRow={{ name: '', placement: '', size: '', technique: '' }}
                      emptyLabel="No print placements yet."
                    />
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 10 }}>Trims</div>
                    <EditableSectionTable
                      columns={[
                        { key: 'name', label: 'Trim', placeholder: 'e.g. YKK zipper' },
                        { key: 'supplier', label: 'Supplier', placeholder: 'Supplier' },
                        { key: 'quantity', label: 'Quantity', placeholder: 'e.g. 1 per unit' },
                        { key: 'unitCost', label: 'Unit cost', placeholder: '0.00' },
                      ]}
                      rows={trims}
                      onUpdate={trimsH.update}
                      onAdd={trimsH.add}
                      onRemove={trimsH.remove}
                      addLabel="Add trim"
                      blankRow={{ name: '', supplier: '', quantity: '', unitCost: '' }}
                      emptyLabel="No trims added yet."
                    />
                  </div>
                </div>
              )}

              {tab === 'labels-packaging' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 10 }}>Label placement</div>
                    <EditableSectionTable
                      columns={[
                        { key: 'type', label: 'Label type', placeholder: 'e.g. Main label, Care label' },
                        { key: 'placement', label: 'Placement', placeholder: 'e.g. Center back neck' },
                        { key: 'content', label: 'Content', placeholder: 'What it says', multiline: true },
                      ]}
                      rows={labels}
                      onUpdate={labelsH.update}
                      onAdd={labelsH.add}
                      onRemove={labelsH.remove}
                      addLabel="Add label"
                      blankRow={{ type: '', placement: '', content: '' }}
                      emptyLabel="No labels added yet."
                    />
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 10 }}>Packaging specifications</div>
                    <EditableSectionTable
                      columns={[
                        { key: 'item', label: 'Item', placeholder: 'e.g. Poly bag' },
                        { key: 'spec', label: 'Spec', placeholder: 'e.g. Recyclable, resealable' },
                        { key: 'notes', label: 'Notes', placeholder: '', multiline: true },
                      ]}
                      rows={packaging}
                      onUpdate={packagingH.update}
                      onAdd={packagingH.add}
                      onRemove={packagingH.remove}
                      addLabel="Add packaging item"
                      blankRow={{ item: '', spec: '', notes: '' }}
                      emptyLabel="No packaging specified yet."
                    />
                  </div>
                </div>
              )}

              {tab === 'materials-notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 10 }}>Material usage</div>
                    <EditableSectionTable
                      columns={[
                        { key: 'material', label: 'Material', placeholder: 'e.g. Body fabric' },
                        { key: 'consumptionPerUnit', label: 'Consumption / unit', placeholder: 'e.g. 1.4' },
                        { key: 'unit', label: 'Unit', placeholder: 'e.g. yards' },
                        { key: 'wastagePercent', label: 'Wastage %', placeholder: 'e.g. 8' },
                      ]}
                      rows={materialUsage}
                      onUpdate={materialUsageH.update}
                      onAdd={materialUsageH.add}
                      onRemove={materialUsageH.remove}
                      addLabel="Add material"
                      blankRow={{ material: '', consumptionPerUnit: '', unit: '', wastagePercent: '' }}
                      emptyLabel="No material usage recorded yet."
                    />
                  </div>
                  <div className="card-raised" style={{ padding: 18 }}>
                    <label className="form-label">Manufacturing notes</label>
                    <textarea className="form-input" style={{ minHeight: 90, resize: 'vertical', marginBottom: 16 }} value={manufacturingNotes} onChange={e => setManufacturingNotes(e.target.value)} placeholder="General instructions to the factory" />
                    <label className="form-label">Compliance notes</label>
                    <textarea className="form-input" style={{ minHeight: 90, resize: 'vertical' }} value={complianceNotes} onChange={e => setComplianceNotes(e.target.value)} placeholder="Certifications, safety, labeling regulations" />
                  </div>
                </div>
              )}

              {tab === 'sampling' && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Sampling & Validation</span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {readinessChecklist.map((item) => (
                      <div key={item.id} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          onClick={() => toggleChecklistStatus(item.id)}
                          style={{
                            width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${item.status === 'done' ? 'var(--green)' : 'var(--border-2)'}`,
                            background: item.status === 'done' ? 'var(--green)' : 'var(--bg-1)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s'
                          }}
                        >
                          {item.status === 'done' && <i className="ph ph-check" style={{ fontSize: 14 }} />}
                        </button>
                        <input
                          className="form-input"
                          style={{ flex: 1, padding: '8px 12px', fontSize: 13.5, background: 'transparent', border: 'none', boxShadow: 'none', textDecoration: item.status === 'done' ? 'line-through' : 'none', color: item.status === 'done' ? 'var(--ink-3)' : 'var(--ink)' }}
                          value={item.label}
                          onChange={e => updateChecklistItem(item.id, e.target.value)}
                          placeholder="Checklist item description"
                        />
                        <button onClick={() => removeChecklistItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}>×</button>
                      </div>
                    ))}
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-sm" onClick={addChecklistItem}><i className="ph ph-plus" /> Add Step</button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'history' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
                  <div className="card-raised" style={{ padding: 18 }}>
                    <span className="card-title" style={{ display: 'block', marginBottom: 12 }}>Approval workflow</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="tag" style={{ background: 'transparent', borderColor: approvalMeta.color, color: approvalMeta.color }}>{approvalMeta.label}</span>
                      {approvedAt && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{timeAgo(approvedAt)}{approvedByName ? ` by ${approvedByName}` : ''}</span>}
                    </div>
                    {approvalStatus === 'rejected' && approvalComment && (
                      <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>Rejection note: {approvalComment}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {approvalStatus === 'draft' && (
                        <button className="btn btn-sm" onClick={() => setApproval('pending')}>Submit for approval</button>
                      )}
                      {approvalStatus === 'pending' && canManage && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setApproval('approved')}>Approve</button>
                          <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => { const c = prompt('Reason for rejecting (optional):') || ''; setApproval('rejected', c); }}>Reject</button>
                        </>
                      )}
                      {approvalStatus === 'pending' && !canManage && (
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Waiting on a brand admin/owner to review.</span>
                      )}
                      {(approvalStatus === 'approved' || approvalStatus === 'rejected') && (
                        <button className="btn btn-sm" onClick={() => setApproval('draft')}>Reset to draft</button>
                      )}
                    </div>
                  </div>

                  <div className="card-raised" style={{ padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span className="card-title">Version history</span>
                      <button className="btn btn-sm" onClick={saveVersion} disabled={savingVersion}>{savingVersion ? 'Saving…' : <><i className="ph ph-camera" /> Save version</>}</button>
                    </div>
                    {versionsError && (
                      <div style={{ fontSize: 11.5, color: 'var(--red)', marginBottom: 10 }}>{versionsError}{versionsError.includes('does not exist') ? ' — run migration 013_tech_pack_builder.sql.' : ''}</div>
                    )}
                    {versions.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Save a version any time you want a restorable snapshot of the whole tech pack.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
                        {versions.map(v => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderTop: '1px solid var(--border)' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{v.label}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(v.created_at)}</div>
                            </div>
                            <button className="btn btn-sm" onClick={() => restoreVersion(v.snapshot)}>Restore</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <CommentsPanel brandId={activeBrand?.id} entityType="tech_pack" entityId={id} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PRINT ONLY LAYOUT (Hidden during normal web browsing) ── */}
      <div className="print-only tech-pack-print">
        <h1>{activeBrand?.name || 'Atelier Brand'} - Tech Pack Specification</h1>

        <div className="meta-grid">
          <div className="meta-item"><strong>Style Name:</strong> {product.name}</div>
          <div className="meta-item"><strong>Category:</strong> {product.category}</div>
          <div className="meta-item"><strong>Target Unit Cost:</strong> {currency(totalBomCost)}</div>
          <div className="meta-item"><strong>Approval status:</strong> {approvalMeta.label}</div>
          <div className="meta-item"><strong>Date Exported:</strong> {new Date().toLocaleDateString()}</div>
        </div>

        {imageUrl && (
          <div>
            <h2>1. Design Reference</h2>
            <img src={imageUrl} alt="Garment Sketch" className="hero-image" />
          </div>
        )}

        <h2>2. Bill of Materials (BOM)</h2>
        <table>
          <thead><tr><th>Material / Component</th><th>Supplier / Ref</th><th>Qty per Unit</th></tr></thead>
          <tbody>
            {bom.filter(b => b.material).map((b, i) => (
              <tr key={i}><td>{b.material}</td><td>{b.supplier || 'TBD'}</td><td>{b.qtyPerUnit}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>3. Graded Measurements</h2>
        <table>
          <thead><tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th><th>Sleeve (in)</th></tr></thead>
          <tbody>
            {measurements.filter(m => m.size).map((m, i) => (
              <tr key={i}><td><strong>{m.size}</strong></td><td>{m.chest}</td><td>{m.length}</td><td>{m.sleeve}</td></tr>
            ))}
          </tbody>
        </table>

        {construction.length > 0 && (
          <>
            <h2>4. Stitch Construction</h2>
            <table>
              <thead><tr><th>Section</th><th>Stitch Type</th><th>Notes</th></tr></thead>
              <tbody>{construction.map((c, i) => <tr key={i}><td>{c.section}</td><td>{c.stitchType}</td><td>{c.notes}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {printPlacements.length > 0 && (
          <>
            <h2>5. Print Placements</h2>
            <table>
              <thead><tr><th>Name</th><th>Placement</th><th>Size</th><th>Technique</th></tr></thead>
              <tbody>{printPlacements.map((p, i) => <tr key={i}><td>{p.name}</td><td>{p.placement}</td><td>{p.size}</td><td>{p.technique}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {trims.length > 0 && (
          <>
            <h2>6. Trims</h2>
            <table>
              <thead><tr><th>Trim</th><th>Supplier</th><th>Quantity</th><th>Unit Cost</th></tr></thead>
              <tbody>{trims.map((t, i) => <tr key={i}><td>{t.name}</td><td>{t.supplier}</td><td>{t.quantity}</td><td>{t.unitCost}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {labels.length > 0 && (
          <>
            <h2>7. Labels</h2>
            <table>
              <thead><tr><th>Type</th><th>Placement</th><th>Content</th></tr></thead>
              <tbody>{labels.map((l, i) => <tr key={i}><td>{l.type}</td><td>{l.placement}</td><td>{l.content}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {packaging.length > 0 && (
          <>
            <h2>8. Packaging Specifications</h2>
            <table>
              <thead><tr><th>Item</th><th>Spec</th><th>Notes</th></tr></thead>
              <tbody>{packaging.map((p, i) => <tr key={i}><td>{p.item}</td><td>{p.spec}</td><td>{p.notes}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {materialUsage.length > 0 && (
          <>
            <h2>9. Material Usage</h2>
            <table>
              <thead><tr><th>Material</th><th>Consumption / Unit</th><th>Unit</th><th>Wastage %</th></tr></thead>
              <tbody>{materialUsage.map((m, i) => <tr key={i}><td>{m.material}</td><td>{m.consumptionPerUnit}</td><td>{m.unit}</td><td>{m.wastagePercent}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {(manufacturingNotes || complianceNotes) && (
          <>
            <h2>10. Notes</h2>
            {manufacturingNotes && <p><strong>Manufacturing:</strong> {manufacturingNotes}</p>}
            {complianceNotes && <p><strong>Compliance:</strong> {complianceNotes}</p>}
          </>
        )}

        {readinessChecklist.length > 0 && (
          <>
            <h2>11. Sampling & Validation Checklist</h2>
            <table>
              <thead><tr><th style={{ width: '20%' }}>Status</th><th>Requirement</th></tr></thead>
              <tbody>
                {readinessChecklist.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold', color: c.status === 'done' ? '#228B22' : '#666' }}>{c.status === 'done' ? '✓ APPROVED' : 'PENDING'}</td>
                    <td>{c.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="footer">
          Generated via Atelier Production OS • {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}
