import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useContent } from '../context/ContentContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { supabase } from '../lib/supabase.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { PhotoPanel } from '../components/decor.jsx';

const TABS = [
  { key: 'hub', label: 'Grid Preview', icon: 'ph-squares-four' },
  { key: 'calendar', label: 'Drop Calendar', icon: 'ph-calendar' },
  { key: 'accounts', label: 'Accounts', icon: 'ph-link' },
];

const PLATFORM_ICON = { instagram: 'ph-instagram-logo', tiktok: 'ph-tiktok-logo', youtube: 'ph-youtube-logo' };
const STATUS_TAG = { Scheduled: 'tag-blue', Posted: 'tag-green', Draft: 'tag-neutral' };
const DEFAULT_PLATFORMS = ['instagram', 'tiktok', 'youtube'];

export default function ContentHub() {
  const location = useLocation();
  const [tab, setTab] = useState('hub');
  const [showComposer, setShowComposer] = useState(false);
  const { products, activeBrand } = useProducts();
  const { orders } = useProduction();
  const { accounts, posts, loading, connectAccount, disconnectAccount, schedulePost, updatePostStatus, refresh: refreshContent } = useContent();

  const [form, setForm] = useState({ platform: 'instagram', scheduledFor: '', caption: '', productId: '' });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Catch OAuth Returns from Social Platforms
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('social_success');
    const error = params.get('social_error');
    
    if (success === 'true' && activeBrand) {
      const platform = params.get('platform');
      const handle = params.get('handle') || 'Connected';
      const brandId = params.get('brandId');

      if (brandId === activeBrand.id) {
        connectAccount(platform, handle).then(() => {
          window.history.replaceState({}, '', '/content');
          setTab('accounts');
        });
      }
    } else if (error) {
      alert(`Failed to connect social account. Reason: ${error}`);
      window.history.replaceState({}, '', '/content');
    }
  }, [location.search, activeBrand]);

  const mergedAccounts = DEFAULT_PLATFORMS.map(p => {
    const dbAcc = accounts.find(a => a.platform === p);
    return dbAcc || { platform: p, connected: false, handle: '', followers: 0 };
  });

  const handleConnect = async (platform) => {
    // If keys are missing, we prompt manually. If you add the keys to .env, this redirects to real OAuth
    window.location.href = `http://localhost:3001/api/social/auth/${platform}?brandId=${activeBrand?.id}`;
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const uploadMedia = async (fileObj) => {
    const fileName = `${activeBrand.id}-${Date.now()}.png`;
    const { data, error } = await supabase.storage
      .from('content_media')
      .upload(fileName, fileObj, { upsert: true });

    if (error) throw new Error("Image Upload Failed: " + error.message);
    const { data: { publicUrl } } = supabase.storage.from('content_media').getPublicUrl(fileName);
    return publicUrl;
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let finalImageUrl = null;
      if (file) {
        finalImageUrl = await uploadMedia(file);
      }

      await schedulePost({
        platform: form.platform,
        scheduled_for: new Date(form.scheduledFor).toISOString(),
        caption: form.caption,
        product_id: form.productId || null,
        status: 'Scheduled',
        image_url: finalImageUrl
      });

      setForm({ platform: 'instagram', scheduledFor: '', caption: '', productId: '' });
      setFile(null); setPreviewUrl(null);
      setShowComposer(false);
    } catch (err) {
      alert('Could not schedule post: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'Scheduled' ? 'Posted' : currentStatus === 'Posted' ? 'Draft' : 'Scheduled';
    try { await updatePostStatus(id, nextStatus); } catch (err) { alert(err.message); }
  };

  // Merge content posts and production orders to create the "Drop Timeline"
  const calendarItems = [
    ...posts.map(p => ({ type: 'post', date: new Date(p.scheduled_for), data: p })),
    ...(orders || []).filter(o => o.due_date).map(o => ({ type: 'production', date: new Date(o.due_date), data: o }))
  ].sort((a, b) => b.date - a.date);

  const instagramPosts = posts.filter(p => p.platform === 'instagram' && p.image_url);

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-content)' }}>Marketing & GTM</div>
            <h1 className="page-title">Content Planner</h1>
          </div>
          <div className="page-sub">Visually plan drops alongside production dates</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => { setTab('calendar'); setShowComposer(true); }}><i className="ph ph-plus" /> New content</button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-content)" />

      <div className="content">
        {tab === 'hub' && (
          <>
            <div className="section-label">Instagram Grid Preview</div>
            {instagramPosts.length === 0 ? (
              <EmptyState icon="ph-squares-four" color="var(--c-content)" title="No visual content yet" sub="Upload photos to Instagram posts in the Calendar tab to see how your feed will look." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 640, background: 'var(--border)', border: '1px solid var(--border)', padding: 4 }}>
                {instagramPosts.map(p => (
                  <div key={p.id} style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--bg-1)', overflow: 'hidden' }}>
                    <img src={p.image_url} alt="Grid post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {p.status !== 'Posted' && (
                       <div style={{ position: 'absolute', top: 6, right: 6 }}>
                          <span className={`tag ${STATUS_TAG[p.status]}`} style={{ padding: '2px 6px', fontSize: 10 }}>{p.status}</span>
                       </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'calendar' && (
          <>
            {showComposer && (
              <form className="card-raised enter" style={{ marginBottom: 24 }} onSubmit={handleSchedule}>
                <div className="corner-fold" style={{ '--fold-color': 'var(--c-content)' }} />
                <div className="card-header">
                  <span className="card-title">Plan Marketing Asset</span>
                  <button type="button" onClick={() => setShowComposer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}><i className="ph ph-x" /></button>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    {/* Image Uploader */}
                    <div style={{ width: 140, flexShrink: 0 }}>
                      <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ width: '100%', aspectRatio: '1/1', border: '1.5px dashed var(--border-2)', borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-3)', overflow: 'hidden' }}
                      >
                        {previewUrl ? (
                           <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                        ) : (
                           <><i className="ph ph-image" style={{ fontSize: 24, marginBottom: 4 }} /><span style={{ fontSize: 11, fontWeight: 600 }}>Upload Media</span></>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div className="grid-3">
                        <div className="form-group">
                          <label className="form-label">Platform *</label>
                          <select className="form-select" value={form.platform} onChange={e => setForm({...form, platform: e.target.value})} required>
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Schedule for *</label>
                          <input className="form-input" type="datetime-local" value={form.scheduledFor} onChange={e => setForm({...form, scheduledFor: e.target.value})} required />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Linked Product</label>
                          <select className="form-select" value={form.productId} onChange={e => setForm({...form, productId: e.target.value})}>
                            <option value="">General brand post</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label className="form-label">Caption / Description *</label>
                        <textarea className="form-textarea" placeholder="Write a caption..." value={form.caption} onChange={e => setForm({...form, caption: e.target.value})} required />
                      </div>
                      <button className="btn btn-primary" type="submit" disabled={saving || !form.platform || !form.scheduledFor || !form.caption.trim()}>
                        <i className="ph ph-calendar-plus" /> {saving ? 'Saving...' : 'Add to Calendar'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}
            
            {calendarItems.length === 0 ? (
               <EmptyState icon="ph-calendar-plus" color="var(--c-content)" title="Timeline is empty" sub="Schedule marketing content alongside your factory due dates to perfectly time your product drops." />
            ) : (
              <div style={{ position: 'relative', paddingLeft: 16, marginTop: 10 }}>
                 <div style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
                 {calendarItems.map((item, i) => {
                    const isPost = item.type === 'post';
                    const data = item.data;
                    return (
                      <div key={i} style={{ position: 'relative', paddingBottom: 24, display: 'flex', gap: 16 }}>
                         <div style={{ position: 'absolute', left: -18, top: 4, width: 14, height: 14, borderRadius: '50%', background: isPost ? 'var(--c-content)' : 'var(--c-materials)', border: '3px solid var(--bg)' }} />
                         
                         {/* Date Column */}
                         <div style={{ width: 100, flexShrink: 0, paddingTop: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{item.date.getFullYear()}</div>
                         </div>

                         {/* Content Card */}
                         <div className="card" style={{ flex: 1, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center' }}>
                            {isPost ? (
                               <>
                                  {data.image_url ? (
                                     <img src={data.image_url} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} alt="Post media" />
                                  ) : (
                                     <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)' }}>
                                        <i className={`ph ${PLATFORM_ICON[data.platform]}`} style={{ fontSize: 20 }} />
                                     </div>
                                  )}
                                  <div style={{ flex: 1 }}>
                                     <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-content)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                                        {data.platform} Post
                                     </div>
                                     <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{data.caption}</div>
                                     {data.products?.name && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}><i className="ph ph-tag" /> Promoting: {data.products.name}</div>}
                                  </div>
                                  <button className={`tag ${STATUS_TAG[data.status]}`} style={{ cursor: 'pointer', outline: 'none' }} onClick={() => toggleStatus(data.id, data.status)} title="Click to change status">
                                     {data.status}
                                  </button>
                               </>
                            ) : (
                               <>
                                  <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-materials)' }}>
                                     <i className="ph ph-package" style={{ fontSize: 20 }} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                     <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-materials)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                                        Factory Arrival
                                     </div>
                                     <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{data.products?.name || data.po_number}</div>
                                     <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{data.units} units from {data.vendors?.name}</div>
                                  </div>
                                  <span className="tag tag-neutral">{data.stage}</span>
                               </>
                            )}
                         </div>
                      </div>
                    )
                 })}
              </div>
            )}
          </>
        )}

        {tab === 'accounts' && (
          <div className="card">
            {mergedAccounts.map(a => (
              <div className="list-row" key={a.platform}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className={`ph ${PLATFORM_ICON[a.platform]}`} style={{ fontSize: 18, color: 'var(--c-content)' }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{a.platform}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{a.connected ? a.handle : 'Not connected'}</div>
                  </div>
                </div>
                {a.connected ? (
                  <button className="btn btn-sm" onClick={() => disconnectAccount(a.id)}>Disconnect</button>
                ) : (
                  <button className="btn btn-sm" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }} onClick={() => handleConnect(a.platform)}>
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}