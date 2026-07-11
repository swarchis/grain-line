import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUserPreferences } from '../../context/UserPreferencesContext.jsx';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function VersionHistory({ productId, onApplyToCanvas }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('design_versions')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setVersions(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [productId]);

  const remove = async (versionId) => {
    const { error } = await supabase.from('design_versions').delete().eq('id', versionId);
    if (!error) setVersions(prev => prev.filter(v => v.id !== versionId));
  };

  return (
    <div className="card-raised" style={{ padding: 18 }}>
      <span className="card-title" style={{ display: 'block', marginBottom: 12 }}>Version history</span>
      {error && (
        <div className="form-hint" style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)' }}>
          {error}{error.includes('does not exist') ? ' — run migration 011_design_studio.sql in Supabase.' : ''}
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><i className="ph ph-circle-notch ph-spin" /> Loading…</div>
      ) : versions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>Every AI Studio result you save shows up here — nothing saved yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 480, overflowY: 'auto' }}>
          {versions.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderTop: '1px solid var(--border)' }}>
              <img src={v.image_url} alt={v.label} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-2)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(v.created_at)}</div>
              </div>
              <button className="btn btn-sm" onClick={() => onApplyToCanvas(v.image_url)}>Restore</button>
              <button onClick={() => remove(v.id)} title="Delete version" style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 13 }}>
                <i className="ph ph-trash" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Comments({ productId }) {
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('design_comments')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });
    if (loadError) setError(loadError.message);
    else setComments(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [productId]);

  const authorName = preferences?.full_name || user?.email?.split('@')[0] || 'You';

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase.from('design_comments').insert([{
        product_id: productId, user_id: user?.id, author_name: authorName, body: text.trim(),
      }]).select().single();
      if (insertError) throw insertError;
      setComments(prev => [...prev, data]);
      setText('');
    } catch (err) {
      setError('Could not post comment: ' + err.message);
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    const { error } = await supabase.from('design_comments').delete().eq('id', id);
    if (!error) setComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="card-raised" style={{ padding: 18 }}>
      <span className="card-title" style={{ display: 'block', marginBottom: 12 }}>Comments</span>
      {error && (
        <div className="form-hint" style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)' }}>
          {error}{error.includes('does not exist') ? ' — run migration 011_design_studio.sql in Supabase.' : ''}
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><i className="ph ph-circle-notch ph-spin" /> Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 380, overflowY: 'auto' }}>
          {comments.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>No comments yet — leave a note for your team.</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', flexShrink: 0 }}>
                {(c.author_name || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{c.author_name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(c.created_at)}</span>
                  {c.user_id === user?.id && (
                    <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 10.5 }}>Delete</button>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Leave a comment…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') post(); }} style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={post} disabled={posting || !text.trim()}>Post</button>
      </div>
    </div>
  );
}

export default function HistoryTab({ productId, onApplyToCanvas }) {
  return (
    <div style={{ maxWidth: 1080, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <VersionHistory productId={productId} onApplyToCanvas={onApplyToCanvas} />
      <Comments productId={productId} />
    </div>
  );
}
