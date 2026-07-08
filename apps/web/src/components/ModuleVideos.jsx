import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Drop-in video section for a training module ──────────────────────────────
// Usage inside your module detail view:   <ModuleVideos moduleId={module.id} canEdit={true}/>
const API = '';
const authHeaders = () => ({ Authorization: 'Bearer ' + localStorage.getItem('ros_token') });

export default function ModuleVideos({ moduleId, canEdit = false }) {
  const [videos, setVideos] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ title: '', url: '' });
  const [dbx, setDbx] = useState(null); // null=closed, {path, folders, videos, loading}

  const load = useCallback(() => {
    fetch(`${API}/api/agent-10/videos?moduleId=${encodeURIComponent(moduleId)}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => setVideos(j.data || [])).catch(() => {});
  }, [moduleId]);
  useEffect(() => { load(); }, [load]);

  const addLink = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setBusy(true); setErr(null);
    const r = await fetch(`${API}/api/agent-10/videos`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, title: form.title, url: form.url }),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    setBusy(false);
    if (r.ok) { setForm({ title: '', url: '' }); setShowAdd(false); load(); }
    else setErr(r.error || 'Failed');
  };

  const uploadFile = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setErr('Keep uploads under 25MB — for longer videos paste a YouTube/Loom link instead'); return; }
    setBusy(true); setErr(null);
    const dataBase64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    const r = await fetch(`${API}/api/agent-10/videos/upload`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, title: form.title.trim() || file.name.replace(/\.\w+$/, ''), mime: file.type, dataBase64 }),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    setBusy(false);
    if (r.ok) { setForm({ title: '', url: '' }); setShowAdd(false); load(); }
    else setErr(r.error || 'Upload failed');
  };

  const browseDropbox = async (path = '') => {
    setDbx(d => ({ ...(d || {}), loading: true }));
    const r = await fetch(`${API}/api/agent-10/videos/dropbox/list?path=${encodeURIComponent(path)}`, { headers: authHeaders() })
      .then(x => x.json()).catch(e => ({ error: e.message }));
    if (r.ok) setDbx({ ...r.data, loading: false });
    else { setErr(r.error || 'Dropbox error'); setDbx(null); }
  };

  const pickDropbox = async (video) => {
    setBusy(true); setErr(null);
    const r = await fetch(`${API}/api/agent-10/videos`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, title: form.title.trim() || video.name.replace(/\.\w+$/, ''), dropboxPath: video.path }),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    setBusy(false);
    if (r.ok) { setForm({ title: '', url: '' }); setDbx(null); setShowAdd(false); load(); }
    else setErr(r.error || 'Failed');
  };

  const remove = async (id) => {
    if (!confirm('Remove this video?')) return;
    await fetch(`${API}/api/agent-10/videos/${id}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  if (!videos.length && !canEdit) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🎬 Videos {videos.length > 0 && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>({videos.length})</span>}</div>
        {canEdit && <button className="btn btn-sm" onClick={() => setShowAdd(s => !s)}>{showAdd ? 'Cancel' : '+ Add video'}</button>}
      </div>

      {showAdd && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <input className="form-input" placeholder="Video title (e.g. How to set a table — section 4)" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" placeholder="Paste YouTube / Loom link…" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={addLink} disabled={busy || !form.title.trim() || !form.url.trim()}>Add link</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>or</span>
            <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files[0])} />
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Uploading…' : '📤 Upload short video (≤25MB)'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>or</span>
            <button className="btn btn-sm" onClick={() => dbx ? setDbx(null) : browseDropbox('')} disabled={busy}>
              📁 {dbx ? 'Close Dropbox' : 'Pick from Dropbox'}
            </button>
          </div>

          {dbx && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 260, overflowY: 'auto', background: 'var(--bg)' }}>
              <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--ink-3)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => browseDropbox(dbx.path?.split('/').slice(0, -1).join('/') || '')}
                  disabled={!dbx.path} style={{ background: 'none', border: 'none', cursor: dbx.path ? 'pointer' : 'default', color: dbx.path ? 'var(--gold)' : 'var(--ink-4)', fontSize: 11 }}>← Up</button>
                <span style={{ fontFamily: 'var(--mono)' }}>{dbx.path || '/'}</span>
                {dbx.loading && <span>…</span>}
              </div>
              {(dbx.folders || []).map(f => (
                <div key={f.path} onClick={() => browseDropbox(f.path)}
                  style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>📁 {f.name}</div>
              ))}
              {(dbx.videos || []).map(v => (
                <div key={v.path} onClick={() => !busy && pickDropbox(v)}
                  style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span>🎬 {v.name}</span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{(v.size / 1048576).toFixed(1)}MB</span>
                </div>
              ))}
              {!dbx.loading && !(dbx.folders || []).length && !(dbx.videos || []).length && (
                <div style={{ padding: 14, fontSize: 12, color: 'var(--ink-3)' }}>No folders or videos here</div>
              )}
            </div>
          )}
          {err && <div style={{ fontSize: 12, color: '#E24B4A', marginTop: 8 }}>⚠ {err}</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {videos.map(v => (
          <div key={v.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '16/9', background: '#000' }}>
              {(v.source_type === 'upload' || v.source_type === 'dropbox')
                ? (v.streamUrl
                    ? <video controls preload="metadata" src={v.streamUrl} style={{ width: '100%', height: '100%' }} />
                    : <div style={{ color: '#888', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Video unavailable — check Dropbox connection</div>)
                : <iframe src={v.url} title={v.title} style={{ width: '100%', height: '100%', border: 0 }} allowFullScreen />}
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
              {canEdit && <button onClick={() => remove(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13, flexShrink: 0 }}>🗑</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
