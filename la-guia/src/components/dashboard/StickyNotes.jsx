import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useProducts } from '../../context/ProductsContext.jsx';

const PAPER = '#fdf8ee';
const DEFAULT_NOTE = (slot) => ({ slot, mode: 'text', text_content: '', drawing_data: null });

// A minimal freehand pencil tool — draws directly on a canvas and reports
// the flattened PNG back up on every stroke-end so the note auto-saves
// without needing an explicit "save" click.
function DrawCanvas({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0];
    const clientX = t ? t.clientX : e.clientX;
    const clientY = t ? t.clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvasRef.current.width / rect.width), y: (clientY - rect.top) * (canvasRef.current.height / rect.height) };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.strokeStyle = '#3a3226';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL('image/png'));
  };

  return (
    <div>
      <canvas
        ref={canvasRef} width={300} height={110}
        style={{ width: '100%', height: 110, touchAction: 'none', borderRadius: 6, cursor: 'crosshair', border: '1px solid var(--border-2)', display: 'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button className="btn btn-sm" style={{ marginTop: 6, padding: '3px 9px', fontSize: 11 }} onClick={clear}>Clear</button>
    </div>
  );
}

export default function StickyNotes() {
  const { activeBrand } = useProducts();
  const [notes, setNotes] = useState([DEFAULT_NOTE(0), DEFAULT_NOTE(1), DEFAULT_NOTE(2)]);
  const [activeSlot, setActiveSlotState] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!activeBrand) return;
    try { setActiveSlotState(Number(localStorage.getItem(`grainline_notes_active_${activeBrand.id}`)) || 0); } catch { setActiveSlotState(0); }

    async function load() {
      setLoaded(false);
      const { data, error } = await supabase.from('brand_notes').select('*').eq('brand_id', activeBrand.id);
      if (!error) {
        const bySlot = [0, 1, 2].map(slot => (data || []).find(n => n.slot === slot) || DEFAULT_NOTE(slot));
        setNotes(bySlot);
      }
      setLoaded(true);
    }
    load();
  }, [activeBrand?.id]);

  const persist = (slot, updates) => {
    if (!activeBrand) return;
    supabase.from('brand_notes')
      .upsert({ brand_id: activeBrand.id, slot, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'brand_id,slot' })
      .then(({ error }) => { if (error) console.error('Failed to save note:', error.message); });
  };

  const updateNote = (slot, updates, debounce) => {
    setNotes(prev => prev.map(n => (n.slot === slot ? { ...n, ...updates } : n)));
    if (debounce) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(slot, updates), 700);
    } else {
      persist(slot, updates);
    }
  };

  const swapTo = (slot) => {
    setActiveSlotState(slot);
    if (activeBrand) { try { localStorage.setItem(`grainline_notes_active_${activeBrand.id}`, String(slot)); } catch {} }
  };

  const active = notes.find(n => n.slot === activeSlot) || DEFAULT_NOTE(activeSlot);
  const storage = notes.filter(n => n.slot !== activeSlot);

  return (
    <div className="card-raised" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>Notes from the atelier</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            title="Type" onClick={() => updateNote(active.slot, { mode: 'text' }, false)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-2)', background: active.mode === 'text' ? 'var(--bg-3)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}
          ><i className="ph ph-text-t" style={{ fontSize: 12 }} /></button>
          <button
            title="Draw" onClick={() => updateNote(active.slot, { mode: 'draw' }, false)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-2)', background: active.mode === 'draw' ? 'var(--bg-3)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}
          ><i className="ph ph-pencil-simple" style={{ fontSize: 12 }} /></button>
        </div>
      </div>

      {!loaded ? (
        <div style={{ flex: 1, minHeight: 90 }} />
      ) : active.mode === 'text' ? (
        <textarea
          value={active.text_content || ''}
          onChange={e => updateNote(active.slot, { text_content: e.target.value }, true)}
          placeholder="Jot something down…"
          style={{
            flex: 1, minHeight: 90, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--hand)', fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.4, width: '100%',
          }}
        />
      ) : (
        <DrawCanvas value={active.drawing_data} onChange={dataUrl => updateNote(active.slot, { drawing_data: dataUrl }, false)} />
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {storage.map(n => (
          <div
            key={n.slot}
            onClick={() => swapTo(n.slot)}
            title="Swap to this note"
            className="card-hover"
            style={{ flex: 1, height: 50, borderRadius: 8, border: '1px solid var(--border-2)', cursor: 'pointer', padding: '5px 7px', overflow: 'hidden', background: 'var(--bg-2)' }}
          >
            {n.mode === 'draw' && n.drawing_data ? (
              <img src={n.drawing_data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
            ) : (
              <div style={{ fontFamily: 'var(--hand)', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {n.text_content?.trim() || 'Empty note'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
