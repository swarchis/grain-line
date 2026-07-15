import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';
import { useProducts } from './ProductsContext.jsx';
import { useVendors } from './VendorsContext.jsx';
import { useProduction } from './ProductionContext.jsx';
import { useMaterials } from './MaterialsContext.jsx';
import { useTeam } from './TeamContext.jsx';

const ChatContext = createContext(null);

// No realtime infrastructure exists elsewhere in this app (every context is
// fetch-on-mount + manual refresh) — this follows that same convention with
// a light poll while the chat panel is open, instead of introducing
// Supabase Realtime as a one-off for this single feature.
const POLL_MS = 8000;

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const { activeBrand, products, collections } = useProducts();
  const { vendors, quotes } = useVendors();
  const { orders } = useProduction();
  const { materials } = useMaterials();
  const { members } = useTeam();

  const [aiChat, setAiChat] = useState(null);
  const [groupChats, setGroupChats] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [loading, setLoading] = useState(true);
  const [sendingAI, setSendingAI] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadChats = async () => {
    if (!activeBrand || !user) { setAiChat(null); setGroupChats([]); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*, chat_participants(user_id, last_read_at)')
        .eq('brand_id', activeBrand.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      let mine = (data || []).find(c => c.type === 'ai' && c.created_by === user.id);
      if (!mine) {
        const { data: created, error: createError } = await supabase
          .from('chats')
          .insert([{ brand_id: activeBrand.id, type: 'ai', name: 'AI Assistant', created_by: user.id }])
          .select()
          .single();
        const { data: rpcResult, error: rpcError } = createError
          ? await supabase.rpc('ensure_personal_ai_chat', { p_brand_id: activeBrand.id })
          : { data: null, error: null };
        const rpcCreated = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        // Surfaced (not just console.error'd) since this was previously the
        // most common silent failure — migration 016 not run, or its RLS
        // policies not applied — and swallowing it just made the AI
        // Assistant entry mysteriously vanish with no way to tell why.
        // Kept non-fatal to the rest of loadChats so a broken AI-chat
        // insert never takes working group chats down with it.
        if (rpcError) {
          console.error('AI chat creation failed', { createError, rpcError, brandId: activeBrand.id, userId: user.id });
          setLoadError(rpcError.message || createError.message);
        }
        else mine = created || rpcCreated;
      }
      setAiChat(mine || null);

      const groups = (data || []).filter(c => c.type === 'group');
      const groupIds = groups.map(c => c.id);
      let lastMsgMap = {};
      if (groupIds.length) {
        const { data: latest } = await supabase
          .from('chat_messages')
          .select('chat_id, created_at')
          .in('chat_id', groupIds)
          .order('created_at', { ascending: false });
        (latest || []).forEach(m => { if (!lastMsgMap[m.chat_id]) lastMsgMap[m.chat_id] = m.created_at; });
      }
      setGroupChats(groups.map(c => {
        const mineParticipant = (c.chat_participants || []).find(p => p.user_id === user.id);
        const lastMessageAt = lastMsgMap[c.id] || null;
        const unread = !!(lastMessageAt && (!mineParticipant || new Date(lastMessageAt) > new Date(mineParticipant.last_read_at)));
        return { ...c, lastMessageAt, unread };
      }));
    } catch (err) {
      console.error('Error loading chats:', err);
      setLoadError(err.message || String(err));
      setAiChat(null);
      setGroupChats([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChats(); }, [activeBrand?.id, user?.id]);

  const loadMessages = async (chatId) => {
    if (!chatId) return [];
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error loading messages:', error); return messagesByChat[chatId] || []; }
    setMessagesByChat(prev => ({ ...prev, [chatId]: data || [] }));
    return data || [];
  };

  // Every teammate who has a real user_id (i.e. actually claimed their
  // invite), plus the brand owner if the current user isn't the owner —
  // pending/unclaimed invites have no auth user yet and can't be added.
  const addableMembers = [
    ...(activeBrand && activeBrand.user_id && activeBrand.user_id !== user?.id
      ? [{ user_id: activeBrand.user_id, invited_email: 'Brand owner', role: 'owner' }]
      : []),
    ...members.filter(m => m.status === 'active' && m.user_id && m.user_id !== user?.id),
  ];

  const createGroupChat = async ({ name, participantUserIds }) => {
    if (!activeBrand || !user) throw new Error('No active brand');
    const { data: chat, error } = await supabase
      .from('chats')
      .insert([{ brand_id: activeBrand.id, type: 'group', name: name?.trim() || 'New chat', created_by: user.id }])
      .select()
      .single();
    if (error) throw error;
    // The creator gets a participant row too (not just an implicit "is
    // creator" pass in RLS) so their own last_read_at is tracked the same
    // way as everyone else's — otherwise their own chat would always look
    // unread to them.
    const uniqueIds = [...new Set([user.id, ...(participantUserIds || [])])];
    const rows = uniqueIds.map(uid => ({ chat_id: chat.id, user_id: uid }));
    const { error: partError } = await supabase.from('chat_participants').insert(rows);
    if (partError) throw partError;
    setGroupChats(prev => [...prev, chat]);
    return chat;
  };

  const addParticipant = async (chatId, userId) => {
    const { error } = await supabase.from('chat_participants').insert([{ chat_id: chatId, user_id: userId }]);
    if (error) throw error;
  };

  const markRead = async (chatId) => {
    if (!chatId) return;
    setGroupChats(prev => prev.map(c => (c.id === chatId ? { ...c, unread: false } : c)));
    const { data } = await supabase.from('chat_participants').select('id').eq('chat_id', chatId).eq('user_id', user.id).maybeSingle();
    if (data) {
      await supabase.from('chat_participants').update({ last_read_at: new Date().toISOString() }).eq('id', data.id);
    }
  };

  // Flattens whatever's already loaded in the other brand contexts into a
  // compact text block for the AI prompt — no extra queries, and capped so a
  // brand with a huge catalog doesn't blow out the prompt.
  const buildBrandContext = () => {
    if (!activeBrand) return '';
    const lines = [`Brand: ${activeBrand.name} (plan: ${activeBrand.plan_tier || 'free'})`];

    lines.push(`\nProducts (${products.length}):`);
    lines.push(products.slice(0, 40).map(p => `- ${p.name}: stage=${p.stage}, status=${p.status || 'active'}, readiness=${p.readiness}%, risk=${p.risk}, budget=$${p.budget || 0}, category=${p.category || 'uncategorized'}`).join('\n') || 'None yet.');

    lines.push(`\nCollections (${collections.length}): ${collections.map(c => c.name).join(', ') || 'None yet.'}`);

    lines.push(`\nVendors (${vendors.length}):`);
    lines.push(vendors.slice(0, 40).map(v => `- ${v.name}: category=${v.category || '—'}, location=${v.location || '—'}, MOQ=${v.moq ?? '—'}, lead time=${v.lead_time || '—'}, price=${v.price_range || '—'}, rating=${v.rating ?? '—'}, trust label=${v.label}`).join('\n') || 'None yet.');

    const openQuotes = quotes.filter(q => q.status === 'Requested' || q.status === 'Received');
    lines.push(`\nOpen quotes (${openQuotes.length}): ${openQuotes.slice(0, 20).map(q => `${q.products?.name || 'product'} <- ${q.vendors?.name || 'vendor'} (${q.status}${q.amount ? `, $${q.amount}` : ''})`).join('; ') || 'None.'}`);

    lines.push(`\nProduction orders (${orders.length}): ${orders.slice(0, 20).map(o => `${o.products?.name || 'product'} via ${o.vendors?.name || 'vendor'}: ${o.stage}, due ${o.due_date || 'unset'}, ${o.units || '—'} units`).join('; ') || 'None.'}`);

    lines.push(`\nMaterials library (${materials.length}): ${materials.slice(0, 20).map(m => m.name).join(', ') || 'None.'}`);

    return lines.join('\n');
  };

  const sendMessage = async (chat, body) => {
    if (!chat || !body.trim()) return;
    const { data: userMsg, error } = await supabase
      .from('chat_messages')
      .insert([{ chat_id: chat.id, sender_id: user.id, sender_type: 'user', body: body.trim() }])
      .select()
      .single();
    if (error) throw error;
    setMessagesByChat(prev => ({ ...prev, [chat.id]: [...(prev[chat.id] || []), userMsg] }));

    if (chat.type === 'ai') {
      setSendingAI(true);
      try {
        const history = (messagesByChat[chat.id] || []).map(m => ({ senderType: m.sender_type, body: m.body }));
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/chat-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body.trim(), history, brandContext: buildBrandContext() }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        const { data: aiMsg, error: aiError } = await supabase
          .from('chat_messages')
          .insert([{ chat_id: chat.id, sender_id: null, sender_type: 'ai', body: data.reply }])
          .select()
          .single();
        if (aiError) throw aiError;
        setMessagesByChat(prev => ({ ...prev, [chat.id]: [...(prev[chat.id] || []), aiMsg] }));
      } finally {
        setSendingAI(false);
      }
    }
    return userMsg;
  };

  const hasUnread = groupChats.some(c => c.unread);

  return (
    <ChatContext.Provider value={{
      aiChat, groupChats, messagesByChat, loading, sendingAI, hasUnread, loadError,
      addableMembers, loadMessages, sendMessage, createGroupChat, addParticipant, markRead,
      refresh: loadChats, pollMs: POLL_MS,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
