import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { trustTagClass } from '../lib/format.js';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx';
import TabBar from '../components/TabBar.jsx';
import { PhotoPanel } from '../components/decor.jsx';
import { useMaterials } from '../context/MaterialsContext.jsx';
import { useVendors } from '../context/VendorsContext.jsx';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';
import { useAutosave, AutosaveIndicator } from '../lib/useAutosave.jsx';
import { usePinned } from '../context/PinnedContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { toast } from '../lib/toast.js';

const TONE_BY_RISK = { green: 'sage', amber: 'gold', red: 'clay' };
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'ph-info' },
  { key: 'cost', label: 'Cost & Suppliers', icon: 'ph-currency-dollar' },
  { key: 'usage', label: 'Usage', icon: 'ph-list-checks' },
];
const AVAILABILITY_OPTIONS = ['In Stock', 'Low Stock', 'Backordered', 'Discontinued', 'Unknown'];

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    materials, deleteMaterial, updateMaterial,
    costLogByMaterial, loadCostLog, addCostLogEntry,
    vendorLinksByMaterial, loadVendorLinks, linkVendor, unlinkVendor,
  } = useMaterials();
  const { vendors } = useVendors();
  const { isPinned, togglePin } = usePinned();

  const material = materials.find(m => m.id === id);
  const costLog = costLogByMaterial[id] || [];
  const vendorLinks = vendorLinksByMaterial[id] || [];
  const pricePoints = costLog.map(c => ({ date: c.logged_at, amount: Number(c.unit_cost) }));
  const similarMaterials = material ? materials.filter(m => m.id !== material.id && m.category && m.category === material.category) : [];

  const [usedInProducts, setUsedInProducts] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState('overview');

  const [sustainDraft, setSustainDraft] = useState(null);
  const [certDraft, setCertDraft] = useState(null);

  // undefined until the material row is loaded, so the initial populate
  // from `material.sustainability_info` doesn't itself trigger a write-back
  const sustainValue = material ? (sustainDraft === null ? (material.sustainability_info || '') : sustainDraft) : undefined;
  const sustainAutosaveStatus = useAutosave(sustainValue, (v) => updateMaterial(id, { sustainability_info: v }));

  const [costForm, setCostForm] = useState({ unitCost: '', note: '' });
  const [costSaving, setCostSaving] = useState(false);
  const [linkVendorId, setLinkVendorId] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadingUsage(true);
    async function loadUsage() {
      // Was an unfiltered, unlimited scan of every tech pack this user can
      // see (no brand scoping in the query at all, relying purely on RLS,
      // no cap) on every material detail page load — the confirmed N+1
      // from the QoL audit. Name-matching inside a jsonb BOM array can't be
      // pushed fully into a WHERE clause without a proper reverse-lookup
      // table (real future work), but capping it is a real, honest interim
      // fix — no brand realistically has thousands of tech packs.
      const { data: tpData } = await supabase.from('tech_packs').select('product_id, bom, products(name, stage, category)').limit(500);
      const target = materials.find(m => m.id === id);
      if (tpData && target) {
        setUsedInProducts(tpData.filter(tp => Array.isArray(tp.bom) && tp.bom.some(b => b.material && b.material.toLowerCase().includes(target.name.toLowerCase()))));
      }
      setLoadingUsage(false);
    }
    loadUsage();
    loadCostLog(id);
    loadVendorLinks(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!material) {
    return <div className="content"><EmptyState icon="ph-magnifying-glass" title="Material not found" sub="This material isn't in the library yet." /></div>;
  }

  const saveField = async (field, value) => {
    try { await updateMaterial(material.id, { [field]: value }); } catch (err) { toast.error('Could not save: ' + err.message); }
  };

  const submitCostLog = async e => {
    e.preventDefault();
    if (!costForm.unitCost) return;
    setCostSaving(true);
    try {
      await addCostLogEntry(material.id, costForm);
      setCostForm({ unitCost: '', note: '' });
      toast.success('Price logged.');
    } catch (err) {
      toast.error('Could not log that price: ' + err.message);
    } finally {
      setCostSaving(false);
    }
  };

  const handleLinkVendor = async e => {
    e.preventDefault();
    if (!linkVendorId) return;
    setLinking(true);
    try {
      await linkVendor(material.id, linkVendorId);
      setLinkVendorId('');
      toast.success('Vendor linked.');
    } catch (err) {
      toast.error('Could not link that vendor: ' + err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <Breadcrumbs items={[{ label: 'Home', path: '/' }, { label: 'Materials', path: '/materials' }, { label: material.name }]} />
            <div className="page-eyebrow" style={{ color: 'var(--c-materials)' }}>Material Intelligence</div>
            <h1 className="page-title">{material.name}</h1>
          </div>
          <div className="page-sub">{material.category} · {material.type || 'fabric'}</div>
        </div>
        <div className="topbar-right">
          <span className={trustTagClass(material.risk_level)}>
            {material.risk_level === 'green' ? 'Low risk' : material.risk_level === 'red' ? 'High risk' : 'Watch'}
          </span>
          <button
            className="canvas-icon-btn"
            title={isPinned('material', material.id) ? 'Unpin' : 'Pin to Home'}
            onClick={() => togglePin('material', material.id)}
            style={{ color: isPinned('material', material.id) ? 'var(--c-materials)' : 'var(--ink-3)' }}
          >
            <i className={isPinned('material', material.id) ? 'ph-fill ph-push-pin' : 'ph ph-push-pin'} />
          </button>
          <button className="canvas-icon-btn" onClick={() => setConfirmingDelete(true)} title="Delete material" style={{ color: 'var(--red)' }}>
            <i className="ph ph-trash" />
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        itemLabel="material"
        itemName={material.name}
        warning={usedInProducts.length > 0
          ? `It's referenced in ${usedInProducts.length} tech pack${usedInProducts.length > 1 ? 's' : ''} by name — those BOM lines will stop matching it, but won't be deleted.`
          : undefined}
        onConfirm={async () => { await deleteMaterial(id); navigate('/materials'); }}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-materials)" />

      <div className="content">
        <PhotoPanel variant="weave" tone={TONE_BY_RISK[material.risk_level] || 'gold'} aspect="21 / 5" label={material.name} icon="ph-flask" style={{ marginBottom: 20 }} />

        {tab === 'overview' && (
          <>
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Production Warning</span></div>
                <div className="card-body">
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink)' }}>{material.warning || 'None on file.'}</p>
                </div>
              </div>
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Handling Notes</span></div>
                <div className="card-body">
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>{material.handling_notes || 'No specific handling notes on file.'}</p>
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div className="card-raised">
                <div className="card-header">
                  <span className="card-title">Sustainability</span>
                  <AutosaveIndicator status={sustainAutosaveStatus} />
                </div>
                <div className="card-body">
                  <textarea
                    className="form-textarea" style={{ minHeight: 60, marginBottom: 12 }}
                    placeholder="e.g. GOTS certified organic cotton, low-impact dyes"
                    value={sustainDraft === null ? (material.sustainability_info || '') : sustainDraft}
                    onChange={e => setSustainDraft(e.target.value)}
                  />
                  <input
                    className="form-input" placeholder="Certifications, comma-separated (e.g. GOTS, OEKO-TEX)"
                    value={certDraft === null ? (material.certifications || []).join(', ') : certDraft}
                    onChange={e => setCertDraft(e.target.value)}
                    onBlur={() => certDraft !== null && saveField('certifications', certDraft.split(',').map(s => s.trim()).filter(Boolean))}
                  />
                  {(material.certifications || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {material.certifications.map(c => <span key={c} className="tag tag-green">{c}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="card-raised">
                <div className="card-header"><span className="card-title">Availability</span></div>
                <div className="card-body">
                  <select className="form-select" value={material.availability || 'Unknown'} onChange={e => saveField('availability', e.target.value)} style={{ marginBottom: 14 }}>
                    {AVAILABILITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <div className="form-label" style={{ marginBottom: 6 }}>Similar materials</div>
                  {similarMaterials.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>No other materials in this category yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {similarMaterials.map(m => (
                        <span key={m.id} className="tag tag-neutral" style={{ cursor: 'pointer' }} onClick={() => navigate(`/materials/${m.id}`)}>{m.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'cost' && (
          <>
            <div className="section-label">Cost history</div>
            <div className="card-raised" style={{ marginBottom: 24, padding: 18 }}>
              {pricePoints.length >= 2 ? (
                <PriceHistoryChart points={pricePoints} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', marginBottom: pricePoints.length ? 12 : 0 }}>
                  {pricePoints.length === 0 ? 'No prices logged yet.' : 'Log one more price to see a trend line.'}
                </div>
              )}
              {pricePoints.length === 1 && <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>${pricePoints[0].amount.toFixed(2)}</div>}
              <form onSubmit={submitCostLog} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
                  <label className="form-label">Unit cost ($)</label>
                  <input className="form-input" type="number" step="0.01" value={costForm.unitCost} onChange={e => setCostForm(f => ({ ...f, unitCost: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                  <label className="form-label">Note</label>
                  <input className="form-input" placeholder="e.g. Quoted by Norte Textile Co." value={costForm.note} onChange={e => setCostForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <button className="btn btn-sm btn-primary" type="submit" disabled={costSaving || !costForm.unitCost}>Log price</button>
              </form>
            </div>

            <div className="section-label">Suppliers</div>
            {vendorLinks.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                {vendorLinks.map(link => (
                  <div className="list-row" key={link.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/vendors/${link.vendor_id}`)}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{link.vendors?.name || 'Unknown vendor'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{link.vendors?.location || '—'} {link.vendors?.price_range ? `· ${link.vendors.price_range}` : ''}</div>
                    </div>
                    <button className="btn btn-sm" onClick={e => { e.stopPropagation(); unlinkVendor(link.id, material.id); }}>Unlink</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleLinkVendor} style={{ display: 'flex', gap: 8 }}>
              <select className="form-select" style={{ flex: 1 }} value={linkVendorId} onChange={e => setLinkVendorId(e.target.value)}>
                <option value="">Choose a vendor to link…</option>
                {vendors.filter(v => !vendorLinks.some(l => l.vendor_id === v.id)).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" type="submit" disabled={linking || !linkVendorId}>Link</button>
            </form>
          </>
        )}

        {tab === 'usage' && (
          loadingUsage ? (
            <div style={{ textAlign: 'center', padding: 30 }}><i className="ph ph-circle-notch ph-spin" /></div>
          ) : usedInProducts.length === 0 ? (
            <div className="card-raised" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
              <i className="ph ph-flask" style={{ fontSize: 24, marginBottom: 10, display: 'block' }} />
              This material is not currently used in any active Tech Packs.
            </div>
          ) : (
            <div className="card">
              {usedInProducts.map(tp => (
                <div className="list-row" key={tp.product_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tech-packs/${tp.product_id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ph ph-tag" style={{ color: 'var(--c-materials)', fontSize: 16 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tp.products?.name || 'Unknown Product'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, textTransform: 'capitalize' }}>
                        {tp.products?.category} · {tp.products?.stage}
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-sm">View Tech Pack <i className="ph ph-arrow-right" /></button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}
