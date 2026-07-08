import React, { useState, useEffect, useCallback, useRef } from 'react';
import { agent1, media } from '../../lib/api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => (n||0).toLocaleString();
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

// ── Main Newsletter Tab ────────────────────────────────────────────────────────
export default function NewsletterTab({ location }) {
  const [view, setView]           = useState('list');   // list | editor | contacts | import
  const [newsletters, setNewsletters] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);
  const [editing, setEditing]     = useState(null);     // newsletter being edited

  const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),4000); };

  const loadAll = useCallback(async () => {
    // Works with or without a selected restaurant — no location = whole group
    setLoading(true);
    try {
      const [nls, cts] = await Promise.all([
        agent1.nlList({ locationId: location?.id }),
        agent1.nlContacts({ locationId: location?.id }),
      ]);
      setNewsletters(Array.isArray(nls) ? nls : []);
      const ctArr = Array.isArray(cts) ? cts : [];
      setContacts(ctArr);
      setStats({
        total:       ctArr.length,
        subscribed:  ctArr.filter(c=>c.subscribed).length,
        opentable:   ctArr.filter(c=>c.source==='opentable').length,
        resy:        ctArr.filter(c=>c.source==='resy').length,
        manual:      ctArr.filter(c=>c.source==='manual').length,
      });
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  }, [location?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openEditor = (nl = null) => { setEditing(nl); setView('editor'); };

  const handleDelete = async (id) => {
    if (!confirm('Delete this draft?')) return;
    await agent1.nlDelete(id);
    setNewsletters(n => n.filter(x => x.id !== id));
    showToast('Deleted');
  };

  // Toast must render in EVERY view — these early returns previously dropped it
  const toastEl = toast && <div className="toast" style={{background:toast.err?'#E24B4A':'var(--ink)'}}>{toast.err?'⚠':'✓'} {toast.msg}</div>;

  if (view === 'editor') return (<>
    <NewsletterEditor
      newsletter={editing}
      location={location}
      onBack={() => { setView('list'); loadAll(); }}
      showToast={showToast}
    />
    {toastEl}
  </>);

  if (view === 'contacts') return (<>
    <ContactsManager
      contacts={contacts}
      stats={stats}
      location={location}
      onBack={() => { setView('list'); loadAll(); }}
      onImport={() => setView('import')}
      showToast={showToast}
    />
    {toastEl}
  </>);

  if (view === 'import') return (<>
    <ImportContacts
      location={location}
      onBack={() => { setView('contacts'); loadAll(); }}
      showToast={showToast}
    />
    {toastEl}
  </>);

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Email Newsletters</div>
          <div style={{fontSize:12,color:'var(--ink-3)'}}>
            {fmt(stats.subscribed)} subscribers · {fmt(newsletters.filter(n=>n.status==='sent').length)} sent
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-sm" onClick={()=>setView('contacts')}>
            👥 Contacts ({fmt(stats.subscribed)})
          </button>
          <button className="btn btn-primary btn-sm" onClick={()=>openEditor(null)}>
            + New newsletter
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
        {[
          {label:'Total contacts',  val:fmt(stats.total),      color:'var(--ink)'},
          {label:'Subscribed',      val:fmt(stats.subscribed), color:'#3ECF8E'},
          {label:'OpenTable/Resy',  val:fmt((stats.opentable||0)+(stats.resy||0)), color:'var(--gold)'},
          {label:'Newsletters sent',val:fmt(newsletters.filter(n=>n.status==='sent').length), color:'var(--ink)'},
        ].map((s,i) => (
          <div key={i} style={{background:'var(--bg-2)',borderRadius:10,padding:'12px 16px',border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{s.label}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:s.color}}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Newsletter list */}
      {loading ? <div className="spinner" style={{margin:'40px auto'}}/> :
       newsletters.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✉️</div>
          <div className="empty-state-title">No newsletters yet</div>
          <div className="empty-state-sub">Create your first newsletter to keep guests coming back</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>openEditor(null)}>Create newsletter</button>
        </div>
      ) : (
        <div className="card">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['Subject','Status','Sent to','Sent date','Opens',''].map(h=>(
                  <th key={h} style={{padding:'9px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newsletters.map(nl=>(
                <tr key={nl.id} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{fontWeight:600}}>{nl.subject}</div>
                    {nl.preview_text && <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>{nl.preview_text}</div>}
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{fontSize:11,padding:'2px 10px',borderRadius:20,fontWeight:600,
                      background:nl.status==='sent'?'#0A2A1A':nl.status==='draft'?'var(--bg)':'var(--bg)',
                      color:nl.status==='sent'?'#3ECF8E':'var(--ink-3)',
                      border:'1px solid '+(nl.status==='sent'?'#3ECF8E30':'var(--border)')}}>
                      {nl.status}
                    </span>
                  </td>
                  <td style={{padding:'12px 16px',fontFamily:'var(--mono)',fontSize:12}}>{nl.sent_count||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:12,color:'var(--ink-3)'}}>{nl.sent_at?fmtDate(nl.sent_at):'—'}</td>
                  <td style={{padding:'12px 16px',fontFamily:'var(--mono)',fontSize:12}}>{nl.open_count||'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-sm" onClick={()=>openEditor(nl)}>
                        {nl.status==='sent'?'View':'Edit'}
                      </button>
                      {nl.status==='draft' && (
                        <button className="btn btn-sm" onClick={()=>handleDelete(nl.id)} style={{color:'var(--ink-3)'}}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toastEl}
    </div>
  );
}

// ── Newsletter Editor ─────────────────────────────────────────────────────────
function NewsletterEditor({ newsletter, location, onBack, showToast }) {
  const isSent   = newsletter?.status === 'sent';
  const [subject, setSubject]     = useState(newsletter?.subject     || '');
  const [preview, setPreview]     = useState(newsletter?.preview_text|| '');
  const [html, setHtml]           = useState(newsletter?.html_content|| '');
  const [text, setText]           = useState(newsletter?.text_content || '');
  const [nlId, setNlId]           = useState(newsletter?.id          || null);
  const [saving, setSaving]       = useState(false);
  const [sending, setSending]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState(isSent);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAiModal, setShowAiModal]     = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickedImages, setPickedImages]   = useState([]);

  const isDirty = useRef(false);
  const saveTimer = useRef(null);

  const autoSave = useCallback(async (subj, prev, h, t) => {
    if (!subj.trim() || !h.trim()) return;
    try {
      const saved = await agent1.nlSave({
        id: nlId || undefined,
        locationId: location?.id,
        subject: subj, previewText: prev,
        htmlContent: h, textContent: t, status: 'draft',
      });
      if (!nlId) setNlId(saved.id);
      isDirty.current = false;
    } catch(e) {}
  }, [nlId, location?.id]);

  const triggerAutoSave = (subj, prev, h, t) => {
    isDirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(subj, prev, h, t), 2000);
  };

  const handleSave = async () => {
    if (!subject.trim()) return showToast('Subject required', true);
    setSaving(true);
    try {
      const saved = await agent1.nlSave({
        id: nlId || undefined,
        locationId: location?.id,
        subject, previewText: preview,
        htmlContent: html, textContent: text, status: 'draft',
      });
      setNlId(saved.id);
      showToast('Saved');
    } catch(e) { showToast(e.message, true); }
    finally { setSaving(false); }
  };

  const handleSendClick = async () => {
    if (!subject.trim()) return showToast('Add a subject line before sending', true);
    if (!html.trim())    return showToast('Newsletter body is empty', true);
    let id = nlId;
    if (!id) {
      // Save the draft first, then open the send modal
      setSaving(true);
      try {
        const saved = await agent1.nlSave({
          locationId: location?.id,
          subject, previewText: preview,
          htmlContent: html, textContent: text, status: 'draft',
        });
        id = saved.id; setNlId(saved.id);
      } catch(e) { showToast('Could not save draft: ' + e.message, true); setSaving(false); return; }
      setSaving(false);
    }
    setShowSendModal(true);
  };

  const handleGenerate = async (params) => {
    setGenerating(true); setShowAiModal(false);
    // Images picked inside the AI modal flow through and also populate the editor strip
    const genImages = (params.imageUrls && params.imageUrls.length) ? params.imageUrls : pickedImages;
    if (params.imageUrls && params.imageUrls.length) {
      setPickedImages(prev => Array.from(new Set([...prev, ...params.imageUrls])));
    }
    try {
      const result = await agent1.nlGenerate({
        locationId: location?.id,
        locationName: location?.name,
        ...params,
        imageUrls: genImages,
      });
      setSubject(result.subject || '');
      setPreview(result.previewText || '');
      setHtml(result.htmlContent || '');
      setText(result.textContent || '');
      setPreviewMode(true);
      showToast('Newsletter generated — review and edit below');
    } catch(e) { showToast(e.message, true); }
    finally { setGenerating(false); }
  };

  const insertImage = (url) => {
    setPickedImages(p => [...p, url]);
    setShowImagePicker(false);
    showToast('Image added — reorder below, then Insert in this order');
  };

  return (
    <div>
      {/* Topbar */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <div style={{flex:1,minWidth:200}}>
          <input value={subject} onChange={e=>{setSubject(e.target.value);triggerAutoSave(e.target.value,preview,html,text);}}
            placeholder="Subject line…" disabled={isSent}
            style={{width:'100%',background:'transparent',border:'none',borderBottom:'1px solid var(--border)',padding:'4px 0',fontSize:16,fontWeight:600,color:'var(--ink)',outline:'none'}}/>
        </div>
        {!isSent && (
          <>
            <button className="btn btn-sm" onClick={()=>setShowAiModal(true)} disabled={generating}>
              {generating?'🤖 Generating…':'🤖 AI generate'}
            </button>
            <button className="btn btn-sm" onClick={()=>setShowImagePicker(true)}>📷 Add image</button>
            <button className="btn btn-sm" onClick={()=>setPreviewMode(p=>!p)}>
              {previewMode?'✏️ Edit':'👁 Preview'}
            </button>
            <button className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving?'Saving…':'Save draft'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSendClick}>
              📧 Send
            </button>
          </>
        )}
      </div>

      {/* Preview text */}
      {!isSent && (
        <input value={preview} onChange={e=>{setPreview(e.target.value);triggerAutoSave(subject,e.target.value,html,text);}}
          placeholder="Preview text (shown in inbox preview)…"
          style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)',color:'var(--ink)',fontSize:13,marginBottom:12,boxSizing:'border-box'}}/>
      )}

      {/* Image strip — reorder / remove before sending */}
      {!isSent && pickedImages.length > 0 && (
        <div style={{marginBottom:12,padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg-2)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em'}}>Images · {pickedImages.length}</div>
            <button className="btn btn-sm" style={{marginLeft:'auto'}} onClick={()=>{
              const block = pickedImages.map(u=>'<img src="'+u+'" style="width:100%;max-width:600px;height:auto;display:block;margin:16px auto" alt=""/>').join('\n');
              setHtml(h=>{ const cleaned=h.replace(/<img[^>]*>\s*/g,''); const nh=(cleaned.trim()?cleaned.trim()+'\n':'')+block; triggerAutoSave(subject,preview,nh,text); return nh; });
              showToast('Images inserted in this order');
            }}>Insert in this order</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {pickedImages.map((url,i)=>(
              <div key={i} style={{position:'relative',width:84,height:84,borderRadius:6,overflow:'hidden',border:'1px solid var(--border)'}}>
                <img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                <div style={{position:'absolute',left:0,right:0,bottom:0,display:'flex',justifyContent:'space-between',background:'rgba(0,0,0,.6)'}}>
                  <button title="Move left" onClick={()=>setPickedImages(p=>{ if(i===0)return p; const n=[...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; })} style={{background:'none',border:'none',color:'#fff',cursor:'pointer',fontSize:12,padding:'2px 6px'}}>◀</button>
                  <button title="Remove" onClick={()=>setPickedImages(p=>p.filter((_,k)=>k!==i))} style={{background:'none',border:'none',color:'#fff',cursor:'pointer',fontSize:11,padding:'2px 4px'}}>✕</button>
                  <button title="Move right" onClick={()=>setPickedImages(p=>{ if(i===p.length-1)return p; const n=[...p]; [n[i+1],n[i]]=[n[i],n[i+1]]; return n; })} style={{background:'none',border:'none',color:'#fff',cursor:'pointer',fontSize:12,padding:'2px 6px'}}>▶</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:'var(--ink-4)',marginTop:6}}>Reorder with ◀ ▶, remove with ✕, then "Insert in this order" to place them in the email.</div>
        </div>
      )}

      {/* Editor / Preview split */}
      <div style={{display:'grid',gridTemplateColumns:previewMode?'1fr':'1fr 1fr',gap:12,height:'calc(100vh - 280px)',minHeight:500}}>
        {!previewMode && (
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>HTML content</div>
            <textarea value={html} onChange={e=>{setHtml(e.target.value);triggerAutoSave(subject,preview,e.target.value,text);}}
              placeholder="Write HTML email content here, or use AI generate above…"
              style={{flex:1,padding:'12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)',color:'var(--ink)',fontSize:12,fontFamily:'var(--mono)',resize:'none',lineHeight:1.6,outline:'none'}}/>
          </div>
        )}
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>
            Preview {isSent && <span style={{color:'#3ECF8E',marginLeft:8}}>✓ Sent</span>}
          </div>
          <div style={{flex:1,border:'1px solid var(--border)',borderRadius:8,overflow:'auto',background:'#f4f4f0'}}>
            <div style={{maxWidth:600,margin:'0 auto',background:'#fff',minHeight:'100%'}}>
              {html ? (
                <div dangerouslySetInnerHTML={{__html: html}}/>
              ) : (
                <div style={{padding:40,textAlign:'center',color:'var(--ink-3)'}}>
                  <div style={{fontSize:32,marginBottom:12}}>✉️</div>
                  <div>Your newsletter preview will appear here</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAiModal     && <AiGenerateModal onGenerate={handleGenerate} onClose={()=>setShowAiModal(false)} generating={generating} locationName={location?.name}/>}
      {showImagePicker && <ImagePickerModal onPick={insertImage} onClose={()=>setShowImagePicker(false)}/>}
      {showSendModal   && <SendModal newsletterId={nlId} location={location} onClose={()=>setShowSendModal(false)} onSent={(r)=>{ setShowSendModal(false); showToast('Sent to '+r.sent+' subscribers'); onBack(); }} showToast={showToast}/>}
    </div>
  );
}

// ── AI Generate Modal ──────────────────────────────────────────────────────────
function AiGenerateModal({ onGenerate, onClose, generating, locationName }) {
  const [form, setForm] = useState({ topic:'', tone:'warm, engaging, slightly sophisticated', occasion:'', promoCode:'', sections:'' });
  const [images, setImages] = useState([]);
  const [pickImg, setPickImg] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const TONES = ['warm, engaging, slightly sophisticated','playful and fun','elegant and refined','casual and friendly','exciting and urgent'];
  const OCCASIONS = ['','Monthly newsletter','Seasonal menu launch','Special event','Holiday promotion','New dish announcement','Chef spotlight'];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:520,maxWidth:'95vw',border:'1px solid var(--border)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700}}>🤖 AI Newsletter</div>
            <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>Claude will write a full newsletter for {locationName||'your restaurant'}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Topic / what to write about</label>
            <input className="form-input" value={form.topic} onChange={e=>f('topic',e.target.value)} placeholder="e.g. New summer menu, Chef's tasting event, Diwali celebration…"/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Occasion</label>
            <select className="form-select" value={form.occasion} onChange={e=>f('occasion',e.target.value)}>
              {OCCASIONS.map(o=><option key={o} value={o}>{o||'None'}</option>)}
            </select>
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
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Sections to include <span style={{fontWeight:400,color:'var(--ink-3)'}}>optional — leave blank for auto</span></label>
            <input className="form-input" value={form.sections} onChange={e=>f('sections',e.target.value)} placeholder="e.g. featured dish, upcoming event, chef's note"/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <label className="form-label" style={{marginBottom:0}}>Images {images.length>0?`· ${images.length}`:'(optional)'}</label>
              <button type="button" className="btn btn-sm" onClick={()=>setPickImg(true)}>📷 Add image</button>
              {images.length>0 && <button type="button" className="btn btn-sm" style={{color:'var(--red)'}} onClick={()=>setImages([])}>Clear</button>}
            </div>
            {images.length>0 ? (
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {images.map((url,i)=>(
                  <div key={i} style={{position:'relative',width:64,height:64,borderRadius:6,overflow:'hidden',border:'1px solid var(--border)'}}>
                    <img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    <button onClick={()=>setImages(p=>p.filter((_,k)=>k!==i))} style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,.6)',border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:10,padding:'1px 4px'}}>✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{fontSize:11,color:'var(--ink-3)'}}>Claude will reference these images and place them in the newsletter.</div>
            )}
          </div>
        </div>
        <div style={{padding:'0 20px 20px',display:'flex',gap:8}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={()=>onGenerate({...form, imageUrls: images})} disabled={generating||!form.topic.trim()}>
            {generating?'Generating…':'Generate newsletter'}
          </button>
        </div>
        {pickImg && <ImagePickerModal onPick={(url)=>{ setImages(p=>[...p,url]); setPickImg(false); }} onClose={()=>setPickImg(false)}/>}
      </div>
    </div>
  );
}

// ── Image Picker Modal ─────────────────────────────────────────────────────────
function ImagePickerModal({ onPick, onClose }) {
  const [path, setPath]       = useState('');
  const [folders, setFolders] = useState([]);
  const [files, setFiles]     = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const browse = useCallback(async (p='') => {
    setLoading(true); setError('');
    try {
      const r = await media.browse(p); // returns { folders, files }
      setFolders(Array.isArray(r?.folders) ? r.folders : []);
      setFiles(Array.isArray(r?.files) ? r.files : []);
      setPath(p);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ browse(''); },[browse]);

  const go = (p) => { setHistory(h=>[...h, path]); browse(p); };
  const back = () => { const prev = history[history.length-1] ?? ''; setHistory(h=>h.slice(0,-1)); browse(prev); };
  const crumbs = path ? path.split('/').filter(Boolean) : [];

  const handlePick = async (file) => {
    try {
      const r = await media.sharedLink(file.path);
      const url = (r.url||r.link||'').replace('www.dropbox.com','dl.dropboxusercontent.com').replace('?dl=0','?raw=1').replace('?dl=1','?raw=1');
      onPick(url);
    } catch(e) { setError('Could not get image link: '+e.message); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:70}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:680,maxWidth:'95vw',maxHeight:'85vh',border:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:700}}>📷 Pick an image</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        {/* Breadcrumb nav */}
        <div style={{padding:'8px 16px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',fontSize:12}}>
          {history.length>0 && <button className="btn btn-sm" onClick={back}>← Back</button>}
          <button onClick={()=>{setHistory([]);browse('');}} style={{background:'none',border:'none',color:!path?'var(--gold)':'var(--ink-3)',cursor:'pointer',fontSize:12}}>📦 Dropbox</button>
          {crumbs.map((c,i)=>(
            <span key={i} style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{color:'var(--ink-4)'}}>/</span>
              <span style={{color:i===crumbs.length-1?'var(--gold)':'var(--ink-3)'}}>{c}</span>
            </span>
          ))}
        </div>
        {error && <div style={{padding:'8px 16px',color:'var(--red)',fontSize:12}}>{error}</div>}
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {loading ? <div className="spinner" style={{margin:'40px auto'}}/> : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10}}>
              {folders.map((f,i)=>(
                <div key={'d'+i} onClick={()=>go(f.path)}
                  style={{borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',overflow:'hidden',background:'var(--bg)'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{padding:'24px 12px',textAlign:'center'}}>
                    <div style={{fontSize:28,marginBottom:6}}>📁</div>
                    <div style={{fontSize:11,color:'var(--ink-3)',wordBreak:'break-word'}}>{f.name}</div>
                  </div>
                </div>
              ))}
              {files.filter(f=>f.resource_type==='image').map((f,i)=>(
                <div key={'f'+i} onClick={()=>handlePick(f)}
                  style={{borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',overflow:'hidden',background:'var(--bg)'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{height:90,background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,overflow:'hidden'}}>
                    {f.thumbnail_url ? <img src={f.thumbnail_url} alt={f.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : '🖼'}
                  </div>
                  <div style={{padding:'6px 8px',fontSize:10,color:'var(--ink-3)',wordBreak:'break-word'}}>{f.name}</div>
                </div>
              ))}
              {folders.length===0 && files.filter(f=>f.resource_type==='image').length===0 && !loading &&
                <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'var(--ink-3)',fontSize:13}}>Nothing here. Use the breadcrumb to navigate to a folder with images.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Send Modal ─────────────────────────────────────────────────────────────────
function SendModal({ newsletterId, location, onClose, onSent, showToast }) {
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending]     = useState(false);
  const [result, setResult]       = useState(null);
  const [allContacts, setAllContacts] = useState([]);
  const [mode, setMode]           = useState('all'); // 'all' | 'choose'
  const [chosen, setChosen]       = useState(new Set());
  const [search, setSearch]       = useState('');

  useEffect(()=>{
    agent1.nlContacts({locationId:location?.id,subscribed:true})
      .then(r=>setAllContacts(Array.isArray(r)?r:[])).catch(()=>{});
  },[location?.id]);

  const subCount = allContacts.length;
  const filtered = allContacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.email||'').toLowerCase().includes(q) ||
           ((c.first_name||'')+' '+(c.last_name||'')).toLowerCase().includes(q);
  });
  const toggleOne = (id) => setChosen(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const recipientCount = mode==='all' ? subCount : chosen.size;

  const send = async (test=false) => {
    setSending(true);
    try {
      const r = await agent1.nlSend({
        newsletterId,
        locationId: location?.id,
        testEmail: test ? testEmail : undefined,
        contactIds: (!test && mode==='choose') ? [...chosen] : undefined,
      });
      if (test) { showToast('Test sent to '+testEmail); }
      else { setResult(r); }
    } catch(e) { showToast(e.message, true); }
    finally { setSending(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:460,maxWidth:'95vw',border:'1px solid var(--border)',padding:24}}>
        {result ? (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:48,marginBottom:12}}>📧</div>
            <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:700,marginBottom:8}}>Newsletter sent!</div>
            <div style={{fontSize:14,color:'var(--ink-3)',marginBottom:4}}>{result.sent} emails sent successfully</div>
            {result.failed>0&&<div style={{fontSize:12,color:'#F26C6C'}}>{result.failed} failed to deliver</div>}
            <button className="btn btn-primary" style={{marginTop:20,width:'100%',justifyContent:'center'}} onClick={()=>onSent(result)}>Done</button>
          </div>
        ) : (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700}}>Send newsletter</div>
              <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
            </div>

            {/* Recipients */}
            <div style={{background:'var(--bg)',borderRadius:8,padding:'14px 16px',marginBottom:16,border:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <div style={{fontSize:12,color:'var(--ink-3)'}}>Recipients</div>
                <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                  <button className="btn btn-sm" style={mode==='all'?{background:'var(--ink)',color:'var(--card)',borderColor:'var(--ink)'}:{}} onClick={()=>setMode('all')}>All subscribers</button>
                  <button className="btn btn-sm" style={mode==='choose'?{background:'var(--ink)',color:'var(--card)',borderColor:'var(--ink)'}:{}} onClick={()=>setMode('choose')}>Choose…</button>
                </div>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:24,fontWeight:700,color:'var(--gold)'}}>{recipientCount}</div>
              <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>
                {mode==='all' ? `subscribed contacts for ${location?.name||'this location'}` : `of ${subCount} selected`}
              </div>
              {mode==='choose' && (
                <div style={{marginTop:12}}>
                  <div style={{display:'flex',gap:6,marginBottom:8}}>
                    <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or email…" style={{flex:1,fontSize:12}}/>
                    <button className="btn btn-sm" onClick={()=>setChosen(new Set(filtered.map(c=>c.id)))}>All shown</button>
                    <button className="btn btn-sm" onClick={()=>setChosen(new Set())}>None</button>
                  </div>
                  <div style={{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:6}}>
                    {filtered.length===0 ? <div style={{padding:16,textAlign:'center',fontSize:12,color:'var(--ink-3)'}}>No matching contacts</div> :
                     filtered.map(c=>(
                      <label key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 12px',borderBottom:'1px solid var(--border)',cursor:'pointer',fontSize:12}}>
                        <input type="checkbox" checked={chosen.has(c.id)} onChange={()=>toggleOne(c.id)} style={{width:15,height:15,cursor:'pointer'}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{[c.first_name,c.last_name].filter(Boolean).join(' ')||'—'}</div>
                          <div style={{fontSize:11,color:'var(--ink-3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Test send */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Send test first</div>
              <div style={{display:'flex',gap:8}}>
                <input className="form-input" type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="your@email.com" style={{flex:1}}/>
                <button className="btn btn-sm" onClick={()=>send(true)} disabled={sending||!testEmail.includes('@')}>
                  {sending?'…':'Send test'}
                </button>
              </div>
            </div>

            <div style={{display:'flex',gap:8}}>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={()=>send(false)} disabled={sending||recipientCount===0}>
                {sending?'Sending…':(mode==='all'?`Send to all ${subCount} subscribers`:`Send to ${chosen.size} selected`)}
              </button>
            </div>

            {subCount===0&&<div style={{fontSize:11,color:'var(--ink-3)',marginTop:8,textAlign:'center'}}>No subscribers yet — import contacts first</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Contacts Manager ───────────────────────────────────────────────────────────
function ContactsManager({ contacts, stats, location, onBack, showToast, onImport }) {
  const [search, setSearch]     = useState('');
  const [deleting, setDeleting] = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [localContacts, setLocalContacts] = useState(contacts);

  const filtered = localContacts.filter(c =>
    !search || c.email.includes(search.toLowerCase()) ||
    (c.first_name||'').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await agent1.nlDeleteContact(id);
      setLocalContacts(c => c.filter(x => x.id !== id));
      showToast('Contact removed');
    } catch(e) { showToast(e.message, true); }
    finally { setDeleting(null); }
  };

  return (
    <div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <div style={{flex:1,fontWeight:700,fontSize:15}}>Contacts ({localContacts.filter(c=>c.subscribed).length} subscribed)</div>
        <button className="btn btn-sm" onClick={()=>setShowAdd(true)}>+ Add contact</button>
        <button className="btn btn-primary btn-sm" onClick={onImport}>⬆ Import CSV</button>
      </div>

      {/* Source breakdown */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[
          {label:'OpenTable', val:stats.opentable||0, color:'#E8A020'},
          {label:'Resy',      val:stats.resy||0,      color:'#4A90D9'},
          {label:'Manual',    val:stats.manual||0,    color:'var(--ink-3)'},
        ].map(s=>(
          <div key={s.label} style={{padding:'6px 14px',borderRadius:20,border:'1px solid var(--border)',background:'var(--bg-2)',fontSize:12}}>
            <span style={{color:s.color,fontWeight:600}}>{s.val}</span> {s.label}
          </div>
        ))}
      </div>

      <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by email or name…" style={{marginBottom:12}}/>

      <div className="card">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
            {['Name','Email','Source','Last visit','Status',''].map(h=>(
              <th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.slice(0,200).map(c=>(
              <tr key={c.id} style={{borderBottom:'1px solid var(--border)',opacity:c.subscribed?1:0.5}}>
                <td style={{padding:'9px 14px',fontWeight:500}}>{c.first_name||''} {c.last_name||''}</td>
                <td style={{padding:'9px 14px',fontSize:12,color:'var(--ink-3)'}}>{c.email}</td>
                <td style={{padding:'9px 14px'}}>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:'var(--bg)',border:'1px solid var(--border)',textTransform:'capitalize'}}>{c.source||'manual'}</span>
                </td>
                <td style={{padding:'9px 14px',fontSize:12,color:'var(--ink-3)'}}>{c.last_visit?fmtDate(c.last_visit):'—'}</td>
                <td style={{padding:'9px 14px'}}>
                  <span style={{fontSize:10,fontWeight:600,color:c.subscribed?'#3ECF8E':'var(--ink-3)'}}>{c.subscribed?'✓ Subscribed':'Unsubscribed'}</span>
                </td>
                <td style={{padding:'9px 14px'}}>
                  <button onClick={()=>handleDelete(c.id)} disabled={deleting===c.id} style={{background:'none',border:'none',color:'var(--ink-4)',cursor:'pointer',fontSize:13}}>×</button>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'var(--ink-3)'}}>No contacts found</td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && <AddContactModal location={location} onClose={()=>setShowAdd(false)} onSaved={c=>{setLocalContacts(p=>[c,...p]);setShowAdd(false);showToast('Contact added');}} showToast={showToast}/>}
    </div>
  );
}

// ── Add Contact Modal ──────────────────────────────────────────────────────────
function AddContactModal({ location, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({email:'',firstName:'',lastName:'',phone:'',source:'manual'});
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const handleSave = async () => {
    if (!form.email.includes('@')) return showToast('Valid email required', true);
    setSaving(true);
    try {
      const saved = await agent1.nlAddContact({...form, locationId: location?.id});
      onSaved(saved);
    } catch(e) { showToast(e.message, true); setSaving(false); }
  };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:420,maxWidth:'95vw',border:'1px solid var(--border)',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:700}}>Add contact</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Email *</label><input className="form-input" type="email" value={form.email} onChange={e=>f('email',e.target.value)}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">First name</label><input className="form-input" value={form.firstName} onChange={e=>f('firstName',e.target.value)}/></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Last name</label><input className="form-input" value={form.lastName} onChange={e=>f('lastName',e.target.value)}/></div>
          </div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)}/></div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Source</label>
            <select className="form-select" value={form.source} onChange={e=>f('source',e.target.value)}>
              {['manual','opentable','resy','website','loyalty','other'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:16}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Add contact'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Import Contacts ────────────────────────────────────────────────────────────
export function ImportContacts({ location, onBack, showToast }) {
  const [csvText, setCsvText]   = useState('');
  const [source, setSource]     = useState('opentable');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) return showToast('No CSV data', true);
    setLoading(true);
    try {
      const r = await agent1.nlImport({ locationId: location?.id, csvText, source });
      setResult(r);
      showToast('Import complete: '+r.imported+' new, '+r.updated+' updated');
    } catch(e) { showToast(e.message, true); }
    finally { setLoading(false); }
  };

  const SOURCES = [
    {val:'opentable', label:'OpenTable',  hint:'Export from OpenTable → Reports → Guest Data'},
    {val:'resy',      label:'Resy',       hint:'Export from Resy → Analytics → Guest Export'},
    {val:'tock',      label:'Tock',       hint:'Export from Tock → Reports → Guests'},
    {val:'toast',     label:'Toast POS',  hint:'Export from Toast → Guest Management'},
    {val:'csv',       label:'Generic CSV',hint:'Any CSV with an "email" column'},
  ];

  return (
    <div style={{maxWidth:640}}>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <div style={{fontWeight:700,fontSize:15}}>Import contacts from reservation system</div>
      </div>

      {result ? (
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:14,padding:24,textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:700,marginBottom:16}}>Import complete</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
            {[
              {label:'New contacts',val:result.imported,color:'#3ECF8E'},
              {label:'Updated',     val:result.updated, color:'var(--gold)'},
              {label:'Skipped',     val:result.skipped, color:'var(--ink-3)'},
            ].map(s=>(
              <div key={s.label} style={{background:'var(--bg)',borderRadius:10,padding:'14px',border:'1px solid var(--border)'}}>
                <div style={{fontFamily:'var(--mono)',fontSize:28,fontWeight:700,color:s.color}}>{s.val}</div>
                <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>{s.label}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={onBack}>View contacts</button>
        </div>
      ) : (
        <>
          {/* Source selector */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Reservation system</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {SOURCES.map(s=>(
                <button key={s.val} onClick={()=>setSource(s.val)} style={{padding:'8px 14px',borderRadius:8,border:`1px solid ${source===s.val?'var(--gold)':'var(--border)'}`,background:source===s.val?'var(--gold-bg)':'var(--bg-2)',color:source===s.val?'var(--gold)':'var(--ink-2)',cursor:'pointer',fontSize:13,fontWeight:source===s.val?600:400}}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,color:'var(--ink-3)',marginTop:8}}>
              💡 {SOURCES.find(s=>s.val===source)?.hint}
            </div>
          </div>

          {/* File upload */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Upload CSV file</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{display:'none'}}/>
            <button className="btn" onClick={()=>fileRef.current?.click()} style={{marginBottom:10}}>
              📂 Choose CSV file
            </button>
          </div>

          {/* Or paste */}
          <div className="form-group" style={{marginBottom:16}}>
            <label className="form-label">Or paste CSV content</label>
            <textarea className="form-textarea" rows={6} value={csvText} onChange={e=>setCsvText(e.target.value)}
              placeholder={'email,first_name,last_name,phone,last_visit\njohn@example.com,John,Smith,415-555-1234,2024-12-15'}
              style={{fontFamily:'var(--mono)',fontSize:12}}/>
          </div>

          {/* Column mapping hint */}
          <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:12,color:'var(--ink-3)',lineHeight:1.7}}>
            <strong style={{color:'var(--ink-2)'}}>Recognized column names:</strong> email, first_name, last_name, phone, last_visit, visit_count<br/>
            Unrecognized columns are safely ignored. The email column is required.
          </div>

          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={handleImport} disabled={loading||!csvText.trim()}>
            {loading?'Importing…':'Import contacts'}
          </button>
        </>
      )}
    </div>
  );
}
