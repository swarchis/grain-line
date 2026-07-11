import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '../context/OnboardingContext.jsx';

const CARD_W = 320;
const GAP = 14;

function findTarget(step) {
  if (!step?.selector) return null;
  return document.querySelector(step.selector);
}

export default function OnboardingOverlay() {
  const { active, step, stepIndex, total, next, back, skipTour } = useOnboarding();
  const location = useLocation();
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const pollRef = useRef(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Text updates the instant the step changes — only the highlight box and
  // card position animate toward the new target, so there's never a blank
  // gap between steps, just the card visibly sliding to where it's going.
  //
  // The scroll itself is instant (not smooth) so its effect on layout is
  // synchronous — `scrollIntoView` with `behavior: 'auto'` updates the
  // scroll position before the next line runs, so `getBoundingClientRect()`
  // right after it already reflects the post-scroll position. An earlier
  // version used smooth-scroll plus an async "wait for it to settle" step;
  // clicking through steps faster than that settle time could resolve
  // raced two in-flight waits against each other and left the highlight
  // stuck on a stale step. Reading the position synchronously removes the
  // race entirely — the highlight box's own CSS transition still animates
  // it gliding to the new spot, so the motion looks the same either way.
  useEffect(() => {
    if (!active || !step) return;
    clearTimeout(pollRef.current);
    if (step.path && location.pathname !== step.path) return;

    let attempts = 0;
    const tryFind = () => {
      const el = findTarget(step);
      if (el) {
        let r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // Leave room for the 320px-wide card that sits above/below the
        // target — if the target is close enough to an edge that the card
        // wouldn't fit, scroll it toward the center instead of just barely
        // into view.
        const outOfView = r.top < 90 || r.bottom > vh - 230;
        if (outOfView) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          r = el.getBoundingClientRect();
        }
        setRect(r);
        return;
      }
      if (!step.selector) { setRect(null); return; }
      attempts += 1;
      if (attempts < 30) pollRef.current = setTimeout(tryFind, 40);
      else setRect(null); // give up gracefully — falls back to a centered card
    };
    tryFind();
    return () => clearTimeout(pollRef.current);
  }, [active, step, location.pathname]);

  // Keeps the highlight glued to its target if the founder manually scrolls
  // or resizes the window mid-step (the initial placement above only runs
  // once per step change). Attached exactly once for the component's whole
  // lifetime and reads the current step through a ref rather than a
  // per-step closure — re-attaching this listener on every step change
  // relied on cleanup-and-reattach happening in perfect lockstep with state
  // updates, and clicking through steps faster than a render could land
  // left it bound to a stale step's element. Reading through a ref can
  // never go stale: whatever's on screen right now is what it measures.
  useEffect(() => {
    const onReposition = () => {
      const s = stepRef.current;
      const el = s?.selector && findTarget(s);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, []);

  // Compute where the card should sit for the current rect (or centered if none).
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      setCardPos({ top: vh / 2 - 100, left: vw / 2 - CARD_W / 2 });
      return;
    }
    const below = rect.bottom + GAP;
    const fitsBelow = below + 200 < vh;
    const top = fitsBelow ? below : Math.max(GAP, rect.top - GAP - 200);
    const left = Math.min(Math.max(rect.left, GAP), vw - CARD_W - GAP);
    setCardPos({ top, left });
  }, [rect]);

  if (!active || !step || !cardPos) return null;

  const hasSpotlight = !!rect;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {hasSpotlight ? (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: rect.top - 4, background: 'rgba(20,17,12,0.55)', transition: 'height 0.25s ease' }} />
          <div style={{ position: 'fixed', top: rect.bottom + 4, left: 0, right: 0, bottom: 0, background: 'rgba(20,17,12,0.55)', transition: 'top 0.25s ease' }} />
          <div style={{ position: 'fixed', top: rect.top - 4, left: 0, width: rect.left - 4, height: rect.height + 8, background: 'rgba(20,17,12,0.55)', transition: 'all 0.25s ease' }} />
          <div style={{ position: 'fixed', top: rect.top - 4, left: rect.right + 4, right: 0, height: rect.height + 8, background: 'rgba(20,17,12,0.55)', transition: 'all 0.25s ease' }} />
          <div style={{
            position: 'fixed', top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8,
            border: '2px solid var(--accent)', borderRadius: 10, boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)',
            transition: 'all 0.25s ease',
          }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,12,0.6)', transition: 'opacity 0.25s ease' }} />
      )}

      <div
        className="card-raised"
        style={{
          position: 'fixed', top: cardPos.top, left: cardPos.left, width: CARD_W, padding: '20px 22px',
          zIndex: 2001, boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto',
          transition: 'top 0.25s cubic-bezier(.2,.8,.3,1), left 0.25s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Step {stepIndex + 1} of {total}
          </span>
          <button onClick={skipTour} title="Skip tour" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 15 }}>
            <i className="ph ph-x" />
          </button>
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--ink)', marginBottom: 8 }}>{step.title}</div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 18 }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={skipTour} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12.5, textDecoration: 'underline' }}>
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIndex > 0 && <button className="btn btn-sm" onClick={back}>Back</button>}
            <button className="btn btn-sm btn-primary" onClick={next}>
              {stepIndex >= total - 1 ? 'Finish' : 'Next'} <i className="ph ph-arrow-right" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
