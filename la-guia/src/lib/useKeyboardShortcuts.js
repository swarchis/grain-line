import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// "Go to" shortcuts follow the g-then-letter convention (GitHub, Linear, Gmail) —
// press g, then a second key within GO_TIMEOUT ms, to jump straight to a page.
const GO_MAP = {
  h: '/', d: '/design', c: '/collections', t: '/tech-packs', m: '/materials',
  v: '/vendors', q: '/quotes', p: '/production', r: '/readiness', s: '/settings',
};
const GO_TIMEOUT = 800;

export const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], macKeys: ['⌘', 'K'], description: 'Open command palette & search' },
  { keys: ['?'], description: 'Show this shortcuts list' },
  { keys: ['G', 'H'], description: 'Go to Home' },
  { keys: ['G', 'D'], description: 'Go to Designs' },
  { keys: ['G', 'C'], description: 'Go to Collections' },
  { keys: ['G', 'T'], description: 'Go to Tech Packs' },
  { keys: ['G', 'M'], description: 'Go to Material Library' },
  { keys: ['G', 'V'], description: 'Go to Vendors' },
  { keys: ['G', 'Q'], description: 'Go to Quotes & Pricing' },
  { keys: ['G', 'P'], description: 'Go to Production Orders' },
  { keys: ['G', 'R'], description: 'Go to Readiness Review' },
  { keys: ['G', 'S'], description: 'Go to Settings' },
  { keys: ['Esc'], description: 'Close any open dialog' },
];

function isTypingTarget(el) {
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useKeyboardShortcuts({ onOpenPalette, onOpenHelp } = {}) {
  const navigate = useNavigate();
  const pendingG = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette?.();
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (pendingG.current) {
        pendingG.current = false;
        clearTimeout(timerRef.current);
        const path = GO_MAP[e.key.toLowerCase()];
        if (path) { e.preventDefault(); navigate(path); }
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        pendingG.current = true;
        timerRef.current = setTimeout(() => { pendingG.current = false; }, GO_TIMEOUT);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        onOpenHelp?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); clearTimeout(timerRef.current); };
  }, [navigate, onOpenPalette, onOpenHelp]);
}
