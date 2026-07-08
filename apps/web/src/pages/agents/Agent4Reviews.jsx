import React, { useState, useEffect, useCallback } from 'react';
import { agent4 } from '../../lib/api.js';

// ── Review card component ─────────────────────────────────────────────────────

function ReviewCard({ review, onGenerate, onSaveDraft, onPost, onDismiss }) {
  const [editing, setEditing]   = useState(false);
  const [draftText, setDraft]   = useState(review.response_draft || '');
  const [posting, setPosting]   = useState(false);
  const [generating, setGen]    = useState(false);

  const actionable = review.status === 'pending' || review.status === 'draft';
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const platformLabel = { google: 'Google', yelp: 'Yelp', opentable: 'OpenTable' }[review.platform];
  const dateStr = new Date(review.review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const borderColor = review.urgent && (review.status === 'pending' || review.status === 'draft') ? 'var(--red)'
    : review.status === 'responded' ? 'var(--green)'
    : review.response_draft ? 'var(--gold)' : 'var(--border)';

  const handleGenerate = async () => {
    setGen(true);
    try {
      const res = await onGenerate(review.id);
      setDraft(res.draft || '');
    } finally { setGen(false); }
  };

  const handlePost = async () => {
    if (editing) {
      await onSaveDraft(review.id, draftText);
      setEditing(false);
    }
    setPosting(true);
    try { await onPost(review.id); }
    finally { setPosting(false); }
  };

  return (
    <div className="card" style={{ borderLeft: `3px solid ${borderColor}`, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ padding: '13px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: { google: '#f0f4ff', yelp: '#fff0f0', opentable: '#fff4e8' }[review.platform],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13,
          color: { google: 'var(--blue)', yelp: '#c41200', opentable: '#d4350a' }[review.platform],
        }}>
          {{ google: 'G', yelp: 'Y', opentable: 'OT' }[review.platform]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{review.reviewer}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            {platformLabel} · {dateStr}
            {review.urgent && <span style={{ color: 'var(--red)', fontWeight: 700 }}> · URGENT</span>}
          </div>
          <div style={{ color: '#e8a020', fontSize: 14, letterSpacing: 1, marginTop: 3 }}>{stars}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <span className={`tag tag-${{ pending: 'gold', responded: 'green', generating: 'blue', draft: 'gold' }[review.status] || 'gray'}`}>
            {{ pending: 'Needs response', responded: 'Responded', generating: 'Generating…', draft: 'Draft ready', dismissed: 'Dismissed' }[review.status] || review.status}
          </span>
          <span className={`tag tag-${{ positive: 'green', negative: 'red', neutral: 'gray' }[review.sentiment]}`}>
            {review.sentiment}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 16px 14px' }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>{review.text}</p>

        {/* Employee mentions */}
        {review.employee_mentions?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {review.employee_mentions.map((em, i) => (
              <span key={i} className={`tag tag-${{ positive: 'green', negative: 'red', neutral: 'gray' }[em.sentiment]}`}>
                👤 {em.name} · {em.sentiment}
              </span>
            ))}
          </div>
        )}

        {/* Draft / response */}
        {(review.response_draft || review.response_posted || review.status === 'generating') && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 6 }}>
              ✦ AI draft{review.status === 'responded' ? ' (posted)' : ' (pending approval)'}
            </div>
            {review.status === 'generating' ? (
              <p style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Analyzing and crafting the best response…</p>
            ) : editing ? (
              <textarea
                className="form-textarea"
                value={draftText}
                onChange={e => setDraft(e.target.value)}
                rows={4}
                style={{ marginBottom: 6 }}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {review.response_posted || review.response_draft}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {actionable && !review.response_draft && (
            <button className="btn btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? '…' : '✦ Generate draft'}
            </button>
          )}
          {actionable && review.response_draft && !editing && (
            <button className="btn btn-sm" onClick={() => { setEditing(true); setDraft(review.response_draft); }}>Edit</button>
          )}
          {editing && (
            <button className="btn btn-sm" onClick={() => { onSaveDraft(review.id, draftText); setEditing(false); }}>Save edit</button>
          )}
          {actionable && review.response_draft && (
            <>
              <button className="btn btn-sm" onClick={handleGenerate} disabled={generating}>↺ Regenerate</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm btn-danger" onClick={() => onDismiss(review.id)}>Dismiss</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handlePost}
                disabled={posting}
              >
                {posting ? '…' : '✓ Approve & post'}
              </button>
            </>
          )}
          {review.status === 'responded' && (
            <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
              ✓ Response posted {dateStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Agent4Reviews() {
  const [reviews,   setReviews]   = useState([]);
  const [filter,    setFilter]    = useState('pending');
  const [platform,  setPlatform]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [fetching,  setFetching]  = useState(false);
  const [stats,     setStats]     = useState(null);
  const [toast,     setToast]     = useState(null);
  const [tab,       setTab]       = useState('queue'); // queue | all | analytics | employees

  const showToast = (msg, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  };

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.status = filter === 'critical' ? undefined : filter === 'pending' ? 'pending,draft,generating' : filter;
      if (filter === 'critical') params.rating = 2; // will fetch 1-2 star
      if (platform) params.platform = platform;
      const data = await agent4.reviews(params);
      setReviews(data);
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  }, [filter, platform]);

  const loadStats = useCallback(async () => {
    try { setStats(await agent4.summary()); }
    catch(_) {}
  }, []);

  useEffect(() => { loadReviews(); loadStats(); }, [loadReviews, loadStats]);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const r = await agent4.fetchNew();
      showToast(`Fetched: Google +${r.google}, Yelp +${r.yelp}`);
      await loadReviews(); await loadStats();
    } catch(e) { showToast(e.message, true); }
    finally { setFetching(false); }
  };

  const handleGenerateAll = async () => {
    showToast('Generating all drafts…');
    try {
      const r = await agent4.generateBatch();
      showToast(`Generated ${r.filter(x => x.ok).length} drafts`);
      await loadReviews();
    } catch(e) { showToast(e.message, true); }
  };

  const handleGenerate = async (id) => {
    const res = await agent4.generate(id);
    await loadReviews();
    return res;
  };

  const handleSaveDraft = async (id, draft) => {
    await agent4.saveDraft(id, draft);
    await loadReviews();
  };

  const handlePost = async (id) => {
    await agent4.post(id);
    showToast('Response posted!');
    await loadReviews(); await loadStats();
  };

  const handleDismiss = async (id) => {
    await agent4.dismiss(id);
    await loadReviews(); await loadStats();
  };

  const pending = reviews.filter(r => r.status === 'pending' || r.status === 'draft' || r.status === 'generating').length;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Reputation Management</h1>
          <div className="page-sub">
            {pending} pending · {reviews.length} total loaded
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={handleFetch} disabled={fetching}>
            {fetching ? '⟳ Fetching…' : '⟳ Fetch reviews'}
          </button>
          <button className="btn" onClick={handleGenerateAll}>✦ Generate all drafts</button>
          <button className="btn btn-primary" onClick={async () => {
            const drafts = reviews.filter(r => (r.status === 'pending' || r.status === 'draft') && r.response_draft);
            for (const r of drafts) await handlePost(r.id);
          }}>Approve all drafts</button>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        {stats && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Pending response</div>
              <div className="stat-value" style={{ color: stats.pending > 0 ? 'var(--gold)' : 'inherit' }}>
                {stats.pending || 0}
              </div>
              <div className={`stat-delta ${stats.urgent > 0 ? 'delta-down' : 'delta-up'}`}>
                {stats.urgent > 0 ? `${stats.urgent} urgent` : 'All caught up'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total reviews</div>
              <div className="stat-value">{stats.total || 0}</div>
              <div className="stat-delta delta-muted">All platforms</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg rating</div>
              <div className="stat-value">{stats.avg_rating || '—'}★</div>
              <div className={`stat-delta ${parseFloat(stats.avg_rating) >= 4.5 ? 'delta-up' : 'delta-muted'}`}>
                {parseFloat(stats.avg_rating) >= 4.5 ? '↑ Excellent' : 'Target: 4.5+'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Responded</div>
              <div className="stat-value">{stats.responded || 0}</div>
              <div className="stat-delta delta-up">via this agent</div>
            </div>
          </div>
        )}

        {/* Alert for pending */}
        {pending > 0 && (
          <div className="alert alert-gold">
            <span>⚡</span>
            <div>
              <strong>{pending} review{pending > 1 ? 's' : ''} need{pending === 1 ? 's' : ''} a response.</strong>
              {' '}Click <strong>✦ Generate all drafts</strong> to have Claude draft all responses, then review and approve each one.
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 4 }}>Filter:</span>
          {[
            { key: 'pending',   label: 'Needs response' },
            { key: 'critical',  label: '⚠ Critical (1–2★)' },
            { key: 'all',       label: 'All' },
            { key: 'responded', label: 'Responded' },
          ].map(f => (
            <button
              key={f.key}
              className="btn btn-sm"
              style={filter === f.key ? { background: 'var(--ink)', color: 'var(--card)', borderColor: 'var(--ink)' } : {}}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <select className="btn btn-sm" style={{ cursor: 'pointer' }} value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">All platforms</option>
              <option value="google">Google</option>
              <option value="yelp">Yelp</option>
              <option value="opentable">OpenTable</option>
            </select>
          </div>
        </div>

        {/* Review list */}
        {loading ? (
          <div className="spinner" />
        ) : reviews.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📬</div>
            <div className="empty-state-title">No reviews here</div>
            <div className="empty-state-sub">
              Add Google API credentials and click "Fetch reviews" to load real reviews.
              <br />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleFetch}>
                Fetch reviews
              </button>
            </div>
          </div>
        ) : (
          reviews.map(r => (
            <ReviewCard
              key={r.id}
              review={r}
              onGenerate={handleGenerate}
              onSaveDraft={handleSaveDraft}
              onPost={handlePost}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast" style={{ background: toast.err ? 'var(--red)' : 'var(--text)' }}>
          {toast.err ? '⚠' : '✓'} {toast.msg}
        </div>
      )}
    </>
  );
}
