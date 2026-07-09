import React, { useState } from 'react';
import { contentPosts, socialAccounts } from '../data/mockData.js';
import TabBar from '../components/TabBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { PhotoPanel } from '../components/decor.jsx';

const TABS = [
  { key: 'hub', label: 'Content Hub', icon: 'ph-megaphone' },
  { key: 'calendar', label: 'Calendar', icon: 'ph-calendar' },
  { key: 'accounts', label: 'Accounts', icon: 'ph-link' },
];

const POST_TONES = ['gold', 'sage', 'clay', 'ink'];

const PLATFORM_ICON = { instagram: 'ph-instagram-logo', tiktok: 'ph-tiktok-logo', youtube: 'ph-youtube-logo' };
const STATUS_TAG = { Scheduled: 'tag-blue', Posted: 'tag-green', Draft: 'tag-neutral' };

export default function ContentHub() {
  const [tab, setTab] = useState('hub');
  const [showComposer, setShowComposer] = useState(false);

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <div className="page-eyebrow" style={{ color: 'var(--c-content)' }}>Content & Marketing</div>
            <h1 className="page-title">Content Hub</h1>
          </div>
          <div className="page-sub">{socialAccounts.filter(a => a.connected).length} accounts connected</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => { setTab('calendar'); setShowComposer(true); }}><i className="ph ph-plus" /> New post</button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} accent="var(--c-content)" />

      <div className="content">
        {tab === 'hub' && (
          <>
            <div className="stats-row">
              {socialAccounts.map(a => (
                <div className="stat-card" key={a.platform} style={{ '--stat-accent': 'var(--c-content)' }}>
                  <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className={`ph ${PLATFORM_ICON[a.platform]}`} /> {a.platform}
                  </div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{a.connected ? a.followers.toLocaleString() : '—'}</div>
                  <div className="stat-delta delta-muted">{a.connected ? a.handle : 'Not connected'}</div>
                </div>
              ))}
            </div>
            <div className="section-label">Recent activity</div>
            <div className="card">
              {contentPosts.slice(0, 3).map((p, pi) => (
                <div className="list-row" key={p.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PhotoPanel variant="fabric" tone={POST_TONES[pi % POST_TONES.length]} aspect="1 / 1" style={{ width: 36, borderRadius: 'var(--r-sm)' }} />
                    <i className={`ph ${PLATFORM_ICON[p.platform]}`} style={{ color: 'var(--c-content)' }} />
                    <span style={{ fontSize: 13.5 }}>{p.caption}</span>
                  </div>
                  <span className={`tag ${STATUS_TAG[p.status]}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'calendar' && (
          <>
            {showComposer && (
              <div className="card-raised enter" style={{ marginBottom: 24 }}>
                <div className="corner-fold" style={{ '--fold-color': 'var(--c-content)' }} />
                <div className="card-header"><span className="card-title">New post</span></div>
                <div className="card-body">
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Platform</label>
                      <select className="form-select" defaultValue="">
                        <option value="" disabled>Choose a platform</option>
                        <option>Instagram</option><option>TikTok</option><option>YouTube</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Schedule for</label>
                      <input className="form-input" type="datetime-local" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Caption</label>
                    <textarea className="form-textarea" placeholder="Write a caption, or tie this post to a product" />
                  </div>
                  <button className="btn btn-primary" disabled style={{ opacity: 0.6 }}><i className="ph ph-calendar-plus" /> Schedule post</button>
                </div>
              </div>
            )}
            <div className="card">
              {contentPosts.map((p, pi) => (
                <div className="list-row" key={p.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PhotoPanel variant="fabric" tone={POST_TONES[pi % POST_TONES.length]} aspect="1 / 1" style={{ width: 36, borderRadius: 'var(--r-sm)' }} />
                    <i className={`ph ${PLATFORM_ICON[p.platform]}`} style={{ color: 'var(--c-content)' }} />
                    <div>
                      <div style={{ fontSize: 13.5 }}>{p.caption}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.scheduledFor}</div>
                    </div>
                  </div>
                  <span className={`tag ${STATUS_TAG[p.status]}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'accounts' && (
          <div className="card">
            {socialAccounts.map(a => (
              <div className="list-row" key={a.platform}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className={`ph ${PLATFORM_ICON[a.platform]}`} style={{ fontSize: 18, color: 'var(--c-content)' }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{a.platform}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{a.connected ? a.handle : 'Not connected'}</div>
                  </div>
                </div>
                <button className="btn btn-sm" style={a.connected ? {} : { background: 'var(--accent-bg)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
                  {a.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
