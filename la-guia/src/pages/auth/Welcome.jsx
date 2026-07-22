import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, useScroll, useReducedMotion } from 'framer-motion';
import { STAGES } from '../../data/mockData.js';
import { PLANS } from '../../data/plans.js';
import { Capacitor } from '@capacitor/core';
import { NeedleA } from './NeedleA.jsx';

// The WebGL gate (with all of three.js) is the single heaviest thing on the
// landing page. Lazy-load it so the hero paints immediately and three.js
// downloads as its own chunk instead of blocking first render.
const IntroGate = lazy(() => import('./IntroGate.jsx'));

/* ───────────────────────────────────────────────────────────────────────────
   "The Cutting Table" — Rev 3.

   Same thesis as Rev 2 (the flat pattern, lifted off the table into space,
   drawn with the drafting vocabulary of a real spec sheet), executed at
   studio-site scale:

   · The hero headline is now the full-bleed object of the scene — display
     type at ~8vw with a line-by-line reveal, and the "finished run." print
     plates physically slide INTO registration on load, like a press
     aligning its color plates. Pattern pieces float among/behind the type
     and scatter apart as you scroll away from the table.
   · A cursor-following key light illuminates whatever part of the page the
     pointer is over (screen-blended radial, whole page, not hero-local).
   · The feature grid became a scrollytelling ledger: a sticky rail with a
     giant outlined counter + the active feature's title tracks a list of
     rows as they cross the center of the viewport.
   · A tilted kinetic marquee band (outlined display type, infinite track)
     carries the six stage names across the page between sections.
   · The assembly-sequence rule physically fills stage by stage as it
     scrolls through the viewport.
   · Cards get a specular sheen sweep on hover — a moving light reflection,
     not a gradient fill (still zero flat-gradient fills and zero text-glow
     anywhere, per earlier revisions).
   · The page closes on a giant outlined ATELIER wordmark with the small
     "labs" subscript — the new lockup, also used in the header.
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

const MARQUEE_ITEMS = ['Design', 'Tech-Pack', 'Source', 'Sample', 'Produce', 'Sell'];

/* The grainline symbol — the pattern-maker's alignment mark, the brand's
   namesake, and the page's one recurring device. */
function Grainline({ h = 34, color = C.blue, stroke = 2 }) {
  const w = h * 0.36;
  return (
    <svg width={w} height={h} viewBox="0 0 18 50" fill="none" style={{ display: 'block' }} aria-hidden>
      <path d="M9 6 V44 M3 12 L9 4 L15 12 M3 38 L9 46 L15 38" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* The lockup: the needle-A mark, then Atelier over a tiny "labs". The mark
   carries .ds-brand-a — the intro gate's liquid logo flies to and lands on
   the first instance of it (the header's). */
function BrandMark({ size = 18 }) {
  return (
    <span className="ds-brand">
      <NeedleA size={size + 10} color={C.paper} className="ds-brand-a" />
      <span className="ds-brand-stack">
        <span className="ds-brand-name" style={{ fontSize: size }}>Atelier</span>
        <span className="ds-brand-labs">labs</span>
      </span>
    </span>
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

/* ── Pattern pieces — stylized technical flats, each with its own grainline
   arrow and cutting notches ─────────────────────────────────────────────── */
function PieceChrome({ label }) {
  return <text x="50%" y="98%" textAnchor="middle" fontFamily={MONO} fontSize="8.5" letterSpacing="0.06em" fill={C.paperDim}>{label}</text>;
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

/* scatter = [x, y, extra rotZ] applied as you scroll away from the table */
const PIECES = [
  { key: 'front', Comp: FrontPiece, top: '7%', left: '55%', z: 60, baseRotY: -14, baseRotZ: -5, w: 185, depth: 1.3, accent: C.blue, floatDur: 7.5, floatDelay: 0, scatter: [140, -170, -12] },
  { key: 'back', Comp: BackPiece, top: '3%', left: '79%', z: 10, baseRotY: 10, baseRotZ: 4, w: 148, depth: 0.7, accent: C.violet, floatDur: 8.5, floatDelay: 1.2, scatter: [220, -90, 10] },
  { key: 'sleeve', Comp: SleevePiece, top: '50%', left: '73%', z: 110, baseRotY: -18, baseRotZ: 7, w: 126, depth: 1.9, accent: C.coral, floatDur: 6.5, floatDelay: 0.6, scatter: [170, 150, 16] },
  { key: 'collar', Comp: CollarPiece, top: '66%', left: '52%', z: 150, baseRotY: 14, baseRotZ: -8, w: 150, depth: 2.4, accent: C.gold, floatDur: 9, floatDelay: 2, scatter: [-150, 190, -18] },
];
const MAX_Z = Math.max(...PIECES.map(p => p.z));

function PatternCard({ piece, px, py, scrollP, reduce, index }) {
  const { Comp, top, left, z, baseRotY, baseRotZ, w, depth, accent, floatDur, floatDelay, scatter } = piece;
  const pxDepth = useTransform(px, v => v * depth * 14);
  const pyDepth = useTransform(py, v => v * depth * 10);
  const sx = useTransform(scrollP, [0, 1], [0, scatter[0]]);
  const sy = useTransform(scrollP, [0, 1], [0, scatter[1]]);
  const x = useTransform([pxDepth, sx], ([a, b]) => a + b);
  const y = useTransform([pyDepth, sy], ([a, b]) => a + b);
  const rotateZ = useTransform(scrollP, [0, 1], [baseRotZ, baseRotZ + scatter[2]]);
  const depthBlur = Math.max(0, (MAX_Z - z) / 34);
  return (
    <motion.div
      className="ds-piece"
      style={{
        position: 'absolute', top, left, width: w,
        x, y, z, rotateY: baseRotY, rotateZ,
        transformStyle: 'preserve-3d',
      }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 70, scale: 0.88 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 0.9, 0.3, 1], delay: 0.65 + index * 0.14 }}
        style={{ animation: reduce ? 'none' : `ds-piece-float ${floatDur}s ease-in-out ${floatDelay}s infinite` }}
      >
        <div className="ds-piece-card" style={{ '--glow': accent, filter: depthBlur ? `blur(${depthBlur.toFixed(2)}px)` : 'none' }}>
          <Comp />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Grain compass — a live instrument, reads angle straight off the
   pointer. Nothing about the number is invented. ────────────────────────── */
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
      <svg viewBox="0 0 84 84" width="112" height="112" aria-hidden>
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

/* ── The hero: full-bleed display type over the 3D table ────────────────── */
function Hero3D({ navigate }) {
  const reduce = useReducedMotion();
  const heroRef = useRef(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const zero = useMotionValue(0);
  const springX = useSpring(px, { stiffness: 60, damping: 16, mass: 0.6 });
  const springY = useSpring(py, { stiffness: 60, damping: 16, mass: 0.6 });
  const pointerRotateY = useTransform(springX, v => v * 8);
  const pointerRotateX = useTransform(springY, v => v * -6);
  const [angle, setAngle] = useState(24);
  const [active, setActive] = useState(false);
  const raf = useRef(null);

  // Scroll keeps driving the same scene: the camera pitches back, the
  // pieces scatter off the table, the whole stage recedes.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const scrollRotateX = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const rotateX = useTransform([pointerRotateX, scrollRotateX], ([a, b]) => a + b);
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 0.9, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 0.88]);
  const headY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);

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
      // Skip sub-half-degree updates — re-rendering the compass on every
      // pointer event competes with scrolling for main-thread time.
      setAngle(a => (Math.abs(deg - a) > 0.4 ? deg : a));
      setActive(true);
    });
  };
  const handleLeave = () => { px.set(0); py.set(0); setActive(false); };
  useEffect(() => () => raf.current && cancelAnimationFrame(raf.current), []);

  // Two dust layers moving opposite directions against the pointer — the
  // cheapest honest depth cue there is: near specks travel further than far
  // ones, and in the opposite sense to the background.
  const dustNearX = useTransform(springX, v => v * 22);
  const dustNearY = useTransform(springY, v => v * 15);
  const dustFarX = useTransform(springX, v => v * -9);
  const dustFarY = useTransform(springY, v => v * -6);

  const fadeUp = (d) => reduce ? {} : {
    initial: { opacity: 0, y: 26 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: [0.16, 0.9, 0.3, 1], delay: d },
  };
  const lineAnim = (d) => reduce ? {} : {
    initial: { y: '108%' },
    animate: { y: '0%' },
    transition: { duration: 0.85, ease: [0.16, 0.9, 0.3, 1], delay: d },
  };

  return (
    <div className="ds-hero3d" ref={heroRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <div className="ds-floor" aria-hidden />
      <div className="ds-glow" aria-hidden />
      <div className="ds-beams" aria-hidden />
      <LiquidField className="ds-liquid-hero" />
      <motion.div className="ds-dust ds-dust-far" style={reduce ? {} : { x: dustFarX, y: dustFarY }} aria-hidden />
      <motion.div className="ds-dust ds-dust-near" style={reduce ? {} : { x: dustNearX, y: dustNearY }} aria-hidden />
      <div className="ds-stage" aria-hidden>
        <motion.div className="ds-scene" style={reduce ? {} : { rotateX, rotateY: pointerRotateY, opacity: sceneOpacity, scale: sceneScale }}>
          {PIECES.map((p, i) => (
            <PatternCard key={p.key} piece={p} index={i}
              px={reduce ? zero : springX} py={reduce ? zero : springY}
              scrollP={reduce ? zero : scrollYProgress} reduce={reduce} />
          ))}
        </motion.div>
      </div>

      <motion.div className="ds-hero-in" style={{ y: headY }}>
        <motion.div className="ds-eyebrow" {...fadeUp(0.05)}>
          <Grainline h={16} color={C.blue} stroke={2.4} /><span>Rev 3.0 · For independent labels</span>
        </motion.div>
        <h1 className="ds-h1">
          <span className="ds-line"><motion.span className="ds-line-in" {...lineAnim(0.16)}>From flat sketch</motion.span></span>
          <span className="ds-line"><motion.span className="ds-line-in" {...lineAnim(0.3)}>
            to&nbsp;
            <span className="ds-h1-print">
              <span className="ds-h1-ghost ds-h1-ghost-a" aria-hidden>finished run.</span>
              <span className="ds-h1-ghost ds-h1-ghost-b" aria-hidden>finished run.</span>
              <span className="ds-h1-solid">finished run.</span>
            </span>
          </motion.span></span>
        </h1>
        <div className="ds-hero-row">
          <motion.p className="ds-lede" {...fadeUp(0.55)}>
            Atelier is the production workspace for independent clothing brands — design, tech-pack, source, sample, and manufacture a product in one place, instead of a stack of spreadsheets, DMs, and freelance tech-pack files.
          </motion.p>
          <motion.div className="ds-cta-col" {...fadeUp(0.68)}>
            <div className="ds-cta-row">
              <button className="ds-btn ds-btn-holo ds-btn-lg" onClick={() => navigate('/signup')}>
                Start free <span className="ds-btn-arrow">→</span>
              </button>
              <a href="#index" className="ds-btn ds-btn-line ds-btn-lg">See the spec</a>
            </div>
            <div className="ds-note"><span className="ds-tick" /> No card. The free plan runs one product, forever.</div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div className="ds-compass-dock" {...fadeUp(1)}>
        <GrainCompass angle={angle} active={active} />
      </motion.div>
      <CornerMarks />
    </div>
  );
}

/* ── Page-wide atmosphere ───────────────────────────────────────────────── */
function Atmosphere() {
  return (
    <div className="ds-atmosphere" aria-hidden>
      {/* The goo filter: blur + alpha-contrast turns separate blobs into one
         merging liquid surface (metaballs) wherever they drift close. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="ds-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b" />
            <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -13" result="g" />
            <feBlend in="SourceGraphic" in2="g" />
          </filter>
        </defs>
      </svg>
      <div className="ds-aurora ds-aurora-1" />
      <div className="ds-aurora ds-aurora-2" />
      <div className="ds-aurora ds-aurora-3" />
      <div className="ds-aurora ds-aurora-4" />
      <div className="ds-grain" />
    </div>
  );
}

/* ── Liquid light — three colored blobs run through the goo filter, so when
   their drift paths cross they visibly merge and split like one liquid
   surface, then the whole field is softened into molten light. ──────────── */
function LiquidField({ className }) {
  return (
    <div className={`ds-liquid ${className || ''}`} aria-hidden>
      <div className="ds-liquid-field">
        <span className="ds-lb ds-lb-1" />
        <span className="ds-lb ds-lb-2" />
        <span className="ds-lb ds-lb-3" />
      </div>
    </div>
  );
}

/* ── Cursor key light — a soft screen-blended radial that follows the
   pointer across the whole page, so every section reads as "lit" by where
   you're looking. Writes CSS vars straight to the node: zero re-renders. ── */
function CursorLight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf;
    const move = (e) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Transform, not background-position: moving a pre-painted orb is
        // compositor-only, while repositioning a viewport-sized gradient
        // repaints the whole screen every frame.
        el.style.transform = `translate3d(${e.clientX - 700}px, ${e.clientY - 700}px, 0)`;
      });
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => { window.removeEventListener('mousemove', move); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <div className="ds-cursorlight" aria-hidden><div ref={ref} className="ds-cursorlight-orb" /></div>;
}

/* ── The persistent grainline thread — draws itself in as you scroll, and
   now weaves in TRUE depth: the full path runs dim and thin BEHIND the
   sections, while alternating segments are redrawn thicker, brighter, and
   glowing ABOVE the content — so the thread passes behind one card and in
   front of the next, like a real needle through cloth. The two layers also
   drift apart laterally as you scroll (parallax) and the near layer slowly
   breathes in scale, so it reads as moving toward and away from you, not
   just side to side. ────────────────────────────────────────────────────── */
const THREAD_PATH = 'M8 0 L88 6 L18 16 L82 26 L14 38 L86 48 L20 58 L80 68 L16 80 L84 90 L50 100';
const THREAD_FRONT_PATH = 'M88 6 L18 16 M82 26 L14 38 M86 48 L20 58 M80 68 L16 80 M84 90 L50 100';

function GrainlineThread() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const dashoffset = useSpring(useTransform(scrollYProgress, [0, 1], [1, 0]), { stiffness: 40, damping: 20 });
  const backX = useTransform(scrollYProgress, [0, 1], [0, 2.2]);
  const frontX = useTransform(scrollYProgress, [0, 1], [0, -2.2]);
  return (
    <>
      {/* vector-effect keeps the thread a constant pixel width — without it,
         the non-uniform viewBox stretch turns diagonals into wide ribbons */}
      <svg className="ds-thread" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <motion.path
          d={THREAD_PATH} vectorEffect="non-scaling-stroke"
          fill="none" stroke={C.blue} strokeWidth="1.1" strokeLinecap="round" opacity="0.5"
          pathLength="1" strokeDasharray="1"
          style={reduce ? {} : { strokeDashoffset: dashoffset, x: backX }}
        />
      </svg>
      <svg className="ds-thread ds-thread-front" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {/* Glow lives in the SVG as a wide soft stroke under the core line —
           a CSS drop-shadow filter here would force Chrome to rasterize a
           full-page-height filtered layer, which stalls the first scroll
           gesture. */}
        <motion.path
          d={THREAD_FRONT_PATH} vectorEffect="non-scaling-stroke"
          fill="none" stroke={C.blue} strokeWidth="7" strokeLinecap="round" opacity="0.22"
          pathLength="1" strokeDasharray="1"
          style={reduce ? {} : { strokeDashoffset: dashoffset, x: frontX }}
        />
        <motion.path
          d={THREAD_FRONT_PATH} vectorEffect="non-scaling-stroke"
          fill="none" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round"
          pathLength="1" strokeDasharray="1"
          style={reduce ? {} : { strokeDashoffset: dashoffset, x: frontX }}
        />
      </svg>
    </>
  );
}

/* ── Kinetic marquee band — outlined display type on an infinite track,
   tilted a couple degrees so it cuts across the page like the thread. ───── */
function Marquee() {
  const half = (
    <div className="ds-marquee-half" aria-hidden>
      {MARQUEE_ITEMS.map((t, i) => (
        <span key={t} className="ds-marquee-item">
          <span className={i % 2 === 0 ? 'ds-marquee-out' : 'ds-marquee-fill'}>{t}</span>
          <Grainline h={26} color={[C.blue, C.violet, C.coral, C.gold][i % 4]} stroke={2.2} />
        </span>
      ))}
    </div>
  );
  return (
    <div className="ds-marquee-clip" aria-hidden>
      <div className="ds-marquee-stage">
        <div className="ds-marquee ds-marquee-back">
          <div className="ds-marquee-track ds-marquee-rev">{half}{half}</div>
        </div>
        <div className="ds-marquee ds-marquee-frontlayer">
          <div className="ds-marquee-track">{half}{half}</div>
        </div>
      </div>
    </div>
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
/* Entrances arrive from 3D space — tipped back and slightly offset toward
   their side — not just slid in flat. transformPerspective makes rotateX
   read as real depth without needing a perspective wrapper. */
const revealDir = (dir) => ({
  hidden: { opacity: 0, y: 20, x: dir * 26, rotateX: 16, transformPerspective: 1000 },
  show: { opacity: 1, y: 0, x: 0, rotateX: 0, transformPerspective: 1000, transition: { duration: 0.65, ease: [0.16, 0.9, 0.35, 1] } },
});

function Reveal({ children, style, as = 'div' }) {
  const M = motion[as];
  return (
    <M variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-70px' }} style={style}>
      {children}
    </M>
  );
}

/* Cheap imperative hover-tilt — CSS vars straight to the node. */
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

/* ── The specification ledger — scrollytelling. A sticky rail (giant
   outlined counter + active title) tracks the row currently crossing the
   center band of the viewport. ──────────────────────────────────────────── */
const ROW_ACCENTS = [C.blue, C.violet, C.coral, C.gold, C.blue, C.violet, C.coral, C.gold];

function SpecLedger() {
  const [active, setActive] = useState(0);
  const f = FEATURES[active];
  return (
    <div className="ds-ledger">
      <div className="ds-ledger-rail">
        <div className="ds-ledger-sticky">
          <div className="ds-ledger-count">SPEC {f.n} / 08</div>
          <motion.div key={f.n} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 0.9, 0.35, 1] }}>
            <div className="ds-ledger-ghost" style={{ WebkitTextStrokeColor: `${ROW_ACCENTS[active]}66` }}>{f.n}</div>
            <div className="ds-ledger-title">{f.title}</div>
          </motion.div>
          <div className="ds-ledger-ticks">
            {FEATURES.map((_, i) => <span key={i} className={`ds-ledger-tick${i <= active ? ' on' : ''}`} />)}
          </div>
        </div>
      </div>
      <div className="ds-ledger-list">
        {FEATURES.map((feat, i) => (
          <motion.div key={feat.n} onViewportEnter={() => setActive(i)} viewport={{ margin: '-46% 0px -46% 0px', amount: 'some' }}>
            <motion.div
              className={`ds-row${active === i ? ' on' : ''}`}
              style={{ '--acc': ROW_ACCENTS[i] }}
              variants={revealDir(i % 2 === 0 ? -1 : 1)}
              initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
            >
              <div className="ds-row-n">{feat.n}</div>
              <div>
                <div className="ds-row-title">{feat.title}</div>
                <p className="ds-row-text">{feat.text}</p>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Assembly sequence — the rule fills stage by stage as it scrolls. ───── */
function FlowRule() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 40%'] });
  const scaleX = useSpring(scrollYProgress, { stiffness: 55, damping: 18 });
  return (
    <div className="ds-rule" ref={ref} style={{ gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` }}>
      <div className="ds-rule-line" aria-hidden />
      <motion.div className="ds-rule-fill" aria-hidden style={{ scaleX }} />
      {STAGES.map((s, i) => (
        <div className="ds-rule-stop" key={s.key}>
          <span className="ds-rule-tick" aria-hidden />
          <span className="ds-rule-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="ds-rule-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  // The liquid-logo gate plays on every fresh open; reduced-motion users go
  // straight to the page.
  // Skip the WebGL intro inside the native app (too heavy on phones) and for
  // reduced-motion users; it only plays in the browser.
  const [introDone, setIntroDone] = useState(() =>
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );

  return (
    <div className="ds-root">
      <style>{CSS}</style>
      {!introDone && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0A0C11' }} />}>
          <IntroGate onDone={() => setIntroDone(true)} />
        </Suspense>
      )}
      <Atmosphere />
      <GrainlineThread />
      <CursorLight />

      <header className="ds-bar">
        <div className="ds-bar-in">
          <BrandMark />
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
            <span key={i} className="ds-strip-item">
              <Grainline h={12} color={[C.blue, C.violet, C.coral, C.gold][i % 4]} stroke={2.6} /> {t}
            </span>
          ))}
        </div>
      </section>

      <section className="ds-mission">
        <LiquidField className="ds-liquid-mission" />
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

      <Marquee />

      <section className="ds-section" id="index">
        <div className="ds-wrap">
          <Reveal>
            <div className="ds-sec-head">
              <Eyebrow>Specification index</Eyebrow>
              <h2 className="ds-h2">Every stage of making a product — on one sheet.</h2>
            </div>
          </Reveal>
          <SpecLedger />
        </div>
      </section>

      <section className="ds-section ds-flow-sec">
        <div className="ds-wrap">
          <Reveal><Eyebrow>Assembly sequence</Eyebrow></Reveal>
          <Reveal><h2 className="ds-h2" style={{ marginBottom: 40 }}>One product, one path — measured end to end.</h2></Reveal>
          <FlowRule />
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
                  <TiltCard className={`ds-plan ds-sheen${feature ? ' ds-plan-feat' : ''}`} strength={feature ? 9 : 6}>
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
            <div className="ds-final ds-sheen">
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
        <div className="ds-foot-mark" aria-hidden>ATELIER<span className="ds-foot-mark-labs">labs</span></div>
        <div className="ds-wrap ds-foot-in">
          <BrandMark size={16} />
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
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
.ds-root { position: relative; background: ${C.ink}; color: ${C.paper}; font-family: ${BODY};
  min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
.ds-root ::selection { background: ${C.blue}; color: ${C.ink}; }
.ds-wrap { max-width: 1120px; margin: 0 auto; padding: 0 28px; }

/* atmosphere — fixed, full-bleed, behind every section */
.ds-atmosphere { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.ds-aurora { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.42; mix-blend-mode: screen; will-change: transform; }
.ds-aurora-1 { width: 58vw; height: 58vw; top: -22%; left: -12%; background: radial-gradient(circle, ${C.blue}, transparent 70%); animation: ds-drift1 28s ease-in-out infinite; }
.ds-aurora-2 { width: 48vw; height: 48vw; top: 28%; right: -16%; background: radial-gradient(circle, ${C.violet}, transparent 70%); animation: ds-drift2 34s ease-in-out infinite; }
.ds-aurora-3 { width: 44vw; height: 44vw; bottom: -14%; left: 22%; background: radial-gradient(circle, ${C.coral}, transparent 70%); animation: ds-drift3 24s ease-in-out infinite; }
.ds-aurora-4 { width: 30vw; height: 30vw; top: 58%; left: -10%; background: radial-gradient(circle, ${C.gold}, transparent 70%); opacity: 0.3; animation: ds-drift2 30s ease-in-out infinite reverse; }
@keyframes ds-drift1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(6%, 8%) scale(1.15); } }
@keyframes ds-drift2 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-8%, -6%) scale(1.12); } }
@keyframes ds-drift3 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(5%, -8%) scale(1.2); } }
.ds-grain { position: absolute; inset: -10%; opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.ds-thread { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0.55; }
/* the near pass of the thread: brighter, thicker, glowing, drawn ABOVE the
   sections, breathing slowly in scale — in front of the page, not behind it */
.ds-thread-front { z-index: 25; opacity: 0.8; will-change: opacity;
  animation: ds-thread-breathe 9s ease-in-out infinite; }
@keyframes ds-thread-breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

/* the cursor key light — a colored key with a small white-hot core */
.ds-cursorlight { position: fixed; inset: 0; z-index: 30; pointer-events: none; mix-blend-mode: screen; overflow: hidden; }
.ds-cursorlight-orb { position: absolute; width: 1400px; height: 1400px; will-change: transform;
  transform: translate3d(-2000px, -2000px, 0);
  background:
    radial-gradient(150px circle at center, rgba(255,255,255,0.05), transparent 70%),
    radial-gradient(560px circle at center, rgba(107,168,222,0.13), rgba(169,140,245,0.06) 42%, transparent 68%); }
@media (hover: none) { .ds-cursorlight { display: none; } }

/* everything else paints above the atmosphere + thread */
.ds-bar, .ds-hero, .ds-mission, .ds-marquee-clip, .ds-section, .ds-flow-sec, .ds-foot { position: relative; z-index: 2; }

/* title bar */
.ds-bar { position: sticky; top: 0; z-index: 40; background: rgba(10,12,17,0.72);
  backdrop-filter: blur(10px); border-bottom: 1px solid ${C.line}; }
.ds-bar-in { max-width: 1120px; margin: 0 auto; padding: 11px 28px; display: flex; align-items: center; justify-content: space-between; }
.ds-brand { display: inline-flex; align-items: center; gap: 10px; }
.ds-brand-stack { display: flex; flex-direction: column; line-height: 1; }
.ds-brand-name { font-family: ${DISPLAY}; font-weight: 800; letter-spacing: -0.01em; color: ${C.paper}; }
.ds-brand-labs { font-family: ${MONO}; font-size: 8.5px; letter-spacing: 0.42em; text-transform: uppercase; color: ${C.paperDim}; margin-top: 3px; }
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
/* solid dark face over a rotating conic ring — light chases the edge, the
   face never changes color. overflow:hidden crops the ring to 1.5px. */
.ds-btn-holo { position: relative; overflow: hidden; background: ${C.ink2}; color: ${C.paper}; border-color: transparent; }
.ds-btn-holo::before { content: ''; position: absolute; inset: -30%; z-index: -1;
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

/* ── hero ─────────────────────────────────────────────────────────────── */
.ds-hero { position: relative; padding: 0 0 20px; }
.ds-hero3d { position: relative; overflow: hidden; padding: 9vh 0 84px; min-height: min(88vh, 820px); }
.ds-glow { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 50% at 30% 38%, rgba(107,168,222,0.15), transparent 70%),
              radial-gradient(45% 40% at 78% 64%, rgba(255,138,107,0.12), transparent 70%); }
.ds-floor { position: absolute; left: -20%; right: -20%; bottom: -30%; height: 90%;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 46px 46px;
  transform: perspective(700px) rotateX(72deg);
  transform-origin: bottom center;
  animation: ds-floor-slide 22s linear infinite;
  -webkit-mask-image: linear-gradient(to top, black 0%, transparent 75%);
  mask-image: linear-gradient(to top, black 0%, transparent 75%);
}
@keyframes ds-floor-slide { to { background-position: 0 46px, 0 0; } }

/* god-ray beams sweeping slowly from above the table */
.ds-beams { position: absolute; inset: -12% -6% 0; pointer-events: none; mix-blend-mode: screen; filter: blur(10px);
  background:
    conic-gradient(from 196deg at 72% -8%, transparent 42%, rgba(107,168,222,0.12) 47%, transparent 53%),
    conic-gradient(from 168deg at 26% -8%, transparent 41%, rgba(169,140,245,0.10) 47%, transparent 54%),
    conic-gradient(from 182deg at 50% -12%, transparent 44%, rgba(240,197,106,0.06) 48%, transparent 52%);
  transform-origin: 50% 0; will-change: transform; animation: ds-beam-sway 16s ease-in-out infinite alternate; }
@keyframes ds-beam-sway { from { transform: rotate(-1.6deg); } to { transform: rotate(1.6deg); } }

/* liquid light fields (see LiquidField) */
.ds-liquid { position: absolute; pointer-events: none; mix-blend-mode: screen; filter: blur(24px) saturate(1.15); opacity: 0.55; }
.ds-liquid-field { position: absolute; inset: 0; filter: url(#ds-goo); }
.ds-lb { position: absolute; border-radius: 50%; will-change: transform; }
.ds-lb-1 { width: 250px; height: 250px; background: ${C.blue}; left: 6%; top: 10%; animation: ds-lb1 17s ease-in-out infinite; }
.ds-lb-2 { width: 195px; height: 195px; background: ${C.violet}; left: 36%; top: 38%; animation: ds-lb2 21s ease-in-out infinite; }
.ds-lb-3 { width: 150px; height: 150px; background: ${C.coral}; left: 18%; top: 58%; animation: ds-lb3 15s ease-in-out infinite; }
@keyframes ds-lb1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(95px, 75px) scale(1.14); } }
@keyframes ds-lb2 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-85px, -65px) scale(0.9); } }
@keyframes ds-lb3 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px, -95px) scale(1.2); } }
.ds-liquid-hero { right: -3%; top: 4%; width: 620px; height: 560px; }
.ds-liquid-mission { left: -5%; bottom: -8%; width: 520px; height: 460px; opacity: 0.4; }

/* parallax dust — near specks big/bright, far specks small/blurred */
.ds-dust { position: absolute; inset: 0; pointer-events: none; animation: ds-dust-float 12s ease-in-out infinite alternate; }
.ds-dust::before { content: ''; position: absolute; border-radius: 50%; }
.ds-dust-near { animation-duration: 10s; }
.ds-dust-near::before { width: 3px; height: 3px; background: rgba(244,242,236,0.9);
  box-shadow: 18vw 12vh 0 rgba(107,168,222,0.85), 63vw 9vh 0 rgba(244,242,236,0.5), 79vw 31vh 0 rgba(169,140,245,0.75),
    31vw 52vh 0 rgba(244,242,236,0.4), 86vw 58vh 0 rgba(255,138,107,0.65), 51vw 22vh 0 rgba(244,242,236,0.55),
    9vw 66vh 0 rgba(107,168,222,0.5), 70vw 70vh 0 rgba(240,197,106,0.6); }
.ds-dust-far { filter: blur(1px); opacity: 0.55; animation-duration: 16s; animation-direction: alternate-reverse; }
.ds-dust-far::before { width: 2px; height: 2px; background: rgba(244,242,236,0.7);
  box-shadow: 26vw 20vh 0 rgba(244,242,236,0.6), 55vw 15vh 0 rgba(107,168,222,0.55), 74vw 44vh 0 rgba(244,242,236,0.45),
    40vw 38vh 0 rgba(169,140,245,0.5), 12vw 40vh 0 rgba(244,242,236,0.4), 90vw 18vh 0 rgba(255,138,107,0.45), 60vw 62vh 0 rgba(244,242,236,0.5); }
@keyframes ds-dust-float { from { translate: 0 0; } to { translate: 0 -12px; } }

.ds-stage { position: absolute; inset: 0; perspective: 1500px; }
.ds-scene { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.ds-piece { transform-style: preserve-3d; will-change: transform; pointer-events: none; }
@keyframes ds-piece-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
.ds-piece-card { position: relative; padding: 10px 10px 16px; border-radius: 10px;
  background: linear-gradient(rgba(20,23,31,0.62), rgba(20,23,31,0.62)) padding-box,
              linear-gradient(135deg, rgba(244,242,236,0.45), rgba(244,242,236,0.05) 35%, rgba(244,242,236,0.03) 65%, rgba(244,242,236,0.22)) border-box;
  border: 1px solid transparent; backdrop-filter: blur(3px);
  box-shadow: 0 30px 60px -30px rgba(0,0,0,0.75), 0 0 44px -14px var(--glow, transparent); }
.ds-piece-card::before { content: ''; position: absolute; top: -14%; left: -8%; width: 55%; height: 45%;
  background: radial-gradient(circle, rgba(255,255,255,0.3), transparent 72%); filter: blur(6px); pointer-events: none; }

.ds-hero-in { position: relative; z-index: 4; max-width: 1120px; margin: 0 auto; padding: 0 28px; }
.ds-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-family: ${MONO}; font-size: 11.5px; letter-spacing: 0.18em; text-transform: uppercase; color: ${C.blue}; margin-bottom: 26px; }
.ds-h1 { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(44px, 8vw, 104px); line-height: 0.94;
  letter-spacing: -0.03em; text-transform: uppercase; margin: 0; color: ${C.paper}; text-shadow: 0 4px 40px rgba(0,0,0,0.5); }
.ds-line { display: block; overflow: hidden; padding-bottom: 0.06em; margin-bottom: -0.06em; }
.ds-line-in { display: inline-block; will-change: transform; }
/* misregistered print plates that slide INTO registration on load — a
   press aligning its color plates, not a glow, not a gradient fill */
.ds-h1-print { position: relative; display: inline-block; }
.ds-h1-ghost { position: absolute; left: 0; top: 0; white-space: nowrap; pointer-events: none; }
.ds-h1-ghost-a { color: ${C.blue}; opacity: 0.75; transform: translate(-3px, 2px); animation: ds-reg-a 0.9s cubic-bezier(0.16,0.9,0.35,1) 1.05s both; }
.ds-h1-ghost-b { color: ${C.coral}; opacity: 0.7; transform: translate(3px, -1.5px); animation: ds-reg-b 0.9s cubic-bezier(0.16,0.9,0.35,1) 1.05s both; }
@keyframes ds-reg-a { from { opacity: 0; transform: translate(-18px, 10px); } to { opacity: 0.75; transform: translate(-3px, 2px); } }
@keyframes ds-reg-b { from { opacity: 0; transform: translate(18px, -9px); } to { opacity: 0.7; transform: translate(3px, -1.5px); } }
.ds-h1-solid { position: relative; color: ${C.paper}; white-space: nowrap; }

.ds-hero-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; flex-wrap: wrap; margin-top: 38px; max-width: 880px; }
.ds-lede { font-size: 15px; line-height: 1.6; color: ${C.paperDim}; max-width: 430px; margin: 0; }
.ds-cta-col { display: flex; flex-direction: column; gap: 14px; }
.ds-cta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ds-note { font-family: ${MONO}; font-size: 12px; color: ${C.paperDim}; display: flex; align-items: center; gap: 9px; text-shadow: 0 1px 8px rgba(10,12,17,0.8); }
.ds-tick { width: 7px; height: 7px; background: ${C.blue}; border-radius: 50%; flex-shrink: 0; }

.ds-compass-dock { position: absolute; right: 28px; bottom: 26px; z-index: 5; }
.ds-compass { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 15px 14px; border-radius: 12px;
  background: rgba(18,21,29,0.62); border: 1px solid ${C.line}; backdrop-filter: blur(6px); }
.ds-compass-label { font-family: ${MONO}; font-size: 9px; letter-spacing: 0.1em; color: ${C.paperFaint}; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
.ds-compass-dot { width: 5px; height: 5px; border-radius: 50%; transition: background .2s ease; }
.ds-compass-read { font-family: ${MONO}; font-size: 12px; color: ${C.paperDim}; letter-spacing: 0.02em; }
.ds-compass-read b { color: ${C.blue}; font-weight: 700; }

/* spec strip */
.ds-strip { max-width: 1120px; margin: 0 auto; padding: 16px 28px; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};
  display: flex; flex-wrap: wrap; gap: 12px 30px; }
.ds-strip-item { font-family: ${MONO}; font-size: 12px; letter-spacing: 0.03em; color: ${C.paperDim}; display: inline-flex; align-items: center; gap: 8px; text-transform: uppercase; }

/* mission */
.ds-mission { padding: 100px 0 110px; background: radial-gradient(60% 100% at 50% 0%, rgba(169,140,245,0.06), transparent 60%);
  clip-path: polygon(0 0, 100% 2.2%, 100% 100%, 0 97.8%); margin-bottom: -1px; }
.ds-mission .ds-wrap { display: flex; flex-direction: column; gap: 26px; max-width: 940px; }
.ds-mission-lead { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(26px, 3.8vw, 44px); line-height: 1.14; letter-spacing: -0.015em; color: ${C.paper}; }
.ds-mission-body { font-size: clamp(18px, 2.2vw, 24px); line-height: 1.5; color: ${C.paperDim}; font-family: ${BODY}; }
.ds-mission-foot { font-family: ${MONO}; font-size: 12.5px; letter-spacing: 0.04em; color: ${C.violet}; text-transform: uppercase; }

/* kinetic marquee band — two tracks in real perspective: a dim, blurred
   reverse-side layer runs the opposite direction behind the front one, both
   pitched back like a ribbon lying across the page rather than a flat bar */
.ds-marquee-clip { overflow: hidden; padding: 44px 0; margin: -14px 0; }
.ds-marquee-stage { position: relative; perspective: 900px; transform: rotate(-1.6deg) scale(1.03); }
.ds-marquee { overflow: hidden; border-block: 1px solid ${C.line}; background: rgba(18,21,29,0.4); backdrop-filter: blur(2px); }
.ds-marquee-frontlayer { position: relative; transform: rotateX(11deg); }
.ds-marquee-back { position: absolute; inset: 0; transform: rotateX(30deg) scaleY(0.96) translateY(-10px);
  opacity: 0.28; filter: blur(1.4px); border-color: transparent; background: none; backdrop-filter: none; }
.ds-marquee-track { display: inline-flex; white-space: nowrap; animation: ds-marq 30s linear infinite; will-change: transform; }
.ds-marquee-rev { animation-direction: reverse; }
@keyframes ds-marq { to { transform: translateX(-50%); } }
.ds-marquee-half { display: inline-flex; align-items: center; }
.ds-marquee-item { display: inline-flex; align-items: center; gap: 42px; padding: 20px 0 20px 42px;
  font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(30px, 4.4vw, 56px); text-transform: uppercase; letter-spacing: -0.02em; line-height: 1; }
.ds-marquee-out { color: transparent; -webkit-text-stroke: 1.4px rgba(244,242,236,0.34); }
.ds-marquee-fill { color: ${C.paperDim}; }
@media (prefers-reduced-motion: reduce) { .ds-marquee-track { animation: none; } }

/* generic section */
.ds-section { padding: 96px 0; }
.ds-sec-head { display: flex; flex-direction: column; gap: 14px; margin-bottom: 48px; }
.ds-h2 { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(28px, 4vw, 48px); line-height: 1.04; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; max-width: 720px; color: ${C.paper}; }

/* 3D tilt cards */
.ds-tilt { perspective: 900px; }
.ds-tilt-inner { transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .1s ease-out; transform-style: preserve-3d; height: 100%; }

/* specular sheen sweep — a moving reflection, not a gradient fill */
.ds-sheen { position: relative; overflow: hidden; }
.ds-sheen::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.05) 55%, transparent 68%);
  transform: translateX(-130%); transition: transform .9s cubic-bezier(0.16,0.9,0.35,1); }
.ds-sheen:hover::after { transform: translateX(130%); }

/* the specification ledger */
.ds-ledger { display: grid; grid-template-columns: 0.85fr 1.5fr; gap: 56px; align-items: start; }
.ds-ledger-sticky { position: sticky; top: 116px; }
.ds-ledger-count { font-family: ${MONO}; font-size: 12px; letter-spacing: 0.14em; color: ${C.blue}; text-transform: uppercase; margin-bottom: 10px; }
.ds-ledger-ghost { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(110px, 13vw, 180px); line-height: 0.82; letter-spacing: -0.05em;
  color: transparent; -webkit-text-stroke-width: 1.6px; -webkit-text-stroke-color: ${C.blue}66; }
.ds-ledger-title { font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(20px, 2.2vw, 28px); letter-spacing: -0.01em; text-transform: uppercase; color: ${C.paper}; margin-top: 20px; max-width: 320px; line-height: 1.1; }
.ds-ledger-ticks { display: flex; gap: 6px; margin-top: 26px; }
.ds-ledger-tick { width: 24px; height: 2px; background: ${C.line}; transition: background .25s ease; }
.ds-ledger-tick.on { background: ${C.blue}; }
.ds-ledger-list { border-bottom: 1px solid ${C.line}; }
.ds-row { position: relative; display: grid; grid-template-columns: 60px 1fr; gap: 22px; padding: 30px 10px 30px 22px;
  border-top: 1px solid ${C.line}; transition: background .3s ease; }
.ds-row::before { content: ''; position: absolute; left: 0; top: 16%; bottom: 16%; width: 2.5px; background: var(--acc, ${C.blue});
  transform: scaleY(0); transform-origin: top; transition: transform .35s cubic-bezier(0.16,0.9,0.35,1); }
.ds-row.on { background: rgba(244,242,236,0.025); }
.ds-row.on::before { transform: scaleY(1); }
.ds-row-n { font-family: ${MONO}; font-size: 13px; font-weight: 700; color: ${C.paperFaint}; letter-spacing: 0.08em; padding-top: 3px; transition: color .3s ease; }
.ds-row.on .ds-row-n { color: var(--acc, ${C.blue}); }
.ds-row-title { font-family: ${DISPLAY}; font-weight: 700; font-size: 19px; letter-spacing: -0.01em; color: ${C.paperDim}; transition: color .3s ease; }
.ds-row.on .ds-row-title { color: ${C.paper}; }
.ds-row-text { font-size: 13.5px; line-height: 1.62; color: ${C.paperDim}; margin: 8px 0 0; max-width: 520px; }

/* flow rule — fills as it scrolls through the viewport */
.ds-flow-sec { background: ${C.ink2}; clip-path: polygon(0 2.2%, 100% 0, 100% 100%, 0 97.8%); margin: -1px 0; padding: 110px 0; }
.ds-rule { position: relative; display: grid; gap: 8px; padding-top: 26px; }
.ds-rule-line { position: absolute; top: 26px; left: 0; right: 0; height: 2px; background: ${C.line}; }
.ds-rule-fill { position: absolute; top: 26px; left: 0; right: 0; height: 2px; transform-origin: left;
  background: linear-gradient(90deg, ${C.blue}, ${C.violet}, ${C.coral}); }
.ds-rule-stop { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
.ds-rule-tick { width: 2px; height: 16px; background: ${C.blue}; margin-top: -7px; }
.ds-rule-n { font-family: ${MONO}; font-size: 12px; font-weight: 700; color: ${C.blue}; }
.ds-rule-label { font-family: ${DISPLAY}; font-weight: 700; font-size: 13.5px; letter-spacing: -0.01em; line-height: 1.15; color: ${C.paper}; }

/* pricing */
.ds-price { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.ds-plan { border-radius: 10px; background: ${C.ink2}; border: 1.5px solid ${C.line}; transition: transform .25s cubic-bezier(0.16,0.9,0.35,1), box-shadow .25s ease; }
.ds-plan:hover { transform: translateY(-5px); box-shadow: 0 34px 60px -34px rgba(0,0,0,0.8); }
.ds-plan .ds-tilt-inner { padding: 26px 24px; display: flex; flex-direction: column; height: 100%; position: relative; }
.ds-plan-feat { background: linear-gradient(160deg, ${C.ink3}, ${C.ink2}); border-color: ${C.violet}55; box-shadow: 0 30px 60px -34px rgba(169,140,245,0.5); }
.ds-plan-feat:hover { box-shadow: 0 38px 70px -34px rgba(169,140,245,0.65); }
.ds-plan-flag { position: absolute; top: -12px; left: 0; font-family: ${MONO}; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; background: ${C.violet}; color: ${C.ink}; padding: 4px 10px; border-radius: 3px; box-shadow: 0 4px 18px -4px ${C.violet}aa; z-index: 2; }
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
.ds-final { position: relative; background: ${C.ink2}; border: 1.5px solid ${C.line}; border-radius: 10px; padding: 64px 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; overflow: hidden; }
.ds-final::before { content: ''; position: absolute; inset: -40%; background: radial-gradient(55% 55% at 28% 15%, ${C.violet}, transparent 70%); opacity: 0.16; filter: blur(60px); }
.ds-final-h { position: relative; font-family: ${DISPLAY}; font-weight: 800; font-size: clamp(24px, 3.4vw, 38px); text-transform: uppercase; letter-spacing: -0.02em; line-height: 1.08; margin: 4px 0 0; max-width: 580px; color: ${C.paper}; }
.ds-final-p { position: relative; font-size: 14.5px; color: ${C.paperDim}; max-width: 460px; margin: 0 0 8px; line-height: 1.6; }

/* footer — the giant outlined lockup closes the page */
.ds-foot { border-top: 1.5px solid ${C.line}; padding: 30px 0 44px; overflow: hidden; }
.ds-foot-mark { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(64px, 12.5vw, 185px); line-height: 0.9; letter-spacing: -0.04em;
  text-align: center; color: transparent; -webkit-text-stroke: 1.5px rgba(244,242,236,0.22); user-select: none;
  display: flex; align-items: flex-end; justify-content: center; gap: 0.08em; margin-bottom: 34px; }
.ds-foot-mark-labs { font-family: ${MONO}; font-weight: 400; font-size: clamp(13px, 1.6vw, 22px); letter-spacing: 0.5em; text-transform: lowercase;
  color: ${C.violet}; -webkit-text-stroke: 0; padding-bottom: 0.35em; }
.ds-foot-in { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
.ds-foot-meta { font-family: ${MONO}; font-size: 11.5px; color: ${C.paperFaint}; letter-spacing: 0.03em; }
.ds-foot-links { display: flex; gap: 20px; }
.ds-foot-links a { font-family: ${MONO}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.paperDim}; text-decoration: none; }
.ds-foot-links a:hover { color: ${C.blue}; }

/* responsive — the 3D scene is a pointer interaction by nature; below 900px
   it steps aside for a plain, fully-readable hero. */
@media (max-width: 900px) {
  .ds-hero3d { min-height: 0; padding: 44px 0 40px; overflow: visible; }
  .ds-stage, .ds-compass-dock, .ds-glow, .ds-floor, .ds-beams, .ds-dust, .ds-liquid, .ds-thread-front { display: none; }
  .ds-h1 { font-size: clamp(38px, 10.5vw, 64px); }
  .ds-hero-row { margin-top: 26px; }
  .ds-ledger { grid-template-columns: 1fr; gap: 0; }
  .ds-ledger-rail { display: none; }
  .ds-rule { grid-template-columns: repeat(4, 1fr) !important; row-gap: 22px; }
  .ds-rule-line, .ds-rule-fill { display: none; }
  .ds-price { grid-template-columns: 1fr; }
  .ds-nav .ds-nav-link { display: none; }
  .ds-marquee-item { gap: 26px; padding-left: 26px; }
}
@media (max-width: 640px) {
  .ds-bar-in { padding: 10px 18px; }
  .ds-nav { gap: 12px; }
  .ds-wrap, .ds-hero-in { padding-left: 18px; padding-right: 18px; }
  .ds-row { grid-template-columns: 44px 1fr; padding-left: 14px; }
}
@media (max-width: 520px) {
  .ds-rule { grid-template-columns: repeat(2, 1fr) !important; }
  .ds-mission { padding: 68px 0; }
  .ds-section { padding: 64px 0; }
  .ds-flow-sec { padding: 80px 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ds-btn, .ds-btn-arrow, .ds-tilt-inner, .ds-plan, .ds-sheen::after { transition: none; }
  .ds-piece { transform: none !important; }
  .ds-h1-ghost-a, .ds-h1-ghost-b { animation: none; }
  .ds-floor, .ds-beams, .ds-lb, .ds-dust, .ds-thread-front, .ds-aurora { animation: none; }
}
`;
