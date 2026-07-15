import { useEffect, useRef, useState } from 'react';

// Debounced (~800ms) autosave, replacing the inconsistent mix of blur-save/
// instant-save/manual-save-button used across this app's forms. Call with
// the current value and a save function; returns a status string for a
// small "Saved" indicator. Skips the save on first mount (the value just
// loaded from the server, nothing changed yet).
export function useAutosave(value, onSave, delay = 800) {
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const timer = useRef(null);
  const mounted = useRef(false);
  const savedValue = useRef(value);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; savedValue.current = value; return; }
    if (JSON.stringify(value) === JSON.stringify(savedValue.current)) return;

    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    timer.current = setTimeout(async () => {
      try {
        await onSave(value);
        savedValue.current = value;
        setStatus('saved');
        setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2000);
      } catch (err) {
        console.error('Autosave failed:', err);
        setStatus('error');
      }
    }, delay);

    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return status;
}

export function AutosaveIndicator({ status }) {
  if (status === 'idle') return null;
  const map = {
    saving: { icon: 'ph-circle-notch ph-spin', text: 'Saving…', color: 'var(--ink-3)' },
    saved: { icon: 'ph-check-circle', text: 'Saved', color: 'var(--green)' },
    error: { icon: 'ph-warning-circle', text: 'Could not save', color: 'var(--red)' },
  };
  const s = map[status];
  if (!s) return null;
  return <span style={{ fontSize: 11.5, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className={`ph ${s.icon}`} /> {s.text}</span>;
}
