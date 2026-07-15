import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

// A generic comment thread against the new `comments` table (entity_type +
// entity_id), reused across Vendors/Quotes/Tech Packs instead of one-off
// tables per entity like design_comments/sample_annotations already are.
export default function CommentsPanel({ brandId, entityType, entityId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('comments').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: true });
    if (!error) setComments(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('comments').insert([{ brand_id: brandId, entity_type: entityType, entity_id: entityId, author_id: user?.id, body: body.trim() }]).select().single();
      if (error) throw error;
      setComments(prev => [...prev, data]);
      setBody('');
    } catch (err) {
      alert('Could not post comment: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-raised">
      <div className="card-header"><span className="card-title">Comments {comments.length > 0 && `(${comments.length})`}</span></div>
      <div className="card-body">
        {loading ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
        ) : comments.length === 0 ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 12 }}>No comments yet.</div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{c.body}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--mono)' }}>{new Date(c.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" placeholder="Add a comment…" value={body} onChange={e => setBody(e.target.value)} />
          <button className="btn btn-sm" type="submit" disabled={saving || !body.trim()}>Post</button>
        </form>
      </div>
    </div>
  );
}
