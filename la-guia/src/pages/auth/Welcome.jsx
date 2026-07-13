import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { WaxSeal, Thumbtack, DriedFlower, PinnedPhoto } from '../../components/decor.jsx';
import { STAGES } from '../../data/mockData.js';
import { PLANS } from '../../data/plans.js';

const FEATURES = [
  { icon: 'ph-pencil-simple', color: 'var(--c-design)', title: 'AI Design Studio', text: 'Sketch, upload a reference photo, or generate a starting silhouette with AI — then edit it right on the canvas with sketch-to-design, recoloring, fabric swaps, and mockup generation.' },
  { icon: 'ph-ruler', color: 'var(--c-techpack)', title: 'Tech Pack Builder', text: 'AI drafts a full tech pack from your design and a short questionnaire — BOM, measurements, construction, print placement, trims, labels, packaging — with a live factory-readiness score.' },
  { icon: 'ph-stack', color: 'var(--c-organization)', title: 'Product Management', text: 'Real categories, colorway × size SKU matrices with generated SKUs, duplicate and archive flows, and an audit trail of every stage a product has moved through.' },
  { icon: 'ph-handshake', color: 'var(--c-vendors)', title: 'Vendor Platform', text: 'Search real manufacturers by material, MOQ, target price, location, and certifications. Compare up to five side by side and track every quote from request to accepted.' },
  { icon: 'ph-package', color: 'var(--c-materials)', title: 'Production Tracking', text: 'A Kanban flow from concept to launch, production orders with real checkpoints, and a factory-readiness gate that keeps under-ready products from shipping by accident.' },
  { icon: 'ph-chat-circle-dots', color: 'var(--c-home)', title: 'Team Chat & AI Assistant', text: 'A personal AI assistant grounded in your own brand data, plus real group chats with your team — one button, available on every page.' },
  { icon: 'ph-chart-line', color: 'var(--c-analytics)', title: 'Sales & Analytics', text: 'Connect Shopify to see real orders next to real production costs — break-even math and product performance, not a mocked-up dashboard.' },
  { icon: 'ph-users-three', color: 'var(--c-finalcheck)', title: 'Team & Permissions', text: 'Invite your team by email, assign roles, and keep every brand workspace scoped so nobody sees data they shouldn’t.' },
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

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* ─── Nav ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px', background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Logomark />
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500 }}>Grainline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <a href="#features" style={{ fontSize: 13, color: 'var(--ink-3)', display: window.innerWidth < 640 ? 'none' : 'inline' }}>Features</a>
          <a href="#pricing" style={{ fontSize: 13, color: 'var(--ink-3)', display: window.innerWidth < 640 ? 'none' : 'inline' }}>Pricing</a>
          <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }} style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Log in</a>
          <button className="btn btn-primary" onClick={() => navigate('/signup')}>Get started</button>
        </div>
      </div>

      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <Section style={{ paddingTop: 80, paddingBottom: 60 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.8fr)', gap: 40, alignItems: 'center' }}>
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 99, border: '1px solid var(--border-2)', background: 'var(--bg-1)', fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 22 }}>
              <i className="ph ph-sparkle" style={{ color: 'var(--accent)' }} /> Built for independent clothing brands
            </motion.div>
            <motion.h1 variants={fadeUp} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 500, lineHeight: 1.12, letterSpacing: '-0.01em', marginBottom: 20 }}>
              From design to drop,<br />without losing your mind.
            </motion.h1>
            <motion.p variants={fadeUp} style={{ fontSize: 16.5, color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: 480, marginBottom: 30 }}>
              Grainline is the production operating system for founders building their own clothing line — one workspace to design, spec, source, and ship, instead of a scattered stack of spreadsheets, DMs, and freelance tech-pack files.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ padding: '13px 22px', fontSize: 14.5 }} onClick={() => navigate('/signup')}>
                Get started free <i className="ph ph-arrow-right" />
              </button>
              <a href="#features" style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                See what it does <i className="ph ph-arrow-down" />
              </a>
            </motion.div>
            <motion.div variants={fadeUp} style={{ marginTop: 22, fontSize: 12, color: 'var(--ink-4)' }}>
              No credit card required — the Free plan runs one product forever.
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, rotate: -3 }}
            animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
            transition={{ duration: 0.7, ease: [0.16, 0.9, 0.35, 1], delay: 0.15 }}
            style={{ position: 'relative', justifySelf: 'center' }}
          >
            <PinnedPhoto variant="weave" tone="clay" aspect="3 / 4" tilt={-2.5} pinColor="var(--c-materials)" wrapperStyle={{ width: 260 }} />
            <motion.div
              animate={{ y: [0, -8, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', bottom: -18, right: -30 }}
            >
              <WaxSeal initials="GL" size={64} color="var(--c-vendors)" />
            </motion.div>
            <motion.div
              animate={{ rotate: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', top: -20, left: -26 }}
            >
              <DriedFlower size={46} color="var(--sage)" />
            </motion.div>
          </motion.div>
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

      {/* ─── Feature grid ────────────────────────────────────────────────── */}
      <Section id="features">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>Everything in one workspace</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 500 }}>
            Every stage of building a product, covered.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18 }}
        >
          {FEATURES.map(f => (
            <motion.div
              key={f.title} variants={fadeUp}
              className="card-raised card-hover"
              style={{ padding: 24 }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 11, background: `color-mix(in srgb, ${f.color} 14%, transparent)`, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 19 }}>
                <i className={`ph ${f.icon}`} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>{f.text}</div>
            </motion.div>
          ))}
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
              <motion.div variants={fadeUp} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 12px' }}>
                <div style={{
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
              style={{
                background: p.id === 'basic' ? 'var(--accent)' : 'var(--charcoal-2)',
                border: `1px solid ${p.id === 'basic' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 'var(--r-lg)', padding: 26, position: 'relative',
                color: p.id === 'basic' ? 'var(--charcoal)' : 'var(--cream)',
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
          className="card-raised"
          style={{ padding: '54px 40px', textAlign: 'center', position: 'relative', overflow: 'visible' }}
        >
          <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)' }}>
            <Thumbtack size={20} color="var(--accent)" />
          </div>
          <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 500, marginBottom: 14 }}>
            Your next product deserves a real workspace.
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 26, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Set up your brand in a couple minutes and start with your first product today — free, no card needed.
          </p>
          <button className="btn btn-primary" style={{ padding: '13px 26px', fontSize: 14.5 }} onClick={() => navigate('/signup')}>
            Get started <i className="ph ph-arrow-right" />
          </button>
        </motion.div>
      </Section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: '30px 24px 40px', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Logomark size={20} />
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>Grainline</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>The production operating system for independent clothing brands.</div>
          <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }} style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>Already have a workspace? Log in</a>
        </div>
      </footer>
    </div>
  );
}
