import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { WaxSeal, Thumbtack, DriedFlower } from '../../components/decor.jsx';
import { STAGES } from '../../data/mockData.js';
import { PLANS } from '../../data/plans.js';

// Each feature now carries a short spec-tag (how you'd label a swatch card
// or a line on a tech pack) instead of a generic icon-in-a-box.
const FEATURES = [
  { tag: 'DESIGN', color: 'var(--c-design)', title: 'AI Design Studio', text: 'Sketch, upload a reference photo, or generate a starting silhouette — then edit it right on the canvas with sketch-to-design, recoloring, fabric swaps, and mockup generation.' },
  { tag: 'SPEC SHEET', color: 'var(--c-techpack)', title: 'Tech Pack Builder', text: 'AI drafts a full tech pack from your design and a short questionnaire — BOM, measurements, construction, print placement, trims, labels, packaging — with a live factory-readiness score.' },
  { tag: 'CATALOG', color: 'var(--c-organization)', title: 'Product Management', text: 'Real categories, colorway × size SKU matrices with generated SKUs, duplicate and archive flows, and an audit trail of every stage a product has moved through.' },
  { tag: 'SOURCING', color: 'var(--c-vendors)', title: 'Vendor Platform', text: 'Search real manufacturers by material, MOQ, target price, location, and certifications. Compare up to five side by side and track every quote from request to accepted.' },
  { tag: 'PRODUCTION', color: 'var(--c-materials)', title: 'Production Tracking', text: 'A Kanban flow from concept to launch, production orders with real checkpoints, and a factory-readiness gate that keeps under-ready products from shipping by accident.' },
  { tag: 'STUDIO CHAT', color: 'var(--c-home)', title: 'Team Chat & AI Assistant', text: 'A personal assistant grounded in your own brand data, plus real group chats with your team — one button, available on every page.' },
  { tag: 'ANALYTICS', color: 'var(--c-analytics)', title: 'Sales & Analytics', text: 'Connect Shopify to see real orders next to real production costs — break-even math and product performance, not a mocked-up dashboard.' },
  { tag: 'ACCESS', color: 'var(--c-finalcheck)', title: 'Team & Permissions', text: "Invite your team by email, assign roles, and keep every brand workspace scoped so nobody sees data they shouldn't." },
];

const fadeUp = { hidden: { opacity: 0, y: 26 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 0.9, 0.35, 1] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

function Logomark({ size = 26 }) {
  return (
    <svg width={size} height={size * (18 / 26)} viewBox="0 0 24 16" fill="none">
      <path d="M1 8h9m4 0h9M14 8l-4-4m0 8 4-4M10 8l4-4m-4 4 4 4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Section({ children, dark, style, ...props }) {
  return (
    <section
      style={{
        padding: '90px 24px',
        background: dark ? 'var(--charcoal)' : 'transparent',
        color: dark ? 'var(--cream)' : 'inherit',
        position: 'relative',
        ...style,
      }}
      {...props}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

// A single row in the feature list — a swatch chip (with a punched ring hole,
// the way an actual fabric-swatch card is bound) sitting on a running thread.
function SwatchRow({ f, isLast }) {
  return (
    <motion.div
      variants={fadeUp}
      className="gl-swatch-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr',
        gap: 20,
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {!isLast && (
          <div
            aria-hidden
            style={{
              position: 'absolute', top: 44, bottom: -26, left: '50%', width: 0,
              borderLeft: '1.5px dashed var(--border-2)', transform: 'translateX(-50%)',
            }}
          />
        )}
        <div
          className="gl-swatch"
          style={{
            width: 40, height: 40, borderRadius: 7,
            background: f.color,
            position: 'relative',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
            transition: 'transform 0.25s ease',
          }}
        >
          <div style={{
            position: 'absolute', top: 5, left: 5, width: 6, height: 6, borderRadius: '50%',
            background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
          }} />
        </div>
      </div>
      <div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.12em', fontWeight: 700,
          color: f.color, marginBottom: 6, textTransform: 'uppercase',
        }}>
          {f.tag}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 7 }}>{f.title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65, maxWidth: 560 }}>{f.text}</div>
      </div>
    </motion.div>
  );
}

// Loose pencil-flat sketches of garments — the kind of quick front-view
// drawing that kicks off a real tech pack. Each outline is drawn twice,
// offset by a pixel, so it reads as hand-sketched rather than vector-clean.
function JacketSketch() {
  return (
    <svg viewBox="0 0 100 108" width="106" height="114" fill="none">
      <path d="M50 7 L38 17 L30 13 L14 24 L20 43 L28 39 L28 99 L72 99 L72 39 L80 43 L86 24 L70 13 L62 17 Z" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.4" transform="translate(1,1)" />
      <path d="M50 7 L38 17 L30 13 L14 24 L20 43 L28 39 L28 99 L72 99 L72 39 L80 43 L86 24 L70 13 L62 17 Z" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M50 7 L50 21" stroke="var(--ink-2)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M42 29 L42 96 M58 29 L58 96" stroke="var(--ink-3)" strokeWidth="0.8" strokeDasharray="2 3" />
      <path d="M27 58 L36 58 M64 58 L73 58" stroke="var(--ink-3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
function ShirtSketch() {
  return (
    <svg viewBox="0 0 100 108" width="106" height="114" fill="none">
      <path d="M50 9 L36 3 L14 19 L22 33 L30 27 L30 99 L70 99 L70 27 L78 33 L86 19 L64 3 Z" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.4" transform="translate(1,1)" />
      <path d="M50 9 L36 3 L14 19 L22 33 L30 27 L30 99 L70 99 L70 27 L78 33 L86 19 L64 3 Z" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M41 9 L50 21 L59 9" stroke="var(--ink-2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 23 L50 97" stroke="var(--ink-3)" strokeWidth="0.8" strokeDasharray="1.5 4" />
      <circle cx="50" cy="40" r="1.1" fill="var(--ink-3)" /><circle cx="50" cy="56" r="1.1" fill="var(--ink-3)" /><circle cx="50" cy="72" r="1.1" fill="var(--ink-3)" />
    </svg>
  );
}
function PantsSketch() {
  return (
    <svg viewBox="0 0 100 108" width="106" height="114" fill="none">
      <path d="M27 5 L73 5 L77 39 L92 99 L74 99 L58 49 L54 99 L36 99 L32 49 L26 99 L8 99 L23 39 Z" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.4" transform="translate(1,1)" />
      <path d="M27 5 L73 5 L77 39 L92 99 L74 99 L58 49 L54 99 L36 99 L32 49 L26 99 L8 99 L23 39 Z" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M27 5 L27 16 M73 5 L73 16" stroke="var(--ink-3)" strokeWidth="1" strokeLinecap="round" />
      <path d="M19 45 L29 45" stroke="var(--ink-3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// A single pinned sketch card for the hero board. Lifts, straightens, and
// throws a deeper shadow on hover — like picking the card up off the board.
function SketchNote({ sketch, label, style }) {
  return (
    <motion.div
      variants={{
        hidden: { top: 76, left: 108, rotate: 0, scale: 0.88, opacity: 0 },
        visible: { ...style, scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 110, damping: 15 } },
      }}
      whileHover={{
        y: -16, scale: 1.05, rotate: style.rotate * 0.35, zIndex: 30,
        boxShadow: '0 26px 46px -18px rgba(0,0,0,0.45)',
        transition: { type: 'spring', stiffness: 260, damping: 16 },
      }}
      style={{
        position: 'absolute', width: 190, cursor: 'default', background: 'var(--bg-1)',
        border: '1px solid var(--border-2)', borderRadius: 4,
        padding: '26px 18px 18px', boxShadow: '0 14px 30px -16px rgba(0,0,0,0.35)',
      }}
    >
      <motion.div
        whileHover={{ rotate: [0, -8, 8, 0] }}
        transition={{ duration: 0.5 }}
        style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}
      >
        <Thumbtack size={19} color="var(--c-materials)" />
      </motion.div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>{sketch}</div>
      <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--ink-4)', textAlign: 'center', textTransform: 'uppercase' }}>
        {label}
      </div>
    </motion.div>
  );
}

// The hero board: three flats start stacked as one deck, then peel apart
// and settle at a slight fan on load — a moodboard coming together.
function HeroBoard() {
  return (
    <motion.div
      initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15, delayChildren: 0.45 } } }}
      style={{ position: 'relative', width: 400, height: 360 }}
    >
      <SketchNote sketch={<ShirtSketch />} label="flat — oxford, front" style={{ top: 0, left: -12, rotate: -10 }} />
      <SketchNote sketch={<PantsSketch />} label="flat — wide leg, cropped" style={{ top: 2, left: 214, rotate: 9 }} />
      <SketchNote sketch={<JacketSketch />} label="flat — bomber, rev. 3" style={{ top: 58, left: 106, rotate: 3 }} />
    </motion.div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const left = FEATURES.slice(0, 4);
  const right = FEATURES.slice(4);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        .gl-swatch-row {
          padding: 26px 14px;
          margin: 0 -14px;
          border-radius: 10px;
          transition: background 0.22s ease;
        }
        .gl-swatch-row:hover { background: var(--bg-1); }
        .gl-swatch-row:hover .gl-swatch { transform: rotate(-4deg) scale(1.08); }
        .gl-flow-step { transition: transform 0.2s ease; cursor: default; }
        .gl-flow-step:hover { transform: translateY(-4px); }
        .gl-flow-step:hover .gl-flow-dot {
          background: var(--accent); color: var(--bg-1);
          transform: scale(1.1);
        }
        .gl-flow-dot { transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease; }
        .gl-footer-link { transition: color 0.15s ease; }
        .gl-footer-link:hover { color: var(--ink-1, var(--ink-2)); }
        .gl-nav-a { transition: color 0.15s ease; }
        .gl-nav-a:hover { color: var(--ink-1, var(--ink-2)); }
        @media (max-width: 640px) {
          .gl-nav-link { display: none; }
        }
      `}</style>

      {/* ─── Nav ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px', background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Logomark />
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500 }}>Atelier</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <a href="#features" className="gl-nav-link gl-nav-a" style={{ fontSize: 13, color: 'var(--ink-3)' }}>Features</a>
          <a href="#pricing" className="gl-nav-link gl-nav-a" style={{ fontSize: 13, color: 'var(--ink-3)' }}>Pricing</a>
          <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }} className="gl-nav-a" style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Log in</a>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn btn-primary" onClick={() => navigate('/signup')}>Get started</motion.button>
        </div>
      </div>

      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <Section style={{ paddingTop: 76, paddingBottom: 60 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.8fr)', gap: 40, alignItems: 'center' }}>
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.h1 variants={fadeUp} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(38px, 5.6vw, 64px)', fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.01em', marginBottom: 22 }}>
              From design to drop,<br />
              <span style={{ position: 'relative', display: 'inline-block' }}>
                without losing your mind.
                <svg
                  viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden
                  style={{ position: 'absolute', left: -4, right: -4, bottom: -6, width: 'calc(100% + 8px)', height: 16 }}
                >
                  <path d="M2 12 C 40 4, 80 16, 120 8 C 160 1, 200 15, 240 7 C 265 3, 285 9, 298 6"
                    stroke="var(--c-vendors)" strokeWidth="3" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </motion.h1>
            <motion.p variants={fadeUp} style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: 480, marginBottom: 30 }}>
              Atelier is the production operating system for founders building their own clothing line — one workspace to design, spec, source, and ship, instead of a scattered stack of spreadsheets, DMs, and freelance tech-pack files.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="btn btn-primary" style={{ padding: '13px 22px', fontSize: 14.5 }} onClick={() => navigate('/signup')}
              >
                Get started free <i className="ph ph-arrow-right" />
              </motion.button>
              <a href="#features" className="gl-nav-a" style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                See what it does <i className="ph ph-arrow-down" />
              </a>
            </motion.div>
            <motion.div variants={fadeUp} style={{ marginTop: 22, fontSize: 12, color: 'var(--ink-4)' }}>
              No credit card required — the Free plan runs one product forever.
            </motion.div>
          </motion.div>

          <div style={{ position: 'relative', justifySelf: 'center' }}>
            <HeroBoard />
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.1, duration: 0.5, ease: [0.16, 0.9, 0.35, 1] }}
              style={{ position: 'absolute', bottom: -6, right: -14 }}
            >
              <motion.div
                animate={{ y: [0, -8, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
                whileHover={{ scale: 1.12, rotate: -8, transition: { type: 'spring', stiffness: 300 } }}
              >
                <WaxSeal initials="GL" size={64} color="var(--c-vendors)" />
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.5, ease: [0.16, 0.9, 0.35, 1] }}
              style={{ position: 'absolute', top: -26, left: -22 }}
            >
              <motion.div animate={{ rotate: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.7 }}>
                <DriedFlower size={46} color="var(--sage)" />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </Section>

      {/* ─── Mission ─────────────────────────────────────────────────────── */}
      <Section dark>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={stagger} style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <motion.div variants={fadeUp} style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            <WaxSeal initials="GL" size={52} color="var(--accent)" />
          </motion.div>
          <motion.div variants={fadeUp} style={{ fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 18 }}>Our mission</motion.div>
          <motion.p variants={fadeUp} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.5, color: 'var(--cream)' }}>
            Starting a clothing brand shouldn't require a rolodex, a manufacturing degree, and a miracle. We're building the tools an independent founder actually needs to take a sketch seriously — turn it into a real, sourceable, sellable product — without pretending AI can make the creative or business calls for you.
          </motion.p>
          <motion.p variants={fadeUp} style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 22 }}>
            AI drafts, extracts, scores, and suggests. You always review and decide.
          </motion.p>
        </motion.div>
      </Section>

      {/* ─── Feature spec sheet ──────────────────────────────────────────── */}
      <Section id="features">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} style={{ marginBottom: 50 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>The workbench</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 500, maxWidth: 620 }}>
            Every stage of building a product, covered.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', columnGap: 56 }}
        >
          <div>
            {left.map((f, i) => <SwatchRow key={f.title} f={f} isLast={i === left.length - 1} />)}
          </div>
          <div>
            {right.map((f, i) => <SwatchRow key={f.title} f={f} isLast={i === right.length - 1} />)}
          </div>
        </motion.div>
      </Section>

      {/* ─── Flow ────────────────────────────────────────────────────────── */}
      <Section>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} style={{ textAlign: 'center', marginBottom: 46 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>How it flows</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 500 }}>
            One product, one path — start to sold.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0 }}
        >
          {STAGES.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && (
                <motion.div variants={fadeUp} style={{ width: 32, height: 2, background: 'var(--border-2)', marginTop: -20 }} />
              )}
              <motion.div variants={fadeUp} className="gl-flow-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 12px' }}>
                <div className="gl-flow-dot" style={{
                  width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-1)', border: '2px solid var(--accent)', color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13,
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{s.label}</div>
              </motion.div>
            </React.Fragment>
          ))}
        </motion.div>
      </Section>

      {/* ─── Pricing ─────────────────────────────────────────────────────── */}
      <Section id="pricing" dark>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} style={{ textAlign: 'center', marginBottom: 46 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 500, color: 'var(--cream)' }}>
            Start free. Grow into it.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}
        >
          {PLANS.map(p => (
            <motion.div
              key={p.id} variants={fadeUp}
              whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
              style={{
                background: p.id === 'basic' ? 'var(--accent)' : 'var(--charcoal-2)',
                border: `1px solid ${p.id === 'basic' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 'var(--r-lg)', padding: 26, position: 'relative',
                color: p.id === 'basic' ? 'var(--charcoal)' : 'var(--cream)',
                boxShadow: '0 0 0 rgba(0,0,0,0)',
              }}
            >
              {p.id === 'basic' && (
                <div style={{ position: 'absolute', top: -12, left: 26, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: 'var(--charcoal)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 99 }}>
                  Most popular
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 18 }}>{p.tagline}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700 }}>{p.price}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{p.priceSuffix}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {p.summary.map(s => (
                  <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5 }}>
                    <i className="ph ph-check" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <button
                className={p.id === 'basic' ? 'btn' : 'btn btn-primary'}
                style={{ width: '100%', justifyContent: 'center', ...(p.id === 'basic' ? { background: 'var(--charcoal)', color: 'var(--cream)', border: 'none' } : {}) }}
                onClick={() => navigate('/signup')}
              >
                {p.id === 'free' ? 'Start for free' : `Choose ${p.name}`}
              </button>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ─── Final CTA ───────────────────────────────────────────────────── */}
      <Section>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp}
          style={{
            textAlign: 'center', padding: '56px 20px',
            borderTop: '1px dashed var(--border-2)', borderBottom: '1px dashed var(--border-2)',
          }}
        >
          <motion.div
            whileHover={{ scale: 1.1, rotate: -6 }} transition={{ type: 'spring', stiffness: 300 }}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, cursor: 'default' }}
          >
            <WaxSeal initials="GL" size={44} color="var(--c-vendors)" />
          </motion.div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 500, marginBottom: 14 }}>
            Cut your first pattern this week.
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 26, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Set up your brand workspace and take one real product from sketch to spec — free, no card, one product forever on the Free plan.
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="btn btn-primary" style={{ padding: '13px 26px', fontSize: 14.5 }} onClick={() => navigate('/signup')}
          >
            Start your first product <i className="ph ph-arrow-right" />
          </motion.button>
        </motion.div>
      </Section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: '40px 24px', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Logomark size={20} />
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>Atelier</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>The production operating system for independent clothing brands.</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/terms'); }} className="gl-footer-link" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Terms</a>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/privacy'); }} className="gl-footer-link" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Privacy</a>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }} className="gl-footer-link" style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, marginLeft: 8 }}>Log in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}