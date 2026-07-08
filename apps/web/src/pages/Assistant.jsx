import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../App.jsx';
import { locations as locationsApi, getToken } from '../lib/api.js';

const ASSISTANT_NAME = 'Sage'; // ← rename the assistant here

// ── API ───────────────────────────────────────────────────────────────────────
async function apiReq(path, opts = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.data;
}
const api = {
  sessions:      ()    => apiReq('/api/assistant/sessions'),
  createSession: (loc) => apiReq('/api/assistant/sessions', { method:'POST', body: JSON.stringify({ locationId: loc }) }),
  deleteSession: (id)  => apiReq(`/api/assistant/sessions/${id}`, { method:'DELETE' }),
  messages:      (id)  => apiReq(`/api/assistant/sessions/${id}/messages`),
};

// ── Minimal markdown ──────────────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  let h = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`([^`\n]+)`/g,'<code style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:.9em">$1</code>')
    .replace(/^### (.+)$/gm,'<div style="font-weight:700;font-size:13px;margin:14px 0 4px">$1</div>')
    .replace(/^## (.+)$/gm,'<div style="font-weight:700;font-size:14px;margin:16px 0 6px">$1</div>')
    .replace(/^# (.+)$/gm,'<div style="font-weight:700;font-size:15px;margin:16px 0 6px">$1</div>');
  // lists
  h = h.replace(/(^[-*] .+\n?)+/gm, m => '<ul style="margin:6px 0;padding-left:20px">'+m.replace(/^[-*] (.+)$/gm,'<li>$1</li>')+'</ul>');
  h = h.replace(/(^\d+\. .+\n?)+/gm, m => '<ol style="margin:6px 0;padding-left:20px">'+m.replace(/^\d+\. (.+)$/gm,'<li>$1</li>')+'</ol>');
  h = h.replace(/\n\n/g,'</p><p style="margin:8px 0">').replace(/\n/g,'<br/>');
  return `<p style="margin:0">${h}</p>`;
}

const PROMPTS = [
  { icon:'📊', text:'How are we performing this week vs last week?' },
  { icon:'🍽️', text:'Which menu items should I reprice or remove?' },
  { icon:'👥', text:'Any staffing or scheduling issues to know about?' },
  { icon:'⭐', text:'What are guests saying in recent reviews?' },
  { icon:'💰', text:'Where am I losing the most money right now?' },
  { icon:'📋', text:'Any urgent compliance issues?' },
];

function tod() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Voice: speech-to-text (input) + text-to-speech (output) via Web Speech API ──
// Architected for many languages; English default. Each entry = recognition lang + TTS voice match.
const VOICE_LANGS = [
  { code: 'en-US', label: 'English' },
  { code: 'es-ES', label: 'Español' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'zh-CN', label: '中文' },
];

function useVoice({ lang, onFinalTranscript }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SR && typeof window !== 'undefined' && !!window.speechSynthesis;
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const startListening = useCallback(() => {
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = lang || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t; else interim += t;
        }
        setPartial(interim);
        if (final) { setPartial(''); onFinalRef.current?.(final.trim()); }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => { setListening(false); setPartial(''); };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch(_) { setListening(false); }
  }, [SR, lang]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch(_) {}
    setListening(false);
  }, []);

  const speak = useCallback((text, speakLang) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      // Strip markdown/symbols so it reads naturally
      const clean = String(text).replace(/[#*_`>~|]/g,'').replace(/\[(.*?)\]\(.*?\)/g,'$1').replace(/\s+/g,' ').trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean.slice(0, 600));
      u.lang = speakLang || lang || 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang === u.lang) || voices.find(v => v.lang?.startsWith((u.lang||'en').slice(0,2)));
      if (match) u.voice = match;
      window.speechSynthesis.speak(u);
    } catch(_) {}
  }, [lang]);

  const stopSpeaking = useCallback(() => { try { window.speechSynthesis?.cancel(); } catch(_) {} }, []);

  return { supported, listening, partial, startListening, stopListening, speak, stopSpeaking };
}

export default function Assistant() {
  const { user, location: globalLocId } = useAuth();
  const [sessions, setSessions]         = useState([]);
  const [session, setSession]           = useState(null);
  const sessionRef = useRef(null); // always current — avoids stale closure in send()
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [chips, setChips]               = useState([]);

  useEffect(() => {
    import('../lib/api.js').then(({ insights }) =>
      insights.mondayBrief().then(r => {
        const fromBrief = (r?.brief?.bullets || []).slice(0, 2).map(b =>
          'Tell me more: ' + b.replace(/\.$/, '')
        );
        setChips([
          ...fromBrief,
          'Which location had the best payroll % last month?',
          'Compare food cost across all locations this quarter',
          'How many guests haven\'t visited in 90 days?',
          'What was our best sales week ever per location?',
        ].slice(0, 5));
      }).catch(() => setChips([
        'Which location had the best payroll % last month?',
        'Compare food cost across all locations this quarter',
        'How many guests haven\'t visited in 90 days?',
        'What was our best sales week ever per location?',
      ]))
    );
  }, []);
  const [streaming, setStreaming]       = useState(false);
  const [streamText, setStreamText]     = useState('');
  const [toolMsg, setToolMsg]           = useState('');
  const [locations, setLocations]       = useState([]);
  const [loc, setLoc]                   = useState(null);
  const [voiceLang, setVoiceLang]       = useState('en-US');
  const [voiceReply, setVoiceReply]     = useState(false); // speak Sage's replies aloud
  const lastSpokenRef = useRef(null);
  const [sidebar, setSidebar]           = useState(false); // history hidden by default — ☰ to open
  const endRef     = useRef(null);
  const areaRef    = useRef(null);
  const abortRef   = useRef(null);

  useEffect(() => {
    locationsApi.list().then(l => setLocations(l||[])).catch(()=>{});
    api.sessions().then(s => setSessions(s||[])).catch(()=>{});
  }, []);

  // Location follows the global sidebar selection (read-only here)
  useEffect(() => {
    setLoc(globalLocId ? (locations.find(l => l.id === globalLocId) || null) : null);
  }, [globalLocId, locations]);

  useEffect(() => {
    if (session) api.messages(session.id).then(m => setMessages(m||[])).catch(()=>{});
    else setMessages([]);
  }, [session?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, streamText]);

  // ── Core send ─────────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    setInput('');

    // Always read from ref — avoids stale closure
    let sid = sessionRef.current?.id;
    if (!sid) {
      try {
        const s = await api.createSession(loc?.id);
        setSessions(p => [s, ...p]);
        setSessionAndRef(s);
        sid = s.id;
      } catch(e) { console.error('create session:', e); return; }
    }

    // Optimistically show user message
    const tmpId = 'tmp-' + Date.now();
    setMessages(p => [...p, { id: tmpId, role:'user', content: msg, created_at: new Date().toISOString() }]);
    setStreaming(true);
    setStreamText('');
    setToolMsg('');

    const token = getToken();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: msg, locationId: loc?.id }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Read SSE stream — track current event name across lines
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let full = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }

          switch (currentEvent) {
            case 'delta':
              full += evt.text || '';
              setStreamText(full);
              break;
            case 'tool_start':
            case 'tool_running':
              setToolMsg(`Looking up ${(evt.name||'').replace(/_/g,' ')}…`);
              break;
            case 'tool_done':
              setToolMsg('');
              break;
            case 'error':
              throw new Error(evt.message || 'Unknown error');
            case 'done': {
              // Fetch final saved messages — braces required to scope const
              setStreamText('');
              setToolMsg('');
              const saved = await api.messages(sid).catch(()=>[]);
              setMessages(saved);
              api.sessions().then(s => setSessions(s||[])).catch(()=>{});
              break;
            }
          }
        }
      }
    } catch(e) {
      if (e.name !== 'AbortError') {
        setMessages(p => [...p, { id:'err-'+Date.now(), role:'assistant', content:`⚠️ ${e.message}`, created_at: new Date().toISOString() }]);
      }
      setStreamText('');
      setToolMsg('');
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, loc]); // session read via sessionRef — no stale closure

  const del = useCallback(async (id, e) => {
    e.stopPropagation();
    await api.deleteSession(id).catch(()=>{});
    setSessions(p => p.filter(s => s.id !== id));
    if (session?.id === id) { setSessionAndRef(null); setMessages([]); }
  }, [session]);

  const setSessionAndRef = (s) => { sessionRef.current = s; setSession(s); };

  const voice = useVoice({
    lang: voiceLang,
    onFinalTranscript: (t) => { if (t) send(t); },
  });
  // Speak Sage's reply aloud when voice-reply is on (most recent assistant message, once)
  useEffect(() => {
    if (!voiceReply || streaming) return;
    const last = messages[messages.length-1];
    if (last && last.role === 'assistant' && last.id !== lastSpokenRef.current) {
      lastSpokenRef.current = last.id;
      voice.speak(last.content, voiceLang);
    }
  }, [messages, streaming, voiceReply, voiceLang]); // eslint-disable-line
  const newChat = useCallback(() => { setSessionAndRef(null); setMessages([]); setStreamText(''); }, []);

  const keyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const empty = messages.length === 0 && !streamText;

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg)' }}>

      {/* ── Session sidebar ── */}
      <div style={{
        width: sidebar ? 256 : 0, flexShrink:0, overflow:'hidden',
        transition:'width .2s', borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', background:'var(--bg-2)',
      }}>
        <div style={{ padding:'14px 12px 8px', flexShrink:0 }}>
          <button onClick={newChat} style={{
            width:'100%', padding:'8px 0', borderRadius:8, border:'none',
            background:'var(--gold)', color:'#000', fontWeight:700, fontSize:12,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            <span>✦</span> New conversation
          </button>
        </div>


        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--ink-3)', padding:'4px 14px 4px' }}>History</div>

        <div style={{ overflowY:'auto', flex:1, paddingBottom:12 }}>
          {sessions.length === 0
            ? <div style={{ fontSize:11, color:'var(--ink-3)', padding:'12px 14px' }}>No conversations yet</div>
            : sessions.map(s => (
              <div key={s.id} onClick={() => setSessionAndRef(s)}
                style={{
                  padding:'8px 12px', cursor:'pointer', display:'flex', gap:8,
                  borderLeft:`2px solid ${session?.id===s.id?'var(--gold)':'transparent'}`,
                  background: session?.id===s.id ? 'var(--bg)':'transparent',
                }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:1 }}>
                    {new Date(s.last_message_at||s.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                    {s.message_count>0?` · ${s.message_count} msgs`:''}
                  </div>
                </div>
                <button onClick={e=>del(s.id,e)}
                  style={{ opacity:0, background:'none', border:'none', color:'var(--ink-3)', fontSize:12, cursor:'pointer', padding:'1px 4px', borderRadius:3 }}
                  className="x-btn">✕</button>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Header */}
        <div style={{ padding:'11px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button onClick={()=>setSidebar(o=>!o)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:17, padding:'2px 6px', borderRadius:5, lineHeight:1 }}>☰</button>
          <div style={{ width:28, height:28, borderRadius:7, background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:'#000', flexShrink:0 }}>✦</div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, fontFamily:'var(--serif)' }}>{ASSISTANT_NAME}</div>
            <div style={{ fontSize:10, color:'var(--ink-3)' }}>{loc?.name||'All locations'} · live data</div>
          </div>
          {session && (
            <div style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-3)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:280 }}>
              {session.title}
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 4px' }}>
          {empty ? (
            <div style={{ maxWidth:680, margin:'0 auto', paddingTop:32 }}>
              <div style={{ textAlign:'center', marginBottom:32 }}>
                <div style={{ fontSize:36, marginBottom:10 }}>✦</div>
                <div style={{ fontFamily:'var(--serif)', fontSize:22, fontWeight:700, marginBottom:6 }}>
                  Good {tod()}, {user?.name?.split(' ')[0]||'Chef'}
                </div>
                <div style={{ fontSize:13, color:'var(--ink-3)', lineHeight:1.7 }}>
                  I know your numbers, menu, team, and guests.<br/>Ask me anything.
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                {PROMPTS.map((p,i) => (
                  <button key={i} onClick={()=>send(p.text)} style={{
                    background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:10,
                    padding:'12px 14px', textAlign:'left', cursor:'pointer',
                    display:'flex', alignItems:'flex-start', gap:9, transition:'all .12s',
                  }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--gold)';}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';}}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{p.icon}</span>
                    <span style={{ fontSize:11, color:'var(--ink)', lineHeight:1.5 }}>{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth:740, margin:'0 auto' }}>
            

              {messages.map(m => <Bubble key={m.id} m={m}/>)}
              {streaming && (
                <div style={{ marginBottom:16 }}>
                  {toolMsg && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:16, padding:'4px 12px', fontSize:11, color:'var(--ink-3)', marginBottom:8 }}>
                      <span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⟳</span> {toolMsg}
                    </div>
                  )}
                  {streamText ? (
                    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                      <Avatar/>
                      <div style={{ background:'var(--bg-2)', borderRadius:'3px 10px 10px 10px', padding:'12px 16px', maxWidth:'87%', fontSize:13, lineHeight:1.75, color:'var(--ink)' }}
                        dangerouslySetInnerHTML={{ __html: md(streamText)+'<span style="animation:blink 1s step-end infinite;opacity:1">▌</span>' }}/>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <Avatar/>
                      <Dots/>
                    </div>
                  )}
                </div>
              )}
              <div ref={endRef}/>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding:'12px 20px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ maxWidth:740, margin:'0 auto' }}>
            {messages.length === 0 && chips.length > 0 && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
            {chips.map((c,i)=>(
              <button key={i} onClick={()=>send(c)} style={{padding:'6px 14px',borderRadius:18,border:'1px solid var(--border)',background:'var(--bg-2)',color:'var(--ink-2)',fontSize:12,cursor:'pointer',textAlign:'left'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                {c}
              </button>
            ))}
          </div>
        )}
            <div style={{ display:'flex', gap:8, alignItems:'flex-end', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:12, padding:'9px 10px 9px 14px' }}>
              <textarea ref={areaRef} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,150)+'px'; }}
                onKeyDown={keyDown} disabled={streaming}
                placeholder="Ask anything about your restaurant…" rows={1}
                style={{ flex:1, background:'none', border:'none', outline:'none', resize:'none', fontSize:13, lineHeight:1.6, color:'var(--ink)', fontFamily:'var(--sans)', minHeight:22, maxHeight:150, overflowY:'auto' }}/>
              {voice.supported && !streaming && (
                <button onClick={()=>voice.listening?voice.stopListening():voice.startListening()}
                  title={voice.listening?'Stop listening':'Speak to Sage'}
                  style={{ width:32, height:32, borderRadius:7, background:voice.listening?'var(--red)':'var(--bg)', border:'1px solid '+(voice.listening?'var(--red)':'var(--border)'), cursor:'pointer', color:voice.listening?'#fff':'var(--ink-3)', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, animation:voice.listening?'pulse 1.2s infinite':'none' }}>
                  🎤
                </button>
              )}
              {streaming
                ? <button onClick={()=>abortRef.current?.abort()} style={{ width:32, height:32, borderRadius:7, background:'var(--bg)', border:'1px solid var(--border)', cursor:'pointer', color:'var(--ink-3)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>■</button>
                : <button onClick={()=>send()} disabled={!input.trim()} style={{ width:32, height:32, borderRadius:7, background:input.trim()?'var(--gold)':'var(--border)', border:'none', cursor:input.trim()?'pointer':'default', color:input.trim()?'#000':'var(--ink-3)', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background .12s' }}>↑</button>
              }
            </div>
            {voice.supported && (
              <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', marginTop:8, flexWrap:'wrap' }}>
                {voice.listening && <span style={{ fontSize:11, color:'var(--red)' }}>● Listening{voice.partial?': '+voice.partial:'…'}</span>}
                <label style={{ fontSize:11, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:5 }}>
                  Language
                  <select value={voiceLang} onChange={e=>setVoiceLang(e.target.value)}
                    style={{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--ink)', fontSize:11, padding:'3px 6px' }}>
                    {VOICE_LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize:11, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                  <input type="checkbox" checked={voiceReply} onChange={e=>{ setVoiceReply(e.target.checked); if(!e.target.checked) voice.stopSpeaking(); }}/>
                  🔊 Speak replies
                </label>
              </div>
            )}
            <div style={{ fontSize:10, color:'var(--ink-3)', textAlign:'center', marginTop:6 }}>
              Reads live data from all your restaurant systems · {loc?.name||'All locations'}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .x-btn{opacity:0!important} div:hover>.x-btn{opacity:1!important}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,.5)}50%{box-shadow:0 0 0 5px rgba(226,75,74,0)}}
      `}</style>
    </div>
  );
}

function Avatar() {
  return <div style={{ width:28,height:28,borderRadius:7,background:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,color:'#000',flexShrink:0,marginTop:2 }}>✦</div>;
}
function Dots() {
  return <div style={{ display:'flex',gap:5,alignItems:'center',padding:'12px 16px',background:'var(--bg-2)',borderRadius:'3px 10px 10px 10px' }}>
    {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:'50%',background:'var(--ink-3)',animation:`bounce 1.2s ease-in-out ${i*.15}s infinite` }}/>)}
  </div>;
}
function Bubble({ m }) {
  const u = m.role==='user';
  return (
    <div style={{ display:'flex',gap:10,alignItems:'flex-start',marginBottom:16,flexDirection:u?'row-reverse':'row' }}>
      {u
        ? <div style={{ width:28,height:28,borderRadius:7,background:'var(--bg-2)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,marginTop:2 }}>👤</div>
        : <Avatar/>
      }
      <div style={{
        background:u?'var(--gold)':'var(--bg-2)', color:u?'#000':'var(--ink)',
        borderRadius:u?'10px 3px 10px 10px':'3px 10px 10px 10px',
        padding:'11px 15px', maxWidth:'87%', fontSize:13, lineHeight:1.75,
      }}>
        {u ? <span>{m.content}</span>
           : <div dangerouslySetInnerHTML={{ __html: md(m.content) }}/>}
        <div style={{ fontSize:9,color:u?'rgba(0,0,0,.4)':'var(--ink-3)',marginTop:5,textAlign:u?'right':'left' }}>
          {new Date(m.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
        </div>
      </div>
    </div>
  );
}
