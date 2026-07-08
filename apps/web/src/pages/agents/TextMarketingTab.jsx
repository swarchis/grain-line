import React, { useState, useEffect, useCallback } from 'react';
import { agent1 } from '../../lib/api.js';

const fmt = n => (n||0).toLocaleString();
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

const CHANNEL_META = {
  sms:       { label:'SMS',       icon:'💬', color:'#4A90D9', desc:'Plain text, 160 chars per message' },
  whatsapp:  { label:'WhatsApp',  icon:'📱', color:'#25D366', desc:'Rich text + emoji, up to 1000 chars' },
};

export default function TextMarketingTab({ location }) {
  const [view, setView]         = useState('list');
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);
  const [editing, setEditing]   = useState(null);

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),4000); };

  const loadAll = useCallback(async () => {
    if (!location?.id) return;
    setLoading(true);
    try {
      const [camps, st] = await Promise.all([
        agent1.txtCampaigns({ locationId: location.id }),
        agent1.txtStats(location.id),
      ]);
      setCampaigns(Array.isArray(camps) ? camps : []);
      setStats(st || {});
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  }, [location?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this draft campaign?')) return;
    await agent1.txtDelete(id);
    setCampaigns(c => c.filter(x => x.id !== id));
    showToast('Deleted');
  };

  if (view === 'editor') return (
    <CampaignEditor
      campaign={editing}
      location={location}
      onBack={() => { setView('list'); loadAll(); }}
      showToast={showToast}
    />
  );

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>SMS & WhatsApp Marketing</div>
          <div style={{fontSize:12,color:'var(--ink-3)'}}>
            {fmt(stats.sms_reachable)} SMS-reachable · {fmt(stats.wa_reachable)} WhatsApp-reachable
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>{ setEditing(null); setView('editor'); }}>
          + New campaign
        </button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
        {[
          {label:'Has phone',     val:fmt(stats.has_phone),      color:'var(--ink)',   icon:'📞'},
          {label:'SMS reachable', val:fmt(stats.sms_reachable),  color:'#4A90D9',      icon:'💬'},
          {label:'WhatsApp',      val:fmt(stats.wa_reachable),   color:'#25D366',      icon:'📱'},
          {label:'Campaigns sent',val:fmt(campaigns.filter(c=>c.status==='sent').length), color:'var(--gold)', icon:'✅'},
        ].map((s,i) => (
          <div key={i} style={{background:'var(--bg-2)',borderRadius:10,padding:'12px 16px',border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{s.icon} {s.label}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:s.color}}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Twilio setup notice */}
      <TwilioSetupGuide />

      {/* Campaign list */}
      {loading ? <div className="spinner" style={{margin:'40px auto'}}/> :
       campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📲</div>
          <div className="empty-state-title">No campaigns yet</div>
          <div className="empty-state-sub">Create your first SMS or WhatsApp campaign to reach guests directly</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>{ setEditing(null); setView('editor'); }}>
            Create campaign
          </button>
        </div>
      ) : (
        <div className="card">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['Campaign','Channel','Status','Sent','Delivered','Date',''].map(h => (
                  <th key={h} style={{padding:'9px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{fontWeight:600}}>{c.name}</div>
                    <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.message}</div>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{fontSize:12,fontWeight:600,color:CHANNEL_META[c.channel]?.color}}>
                      {CHANNEL_META[c.channel]?.icon} {CHANNEL_META[c.channel]?.label}
                    </span>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{fontSize:11,padding:'2px 10px',borderRadius:20,fontWeight:600,
                      background:c.status==='sent'?'#0A2A1A':'var(--bg)',
                      color:c.status==='sent'?'#3ECF8E':'var(--ink-3)',
                      border:'1px solid '+(c.status==='sent'?'#3ECF8E30':'var(--border)')}}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{padding:'12px 16px',fontFamily:'var(--mono)',fontSize:12}}>{c.sent_count||'—'}</td>
                  <td style={{padding:'12px 16px',fontFamily:'var(--mono)',fontSize:12}}>{c.delivered_count||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:12,color:'var(--ink-3)'}}>{c.sent_at?fmtDate(c.sent_at):fmtDate(c.created_at)}</td>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-sm" onClick={()=>{ setEditing(c); setView('editor'); }}>
                        {c.status==='sent'?'View':'Edit'}
                      </button>
                      {c.status==='draft' && (
                        <button className="btn btn-sm" onClick={()=>handleDelete(c.id)} style={{color:'var(--ink-3)'}}>Del</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast" style={{background:toast.err?'#E24B4A':'var(--ink)'}}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}

// ── Campaign Editor ────────────────────────────────────────────────────────────
function CampaignEditor({ campaign, location, onBack, showToast }) {
  const isSent = campaign?.status === 'sent';
  const [name, setName]         = useState(campaign?.name     || '');
  const [channel, setChannel]   = useState(campaign?.channel  || 'sms');
  const [message, setMessage]   = useState(campaign?.message  || '');
  const [campaignId, setCampaignId] = useState(campaign?.id   || null);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showAi, setShowAi]     = useState(false);

  const charLimit = channel === 'sms' ? 160 : 1000;
  const charCount = message.length;
  const smsSegments = channel === 'sms' ? Math.ceil(charCount / 160) : 1;
  const overLimit = channel === 'sms' && charCount > 160;

  const handleSave = async () => {
    if (!name.trim()) return showToast('Campaign name required', true);
    if (!message.trim()) return showToast('Message required', true);
    setSaving(true);
    try {
      const saved = await agent1.txtSave({
        id: campaignId || undefined,
        locationId: location?.id,
        name, channel, message, status: 'draft',
      });
      setCampaignId(saved.id);
      showToast('Saved');
    } catch(e) { showToast(e.message, true); }
    finally { setSaving(false); }
  };

  const handleGenerate = async (params) => {
    setGenerating(true); setShowAi(false);
    try {
      const result = await agent1.txtGenerate({
        locationName: location?.name,
        channel, ...params,
      });
      setMessage(result.message || '');
      showToast('Message generated');
    } catch(e) { showToast(e.message, true); }
    finally { setGenerating(false); }
  };

  // WhatsApp formatting helpers
  const insertFormat = (tag) => {
    const ta = document.getElementById('msg-textarea');
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = message.slice(s, e) || 'text';
    const newMsg = message.slice(0, s) + tag + sel + tag + message.slice(e);
    setMessage(newMsg);
  };

  return (
    <div style={{maxWidth:800}}>
      {/* Topbar */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Campaign name…" disabled={isSent}
          style={{flex:1,minWidth:160,background:'transparent',border:'none',borderBottom:'1px solid var(--border)',padding:'4px 0',fontSize:16,fontWeight:600,color:'var(--ink)',outline:'none'}}/>
        {!isSent && (
          <>
            <button className="btn btn-sm" onClick={()=>setShowAi(true)} disabled={generating}>
              {generating?'🤖 Generating…':'🤖 AI write'}
            </button>
            <button className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving?'Saving…':'Save draft'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={()=>{ if(!campaignId){showToast('Save first',true);return;} setShowSend(true); }}>
              📲 Send
            </button>
          </>
        )}
      </div>

      {/* Channel selector */}
      {!isSent && (
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {Object.entries(CHANNEL_META).map(([key, meta]) => (
            <button key={key} onClick={()=>setChannel(key)} style={{padding:'10px 20px',borderRadius:10,border:`1px solid ${channel===key?meta.color:'var(--border)'}`,background:channel===key?meta.color+'15':'transparent',color:channel===key?meta.color:'var(--ink-3)',cursor:'pointer',fontWeight:channel===key?700:400,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>{meta.icon}</span>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:13,fontWeight:700}}>{meta.label}</div>
                <div style={{fontSize:10,opacity:.7}}>{meta.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp formatting toolbar */}
      {channel === 'whatsapp' && !isSent && (
        <div style={{display:'flex',gap:6,marginBottom:8}}>
          {[['*','Bold'],['_','Italic'],['~','Strike'],['```','Mono']].map(([tag,label]) => (
            <button key={tag} onClick={()=>insertFormat(tag)} style={{padding:'3px 10px',fontSize:12,borderRadius:5,border:'1px solid var(--border)',background:'var(--bg-2)',cursor:'pointer',color:'var(--ink-2)'}}>
              {label}
            </button>
          ))}
          <span style={{fontSize:11,color:'var(--ink-3)',marginLeft:4,alignSelf:'center'}}>Select text then click to format</span>
        </div>
      )}

      {/* Message textarea */}
      <div style={{position:'relative',marginBottom:8}}>
        <textarea
          id="msg-textarea"
          value={message}
          onChange={e=>setMessage(e.target.value)}
          disabled={isSent}
          placeholder={channel==='sms'
            ? 'Hi {{first_name}}, join us this weekend for our new summer menu! 20% off with code SUMMER20. Reply STOP to unsubscribe.'
            : 'Hi {{first_name}}! 🌟\n\nWe\'re excited to share something special with you...\n\nReply STOP to unsubscribe.'}
          rows={channel==='whatsapp'?10:6}
          style={{width:'100%',padding:'14px',borderRadius:10,border:`1px solid ${overLimit?'#F26C6C':'var(--border)'}`,background:'var(--bg-2)',color:'var(--ink)',fontSize:14,fontFamily:'inherit',resize:'vertical',lineHeight:1.6,outline:'none',boxSizing:'border-box'}}
        />
        <div style={{position:'absolute',bottom:10,right:12,fontSize:11,color:overLimit?'#F26C6C':'var(--ink-3)',fontFamily:'var(--mono)'}}>
          {charCount}/{charLimit}
          {channel==='sms'&&smsSegments>1&&<span style={{marginLeft:6,color:'#E8A020'}}>({smsSegments} msgs)</span>}
        </div>
      </div>

      {/* Tips */}
      <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',fontSize:12,color:'var(--ink-3)',lineHeight:1.8,marginBottom:16}}>
        <strong style={{color:'var(--ink-2)'}}>Tips:</strong>
        {' '}Use <code style={{background:'var(--bg-2)',padding:'1px 5px',borderRadius:4,fontSize:11}}>{'{{first_name}}'}</code> to personalize.
        {channel==='sms'
          ? ' Keep under 160 chars for 1 message (lower cost). Always include opt-out.'
          : ' WhatsApp supports *bold*, _italic_, ~strikethrough~, emojis. Must include opt-out note.'}
      </div>

      {/* Preview */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Preview</div>
        <MessagePreview channel={channel} message={message.replace(/\{\{first_name\}\}/gi,'Alex')}/>
      </div>

      {/* Modals */}
      {showAi   && <AiTextModal channel={channel} onGenerate={handleGenerate} onClose={()=>setShowAi(false)} locationName={location?.name}/>}
      {showSend && <TextSendModal campaignId={campaignId} channel={channel} location={location} onClose={()=>setShowSend(false)}
        onSent={r=>{ setShowSend(false); showToast('Sent to '+r.sent+' contacts'); onBack(); }} showToast={showToast}/>}
    </div>
  );
}

// ── Message Preview ────────────────────────────────────────────────────────────
function MessagePreview({ channel, message }) {
  if (!message) return null;

  // Parse WhatsApp formatting to HTML
  const parseWA = (text) => {
    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<s>$1</s>')
      .replace(/```(.*?)```/gs, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  if (channel === 'whatsapp') {
    return (
      <div style={{background:'#e5ddd5',borderRadius:12,padding:16,maxWidth:360}}>
        <div style={{fontSize:10,color:'#667781',marginBottom:8,textAlign:'center'}}>WhatsApp Preview</div>
        <div style={{background:'#fff',borderRadius:'4px 12px 12px 12px',padding:'8px 12px',maxWidth:280,boxShadow:'0 1px 2px rgba(0,0,0,.1)'}}>
          <div style={{fontSize:14,color:'#111',lineHeight:1.5}} dangerouslySetInnerHTML={{__html:parseWA(message)}}/>
          <div style={{fontSize:10,color:'#667781',textAlign:'right',marginTop:4}}>now ✓✓</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{background:'#1c1c1e',borderRadius:12,padding:16,maxWidth:320}}>
      <div style={{fontSize:10,color:'#8e8e93',marginBottom:8,textAlign:'center'}}>SMS Preview</div>
      <div style={{background:'#3a3a3c',borderRadius:'4px 18px 18px 18px',padding:'10px 14px',maxWidth:260,display:'inline-block'}}>
        <div style={{fontSize:14,color:'#fff',lineHeight:1.5}}>{message}</div>
      </div>
    </div>
  );
}

// ── AI Text Modal ──────────────────────────────────────────────────────────────
function AiTextModal({ channel, onGenerate, onClose, locationName }) {
  const [form, setForm] = useState({ topic:'', tone:'warm and enticing', promoCode:'' });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const TONES = ['warm and enticing','exciting and urgent','friendly and casual','sophisticated and elegant','fun and playful'];
  const TOPICS = [
    'Weekend special offer','New menu item launch','Happy hour promotion',
    'Private event announcement','Seasonal menu','Holiday dinner reservation',
    'Chef\'s tasting event','Anniversary promotion',
  ];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:460,maxWidth:'95vw',border:'1px solid var(--border)',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700}}>
              🤖 AI {channel==='whatsapp'?'WhatsApp':'SMS'} Message
            </div>
            <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>Claude will write a {channel==='whatsapp'?'WhatsApp message':'160-char SMS'} for {locationName||'your restaurant'}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">What to promote</label>
            <input className="form-input" value={form.topic} onChange={e=>f('topic',e.target.value)} placeholder="e.g. New summer menu launch…"/>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {TOPICS.map(t=>(
              <button key={t} onClick={()=>f('topic',t)} style={{padding:'4px 10px',fontSize:11,borderRadius:20,border:`1px solid ${form.topic===t?'var(--gold)':'var(--border)'}`,background:form.topic===t?'var(--gold-bg)':'transparent',color:form.topic===t?'var(--gold)':'var(--ink-3)',cursor:'pointer'}}>
                {t}
              </button>
            ))}
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Tone</label>
            <select className="form-select" value={form.tone} onChange={e=>f('tone',e.target.value)}>
              {TONES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Promo code <span style={{fontWeight:400,color:'var(--ink-3)'}}>optional</span></label>
            <input className="form-input" value={form.promoCode} onChange={e=>f('promoCode',e.target.value)} placeholder="e.g. SUMMER20"/>
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:20}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={()=>onGenerate(form)} disabled={!form.topic.trim()}>
            Generate message
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Text Send Modal ────────────────────────────────────────────────────────────
function TextSendModal({ campaignId, channel, location, onClose, onSent, showToast }) {
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending]    = useState(false);
  const [result, setResult]      = useState(null);
  const [reachable, setReachable] = useState(null);

  const col = CHANNEL_META[channel];

  useEffect(() => {
    agent1.txtStats(location?.id).then(s => {
      setReachable(channel==='whatsapp' ? parseInt(s.wa_reachable||0) : parseInt(s.sms_reachable||0));
    }).catch(()=>{});
  }, [channel, location?.id]);

  const send = async (test=false) => {
    setSending(true);
    try {
      const r = await agent1.txtSend({
        campaignId,
        locationId: location?.id,
        testPhone: test ? testPhone : undefined,
      });
      if (test) { showToast('Test sent to '+testPhone); }
      else { setResult(r); }
    } catch(e) { showToast(e.message, true); }
    finally { setSending(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:460,maxWidth:'95vw',border:'1px solid var(--border)',padding:24}}>
        {result ? (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:48,marginBottom:12}}>{col.icon}</div>
            <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:700,marginBottom:8}}>Campaign sent!</div>
            <div style={{fontSize:14,color:'var(--ink-3)',marginBottom:4}}>{result.sent} messages sent</div>
            {result.failed>0&&<div style={{fontSize:12,color:'#F26C6C'}}>{result.failed} failed</div>}
            <button className="btn btn-primary" style={{marginTop:20,width:'100%',justifyContent:'center'}} onClick={()=>onSent(result)}>Done</button>
          </div>
        ) : (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700}}>
                Send {col.icon} {col.label} campaign
              </div>
              <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
            </div>

            {/* Reach count */}
            <div style={{background:'var(--bg)',borderRadius:8,padding:'14px 16px',marginBottom:16,border:'1px solid var(--border)'}}>
              <div style={{fontSize:12,color:'var(--ink-3)',marginBottom:4}}>Will send to</div>
              <div style={{fontFamily:'var(--mono)',fontSize:24,fontWeight:700,color:col.color}}>{reachable!==null?reachable:'…'}</div>
              <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>contacts with phone numbers opted in to {col.label}</div>
            </div>

            {/* Test */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Test first</div>
              <div style={{display:'flex',gap:8}}>
                <input className="form-input" type="tel" value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="+1 415 555 1234" style={{flex:1}}/>
                <button className="btn btn-sm" onClick={()=>send(true)} disabled={sending||!testPhone.replace(/\D/g,'').length}>
                  {sending?'…':'Send test'}
                </button>
              </div>
              <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>
                {channel==='whatsapp'?'Your number must have WhatsApp installed':'Standard SMS rates apply for test'}
              </div>
            </div>

            {reachable===0&&(
              <div style={{padding:'10px 14px',background:'#2A2010',borderRadius:8,border:'1px solid #E8A02030',fontSize:12,color:'#E8A020',marginBottom:12}}>
                ⚠ No contacts have phone numbers yet. Import contacts with phone numbers from OpenTable or add them manually.
              </div>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2,justifyContent:'center',background:col.color,borderColor:col.color}} onClick={()=>send(false)} disabled={sending||reachable===0}>
                {sending?'Sending…':'Send to all'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Twilio Setup Guide ─────────────────────────────────────────────────────────
function TwilioSetupGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{marginBottom:20,background:'var(--bg-2)',borderRadius:10,border:'1px solid var(--border)',overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'12px 16px',background:'none',border:'none',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left'}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:18}}>⚙️</span>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>Twilio setup required</div>
            <div style={{fontSize:11,color:'var(--ink-3)'}}>Add 4 environment variables to Railway to enable sending</div>
          </div>
        </div>
        <span style={{color:'var(--ink-3)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{padding:'0 16px 16px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.8,marginBottom:12}}>
            <strong>1. Create a Twilio account</strong> at <a href="https://www.twilio.com" target="_blank" rel="noopener noreferrer" style={{color:'var(--gold)'}}>twilio.com</a> (free trial includes $15 credit)
          </div>
          <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.8,marginBottom:12}}>
            <strong>2. Get a phone number</strong> — Buy a number in Twilio Console → Phone Numbers → Buy a number. Choose a local US number with SMS capability (~$1/month)
          </div>
          <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.8,marginBottom:12}}>
            <strong>3. Register for 10DLC</strong> (required for business SMS in US) — Twilio Console → Messaging → Regulatory Compliance → US A2P 10DLC. Takes ~1-2 weeks for carrier approval.
          </div>
          <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.8,marginBottom:16}}>
            <strong>4. For WhatsApp</strong> — Twilio Console → Messaging → Try WhatsApp → Join sandbox for testing. Production requires Meta Business verification.
          </div>
          <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',fontSize:12}}>
            <div style={{fontWeight:600,color:'var(--ink-2)',marginBottom:10}}>Add to Railway → Service → Variables:</div>
            {[
              ['TWILIO_ACCOUNT_SID',    'Your Account SID from Twilio Console dashboard'],
              ['TWILIO_AUTH_TOKEN',     'Your Auth Token from Twilio Console dashboard'],
              ['TWILIO_PHONE_NUMBER',   'Your Twilio number e.g. +14155551234'],
              ['TWILIO_WHATSAPP_NUMBER','WhatsApp sandbox: whatsapp:+14155238886'],
            ].map(([key, desc]) => (
              <div key={key} style={{display:'flex',gap:10,marginBottom:8,alignItems:'flex-start'}}>
                <code style={{background:'var(--bg-2)',padding:'2px 8px',borderRadius:5,fontSize:11,fontFamily:'var(--mono)',color:'var(--gold)',flexShrink:0,whiteSpace:'nowrap'}}>{key}</code>
                <span style={{color:'var(--ink-3)',fontSize:11}}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
