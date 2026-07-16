import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, useScroll, useReducedMotion } from 'framer-motion';
import { STAGES } from '../../data/mockData.js';
import { PLANS } from '../../data/plans.js';

/* ───────────────────────────────────────────────────────────────────────────
   "The Cutting Table" — a real 3D scene built from actual CSS perspective and
   transforms (no WebGL, no new dependency), not a flat page with animations
   sprinkled on top.

   The subject is still a production tool, but its native artifact — the flat
   pattern — is reimagined as what it actually is right before a garment gets
   sewn: pieces lifted off the table and fanned out in space, each its own
   card with a grainline and cutting notches, tilting toward the cursor like
   you're leaning over the table yourself. A floating instrument reads the
   grain angle live off your pointer position — the brand's own namesake
   mark turned into the one genuinely interactive HUD element, not a
   decorative rainbow dial. Everything else on the page stays disciplined:
   the same technical drafting vocabulary (title blocks, dimension ticks,
   mono captions) as before, just lit for depth instead of flattened on
   cream paper.

   Revision note: v1 used a flat linear-gradient fill on the hero text and
   every CTA — the single most common "AI made this" tell, because it's the
   cheapest way to look colorful and reads as exactly that: cheap. v2 keeps
   the same thread-holographic palette (blue → violet → coral → gold) but
   never fills a shape with it flat. Text gets a real backlit glow
   (layered text-shadow, no gradient clip); buttons get a rotating
   conic-gradient ring behind a solid dark face (the "expensive SaaS
   button" trick — light chases the edge, the face stays solid); the page
   gets a genuine atmosphere layer (drifting blurred aurora blobs + SVG
   grain texture, both full-bleed and fixed, not just a hero-local glow);
   and pattern pieces get real per-surface lighting (a specular highlight,
   a gradient rim-light border, a colored ambient shadow, depth-cued blur
   on the pieces further from camera) instead of a flat glass panel.
   Directionality: a single diagonal grainline thread — the brand's own
   mark — runs the full height of the page as an SVG that draws itself in
   as you scroll, plus alternating left/right card entrances and skewed
   section edges, so the page reads as one continuous diagonal cut rather
   than a stack of centered rectangles.
─────────────────────────────────────────────────────────────────────────── */

const C = {
  ink: '#0A0C11',
  ink2: '#12151D',
  ink3: '#1A1E29',
  line: 'rgba(244,242,236,0.10)',
  lineBright: 'rgba(244,242,236,0.22)',
  paper: '#F4F2EC',
  paperDim: '#9CA1AE',
  paperFaint: '#5B6070',
  blue: '#6BA8DE',
  violet: '#A98CF5',
  coral: '#FF8A6B',
  gold: '#F0C56A',
};
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'Space Mono', ui-monospace, monospace";
const BODY = "'Inter', system-ui, sans-serif";
const SERIF = "'Newsreader', Georgia, serif";

const FEATURES = [
  { n: '01', title: 'AI Design Studio', text: 'Sketch, upload a reference, or generate a starting silhouette — then edit it on the canvas: recolor, swap fabric, build a mockup.' },
  { n: '02', title: 'Tech-Pack Builder', text: 'AI drafts the BOM, measurements, construction, trims, and labels from a short questionnaire — with a live factory-readiness score.' },
  { n: '03', title: 'Product Management', text: 'Real categories, colorway × size SKU matrices, duplicate and archive flows, and an audit trail of every stage a product has moved through.' },
  { n: '04', title: 'Vendor Platform', text: 'Search real manufacturers by material, MOQ, target price, location, and certifications. Compare up to five side by side.' },
  { n: '05', title: 'RFQ & Quote Economics', text: 'One request to many vendors. A cost breakdown, a landed-cost calculator, and a cost simulator that prices each change like a car configurator.' },
  { n: '06', title: 'Sampling', text: 'Rounds that keep their own history, photos you can pin notes onto at the exact spot, structured fit feedback, and an approval workflow.' },
  { n: '07', title: 'Production Tracking', text: 'A manufacturing timeline, an editable QC checklist, an issue log, shipment tracking, and an honest delivery estimate.' },
  { n: '08', title: 'Team & AI Assistant', text: 'Group chats with your team plus a personal assistant grounded in your own brand data — one button, on every page.' },
];

/* The grainline symbol — the mark a pattern-maker draws on every cut piece
   to align it with the fabric's grain. The brand's namesake, so it earns
   its place as the recurring device (and, in the hero, becomes a literal
   working instrument rather than a logo). */
function Grainline({ h = 34, color = C.blue, stroke = 2 }) {
  const w = h * 0.36;
  return (
    <svg width={w} height={h} viewBox="0 0 18 50" fill="none" style={{ display: 'block' }} aria-hidden>
      <path d="M9 6 V44 M3 12 L9 4 L15 12 M3 38 L9 46 L15 38" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CornerMarks({ color = C.lineBright }) {
  const L = ({ style }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', ...style }} aria-hidden>
      <path d="M1 1 H16 M1 1 V16" stroke={color} strokeWidth="1.25" />
    </svg>
  );
  return (
    <>
      <L style={{ top: 10, left: 10 }} />
      <L style={{ top: 10, right: 10, transform: 'scaleX(-1)' }} />
      <L style={{ bottom: 10, left: 10, transform: 'scaleY(-1)' }} />
      <L style={{ bottom: 10, right: 10, transform: 'scale(-1)' }} />
    </>
  );
}

/* ── Pattern pieces — simplified, stylized technical flats, one per garment
   piece, each carrying its own grainline arrow and cutting notches ──────── */
function PieceChrome({ label, children, accent }) {
  return (
    <>
      {children}
      <text x="50%" y="98%" textAnchor="middle" fontFamily={MONO} fontSize="8.5" letterSpacing="0.06em" fill={C.paperDim}>{label}</text>
    </>
  );
}

function FrontPiece() {
  return (
    <svg viewBox="0 0 160 200" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <path d="M50 10 Q80 22 110 10 L118 12 Q128 40 150 66 L134 78 Q122 54 112 46 L118 186 L42 186 L48 46 Q38 54 26 78 L10 66 Q32 40 42 12 Z"
        fill="rgba(107,168,222,0.07)" stroke={C.paper} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M70 92 L80 112 L90 92" fill="none" stroke={C.paperDim} strokeWidth="1" />
      <path d="M80 58 V150 M74 66 L80 56 L86 66 M74 142 L80 152 L86 142" stroke={C.blue} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 60 L54 66 M114 60 L106 66" stroke={C.paperDim} strokeWidth="1" />
      <PieceChrome label="FRONT · CUT 1" />
    </svg>
  );
}
function BackPiece() {
  return (
    <svg viewBox="0 0 150 190" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <path d="M45 8 Q75 4 105 8 L112 12 Q124 38 144 62 L128 74 Q118 50 108 44 L112 178 L38 178 L42 44 Q32 50 22 74 L6 62 Q26 38 38 12 Z"
        fill="rgba(169,140,245,0.07)" stroke={C.paper} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M75 14 L75 178" stroke={C.paperFaint} strokeWidth="1" strokeDasharray="2 5" />
      <path d="M52 58 V138 M46 66 L52 56 L58 66 M46 130 L52 140 L58 130" stroke={C.violet} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <PieceChrome label="BACK · CUT 1" />
    </svg>
  );
}
function SleevePiece() {
  return (
    <svg viewBox="0 0 140 170" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <path d="M70 4 Q120 20 128 60 L108 74 Q98 54 88 48 L96 156 L44 156 L52 48 Q42 54 32 74 L12 60 Q20 20 70 4 Z"
        fill="rgba(255,138,107,0.07)" stroke={C.paper} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M70 46 V132 M64 54 L70 44 L76 54 M64 124 L70 134 L76 124" stroke={C.coral} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 50 L62 56 M84 50 L78 56" stroke={C.paperDim} strokeWidth="1" />
      <PieceChrome label="SLEEVE · CUT 2" />
    </svg>
  );
}
function CollarPiece() {
  return (
    <svg viewBox="0 0 170 76" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <path d="M10 40 Q85 -6 160 40 L160 58 Q85 18 10 58 Z"
        fill="rgba(240,197,106,0.08)" stroke={C.paper} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M32 46 H138 M40 40 L30 46 L40 52 M130 40 L140 46 L130 52" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <PieceChrome label="COLLAR · CUT 1" />
    </svg>
  );
}

const PIECES = [
  { key: 'front', Comp: FrontPiece, top: '4%', left: '46%', z: 60, baseRotY: -12, baseRotZ: -4, w: 168, depth: 1.4, accent: C.blue, floatDur: 7.5, floatDelay: 0 },
  { key: 'back', Comp: BackPiece, top: '0%', left: '73%', z: 10, baseRotY: 9, baseRotZ: 3, w: 138, depth: 0.7, accent: C.violet, floatDur: 8.5, floatDelay: 1.2 },
  { key: 'sleeve', Comp: SleevePiece, top: '42%', left: '64%', z: 100, baseRotY: -16, baseRotZ: 6, w: 118, depth: 1.9, accent: C.coral, floatDur: 6.5, floatDelay: 0.6 },
  { key: 'collar', Comp: CollarPiece, top: '58%', left: '48%', z: 140, baseRotY: 13, baseRotZ: -7, w: 146, depth: 2.4, accent: C.gold, floatDur: 9, floatDelay: 2 },
];
const MAX_Z = Math.max(...PIECES.map(p => p.z));

function PatternCard({ piece, px, py, reduce }) {
  const { Comp, top, left, z, baseRotY, baseRotZ, w, depth, accent, floatDur, floatDelay } = piece;
  const x = useTransform(px, v => v * depth * 14);
  const y = useTransform(py, v => v * depth * 10);
  // Pieces further from camera (lower z) read as further back — a soft
  // depth-of-field blur sells that better than stacking order alone.
  const depthBlur = Math.max(0, (MAX_Z - z) / 34);
  return (
    <motion.div
      className="ds-piece"
      style={{
        position: 'absolute', top, left, width: w, x, y,
        transform: `translateZ(${z}px) rotateY(${baseRotY}deg) rotateZ(${baseRotZ}deg)`,
        transformStyle: 'preserve-3d',
        animation: reduce ? 'none' : `ds-piece-float ${floatDur}s ease-in-out ${floatDelay}s infinite`,
      }}
    >
      <div className="ds-piece-card" style={{ '--glow': accent, filter: depthBlur ? `blur(${depthBlur.toFixed(2)}px)` : 'none' }}>
        <Comp />
      </div>
    </motion.div>
  );
}

/* ── Grain compass — the one true HUD instrument. Reads a live grain angle
   straight off pointer position; nothing about the number is invented. ──── */
function GrainCompass({ angle, active }) {
  const rad = (angle * Math.PI) / 180;
  const nx = 42 + Math.sin(rad) * 30;
  const ny = 42 - Math.cos(rad) * 30;
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <div className="ds-compass">
      <div className="ds-compass-label">
        <span className="ds-compass-dot" style={{ background: active ? C.blue : C.paperFaint }} />
        MAIN GRAINLINE
      </div>
      <svg viewBox="0 0 84 84" width="120" height="120" aria-hidden>
        <circle cx="42" cy="42" r="40" fill="rgba(244,242,236,0.03)" stroke={C.line} strokeWidth="1" />
        <circle cx="42" cy="42" r="30" fill="none" stroke={C.line} strokeWidth="1" />
        {ticks.map(t => {
          const r = (t * Math.PI) / 180;
          const big = t % 90 === 0;
          const r1 = big ? 33 : 36.5;
          return (
            <line key={t} x1={42 + Math.sin(r) * r1} y1={42 - Math.cos(r) * r1} x2={42 + Math.sin(r) * 40} y2={42 - Math.cos(r) * 40}
              stroke={big ? C.paperDim : C.line} strokeWidth={big ? 1.2 : 0.8} />
          );
        })}
        <line x1="42" y1="42" x2={nx} y2={ny} stroke={C.blue} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx={nx} cy={ny} r="2.4" fill={C.blue} />
        <circle cx="42" cy="42" r="2.5" fill={C.paper} />
      </svg>
      <div className="ds-compass-read">GRAIN <b>{angle.toFixed(1)}°</b></div>
    </div>
  );
}

/* ── The 3D hero scene ─────────────────────────────────────────────────── */
function Hero3D({ navigate }) {
  const reduce = useReducedMotion();
  const heroRef = useRef(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const zero = useMotionValue(0);
  const springX = useSpring(px, { stiffness: 60, damping: 16, mass: 0.6 });
  const springY = useSpring(py, { stiffness: 60, damping: 16, mass: 0.6 });
  const pointerRotateY = useTransform(springX, v => v * 9);
  const pointerRotateX = useTransform(springY, v => v * -7);
  const headX = useTransform(springX, v => v * -6);
  const headY = useTransform(springY, v => v * -4);
  const [angle, setAngle] = useState(24);
  const [active, setActive] = useState(false);
  const raf = useRef(null);

  // Scroll doesn't just fade the hero out — it keeps driving the same 3D
  // scene, pitching the "camera" further back and scattering the pieces,
  // like stepping away from the table instead of a flat page cut.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const scrollRotateX = useTransform(scrollYProgress, [0, 1], [0, 16]);
  const rotateY = pointerRotateY;
  const rotateX = useTransform([pointerRotateX, scrollRotateX], ([a, b]) => a + b);
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.75, 1], [1, 1, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);

  const handleMove = (e) => {
    if (reduce) return;
    const rect = heroRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    px.set(nx);
    py.set(ny);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let deg = (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      setAngle(deg);
      setActive(true);
    });
  };
  const handleLeave = () => {
    px.set(0); py.set(0); setActive(false);
  };

  useEffect(() => () => raf.current && cancelAnimationFrame(raf.current), []);

  return (
    <div className="ds-hero3d" ref={heroRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <div className="ds-floor" aria-hidden />
      <div className="ds-glow" aria-hidden />
      <div className="ds-stage">
        <motion.div className="ds-scene" style={reduce ? {} : { rotateX, rotateY, opacity: sceneOpacity, scale: sceneScale }}>
          {PIECES.map(p => <PatternCard key={p.key} piece={p} px={reduce ? zero : springX} py={reduce ? zero : springY} reduce={reduce} />)}
        </motion.div>
      </div>
      <motion.div className="ds-headline-3d" style={reduce ? {} : { x: headX, y: headY }}>
        <div className="ds-eyebrow"><Grainline h={16} color={C.blue} stroke={2.4} /><span>Rev 2.2 · For independent labels</span></div>
        <h1 className="ds-h1">
          From flat<br />sketch to<br /><span className="ds-h1-holo">finished run.</span>
        </h1>
        <p className="ds-lede">
          Atelier is the production workspace for independent clothing brands — design, tech-pack, source, sample, and manufacture a product in one place, instead of a stack of spreadsheets, DMs, and freelance tech-pack files.
        </p>
        <div className="ds-cta-row">
          <button className="ds-btn ds-btn-holo ds-btn-lg" onClick={() => navigate('/signup')}>
            Start free <span className="ds-btn-arrow">→</span>
          </button>
          <a href="#index" className="ds-btn ds-btn-line ds-btn-lg">See the spec</a>
        </div>
        <div className="ds-note"><span className="ds-tick" /> No card. The free plan runs one product, forever.</div>
      </motion.div>
      <div className="ds-compass-dock"><GrainCompass angle={angle} active={active} /></div>
      <CornerMarks />
    </div>
  );
}

/* ── Page-wide atmosphere — fixed behind everything, not just the hero, so
   the "cool background" reads across the whole page rather than one
   section. Three drifting blurred aurora blobs + an SVG grain texture
   (the same feTurbulence technique the in-app sidebar already uses, doubly
   apt here since "grain" is literally the brand's subject). ──────────────── */
function Atmosphere() {
  return (
    <div className="ds-atmosphere" aria-hidden>
      <div className="ds-aurora ds-aurora-1" />
      <div className="ds-aurora ds-aurora-2" />
      <div className="ds-aurora ds-aurora-3" />
      <div className="ds-grain" />
    </div>
  );
}

/* ── The persistent grainline thread — the brand's own directional mark,
   made structural: one diagonal path zigzags the full height of the page
   and draws itself in as you scroll, so the page reads as a single
   continuous diagonal cut instead of a stack of centered rectangles. ────── */
function GrainlineThread() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const dashoffset = useSpring(useTransform(scrollYProgress, [0, 1], [1, 0]), { stiffness: 40, damping: 20 });
  return (
    <svg className="ds-thread" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <motion.path
        d="M8 0 L88 6 L18 16 L82 26 L14 38 L86 48 L20 58 L80 68 L16 80 L84 90 L50 100"
        fill="none" stroke={C.blue} strokeWidth="0.15" strokeLinecap="round"
        pathLength="1" strokeDasharray="1"
        style={{ strokeDashoffset: reduce ? 0 : dashoffset }}
      />
    </svg>
  );
}

function Eyebrow({ children, color = C.blue }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.18em', textTransform: 'uppercase', color }}>
      <Grainline h={16} color={color} stroke={2.4} />
      <span>{children}</span>
    </div>
  );
}

const reveal = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 0.9, 0.35, 1] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
// Alternating left/right entrance instead of uniform bottom-up — one of the
// small devices that makes the page feel like it has a direction, not just
// a vertical stack of centered blocks.
const revealDir = (dir) => ({
  hidden: { opacity: 0, y: 18, x: dir * 26 },
  show: { opacity: 1, y: 0, x: 0, transition: { duration: 0.6, ease: [0.16, 0.9, 0.35, 1] } },
});

function Reveal({ children, style, as = 'div' }) {
  const M = motion[as];
  return (
    <M variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-70px' }} style={style}>
      {children}
    </M>
  );
}

/* Cheap, imperative 3D hover-tilt — writes CSS vars directly to the DOM node
   instead of going through React state, so it costs nothing on re-render. */
function useTilt(strength = 8) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * strength).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * strength).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}

function TiltCard({ className, children, style, strength = 7 }) {
  const tilt = useTilt(strength);
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`ds-tilt ${className || ''}`} style={style}>
      <div className="ds-tilt-inner">{children}</div>
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="ds-root">
      <style>{CSS}</style>
      <Atmosphere />
      <GrainlineThread />

      <header className="ds-bar">
        <div className="ds-bar-in">
          <div className="ds-brand">
            <Grainline h={22} color={C.blue} stroke={2.6} />
            <span className="ds-brand-name">Atelier</span>
            <span className="ds-brand-sub">PRODUCTION&nbsp;OS</span>
          </div>
          <nav className="ds-nav">
            <a href="#index" className="ds-nav-link">Index</a>
            <a href="#pricing" className="ds-nav-link">Pricing</a>
            <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/login')}>Log in</button>
            <button className="ds-btn ds-btn-solid" onClick={() => navigate('/signup')}>Start free</button>
          </nav>
        </div>
      </header>

      <section className="ds-hero">
        <Hero3D navigate={navigate} />

        <div className="ds-strip">
          {['6 stages · concept → sold', 'AI assists — never decides', 'Real vendors, real quotes', 'Free plan, one product, forever'].map((t, i) => (
            <span key={i} className="ds-strip-item"><Grainline h={12} color={C.paperFaint} stroke={2.6} /> {t}</span>
          ))}
        </div>
      </section>

      <section className="ds-mission">
        <div className="ds-wrap">
          <Reveal><Eyebrow color={C.violet}>Mission</Eyebrow></Reveal>
          <Reveal as="p" style={{ margin: 0 }}>
            <span className="ds-mission-lead">
              Starting a clothing brand shouldn't take a rolodex, a manufacturing degree, and a miracle.
            </span>{' '}
            <span className="ds-mission-body">
              <em style={{ fontFamily: SERIF, fontStyle: 'italic', color: C.paper }}>Atelier</em> gives an independent founder the tools to take a sketch seriously — and turn it into something real, sourceable, and sellable.
            </span>
          </Reveal>
          <Reveal>
            <div className="ds-mission-foot">AI drafts, extracts, scores, and suggests. You review and decide — always.</div>
          </Reveal>
        </div>
      </section>

      <section className="ds-section" id="index">
        <div className="ds-wrap">
          <Reveal>
            <div className="ds-sec-head">
              <Eyebrow>Specification index</Eyebrow>
              <h2 className="ds-h2">Every stage of making a product — on one sheet.</h2>
            </div>
          </Reveal>
          <motion.div className="ds-index" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
            {FEATURES.map((f, i) => (
              <motion.div key={f.n} variants={revealDir(i % 2 === 0 ? -1 : 1)}>
                <TiltCard className="ds-cell">
                  <div className="ds-cell-n">{f.n}</div>
                  <h3 className="ds-cell-title">{f.title}</h3>
                  <p className="ds-cell-text">{f.text}</p>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="ds-section ds-flow-sec">
        <div className="ds-wrap">
          <Reveal><Eyebrow>Assembly sequence</Eyebrow></Reveal>
          <Reveal><h2 className="ds-h2" style={{ marginBottom: 34 }}>One product, one path — measured end to end.</h2></Reveal>
          <Reveal>
            <div className="ds-rule">
              <div className="ds-rule-line" aria-hidden />
              {STAGES.map((s, i) => (
                <div className="ds-rule-stop" key={s.key}>
                  <span className="ds-rule-tick" aria-hidden />
                  <span className="ds-rule-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ds-rule-label">{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="ds-section" id="pricing">
        <div className="ds-wrap">
          <Reveal>
            <div className="ds-sec-head">
              <Eyebrow>Size run</Eyebrow>
              <h2 className="ds-h2">Start free. Grow into it.</h2>
            </div>
          </Reveal>
          <motion.div className="ds-price" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
            {PLANS.map((p, i) => {
              const feature = p.id === 'basic';
              return (
                <motion.div key={p.id} variants={revealDir(i === 0 ? -1 : i === PLANS.length - 1 ? 1 : 0)}>
                  <TiltCard className={`ds-plan${feature ? ' ds-plan-feat' : ''}`} strength={feature ? 9 : 6}>
                    {feature && <div className="ds-plan-flag">Most chosen</div>}
                    <div className="ds-plan-name">{p.name}</div>
                    <div className="ds-plan-tag">{p.tagline}</div>
                    <div className="ds-plan-price"><span className="ds-plan-amt">{p.price}</span><span className="ds-plan-suf">{p.priceSuffix}</span></div>
                    <div className="ds-plan-rule" />
                    <ul className="ds-plan-list">
                      {p.summary.map(s => (
                        <li key={s}><Grainline h={12} color={feature ? C.violet : C.blue} stroke={2.6} /><span>{s}</span></li>
                      ))}
                    </ul>
                    <button className={`ds-btn ds-btn-lg ${feature ? 'ds-btn-holo' : 'ds-btn-line'}`} style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/signup')}>
                      {p.id === 'free' ? 'Start for free' : `Choose ${p.name}`}
                    </button>
                  </TiltCard>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="ds-section">
        <div className="ds-wrap">
          <Reveal>
            <div className="ds-final">
              <CornerMarks color="rgba(244,242,236,0.18)" />
              <Grainline h={40} color={C.violet} stroke={2.4} />
              <h2 className="ds-final-h">Your next product deserves a real workspace.</h2>
              <p className="ds-final-p">Set up your brand in a couple minutes and start on your first product today — free, no card needed.</p>
              <button className="ds-btn ds-btn-holo ds-btn-lg" onClick={() => navigate('/signup')}>Start free <span className="ds-btn-arrow">→</span></button>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="ds-foot">
        <div className="ds-wrap ds-foot-in">
          <div className="ds-brand">
            <Grainline h={18} color={C.paperDim} stroke={2.6} />
            <span className="ds-brand-name" style={{ color: C.paper }}>Atelier</span>
          </div>
          <div className="ds-foot-meta">Production OS for independent clothing brands</div>
          <div className="ds-foot-links">
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Log in</a>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/terms'); }}>Terms</a>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/privacy'); }}>Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
.ds-root { position: relative; background: ${C.ink}; color: ${C.paper}; font-family: ${BODY};
  min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
.ds-root ::selection { background: ${C.blue}; color: ${C.ink}; }
.ds-wrap { max-width: 1120px; margin: 0 auto; padding: 0 28px; }

/* atmosphere — fixed, full-bleed, sits behind every section */
.ds-atmosphere { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.ds-aurora { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.4; mix-blend-mode: screen; }
.ds-aurora-1 { width: 58vw; height: 58vw; top: -22%; left: -12%; background: radial-gradient(circle, ${C.blue}, transparent 70%); animation: ds-drift1 28s ease-in-out infinite; }
.ds-aurora-2 { width: 48vw; height: 48vw; top: 28%; right: -16%; background: radial-gradient(circle, ${C.violet}, transparent 70%); animation: ds-drift2 34s ease-in-out infinite; }
.ds-aurora-3 { width: 44vw; height: 44vw; bottom: -14%; left: 22%; background: radial-gradient(circle, ${C.coral}, transparent 70%); animation: ds-drift3 24s ease-in-out infinite; }
@keyframes ds-drift1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(6%, 8%) scale(1.15); } }
@keyframes ds-drift2 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-8%, -6%) scale(1.12); } }
@keyframes ds-drift3 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(5%, -8%) scale(1.2); } }
.ds-grain { position: absolute; inset: -10%; opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.ds-thread { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0.55; }

/* everything else paints above the atmosphere + thread */
.ds-bar, .ds-hero, .ds-mission, .ds-section, .ds-flow-sec, .ds-foot { position: relative; z-index: 2; }

/* title bar */
.ds-bar { position: sticky; top: 0; z-index: 40; background: rgba(10,12,17,0.72);
  backdrop-filter: blur(10px); border-bottom: 1px solid ${C.line}; }
.ds-bar-in { max-width: 1120px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; justify-content: space-between; }
.ds-brand { display: flex; align-items: center; gap: 9px; }
.ds-brand-name { font-family: ${DISPLAY}; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; color: ${C.paper}; }
.ds-brand-sub { font-family: ${MONO}; font-size: 9.5px; letter-spacing: 0.16em; color: ${C.paperFaint}; padding: 3px 6px; border: 1px solid ${C.line}; border-radius: 3px; }
.ds-nav { display: flex; align-items: center; gap: 20px; }
.ds-nav-link { font-family: ${MONO}; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: ${C.paperDim}; text-decoration: none; }
.ds-nav-link:hover { color: ${C.paper}; }

/* buttons */
.ds-btn { position: relative; isolation: isolate; font-family: ${MONO}; font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  border: 1.5px solid transparent; border-radius: 4px; padding: 9px 16px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  text-decoration: none; transition: transform .12s ease, background .12s ease, color .12s ease, border-color .12s ease, box-shadow .18s ease; }
.ds-btn:active { transform: translateY(1px); }
.ds-btn-lg { padding: 13px 22px; font-size: 13px; }
.ds-btn-solid { background: ${C.paper}; color: ${C.ink}; border-color: ${C.paper}; }
.ds-btn-solid:hover { background: ${C.blue}; border-color: ${C.blue}; color: ${C.ink}; }
/* "Expensive SaaS button": a solid dark face over a rotating conic-gradient
   ring, instead of a flat gradient fill — the light chases the edge, the
   face itself never changes color. */
.ds-btn-holo { background: ${C.ink2}; color: ${C.paper}; border-color: transparent; }
.ds-btn-holo::before { content: ''; position: absolute; inset: -60%; z-index: -1;
  background: conic-gradient(${C.blue}, ${C.violet}, ${C.coral}, ${C.gold}, ${C.blue});
  animation: ds-spin 5s linear infinite; }
.ds-btn-holo::after { content: ''; position: absolute; inset: 1.5px; z-index: -1; border-radius: 3px; background: ${C.ink2}; transition: background .18s ease; }
.ds-btn-holo:hover::after { background: ${C.ink3}; }
.ds-btn-holo:hover { box-shadow: 0 8px 30px -8px rgba(169,140,245,0.6); }
@keyframes ds-spin { to { transform: rotate(360deg); } }
.ds-btn-line { background: transparent; color: ${C.paper}; border-color: ${C.lineBright}; }
.ds-btn-line:hover { background: ${C.paper}; color: ${C.ink}; border-color: ${C.paper}; }
.ds-btn-ghost { background: transparent; color: ${C.paperDim}; border-color: transparent; }
.ds-btn-ghost:hover { color: ${C.paper}; }
.ds-btn-arrow { transition: transform .16s ease; }
.ds-btn:hover .ds-btn-arrow { transform: translateX(3px); }

/* ── 3D hero scene ────────────────────────────────────────────────────── */
.ds-hero { position: relative; padding: 8px 0 20px; }
.ds-hero3d { position: relative; height: min(88vh, 780px); min-height: 560px; overflow: hidden; }
.ds-glow { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 50% at 32% 40%, rgba(107,168,222,0.16), transparent 70%),
              radial-gradient(45% 40% at 78% 62%, rgba(255,138,107,0.12), transparent 70%); }
.ds-floor { position: absolute; left: -20%; right: -20%; bottom: -30%; height: 90%;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 46px 46px;
  transform: perspective(700px) rotateX(72deg);
  transform-origin: bottom center;
  -webkit-mask-image: linear-gradient(to top, black 0%, transparent 75%);
  mask-image: linear-gradient(to top, black 0%, transparent 75%);
}
.ds-stage { position: absolute; inset: 0; perspective: 1500px; display: flex; align-items: center; justify-content: center; }
.ds-scene { position: relative; width: min(920px, 92vw); height: 100%; transform-style: preserve-3d; }
.ds-piece { transform-style: preserve-3d; will-change: transform; pointer-events: none; }
@keyframes ds-piece-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
/* Real per-surface lighting instead of a flat glass panel: a two-layer
   background paints a soft gradient rim-light border (brighter top-left,
   like a real edge catching light), a specular highlight blob sits in the
   corner, and a colored ambient glow (each piece's own accent, set via
   --glow inline) grounds it in the scene under the plain drop shadow. */
.ds-piece-card { position: relative; padding: 10px 10px 16px; border-radius: 10px;
  background: linear-gradient(rgba(20,23,31,0.62), rgba(20,23,31,0.62)) padding-box,
              linear-gradient(135deg, rgba(244,242,236,0.45), rgba(244,242,236,0.05) 35%, rgba(244,242,236,0.03) 65%, rgba(244,242,236,0.22)) border-box;
  border: 1px solid transparent; backdrop-filter: blur(3px);
  box-shadow: 0 30px 60px -30px rgba(0,0,0,0.75), 0 0 44px -14px var(--glow, transparent); }
.ds-piece-card::before { content: ''; position: absolute; top: -14%; left: -8%; width: 55%; height: 45%;
  background: radial-gradient(circle, rgba(255,255,255,0.3), transparent 72%); filter: blur(6px); pointer-events: none; }
.ds-headline-3d { position: absolute; left: 28px; top: 12%; width: min(430px, 72vw); z-index: 4; }
.ds-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-family: ${MONO}; font-size: 11.5px; letter-spacing: 0.18em; text-transform: uppercase; color: ${C.blue}; margin-bottom: 18px; }
.ds-h1 { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(34px, 4.8vw, 64px); line-height: 0.96;
  letter-spacing: -0.025em; text-transform: uppercase; margin: 0; color: ${C.paper}; text-shadow: 0 4px 40px rgba(0,0,0,0.5); }
/* A real backlit glow, not a gradient fill — layered colored text-shadows
   read as light behind the letters instead of a flat rainbow printed on them. */
.ds-h1-holo { color: ${C.paper};
  text-shadow: 0 0 26px rgba(107,168,222,0.55), 0 0 52px rgba(169,140,245,0.4), 0 0 84px rgba(255,138,107,0.28); }
.ds-lede { font-size: 14.5px; line-height: 1.58; color: ${C.paperDim}; max-width: 420px; margin: 16px 0 0; }
.ds-cta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
.ds-note { font-family: ${MONO}; font-size: 12px; color: ${C.paperFaint}; display: flex; align-items: center; gap: 9px; margin-top: 14px; }
.ds-tick { width: 7px; height: 7px; background: ${C.blue}; border-radius: 50%; flex-shrink: 0; }

.ds-compass-dock { position: absolute; right: 22px; top: 50%; transform: translateY(-50%); z-index: 5; }
.ds-compass { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 14px; border-radius: 12px;
  background: rgba(18,21,29,0.62); border: 1px solid ${C.line}; backdrop-filter: blur(6px); }
.ds-compass-label { font-family: ${MONO}; font-size: 9px; letter-spacing: 0.1em; color: ${C.paperFaint}; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
.ds-compass-dot { width: 5px; height: 5px; border-radius: 50%; transition: background .2s ease; }
.ds-compass-read { font-family: ${MONO}; font-size: 12px; color: ${C.paperDim}; letter-spacing: 0.02em; }
.ds-compass-read b { color: ${C.blue}; font-weight: 700; }

/* spec strip */
.ds-strip { max-width: 1120px; margin: 28px auto 0; padding: 16px 28px; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};
  display: flex; flex-wrap: wrap; gap: 12px 30px; }
.ds-strip-item { font-family: ${MONO}; font-size: 12px; letter-spacing: 0.03em; color: ${C.paperDim}; display: inline-flex; align-items: center; gap: 8px; text-transform: uppercase; }

/* mission — a diagonal clip instead of a flat rule, so the section break
   itself carries direction rather than just stacking under the last one */
.ds-mission { padding: 96px 0; background: radial-gradient(60% 100% at 50% 0%, rgba(169,140,245,0.06), transparent 60%);
  clip-path: polygon(0 0, 100% 2.2%, 100% 100%, 0 97.8%); margin-bottom: -1px; }
.ds-mission .ds-wrap { display: flex; flex-direction: column; gap: 26px; max-width: 900px; }
.ds-mission-lead { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.4vw, 38px); line-height: 1.18; letter-spacing: -0.01em; color: ${C.paper}; }
.ds-mission-body { font-size: clamp(18px, 2.2vw, 24px); line-height: 1.5; color: ${C.paperDim}; font-family: ${BODY}; }
.ds-mission-foot { font-family: ${MONO}; font-size: 12.5px; letter-spacing: 0.04em; color: ${C.violet}; text-transform: uppercase; }

/* generic section */
.ds-section { padding: 90px 0; }
.ds-sec-head { display: flex; flex-direction: column; gap: 14px; margin-bottom: 40px; }
.ds-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(26px, 3.6vw, 40px); line-height: 1.06; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; max-width: 640px; color: ${C.paper}; }

/* 3D tilt cards (shared by spec index + pricing) */
.ds-tilt { perspective: 900px; }
.ds-tilt-inner { transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .1s ease-out; transform-style: preserve-3d; height: 100%; }

/* specification index */
.ds-index { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5px; background: ${C.line}; border: 1.5px solid ${C.line}; }
.ds-cell { position: relative; background: ${C.ink2}; height: 100%; }
.ds-cell .ds-tilt-inner { padding: 26px 24px 30px; }
.ds-cell:hover { background: ${C.ink3}; }
.ds-cell-n { font-family: ${MONO}; font-size: 12px; font-weight: 700; color: ${C.blue}; letter-spacing: 0.08em; }
.ds-cell-title { font-family: ${DISPLAY}; font-weight: 700; font-size: 16.5px; margin: 12px 0 8px; letter-spacing: -0.01em; color: ${C.paper}; }
.ds-cell-text { font-size: 13px; line-height: 1.6; color: ${C.paperDim}; margin: 0; }

/* flow rule — clipped the opposite direction from the mission band above it,
   so the two cuts read as a single zigzag running down the page */
.ds-flow-sec { background: ${C.ink2}; clip-path: polygon(0 2.2%, 100% 0, 100% 100%, 0 97.8%); margin: -1px 0; }
.ds-rule { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; padding-top: 26px; }
.ds-rule-line { position: absolute; top: 26px; left: 0; right: 0; height: 2px; background: ${C.line}; }
.ds-rule-stop { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
.ds-rule-tick { width: 2px; height: 16px; background: ${C.blue}; margin-top: -7px; }
.ds-rule-n { font-family: ${MONO}; font-size: 12px; font-weight: 700; color: ${C.blue}; }
.ds-rule-label { font-family: ${DISPLAY}; font-weight: 700; font-size: 13.5px; letter-spacing: -0.01em; line-height: 1.15; color: ${C.paper}; }

/* pricing */
.ds-price { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.ds-plan { border-radius: 10px; background: ${C.ink2}; border: 1.5px solid ${C.line}; }
.ds-plan .ds-tilt-inner { padding: 26px 24px; display: flex; flex-direction: column; height: 100%; position: relative; }
.ds-plan-feat { background: linear-gradient(160deg, ${C.ink3}, ${C.ink2}); border-color: ${C.violet}55; box-shadow: 0 30px 60px -34px rgba(169,140,245,0.5); }
.ds-plan-flag { position: absolute; top: -12px; left: 0; font-family: ${MONO}; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; background: ${C.violet}; color: ${C.ink}; padding: 4px 10px; border-radius: 3px; box-shadow: 0 4px 18px -4px ${C.violet}aa; }
.ds-plan-name { font-family: ${DISPLAY}; font-weight: 800; font-size: 18px; text-transform: uppercase; letter-spacing: -0.01em; color: ${C.paper}; }
.ds-plan-tag { font-size: 12.5px; color: ${C.paperFaint}; margin-top: 4px; }
.ds-plan-price { display: flex; align-items: baseline; gap: 5px; margin: 18px 0; }
.ds-plan-amt { font-family: ${MONO}; font-size: 34px; font-weight: 700; color: ${C.paper}; }
.ds-plan-suf { font-family: ${MONO}; font-size: 12px; color: ${C.paperFaint}; }
.ds-plan-rule { height: 1px; background: ${C.line}; margin-bottom: 18px; }
.ds-plan-list { list-style: none; margin: 0 0 22px; padding: 0; display: flex; flex-direction: column; gap: 11px; }
.ds-plan-list li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.45; color: ${C.paperDim}; }
.ds-plan-list svg { margin-top: 1px; flex-shrink: 0; }

/* final cta */
.ds-final { position: relative; background: ${C.ink2}; border: 1.5px solid ${C.line}; border-radius: 10px; padding: 60px 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; overflow: hidden; }
.ds-final::before { content: ''; position: absolute; inset: -40%; background: radial-gradient(55% 55% at 28% 15%, ${C.violet}, transparent 70%); opacity: 0.16; filter: blur(60px); }
.ds-final-h { position: relative; font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.4vw, 36px); text-transform: uppercase; letter-spacing: -0.02em; line-height: 1.08; margin: 4px 0 0; max-width: 560px; color: ${C.paper}; }
.ds-final-p { position: relative; font-size: 14.5px; color: ${C.paperDim}; max-width: 460px; margin: 0 0 8px; line-height: 1.6; }

/* footer */
.ds-foot { border-top: 1.5px solid ${C.line}; padding: 26px 0 40px; }
.ds-foot-in { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
.ds-foot-meta { font-family: ${MONO}; font-size: 11.5px; color: ${C.paperFaint}; letter-spacing: 0.03em; }
.ds-foot-links { display: flex; gap: 20px; }
.ds-foot-links a { font-family: ${MONO}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.paperDim}; text-decoration: none; }
.ds-foot-links a:hover { color: ${C.blue}; }

/* responsive — the 3D scene (pieces + floor + compass) is a desktop pointer
   interaction by nature (parallax and hover-tilt need a mouse), so below
   900px it steps aside for a plain, fully-readable static hero instead of
   an approximation that can't really be "interactive" on a touchscreen. */
@media (max-width: 900px) {
  .ds-hero3d { height: auto; min-height: 0; padding: 36px 0 32px; overflow: visible; }
  .ds-stage, .ds-compass-dock, .ds-glow, .ds-floor { display: none; }
  .ds-headline-3d { position: static; width: 100%; padding: 0 18px; }
  .ds-index { grid-template-columns: repeat(2, 1fr); }
  .ds-rule { grid-template-columns: repeat(4, 1fr); row-gap: 22px; }
  .ds-rule-line { display: none; }
  .ds-price { grid-template-columns: 1fr; }
  .ds-nav .ds-nav-link { display: none; }
}
@media (max-width: 640px) {
  .ds-brand-sub { display: none; }
  .ds-bar-in { padding: 11px 18px; }
  .ds-nav { gap: 12px; }
  .ds-wrap { padding-left: 18px; padding-right: 18px; }
}
@media (max-width: 520px) {
  .ds-index { grid-template-columns: 1fr; }
  .ds-rule { grid-template-columns: repeat(2, 1fr); }
  .ds-mission { padding: 68px 0; }
  .ds-section { padding: 64px 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ds-btn, .ds-btn-arrow, .ds-tilt-inner { transition: none; }
  .ds-piece { transform: none !important; }
}
`;
