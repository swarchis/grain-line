import React, { useState, useEffect, useCallback } from 'react';
import { social } from '../../lib/api.js';

export default function InstagramTab() {
  const [status, setStatus]     = useState(null);
  const [insights, setInsights] = useState(null);
  const [media, setMedia]       = useState(null);
  const [err, setErr]           = useState(null);
  const [pub, setPub]           = useState({ imageUrl: '', caption: '' });
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished]   = useState(null);
  const [alsoFb, setAlsoFb] = useState(true);
  const [fbResult, setFbResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const s = await social.status();
      setStatus(s);
      if (s?.instagram?.status === 'active') {
        social.igInsights().then(setInsights).catch(e => setErr(e.message));
        social.igMedia().then(setMedia).catch(e => setErr(e.message));
      }
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handlePublish = async () => {
    if (!pub.imageUrl.trim()) return;
    setPublishing(true); setErr(null); setPublished(null);
    try {
      const r = await social.igPublish({ imageUrl: pub.imageUrl.trim(), caption: pub.caption });
      setPublished(r);
      setFbResult(null);
      if (alsoFb && status?.facebook?.status === 'active') {
        try { setFbResult(await social.fbPublish({ imageUrl: pub.imageUrl.trim(), message: pub.caption })); }
        catch(e) { setFbResult({ error: e.message }); }
      }
      setPub({ imageUrl: '', caption: '' });
      social.igMedia().then(setMedia).catch(() => {});
    } catch (e) { setErr(e.message); }
    finally { setPublishing(false); }
  };

  if (!status) return <div className="spinner" style={{ margin: '50px auto' }} />;

  if (status.instagram?.status !== 'active') return (
    <div className="empty-state">
      <div className="empty-state-icon">📸</div>
      <div className="empty-state-title">Instagram not connected</div>
      <div className="empty-state-sub">Connect your Instagram business account to read performance and publish directly.</div>
      <a href="/setup" className="btn btn-primary" style={{ marginTop: 14, textDecoration: 'none' }}>Go to Setup →</a>
    </div>
  );

  const reach30 = insights?.metrics?.find(m => m.name === 'reach')?.total_value?.value;
  const views30 = insights?.metrics?.find(m => m.name === 'profile_views')?.total_value?.value;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 }}>
        Connected as <strong style={{ color: 'var(--ink)' }}>@{insights?.account || status.instagram.accounts?.[0]?.igUsername}</strong>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Followers', val: insights?.followers },
          { label: 'Posts', val: insights?.mediaCount },
          { label: 'Reach (30d)', val: reach30 },
          { label: 'Profile views (30d)', val: views30 },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}>{s.val != null ? Number(s.val).toLocaleString() : '—'}</div>
          </div>
        ))}
      </div>

      {/* Publish */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📤 Publish a post</div>
        <input className="form-input" placeholder="Public image URL (JPG/PNG — Dropbox temp links from the Media library work)" value={pub.imageUrl}
          onChange={e => setPub(p => ({ ...p, imageUrl: e.target.value }))} style={{ marginBottom: 8, fontFamily: 'var(--mono)', fontSize: 12 }} />
        <div style={{ fontSize: 11, color: 'var(--ink-3)', margin: '-4px 0 8px' }}>
          Instagram requires an image on every post — the button stays disabled until a URL is pasted. Tip: open 📁 Media library, pick a photo, copy its link.
        </div>
        <textarea className="form-input" placeholder="Caption…" rows={3} value={pub.caption}
          onChange={e => setPub(p => ({ ...p, caption: e.target.value }))} style={{ marginBottom: 8, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status?.facebook?.status === 'active' && (
            <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={alsoFb} onChange={e => setAlsoFb(e.target.checked)} />
              Also post to Facebook Page
            </label>
          )}
          <button className="btn btn-primary btn-sm" onClick={handlePublish} disabled={publishing || !pub.imageUrl.trim()}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
          {published && <a href={published.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3ECF8E', fontWeight: 600 }}>✓ Live — view post →</a>}
          {fbResult && !fbResult.error && <a href={fbResult.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1877F2', fontWeight: 600 }}>✓ On Facebook →</a>}
          {fbResult?.error && <span style={{ fontSize: 11, color: '#E8A020' }}>IG ✓ but Facebook failed: {fbResult.error}</span>}
          {err && <span style={{ fontSize: 12, color: '#E24B4A' }}>⚠ {err}</span>}
        </div>
      </div>

      {/* Recent media grid */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent posts</div>
      {!media ? <div className="spinner" style={{ margin: '30px auto' }} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {(media.media || []).map(m => (
            <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', textDecoration: 'none', background: 'var(--bg-2)' }}>
              <div style={{ aspectRatio: '1/1', background: '#111' }}>
                <img src={m.thumbnail_url || m.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              </div>
              <div style={{ padding: '7px 10px', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
                <span>❤️ {m.like_count ?? '—'}</span>
                <span>💬 {m.comments_count ?? '—'}</span>
                <span>{m.timestamp ? new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
