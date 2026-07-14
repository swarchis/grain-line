import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Shared shell for every auth screen — the landing page's "Draft Sheet" look,
   scaled down: a dark ink brand panel on the left (grid, registration marks,
   the grainline mark, a single line of intent) and the form on cool bone paper
   to the right. Collapses to a single column on small screens. Palette is
   self-contained so these pages read the same regardless of app theme. */

const C = {
  sheet: '#E9EAE4',
  ink: '#15171B',
  ink2: '#565B63',
  cream: '#E9EAE4',
  line: 'rgba(233,234,228,0.12)',
  blue: '#6FA2C4',
};
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'Space Mono', ui-monospace, monospace";

function Grainline({ h = 26, color = C.blue, stroke = 2.4 }) {
  const w = h * 0.36;
  return (
    <svg width={w} height={h} viewBox="0 0 18 50" fill="none" style={{ display: 'block' }} aria-hidden>
      <path d="M9 6 V44 M3 12 L9 4 L15 12 M3 38 L9 46 L15 38" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ease = [0.16, 0.9, 0.35, 1];

export default function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  const reduce = useReducedMotion();
  const rise = reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="al-root">
      <style>{CSS}</style>

      {/* brand panel */}
      <div className="al-brand">
        <div className="al-brand-grid" aria-hidden />
        <span className="al-reg al-reg-tl" aria-hidden /><span className="al-reg al-reg-br" aria-hidden />
        <motion.div className="al-brand-in" initial={reduce ? undefined : { opacity: 0 }} animate={reduce ? undefined : { opacity: 1 }} transition={{ duration: 0.6, ease }}>
          <div className="al-brand-top">
            <Grainline h={24} />
            <span className="al-brand-name">Atelier</span>
            <span className="al-brand-tag">PRODUCTION&nbsp;OS</span>
          </div>
          <motion.h2 className="al-brand-head" {...rise} transition={{ duration: 0.6, delay: 0.08, ease }}>
            From flat sketch<br />to finished run.
          </motion.h2>
          <motion.p className="al-brand-note" {...rise} transition={{ duration: 0.6, delay: 0.16, ease }}>
            Design, spec, source, and make a product in one place.
          </motion.p>
          <div className="al-brand-strip">
            {['Design studio', 'Tech packs', 'Sourcing', 'Production'].map(t => (
              <span key={t} className="al-chip"><Grainline h={11} color="#8FB6D2" stroke={2.6} /> {t}</span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* form panel */}
      <div className="al-form-wrap">
        <motion.div className="al-form" {...rise} transition={{ duration: 0.55, ease }}>
          <div className="al-mark-mobile">
            <Grainline h={22} color="var(--accent)" />
            <span>Atelier</span>
          </div>
          {eyebrow && <div className="al-eyebrow">{eyebrow}</div>}
          <h1 className="al-title">{title}</h1>
          {subtitle && <p className="al-sub">{subtitle}</p>}
          <div className="al-body">{children}</div>
          {footer && <div className="al-footer">{footer}</div>}
        </motion.div>
      </div>
    </div>
  );
}

const CSS = `
.al-root { min-height: 100vh; display: grid; grid-template-columns: 1.05fr 1fr; background: ${C.sheet}; font-family: 'Inter', system-ui, sans-serif; }

.al-brand { position: relative; background: ${C.ink}; color: ${C.cream}; overflow: hidden; display: flex; align-items: center; }
.al-brand-grid { position: absolute; inset: 0; opacity: 0.5;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 30px 30px; }
.al-reg { position: absolute; width: 16px; height: 16px; border-color: rgba(233,234,228,0.25); }
.al-reg-tl { top: 22px; left: 22px; border-top: 1.25px solid; border-left: 1.25px solid; }
.al-reg-br { bottom: 22px; right: 22px; border-bottom: 1.25px solid; border-right: 1.25px solid; }
.al-brand-in { position: relative; padding: 0 clamp(40px, 6vw, 76px); max-width: 520px; }
.al-brand-top { display: flex; align-items: center; gap: 10px; margin-bottom: 42px; }
.al-brand-name { font-family: ${DISPLAY}; font-weight: 800; font-size: 20px; letter-spacing: -0.01em; }
.al-brand-tag { font-family: ${MONO}; font-size: 9.5px; letter-spacing: 0.16em; color: rgba(233,234,228,0.5); padding: 3px 7px; border: 1px solid rgba(233,234,228,0.18); border-radius: 3px; }
.al-brand-head { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(30px, 3.6vw, 46px); line-height: 0.98; letter-spacing: -0.025em; text-transform: uppercase; margin: 0 0 18px; }
.al-brand-note { font-size: 15px; line-height: 1.6; color: #A9B4BC; max-width: 340px; margin: 0 0 34px; }
.al-brand-strip { display: flex; flex-wrap: wrap; gap: 10px 18px; }
.al-chip { font-family: ${MONO}; font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: rgba(233,234,228,0.72); display: inline-flex; align-items: center; gap: 7px; }

.al-form-wrap { display: flex; align-items: center; justify-content: center; padding: 40px 28px; }
.al-form { width: 100%; max-width: 400px; }
.al-mark-mobile { display: none; align-items: center; gap: 9px; font-family: ${DISPLAY}; font-weight: 800; font-size: 20px; color: var(--ink); margin-bottom: 28px; }
.al-eyebrow { font-family: ${MONO}; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
.al-title { font-family: ${DISPLAY}; font-weight: 800; font-size: 30px; letter-spacing: -0.022em; line-height: 1.05; color: var(--ink); margin: 0 0 8px; }
.al-sub { font-size: 14px; color: var(--ink-3); line-height: 1.6; margin: 0 0 26px; }
.al-body { margin-bottom: 4px; }
.al-footer { text-align: center; margin-top: 20px; font-size: 13px; color: var(--ink-3); }

@media (max-width: 860px) {
  .al-root { grid-template-columns: 1fr; }
  .al-brand { display: none; }
  .al-mark-mobile { display: flex; }
  .al-form-wrap { min-height: 100vh; padding-top: 56px; align-items: flex-start; }
}
`;
