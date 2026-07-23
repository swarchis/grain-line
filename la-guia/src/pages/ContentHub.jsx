import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useContent } from '../context/ContentContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useProduction } from '../context/ProductionContext.jsx';
import { useInfluencers } from '../context/InfluencersContext.jsx';
import { currency } from '../lib/format.js';
import { supabase } from '../lib/supabase.js';
import { consumeOAuthHandoff } from '../lib/oauthHandoff.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { PhotoPanel } from '../components/decor.jsx';
import CalendarGrid from '../components/CalendarGrid.jsx';
import { toast } from '../lib/toast.js';

const TABS = [
  { key: 'hub', label: 'Grid Preview', icon: 'ph-squares-four' },
  { key: 'calendar', label: 'Drop Calendar', icon: 'ph-calendar' },
  { key: 'launch', label: 'Launch Planner', icon: 'ph-rocket-launch' },
  { key: 'influencers', label: 'Influencers', icon: 'ph-users-three' },
  { key: 'email', label: 'Email Campaigns', icon: 'ph-envelope-simple' },
  { key: 'analytics', label: 'Analytics', icon: 'ph-chart-bar' },
  { key: 'accounts', label: 'Accounts', icon: 'ph-link' },
];

const INFLUENCER_STATUSES = ['Prospect', 'Contacted', 'Negotiating', 'Active', 'Completed'];
const INFLUENCER_STATUS_TAG = { Prospect: 'tag-neutral', Contacted: 'tag-blue', Negotiating: 'tag-amber', Active: 'tag-green', Completed: 'tag-neutral' };

// Offsets relative to launch_date — negative = days before, positive = after.
const LAUNCH_TEMPLATE = [
  { offset: -30, label: 'Finalize product listing copy' },
  { offset: -21, label: 'Photography & content shoot' },
  { offset: -14, label: 'Teaser post scheduled' },
  { offset: -7, label: 'Email list warm-up' },
  { offset: -3, label: 'Final inventory check' },
  { offset: 0, label: 'Launch day — go live + launch post' },
  { offset: 3, label: 'Restock / inventory check' },
  { offset: 7, label: 'Performance review' },
];

const PLATFORM_ICON = { instagram: 'ph-instagram-logo', tiktok: 'ph-tiktok-logo', youtube: 'ph-youtube-logo', pinterest: 'ph-pinterest-logo' };
const STATUS_TAG = { Scheduled: 'tag-blue', Posted: 'tag-green', Draft: 'tag-neutral', Failed: 'tag-red' };
const DEFAULT_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'pinterest'];

export default function ContentHub() {
  const location = useLocation();
  const [tab, setTab] = useState('hub');
  const [showComposer, setShowComposer] = useState(false);
  const [calView, setCalView] = useState('timeline'); // 'timeline' | 'month'
  const { products, activeBrand, updateProduct } = useProducts();
  const { orders } = useProduction();
  const { accounts, posts, loading, connectAccount, disconnectAccount, schedulePost, updatePostStatus, refresh: refreshContent } = useContent();
  const { influencers, loading: influencersLoading, createInfluencer, updateInfluencer, deleteInfluencer, dealsByInfluencer, loadDeals, addDeal } = useInfluencers();

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
      const handoffCode = params.get('handoff');
      const brandId = params.get('brandId');

      if (brandId === activeBrand.id && handoffCode) {
        consumeOAuthHandoff(handoffCode)
          .then(({ handle, accessToken, refreshToken }) => connectAccount(platform, handle, accessToken, refreshToken))
          .then(() => {
            window.history.replaceState({}, '', '/content');
            setTab('accounts');
          })
          .catch(err => {
            toast.error(`Failed to connect social account: ${err.message}`);
            window.history.replaceState({}, '', '/content');
          });
      }
    } else if (error) {
      toast.error(`Failed to connect social account. Reason: ${error}`);
      window.history.replaceState({}, '', '/content');
    }
  }, [location.search, activeBrand]);

  const mergedAccounts = DEFAULT_PLATFORMS.map(p => {
    const dbAcc = accounts.find(a => a.platform === p);
    return dbAcc || { platform: p, connected: false, handle: '', followers: 0 };
  });

  const handleConnect = async (platform) => {
    // If keys are missing, we prompt manually. If you add the keys to .env, this redirects to real OAuth
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/social/auth/${platform}?brandId=${activeBrand?.id}`;
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
      toast.success('Post scheduled.');
    } catch (err) {
      toast.error('Could not schedule post: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'Scheduled' ? 'Posted' : currentStatus === 'Posted' ? 'Draft' : 'Scheduled';
    try { await updatePostStatus(id, nextStatus); } catch (err) { toast.error(err.message); }
  };

  const [publishingId, setPublishingId] = useState(null);
  const [publishError, setPublishError] = useState(null);

  // Real attempt — only succeeds where the connected account actually has
  // write access (Pinterest today; see api/index.js for why Instagram/
  // TikTok/YouTube honestly can't yet). Failure is shown, not hidden.
  const publishNow = async (post) => {
    setPublishError(null);
    const account = accounts.find(a => a.platform === post.platform);
    if (!account?.access_token) {
      setPublishError(`No connected ${post.platform} account with a stored access token.`);
      return;
    }
    let boardId;
    if (post.platform === 'pinterest') {
      boardId = window.prompt('Pinterest board ID to pin to:');
      if (!boardId) return;
    }
    setPublishingId(post.id);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/social/publish/${post.platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: account.access_token, caption: post.caption, imageUrl: post.image_url, boardId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await updatePostStatus(post.id, 'Posted');
    } catch (err) {
      setPublishError(err.message);
      await updatePostStatus(post.id, 'Failed').catch(() => {});
    } finally {
      setPublishingId(null);
    }
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
            <div className="pill-group" style={{ marginBottom: 18 }}>
              <button className={`pill ${calView === 'timeline' ? 'active' : ''}`} onClick={() => setCalView('timeline')}>
                <i className="ph ph-list-dashes" style={{ marginRight: 6 }} /> Timeline
              </button>
              <button className={`pill ${calView === 'month' ? 'active' : ''}`} onClick={() => setCalView('month')}>
                <i className="ph ph-calendar-blank" style={{ marginRight: 6 }} /> Month
              </button>
            </div>
            {publishError && (
              <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{publishError}</div>
            )}
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
                            <option value="pinterest">Pinterest</option>
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
            
            {calView === 'month' ? (
              <CalendarGrid
                events={calendarItems.map((item, i) => ({
                  key: `${item.type}-${i}`,
                  date: item.date,
                  render: () => item.type === 'post' ? (
                    <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--c-content)' }}>
                      <i className={`ph ${PLATFORM_ICON[item.data.platform]}`} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.caption}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--c-materials)' }}>
                      <i className="ph ph-package" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.products?.name || item.data.po_number}</span>
                    </div>
                  ),
                }))}
                accent="var(--c-content)"
                onDayClick={date => {
                  const pad = n => String(n).padStart(2, '0');
                  setForm(f => ({ ...f, scheduledFor: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00` }));
                  setShowComposer(true);
                }}
              />
            ) : calendarItems.length === 0 ? (
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
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                    <button className={`tag ${STATUS_TAG[data.status]}`} style={{ cursor: 'pointer', outline: 'none' }} onClick={() => toggleStatus(data.id, data.status)} title="Click to change status">
                                       {data.status}
                                    </button>
                                    {data.status === 'Scheduled' && (
                                      <button className="btn btn-sm" disabled={publishingId === data.id} onClick={() => publishNow(data)}>
                                        {publishingId === data.id ? 'Publishing…' : 'Publish Now'}
                                      </button>
                                    )}
                                  </div>
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

        {tab === 'launch' && <LaunchPlannerTab products={products} updateProduct={updateProduct} />}

        {tab === 'influencers' && (
          <InfluencersTab
            influencers={influencers}
            loading={influencersLoading}
            createInfluencer={createInfluencer}
            updateInfluencer={updateInfluencer}
            deleteInfluencer={deleteInfluencer}
            dealsByInfluencer={dealsByInfluencer}
            loadDeals={loadDeals}
            addDeal={addDeal}
            products={products}
          />
        )}

        {tab === 'email' && <EmailCampaignsTab activeBrand={activeBrand} />}
        {tab === 'analytics' && <CampaignAnalyticsTab posts={posts} activeBrand={activeBrand} />}

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

function LaunchPlannerTab({ products, updateProduct }) {
  const [productId, setProductId] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [saving, setSaving] = useState(false);
  const product = products.find(p => p.id === productId);

  useEffect(() => {
    if (product) setLaunchDate(product.launch_date || '');
  }, [productId]);

  const generatePlan = async () => {
    if (!product || !launchDate) return;
    setSaving(true);
    try {
      const plan = LAUNCH_TEMPLATE.map((t, i) => ({ id: `task-${i}`, label: t.label, offset: t.offset, status: 'pending' }));
      await updateProduct(product.id, { launch_date: launchDate, launch_plan: plan });
    } catch (err) {
      toast.error('Could not save launch plan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (taskId) => {
    const next = (product.launch_plan || []).map(t => t.id === taskId ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t);
    try { await updateProduct(product.id, { launch_plan: next }); } catch (err) { toast.error(err.message); }
  };

  const plan = product?.launch_plan || [];
  const done = plan.filter(t => t.status === 'done').length;

  return (
    <>
      <div className="card" style={{ marginBottom: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Product</label>
        <select className="form-select" style={{ maxWidth: 280 }} value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Choose a product…</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {productId && (
          <>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Launch date</label>
            <input className="form-input" type="date" style={{ maxWidth: 180 }} value={launchDate} onChange={e => setLaunchDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={!launchDate || saving} onClick={generatePlan}>
              {plan.length > 0 ? 'Regenerate Plan' : 'Generate Plan'}
            </button>
          </>
        )}
      </div>

      {!productId ? (
        <EmptyState icon="ph-rocket-launch" color="var(--c-content)" title="Pick a product to plan its launch" sub="Set a launch date and get a T-minus checklist of drop-day tasks." />
      ) : plan.length === 0 ? (
        <EmptyState icon="ph-rocket-launch" color="var(--c-content)" title="No launch plan yet" sub="Set a launch date above and generate a T-minus checklist." />
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{product.name} — Launch Checklist</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{done}/{plan.length} done</span>
          </div>
          {plan.map(t => {
            const due = new Date(launchDate + 'T00:00:00');
            due.setDate(due.getDate() + t.offset);
            return (
              <div className="list-row" key={t.id} style={{ cursor: 'pointer' }} onClick={() => toggleTask(t.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className={`ph ${t.status === 'done' ? 'ph-check-circle' : 'ph-circle'}`} style={{ fontSize: 18, color: t.status === 'done' ? 'var(--green)' : 'var(--ink-4)' }} />
                  <span style={{ fontSize: 14, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--ink-3)' : 'var(--ink)' }}>{t.label}</span>
                </div>
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                  {t.offset === 0 ? 'Launch day' : t.offset < 0 ? `T${t.offset}` : `T+${t.offset}`} · {due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function InfluencersTab({ influencers, loading, createInfluencer, updateInfluencer, deleteInfluencer, dealsByInfluencer, loadDeals, addDeal, products }) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', handle: '', platform: 'instagram', followers: '', contact_info: '', rate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [dealForm, setDealForm] = useState({ productId: '', deliverables: '', amount: '', deal_date: '' });
  const [savingDeal, setSavingDeal] = useState(false);

  const filtered = statusFilter === 'All' ? influencers : influencers.filter(i => i.status === statusFilter);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createInfluencer({
        name: form.name, handle: form.handle || null, platform: form.platform,
        followers: form.followers ? Number(form.followers) : null,
        contact_info: form.contact_info || null, rate: form.rate ? Number(form.rate) : null, notes: form.notes || null,
      });
      setForm({ name: '', handle: '', platform: 'instagram', followers: '', contact_info: '', rate: '', notes: '' });
      setShowAdd(false);
    } catch (err) {
      toast.error('Could not add influencer: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (inf) => {
    if (expandedId === inf.id) { setExpandedId(null); return; }
    setExpandedId(inf.id);
    if (!dealsByInfluencer[inf.id]) loadDeals(inf.id);
  };

  const handleAddDeal = async (e, influencerId) => {
    e.preventDefault();
    setSavingDeal(true);
    try {
      await addDeal(influencerId, {
        product_id: dealForm.productId || null, deliverables: dealForm.deliverables || null,
        amount: dealForm.amount ? Number(dealForm.amount) : null, deal_date: dealForm.deal_date || null,
      });
      setDealForm({ productId: '', deliverables: '', amount: '', deal_date: '' });
    } catch (err) {
      toast.error('Could not add deal: ' + err.message);
    } finally {
      setSavingDeal(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="pill-group">
          {['All', ...INFLUENCER_STATUSES].map(s => (
            <button key={s} className={`pill ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}><i className="ph ph-plus" /> Add Influencer</button>
      </div>

      {showAdd && (
        <form className="card-raised" style={{ marginBottom: 18 }} onSubmit={handleAdd}>
          <div className="card-header"><span className="card-title">New Influencer</span></div>
          <div className="card-body">
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Handle</label>
                <input className="form-input" placeholder="@handle" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Platform</label>
                <select className="form-select" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="pinterest">Pinterest</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Followers</label>
                <input className="form-input" type="number" value={form.followers} onChange={e => setForm(f => ({ ...f, followers: e.target.value }))} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Contact (email/DM)</label>
                <input className="form-input" value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Typical Rate ($)</label>
                <input className="form-input" type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()} style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Add Influencer'}</button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="ph-users-three" color="var(--c-content)" title="No influencers yet" sub="Add one to start tracking outreach and deals." />
      ) : (
        <div className="card">
          {filtered.map(inf => {
            const deals = dealsByInfluencer[inf.id] || [];
            return (
              <div key={inf.id}>
                <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(inf)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <i className={`ph ${PLATFORM_ICON[inf.platform] || 'ph-user'}`} style={{ fontSize: 18, color: 'var(--c-content)' }} />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{inf.name}</span>
                      {inf.handle && <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>{inf.handle}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {inf.followers != null && <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{inf.followers.toLocaleString()} followers</span>}
                    <select className="form-select" style={{ fontSize: 12, padding: '4px 8px' }} value={inf.status} onClick={e => e.stopPropagation()} onChange={e => updateInfluencer(inf.id, { status: e.target.value })}>
                      {INFLUENCER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="btn btn-sm" onClick={e => { e.stopPropagation(); if (confirm(`Remove ${inf.name}?`)) deleteInfluencer(inf.id); }}><i className="ph ph-trash" /></button>
                  </div>
                </div>
                {expandedId === inf.id && (
                  <div style={{ padding: '0 20px 20px', background: 'var(--bg-1)' }}>
                    {inf.notes && <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>{inf.notes}</div>}
                    <div className="section-label" style={{ marginBottom: 8 }}>Deals</div>
                    {deals.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        {deals.map(d => (
                          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                            <span>{d.deliverables || 'Deal'} {d.products?.name ? `— ${d.products.name}` : ''}</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{d.amount ? currency(d.amount) : '—'} {d.deal_date ? `· ${d.deal_date}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={e => handleAddDeal(e, inf.id)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <select className="form-select" style={{ maxWidth: 160 }} value={dealForm.productId} onChange={e => setDealForm(f => ({ ...f, productId: e.target.value }))}>
                        <option value="">Product (optional)</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input className="form-input" style={{ maxWidth: 180 }} placeholder="Deliverables (e.g. 1 reel)" value={dealForm.deliverables} onChange={e => setDealForm(f => ({ ...f, deliverables: e.target.value }))} />
                      <input className="form-input" style={{ maxWidth: 100 }} type="number" placeholder="Amount" value={dealForm.amount} onChange={e => setDealForm(f => ({ ...f, amount: e.target.value }))} />
                      <input className="form-input" style={{ maxWidth: 140 }} type="date" value={dealForm.deal_date} onChange={e => setDealForm(f => ({ ...f, deal_date: e.target.value }))} />
                      <button className="btn btn-sm" type="submit" disabled={savingDeal}>{savingDeal ? 'Adding…' : 'Add Deal'}</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Minimal client-side CSV parser for a two-column (or single-column) contact
// import — no quoting/escaping support, matches the simplicity of this
// app's existing csvExport.js on the way out rather than pulling in a parser
// dependency for the way in.
function parseContactsCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  lines.forEach(line => {
    const [first, second] = line.split(',').map(s => s?.trim());
    const looksLikeEmail = s => s && s.includes('@');
    if (looksLikeEmail(first)) rows.push({ email: first, name: second || null });
    else if (looksLikeEmail(second)) rows.push({ email: second, name: first || null });
  });
  return rows;
}

function EmailCampaignsTab({ activeBrand }) {
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactForm, setContactForm] = useState({ email: '', name: '' });
  const [campaignForm, setCampaignForm] = useState({ subject: '', body: '' });
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    if (!activeBrand) { setContacts([]); setCampaigns([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: c }, { data: camp }] = await Promise.all([
      supabase.from('email_contacts').select('*').eq('brand_id', activeBrand.id).order('added_at', { ascending: false }),
      supabase.from('email_campaigns').select('*').eq('brand_id', activeBrand.id).order('created_at', { ascending: false }),
    ]);
    setContacts(c || []);
    setCampaigns(camp || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeBrand]);

  const addContact = async (e) => {
    e.preventDefault();
    if (!contactForm.email.trim()) return;
    const { error: err } = await supabase.from('email_contacts').upsert({ brand_id: activeBrand.id, email: contactForm.email.trim(), name: contactForm.name || null }, { onConflict: 'brand_id, email' });
    if (err) { setError(err.message); return; }
    setContactForm({ email: '', name: '' });
    load();
  };

  const importCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseContactsCSV(text);
    if (rows.length === 0) { setError('No valid email addresses found in that file.'); return; }
    const { error: err } = await supabase.from('email_contacts').upsert(rows.map(r => ({ brand_id: activeBrand.id, email: r.email, name: r.name })), { onConflict: 'brand_id, email' });
    if (err) setError(err.message);
    else load();
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeContact = async (id) => {
    await supabase.from('email_contacts').delete().eq('id', id);
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const subscribedContacts = contacts.filter(c => c.subscribed);

  const doSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/send-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: campaignForm.subject, body: campaignForm.body, recipients: subscribedContacts.map(c => c.email) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await supabase.from('email_campaigns').insert([{
        brand_id: activeBrand.id, subject: campaignForm.subject, body: campaignForm.body,
        status: 'Sent', recipient_count: data.sent, sent_at: new Date().toISOString(),
      }]);
      if (data.failed > 0) setError(`Sent to ${data.sent}, but ${data.failed} failed — check your Resend account (free tier only delivers to your own verified address without a verified domain).`);
      setCampaignForm({ subject: '', body: '' });
      setPreview(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;

  return (
    <>
      {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card-raised">
          <div className="card-header">
            <span className="card-title">Contacts ({subscribedContacts.length} subscribed)</span>
          </div>
          <div className="card-body">
            <form onSubmit={addContact} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="form-input" placeholder="email@example.com" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
              <input className="form-input" placeholder="Name (optional)" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
              <button className="btn btn-sm" type="submit">Add</button>
            </form>
            <input ref={fileRef} type="file" accept=".csv" onChange={importCSV} style={{ fontSize: 12, marginBottom: 12 }} />
            <div className="form-hint" style={{ marginTop: -6, marginBottom: 12 }}>CSV with an email column (name column optional) — no header row assumptions, just one contact per line.</div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{c.name ? `${c.name} — ` : ''}{c.email}</span>
                  <button onClick={() => removeContact(c.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}><i className="ph ph-x" /></button>
                </div>
              ))}
              {contacts.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: 12 }}>No contacts yet.</div>}
            </div>
          </div>
        </div>

        <div className="card-raised">
          <div className="card-header"><span className="card-title">Compose Campaign</span></div>
          <div className="card-body">
            {!preview ? (
              <>
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input className="form-input" value={campaignForm.subject} onChange={e => setCampaignForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Body (HTML)</label>
                  <textarea className="form-textarea" style={{ minHeight: 140 }} value={campaignForm.body} onChange={e => setCampaignForm(f => ({ ...f, body: e.target.value }))} />
                </div>
                <button className="btn btn-primary" disabled={!campaignForm.subject.trim() || !campaignForm.body.trim() || subscribedContacts.length === 0} onClick={() => setPreview(true)}>
                  Preview
                </button>
                {subscribedContacts.length === 0 && <div className="form-hint" style={{ marginTop: 8 }}>Add at least one subscribed contact first.</div>}
              </>
            ) : (
              <>
                <div className="form-hint" style={{ marginBottom: 12 }}>This sends a real email via Resend to {subscribedContacts.length} contact{subscribedContacts.length === 1 ? '' : 's'}. Review before confirming.</div>
                <div style={{ padding: '14px 16px', background: 'var(--bg-1)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{campaignForm.subject}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }} dangerouslySetInnerHTML={{ __html: campaignForm.body }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn" onClick={() => setPreview(false)} disabled={sending}>Back</button>
                  <button className="btn btn-primary" onClick={doSend} disabled={sending}>{sending ? 'Sending…' : `Confirm & Send to ${subscribedContacts.length}`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Sent Campaigns</span></div>
          {campaigns.map(c => (
            <div className="list-row" key={c.id}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.subject}</span>
              <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--ink-3)' }}>
                <span>{c.recipient_count} recipients</span>
                <span>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CampaignAnalyticsTab({ posts, activeBrand }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBrand) { setCampaigns([]); setLoading(false); return; }
    supabase.from('email_campaigns').select('*').eq('brand_id', activeBrand.id).eq('status', 'Sent')
      .then(({ data }) => { setCampaigns(data || []); setLoading(false); });
  }, [activeBrand]);

  const byPlatform = {};
  posts.forEach(p => {
    byPlatform[p.platform] = byPlatform[p.platform] || { scheduled: 0, posted: 0, failed: 0 };
    if (p.status === 'Posted') byPlatform[p.platform].posted++;
    else if (p.status === 'Failed') byPlatform[p.platform].failed++;
    else byPlatform[p.platform].scheduled++;
  });

  const totalRecipients = campaigns.reduce((s, c) => s + (c.recipient_count || 0), 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><i className="ph ph-circle-notch ph-spin" /></div>;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-content)' }}>
          <div className="stat-label">Posts Scheduled</div>
          <div className="stat-value">{posts.filter(p => p.status === 'Scheduled').length}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--green)' }}>
          <div className="stat-label">Posts Published</div>
          <div className="stat-value">{posts.filter(p => p.status === 'Posted').length}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-content)' }}>
          <div className="stat-label">Campaigns Sent</div>
          <div className="stat-value">{campaigns.length}</div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--c-content)' }}>
          <div className="stat-label">Total Email Recipients</div>
          <div className="stat-value">{totalRecipients}</div>
        </div>
      </div>

      <div className="form-hint" style={{ marginBottom: 16 }}>These are real counts from what's actually been scheduled/posted/sent — there's no click, open, or engagement tracking wired up yet, so nothing beyond volume is shown here.</div>

      {Object.keys(byPlatform).length === 0 ? (
        <EmptyState icon="ph-chart-bar" color="var(--c-content)" title="No content activity yet" sub="Schedule a post or send a campaign to see real numbers here." />
      ) : (
        <div className="card">
          <div className="card-header"><span className="card-title">Content by Platform</span></div>
          {Object.entries(byPlatform).map(([platform, counts]) => (
            <div className="list-row" key={platform}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className={`ph ${PLATFORM_ICON[platform] || 'ph-share-network'}`} style={{ fontSize: 18, color: 'var(--c-content)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{platform}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-3)' }}>
                <span>{counts.scheduled} scheduled</span>
                <span style={{ color: 'var(--green)' }}>{counts.posted} posted</span>
                {counts.failed > 0 && <span style={{ color: 'var(--red)' }}>{counts.failed} failed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}