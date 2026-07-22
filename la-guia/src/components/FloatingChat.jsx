import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../context/ChatContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useTeam } from '../context/TeamContext.jsx';
import { useAIUsage } from '../context/AIUsageContext.jsx';

function timeLabel(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60000) return 'just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  return d.toLocaleDateString() === new Date().toLocaleDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString();
}

export default function FloatingChat() {
  const { user } = useAuth();
  const { activeBrand } = useProducts();
  const { members } = useTeam();
  const { canAfford, openTopup, costOf, remaining: aiRemaining, logUsage } = useAIUsage();
  const {
    aiChat, groupChats, messagesByChat, sendingAI, hasUnread, loadError,
    addableMembers, loadMessages, sendMessage, createGroupChat, markRead, pollMs, refresh,
  } = useChat();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'thread' | 'new'
  const [activeChatId, setActiveChatId] = useState(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState(null);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef(null);

  const activeChat = activeChatId === aiChat?.id ? aiChat : groupChats.find(c => c.id === activeChatId) || null;
  const messages = activeChat ? (messagesByChat[activeChat.id] || []) : [];

  const senderLabel = senderId => {
    if (!senderId) return 'AI Assistant';
    if (senderId === user.id) return 'You';
    if (senderId === activeBrand?.user_id) return 'Brand owner';
    const m = members.find(m => m.user_id === senderId);
    if (m) return m.invited_email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return 'Teammate';
  };

  const openThread = async chat => {
    setActiveChatId(chat.id);
    setView('thread');
    setSendError(null);
    await loadMessages(chat.id);
    if (chat.type === 'group') markRead(chat.id);
  };

  useEffect(() => {
    if (view !== 'thread' || !activeChat || activeChat.type !== 'group') return;
    const interval = setInterval(() => { loadMessages(activeChat.id); }, pollMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeChat?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async e => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeChat) return;
    if (activeChat.type === 'ai' && !canAfford('chat-reply')) { openTopup(); return; }
    setDraft('');
    setSendError(null);
    try {
      await sendMessage(activeChat, text);
      if (activeChat.type === 'ai') await logUsage('chat-assistant');
    } catch (err) {
      setSendError(err.message || 'Could not send that message.');
    }
  };

  const toggleSelected = uid => setSelected(prev => (prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]));
  const selectAll = () => setSelected(addableMembers.map(m => m.user_id));

  const handleCreate = async e => {
    e.preventDefault();
    setCreating(true);
    try {
      const chat = await createGroupChat({ name: newName, participantUserIds: selected });
      setNewName('');
      setSelected([]);
      await openThread(chat);
    } catch (err) {
      setSendError(err.message || 'Could not create that chat.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          width: 54, height: 54, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(0,0,0,0.25)', fontSize: 22,
        }}
      >
        <i className={`ph ${open ? 'ph-x' : 'ph-chat-circle-dots'}`} />
        {!open && hasUnread && (
          <span style={{ position: 'absolute', top: 4, right: 4, width: 11, height: 11, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--bg-1)' }} />
        )}
      </button>

      {open && (
        <div className="card-raised enter" style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 99,
          width: 360, height: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0,
        }}>
          {view === 'list' && (
            <>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <span className="card-title">Chats</span>
                <button className="btn btn-sm" onClick={() => setView('new')}><i className="ph ph-plus" /> New chat</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loadError && (
                  <div style={{ margin: '12px', padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 11.5, lineHeight: 1.5 }}>
                    <i className="ph ph-warning" style={{ marginRight: 4 }} />
                    {!aiChat
                      ? "Couldn't load the AI Assistant — this usually means migration 016_chat.sql hasn't been run on the database yet, or the backend needs restarting."
                      : "Couldn't fully load chats."}
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 4, opacity: 0.8, wordBreak: 'break-word' }}>{loadError}</div>
                    <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={refresh}>Retry</button>
                  </div>
                )}
                {aiChat && (
                  <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => openThread(aiChat)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ph ph-sparkle" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>AI Assistant</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Ask anything about your brand</div>
                      </div>
                    </div>
                    <i className="ph ph-caret-right" style={{ color: 'var(--ink-4)' }} />
                  </div>
                )}
                {groupChats.map(c => (
                  <div className="list-row" key={c.id} style={{ cursor: 'pointer' }} onClick={() => openThread(c)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--bg-3)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ph ph-users-three" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.name}
                          {c.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{(c.chat_participants || []).length + 1} people</div>
                      </div>
                    </div>
                    <i className="ph ph-caret-right" style={{ color: 'var(--ink-4)' }} />
                  </div>
                ))}
                {groupChats.length === 0 && (
                  <div style={{ padding: '20px 18px', fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>No group chats yet — start one with your team.</div>
                )}
              </div>
            </>
          )}

          {view === 'new' && (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <button type="button" onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16, marginRight: 6 }}>
                  <i className="ph ph-arrow-left" />
                </button>
                <span className="card-title">New chat</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <div className="form-group">
                  <label className="form-label">Chat name</label>
                  <input className="form-input" placeholder="e.g. Production team" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Add people</label>
                  <button type="button" className="btn btn-sm" onClick={selectAll} disabled={!addableMembers.length}>Add everyone</button>
                </div>
                {addableMembers.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>No other active teammates on this brand yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {addableMembers.map(m => (
                      <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: selected.includes(m.user_id) ? 'var(--accent-bg)' : 'transparent' }}>
                        <input type="checkbox" checked={selected.includes(m.user_id)} onChange={() => toggleSelected(m.user_id)} />
                        {m.invited_email}
                        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{m.role}</span>
                      </label>
                    ))}
                  </div>
                )}
                {sendError && <div className="form-hint" style={{ color: 'var(--red)', marginTop: 10 }}>{sendError}</div>}
              </div>
              <div style={{ padding: 14, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }} disabled={creating || selected.length === 0}>
                  {creating ? 'Creating…' : 'Create chat'}
                </button>
              </div>
            </form>
          )}

          {view === 'thread' && activeChat && (
            <>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <button type="button" onClick={() => { setView('list'); setActiveChatId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16, marginRight: 6 }}>
                  <i className="ph ph-arrow-left" />
                </button>
                <span className="card-title">{activeChat.type === 'ai' ? 'AI Assistant' : activeChat.name}</span>
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>
                    {activeChat.type === 'ai' ? 'Ask anything about your products, vendors, or production status.' : 'No messages yet — say hello.'}
                  </div>
                )}
                {messages.map(m => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                      {!mine && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 2, marginLeft: 4 }}>{senderLabel(m.sender_id)}</div>}
                      <div style={{
                        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                        borderBottomRightRadius: mine ? 3 : 12, borderBottomLeftRadius: mine ? 12 : 3,
                        background: mine ? 'var(--accent)' : m.sender_type === 'ai' ? 'var(--accent-bg)' : 'var(--bg-3)',
                        color: mine ? '#fff' : 'var(--ink)',
                        fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap',
                      }}>
                        {m.body}
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--ink-4)', marginTop: 2 }}>{timeLabel(m.created_at)}</div>
                    </div>
                  );
                })}
                {sendingAI && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
                    <i className="ph ph-circle-notch ph-spin" /> Thinking…
                  </div>
                )}
              </div>

              <form onSubmit={handleSend} style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                {sendError && <div className="form-hint" style={{ color: 'var(--red)', marginBottom: 8 }}>{sendError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input" placeholder="Type a message…" value={draft}
                    onChange={e => setDraft(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-sm btn-primary" type="submit" disabled={!draft.trim() || sendingAI}>
                    <i className="ph ph-paper-plane-tilt" />
                  </button>
                </div>
                {activeChat.type === 'ai' && (
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 6 }}>
                    {aiRemaining.toLocaleString()} credits left · {costOf('chat-reply')} per message
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
