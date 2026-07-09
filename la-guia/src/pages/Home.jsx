import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { STAGES, notifications } from '../data/mockData.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { riskTagClass, readinessColor, currency, stageLink, swatchGradient, tiltForId, SECTION_COLOR } from '../lib/format.js';
import { PinnedPhoto, PhotoPanel, WaxSeal, DriedFlower, Thumbtack } from '../components/decor.jsx';

const QUICK_ACTIONS = [
  { label: 'New Product', desc: 'Start from a sketch or upload', icon: 'ph-plus-circle', color: 'var(--c-design)', path: '/design' },
  { label: 'Import Vendor', desc: 'Paste a link or notes', icon: 'ph-download-simple', color: 'var(--c-vendors)', path: '/vendors' },
  { label: 'Request Quote', desc: 'Ask a vendor to bid', icon: 'ph-file-text', color: 'var(--c-vendors)', path: '/quotes' },
  { label: 'Review Readiness', desc: 'Check stage-gate status', icon: 'ph-check-circle', color: 'var(--c-finalcheck)', path: '/readiness' },
];

const NOTIFICATION_DOT = { success: 'var(--green)', info: 'var(--blue)', warning: 'var(--amber)' };

function stageColor(stageKey) {
  const s = STAGES.find(st => st.key === stageKey);
  return s.key === 'launched' ? 'var(--green)' : SECTION_COLOR[s.section];
}

const MENU_WIDTH = 208;
const MENU_HEIGHT_ESTIMATE = 260;

// Portaled to <body> with position:fixed — piece cards sit inside elements that
// have a CSS transform (for the hand-tilt), and a transform creates a new
// stacking context, which traps a nested z-index and lets later sections paint
// over it. Escaping to a body-level portal sidesteps that entirely.
function MoveMenu({ productId, current, anchorRect, onMove, onClose }) {
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUpward = spaceBelow < MENU_HEIGHT_ESTIMATE && anchorRect.top > MENU_HEIGHT_ESTIMATE;
  const top = openUpward ? anchorRect.top - 8 : anchorRect.bottom + 8;
  const left = Math.min(Math.max(anchorRect.right - MENU_WIDTH, 8), window.innerWidth - MENU_WIDTH - 8);

  return createPortal(
    <>
      <div className="move-menu-backdrop" onClick={onClose} />
      <div
        className="move-menu"
        style={{ top, left, transform: openUpward ? 'translateY(-100%)' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="move-menu-label">Move to…</div>
        {STAGES.filter(s => s.key !== current).map(s => (
          <div key={s.key} className="move-menu-item" onClick={() => { onMove(productId, s.key); onClose(); }}>
            <span className="move-menu-dot" style={{ '--mm-color': stageColor(s.key) }} />
            {s.label}
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

function PieceCard({ p, dragging, onDragStart, onDragEnd }) {
  const navigate = useNavigate();
  const { moveProduct } = useProducts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const suppressClick = useRef(false);
  const color = stageColor(p.stage);

  const toggleMenu = e => {
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setMenuOpen(true);
  };

  return (
    <motion.div
      layoutId={p.id}
      layout
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`piece-card ${dragging === p.id ? 'dragging' : ''}`}
      style={{ '--tilt': `${tiltForId(p.id)}deg` }}
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(p.id); }}
      onDragEnd={() => { onDragEnd(); suppressClick.current = true; setTimeout(() => (suppressClick.current = false), 50); }}
      onClick={() => { if (!suppressClick.current && !menuOpen) navigate(stageLink(p.stage, p.id)); }}
    >
      <div className="washi" style={{ '--washi-color': color }} />
      <button className="piece-move-btn" onClick={toggleMenu} title="Move to another stage">
        <i className="ph ph-arrows-out-cardinal" />
      </button>
      {menuOpen && anchorRect && (
        <MoveMenu productId={p.id} current={p.stage} anchorRect={anchorRect} onMove={moveProduct} onClose={() => setMenuOpen(false)} />
      )}
      <div className="piece-card-top">
        <div className="swatch" style={{ background: swatchGradient(p.id) }} />
        <div style={{ minWidth: 0 }}>
          <div className="piece-card-name">{p.name}</div>
          <div className="piece-card-meta">{p.category}</div>
        </div>
      </div>
      <div className="readiness" style={{ marginBottom: 10 }}>
        <div className="readiness-track">
          <div className="readiness-fill" style={{ width: `${p.readiness}%`, background: readinessColor(p.readiness) }} />
          <div className="readiness-gate" style={{ left: '80%' }} />
        </div>
        <span className="readiness-value">{p.readiness}%</span>
      </div>
      <span className={riskTagClass(p.risk)}>{p.risk}</span>
    </motion.div>
  );
}

const SWATCH_TONES = ['gold', 'sage', 'clay', 'ink'];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products, collections, moveProduct } = useProducts();
  const { orders: productionOrders } = useProduction();
  const [draggingId, setDraggingId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.email
    ? user.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Founder';

  const inProduction = products.filter(p => !['concept', 'launched'].includes(p.stage)).length;
  const avgReadiness = products.length ? Math.round(products.reduce((s, p) => s + p.readiness, 0) / products.length) : 0;
  const totalBudget = products.reduce((s, p) => s + p.budget, 0);
  const gateFlags = products.filter(p => p.readiness < 80 && p.stage === 'sourcing').length;

  // The most active in-motion piece — featured in the hero, mirroring a "spotlight"
  // product panel. Falls back to the first product if everything is still concept-stage.
  const featured = products.find(p => !['concept', 'launched'].includes(p.stage)) || products[0];
  const featuredStageIdx = featured ? STAGES.findIndex(s => s.key === featured.stage) : -1;
  const nextStage = featuredStageIdx >= 0 && featuredStageIdx < STAGES.length - 1 ? STAGES[featuredStageIdx + 1] : null;

  const scrollTo = key => document.getElementById(`stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleDrop = (e, stageKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveProduct(id, stageKey);
    setDraggingId(null);
    setOverStage(null);
  };

  const previewCollections = collections.slice(0, 2).map(c => {
    const members = products.filter(p => p.collection_id === c.id);
    const inMotion = members.some(p => ['sampling', 'production'].includes(p.stage));
    const inDev = members.some(p => ['techpack', 'sourcing'].includes(p.stage));
    return { ...c, memberCount: members.length, status: inMotion ? 'In production' : inDev ? 'In development' : 'Concept' };
  });

  const ordersByStage = productionOrders.reduce((acc, o) => { acc[o.stage] = (acc[o.stage] || 0) + 1; return acc; }, {});
  const upcomingOrders = productionOrders
    .filter(o => o.due_date && o.stage !== 'Delivered')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3);

  return (
    <>
      <div className="topbar" style={{ border: 'none', background: 'transparent', backdropFilter: 'none' }}>
        <div className="topbar-left" style={{ flex: 0 }} />
        <div className="topbar-right">
          <button className="canvas-icon-btn" style={{ width: 36, height: 36, borderRadius: '50%', cursor: 'not-allowed', opacity: 0.55 }} title="Search — not wired up yet">
            <i className="ph ph-magnifying-glass" />
          </button>
          <button className="bell-btn" style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--ink-2)' }} onClick={() => navigate('/notifications')} title="Notifications">
            <i className="ph ph-bell" style={{ fontSize: 14 }} />
            {notifications.some(n => !n.read) && <span className="bell-dot" style={{ background: 'var(--accent)', borderColor: 'var(--bg)' }} />}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/design')}>
            <i className="ph ph-plus" /> New Product
          </button>
        </div>
      </div>

      <div className="content" style={{ paddingTop: 4 }}>
        <div className="enter" style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 32, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 6 }}>Here's what's happening in your atelier.</div>
        </div>

        {/* ── Hero spotlight — pinned photographs on a paper background, not
             flush bordered tiles ────────────────────────────────────────── */}
        {featured && (
          <div className="card-raised enter" style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: '0.85fr 1.3fr 1fr', gap: 26, padding: '26px 28px', overflow: 'visible', position: 'relative', alignItems: 'center' }}>
            <PinnedPhoto
              variant="weave" tone={SWATCH_TONES[products.indexOf(featured) % SWATCH_TONES.length]}
              aspect="3 / 4" tilt={-2.5} pinColor="var(--c-materials)"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span className="tag tag-accent">{featured.stage === 'launched' ? 'Launched' : 'In production'}</span>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, color: 'var(--ink)', marginTop: 10, lineHeight: 1.2 }}>{featured.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{featured.category}{featured.collectionId ? ` · ${collections.find(c => c.id === featured.collectionId)?.name || ''}` : ''}</div>
              </div>
              <div>
                <div className="stat-label" style={{ marginBottom: 8 }}>Product progress</div>
                <div className="readiness">
                  <div className="readiness-track">
                    <div className="readiness-fill" style={{ width: `${featured.readiness}%`, background: readinessColor(featured.readiness) }} />
                    <div className="readiness-gate" style={{ left: '80%' }} />
                  </div>
                  <span className="readiness-value">{featured.readiness}%</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8 }}>Stage: {STAGES.find(s => s.key === featured.stage)?.label}</div>
              </div>
              {nextStage && (
                <div>
                  <div className="stat-label" style={{ marginBottom: 5 }}>Next step</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Move to {nextStage.label}</div>
                </div>
              )}
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(stageLink(featured.stage, featured.id))}>
                View Product <i className="ph ph-arrow-right" />
              </button>
            </div>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
              <PinnedPhoto variant="sketch" tone="ink" aspect="16 / 11" label="Working sketch" icon="ph-pencil-simple-line" tilt={1.5} pinColor="var(--c-design)" wrapperStyle={{ width: '92%' }} />
              <div style={{ display: 'flex', gap: 14 }}>
                <PinnedPhoto variant="weave" tone={SWATCH_TONES[(products.indexOf(featured) + 1) % SWATCH_TONES.length]} aspect="1 / 1" tilt={-3} pinColor="var(--c-vendors)" wrapperStyle={{ width: 82 }} />
                <PinnedPhoto variant="fabric" tone={SWATCH_TONES[(products.indexOf(featured) + 2) % SWATCH_TONES.length]} aspect="1 / 1" tilt={2.5} pinColor="var(--sage)" wrapperStyle={{ width: 82 }} />
              </div>
              <div style={{ position: 'absolute', bottom: -8, right: 4 }}>
                <WaxSeal initials="AS" size={48} />
              </div>
            </div>
          </div>
        )}

        <div className="stats-row enter enter-1">
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-home)' }}>
            <div className="stat-label">Active products</div>
            <div className="stat-value">{products.length}</div>
            <div className="stat-delta delta-muted">{inProduction} in production</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-techpack)' }}>
            <div className="stat-label">Avg. factory readiness</div>
            <div className="stat-value">{avgReadiness}%</div>
            <div className="stat-delta delta-muted">gate clears at 80%</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-materials)' }}>
            <div className="stat-label">Committed budget</div>
            <div className="stat-value">{currency(totalBudget)}</div>
            <div className="stat-delta delta-muted">across all workspaces</div>
          </div>
          <div className="stat-card" style={{ '--stat-accent': 'var(--c-finalcheck)' }}>
            <div className="stat-label">Stage-gate flags</div>
            <div className="stat-value" style={{ color: gateFlags > 0 ? 'var(--amber)' : 'var(--ink)' }}>{gateFlags}</div>
            <div className="stat-delta delta-muted">below readiness threshold</div>
          </div>
        </div>

        {/* ── Collections / Quick actions / Notes ────────────────────────── */}
        <div className="enter enter-2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.9fr', gap: 18, marginBottom: 30, alignItems: 'stretch' }}>
          <div className="card-raised" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>Collections</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer' }} onClick={() => navigate('/collections')}>View all →</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {previewCollections.map((c, ci) => (
                <div key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/collections/${c.id}`)}>
                  <PhotoPanel variant="weave" tone={SWATCH_TONES[ci % SWATCH_TONES.length]} aspect="3 / 4" />
                  <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{c.status} · {c.memberCount} products</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-raised" style={{ padding: 20 }}>
            <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 14 }}>Quick actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {QUICK_ACTIONS.map(a => (
                <div key={a.label} className="card-hover" style={{ padding: '12px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(a.path)}>
                  <i className={`ph ${a.icon}`} style={{ fontSize: 17, color: a.color }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{a.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.3 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-raised" style={{ padding: '20px 22px', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 16, right: 18 }}>
              <DriedFlower size={30} />
            </div>
            <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 10 }}>Notes from the atelier</div>
            <p style={{ fontFamily: 'var(--hand)', fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.4, maxWidth: 170 }}>
              "Discipline in process creates freedom in design."
            </p>
          </div>
        </div>

        {/* ── Production flow / status ────────────────────────────────────── */}
        <div className="enter enter-3" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 30, alignItems: 'stretch' }}>
          <div className="card-raised" style={{ padding: 22 }}>
            <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 4 }}>Production flow</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 14 }}>Drag a piece below, or drop it on a stage here</div>
            <div className="flow-map" style={{ marginBottom: 8 }}>
              {STAGES.map((stage, i) => {
                const color = stageColor(stage.key);
                const count = products.filter(p => p.stage === stage.key).length;
                const prevColor = i > 0 ? stageColor(STAGES[i - 1].key) : color;
                return (
                  <React.Fragment key={stage.key}>
                    {i > 0 && <div className="flow-map-line" style={{ '--fm-line': prevColor }} />}
                    <div
                      className="flow-map-node"
                      onClick={() => scrollTo(stage.key)}
                      onDragOver={e => { e.preventDefault(); setOverStage(stage.key); }}
                      onDrop={e => handleDrop(e, stage.key)}
                    >
                      <div className="flow-map-dot" style={{ '--fm-color': color, outline: overStage === stage.key ? `2px solid ${color}` : 'none', outlineOffset: 2 }}>{count}</div>
                      <div className="flow-map-label">{stage.label}</div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            <button className="btn btn-sm" onClick={() => scrollTo('concept')}>View production plan <i className="ph ph-arrow-right" /></button>
          </div>

          <div className="card-raised" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
            <div className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, marginBottom: 14 }}>Production orders</div>
            <div className="stat-strip" style={{ marginBottom: 16 }}>
              <div className="stat-strip-seg">
                <div className="stat-strip-value">{ordersByStage['Sampling'] || 0}</div>
                <div className="stat-strip-label">Sampling</div>
              </div>
              <div className="stat-strip-seg">
                <div className="stat-strip-value">{ordersByStage['In production'] || 0}</div>
                <div className="stat-strip-label">In production</div>
              </div>
              <div className="stat-strip-seg">
                <div className="stat-strip-value">{ordersByStage['Delivered'] || 0}</div>
                <div className="stat-strip-label">Delivered</div>
              </div>
            </div>
            <PhotoPanel variant="fabric" tone="clay" aspect="16 / 7" style={{ marginBottom: 12 }} />
            <span style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer' }} onClick={() => navigate('/production')}>Go to production →</span>
          </div>
        </div>

        {/* ── Recent activity / Upcoming / flat-lay ──────────────────────── */}
        <div className="enter enter-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 34, alignItems: 'stretch' }}>
          <div className="card-raised" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>Recent activity</span>
            </div>
            {notifications.slice(0, 4).map(n => (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: NOTIFICATION_DOT[n.type] || 'var(--ink-4)', marginTop: 5, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{n.time}</div>
                </div>
              </div>
            ))}
            <span style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', display: 'inline-block', marginTop: 6 }} onClick={() => navigate('/notifications')}>View all activity →</span>
          </div>

          <div className="card-raised" style={{ padding: 20 }}>
            <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, display: 'block', marginBottom: 6 }}>Upcoming production dates</span>
            {upcomingOrders.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', padding: '14px 0' }}>Nothing scheduled yet.</div>
            ) : upcomingOrders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{o.products?.name || 'Product'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{o.due_date}</div>
              </div>
            ))}
            <span style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', display: 'inline-block', marginTop: 6 }} onClick={() => navigate('/production')}>View production →</span>
          </div>

          <PinnedPhoto variant="fabric" tone="ink" tilt={-1.5} pinColor="var(--accent)" aspect="4 / 3" style={{ height: '100%' }} />
        </div>

        <div className="section-label enter enter-5">All products — drag a piece, or drop it on a stage above</div>

        <LayoutGroup>
          {STAGES.map((stage, si) => {
            const stageProducts = products.filter(p => p.stage === stage.key);
            const color = stageColor(stage.key);
            const isOver = overStage === stage.key;
            return (
              <div className={`stage-section enter enter-${Math.min(si + 4, 6)}`} id={`stage-${stage.key}`} key={stage.key}>
                <div className="stage-section-header">
                  <span className="stage-section-title">{stage.label}</span>
                  <span className="stage-section-count">{stageProducts.length} {stageProducts.length === 1 ? 'piece' : 'pieces'}</span>
                  <span className="stage-section-line" />
                </div>
                <div
                  className={`stage-rail ${isOver ? 'drop-active' : ''}`}
                  style={{ '--rail-color': isOver ? color : undefined, '--rail-tint': `color-mix(in srgb, ${color} 8%, transparent)` }}
                  onDragOver={e => { e.preventDefault(); setOverStage(stage.key); }}
                  onDragLeave={() => setOverStage(prev => (prev === stage.key ? null : prev))}
                  onDrop={e => handleDrop(e, stage.key)}
                >
                  {stageProducts.length === 0 && <div className="stage-rail-empty">Drop a piece here</div>}
                  {stageProducts.map(p => (
                    <PieceCard
                      key={p.id}
                      p={p}
                      dragging={draggingId}
                      onDragStart={setDraggingId}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </LayoutGroup>
      </div>
    </>
  );
}
