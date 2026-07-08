import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, setToken } from '../lib/api.js';

const API = '';

const STEPS = [
  { id: 'company',  label: 'Company',   icon: '🏢' },
  { id: 'location', label: 'Location',  icon: '📍' },
  { id: 'branding', label: 'Branding',  icon: '🎨' },
  { id: 'loyalty',  label: 'Loyalty',   icon: '🦚' },
  { id: 'billing',  label: 'Billing',   icon: '💳' },
];

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page:    { minHeight:'100vh', background:'#0D0D0D', color:'#F0F0F0', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 20px 80px' },
  card:    { background:'#141414', border:'1px solid #222', borderRadius:16, padding:'32px', width:'100%', maxWidth:520 },
  label:   { display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:'#666', marginBottom:6 },
  input:   { display:'block', width:'100%', padding:'10px 14px', background:'#1A1A1A', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:14, outline:'none', transition:'border-color .15s', boxSizing:'border-box' },
  btn:     { width:'100%', padding:'13px', background:'#E8A020', color:'#000', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', transition:'background .15s' },
  btnSec:  { width:'100%', padding:'13px', background:'transparent', color:'#666', border:'1px solid #333', borderRadius:8, fontSize:14, cursor:'pointer' },
  error:   { background:'#2A1A1A', border:'1px solid #F26C6C40', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#F26C6C', marginBottom:16 },
  step:    { fontSize:11, color:'#666', marginBottom:8, fontFamily:'monospace' },
  title:   { fontSize:26, fontWeight:700, letterSpacing:'-0.02em', marginBottom:6 },
  sub:     { fontSize:14, color:'#666', marginBottom:28, lineHeight:1.6 },
  group:   { marginBottom:16 },
};

function Input({ label, ...props }) {
  return (
    <div style={S.group}>
      {label && <label style={S.label}>{label}</label>}
      <input style={S.input} {...props}
        onFocus={e=>e.target.style.borderColor='#E8A020'}
        onBlur={e=>e.target.style.borderColor='#333'}
      />
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ current }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div style={{ display:'flex', gap:8, marginBottom:32, width:'100%', maxWidth:520 }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ flex:1, textAlign:'center' }}>
          <div style={{ height:3, borderRadius:2, background: i <= idx ? '#E8A020' : '#222', marginBottom:6, transition:'background .3s' }}/>
          <div style={{ fontSize:10, color: i === idx ? '#E8A020' : i < idx ? '#666' : '#333', fontWeight: i === idx ? 600 : 400 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Company ─────────────────────────────────────────────────────────────
function StepCompany({ onNext }) {
  const [form, setForm] = useState({ companyName:'', name:'', email:'', password:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleNext = async () => {
    if (!form.companyName || !form.name || !form.email || !form.password) return setError('All fields required');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantName: form.companyName, name: form.name, email: form.email, password: form.password }),
      });
      const data = await res.json();

      if (!data.ok) {
        // If email already exists, try to log them in — they may be retrying after a billing failure
        if (data.error?.includes('already registered') || data.error?.includes('already exists')) {
          const loginRes = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email, password: form.password }),
          });
          const loginData = await loginRes.json();
          if (!loginData.ok) {
            setError('An account with this email already exists. Check your password or sign in at /login.');
            return;
          }
          setToken(loginData.data.token);
          auth.setUser(loginData.data.user);
          onNext({ ...form, tenantId: loginData.data.user.tenantId, token: loginData.data.token, existingAccount: true });
          return;
        }
        throw new Error(data.error);
      }

      setToken(data.data.token);
      auth.setUser(data.data.user);
      onNext({ ...form, tenantId: data.data.user.tenantId, token: data.data.token });
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div style={S.step}>Step 1 of 5</div>
      <div style={S.title}>Welcome to Pulse</div>
      <div style={S.sub}>Set up your account in minutes. Start with a 14-day free trial — no credit card needed yet.</div>
      {error && <div style={S.error}>{error}</div>}
      <Input label="Restaurant group / company name" value={form.companyName} onChange={e=>f('companyName',e.target.value)} placeholder="e.g. Pippal Restaurant Group"/>
      <Input label="Your full name" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Vikram Madan"/>
      <Input label="Email" type="email" value={form.email} onChange={e=>f('email',e.target.value)} placeholder="vikram@yourrestaurant.com"/>
      <Input label="Password (min 8 characters)" type="password" value={form.password} onChange={e=>f('password',e.target.value)} placeholder="••••••••"/>
      <button style={S.btn} onClick={handleNext} disabled={saving}>{saving ? 'Creating account…' : 'Create account →'}</button>
      <div style={{ textAlign:'center', marginTop:16, fontSize:13, color:'#555' }}>
        Already have an account? <a href="/login" style={{ color:'#E8A020' }}>Sign in</a>
      </div>
    </>
  );
}

// ── Step 2: Location ────────────────────────────────────────────────────────────
function StepLocation({ data, onNext, onBack }) {
  const [form, setForm] = useState({ name:'', address:'', city:'', state:'', phone:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleNext = async () => {
    if (!form.name || !form.city) return setError('Restaurant name and city required');
    setSaving(true); setError('');
    try {
      // If existing account, check if they already have locations
      if (data.existingAccount) {
        const existing = await fetch(`${API}/api/locations`, {
          headers: { 'Authorization': `Bearer ${data.token}` },
        }).then(r => r.json());
        if (existing.ok && existing.data?.length > 0) {
          onNext({ ...data, locationId: existing.data[0].id, locationName: existing.data[0].name });
          return;
        }
      }
      const res = await fetch(`${API}/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` },
        body: JSON.stringify({ name:form.name, address:form.address||'', city:form.city, state:form.state||'', zip:'00000', phone:form.phone }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      onNext({ ...data, locationId: d.data.id, locationName: form.name });
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div style={S.step}>Step 2 of 5</div>
      <div style={S.title}>Add your first location</div>
      <div style={S.sub}>You can add more locations later. Start with your flagship restaurant.</div>
      {error && <div style={S.error}>{error}</div>}
      <Input label="Restaurant name" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Rooh SF"/>
      <Input label="Address" value={form.address} onChange={e=>f('address',e.target.value)} placeholder="333 Soma St"/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Input label="City" value={form.city} onChange={e=>f('city',e.target.value)} placeholder="San Francisco"/>
        <Input label="State" value={form.state} onChange={e=>f('state',e.target.value)} placeholder="CA"/>
      </div>
      <Input label="Phone (optional)" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="+1 (415) 000-0000"/>
      <button style={S.btn} onClick={handleNext} disabled={saving}>{saving ? 'Saving…' : 'Continue →'}</button>
      <button style={{...S.btnSec, marginTop:10}} onClick={onBack}>← Back</button>
    </>
  );
}

// ── Step 3: Branding ────────────────────────────────────────────────────────────
function StepBranding({ data, onNext, onBack }) {
  const [form, setForm] = useState({ brand_voice:'', instagram_handle:'' });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleNext = async () => {
    if (form.brand_voice && data.locationId) {
      setSaving(true);
      try {
        await fetch(`${API}/api/locations/${data.locationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` },
          body: JSON.stringify(form),
        });
      } catch(_) {}
      setSaving(false);
    }
    onNext({ ...data, ...form });
  };

  return (
    <>
      <div style={S.step}>Step 3 of 5</div>
      <div style={S.title}>Your brand voice</div>
      <div style={S.sub}>This teaches Claude how to write marketing content that sounds like you. You can refine this later.</div>
      <div style={S.group}>
        <label style={S.label}>Brand voice (optional)</label>
        <textarea value={form.brand_voice} onChange={e=>f('brand_voice',e.target.value)}
          placeholder="e.g. Sophisticated yet warm. We focus on craft, spice, and story. Never use the words 'delicious' or 'amazing'."
          style={{...S.input, minHeight:100, resize:'vertical', lineHeight:1.6}}
          onFocus={e=>e.target.style.borderColor='#E8A020'}
          onBlur={e=>e.target.style.borderColor='#333'}
        />
      </div>
      <Input label="Instagram handle (optional)" value={form.instagram_handle} onChange={e=>f('instagram_handle',e.target.value)} placeholder="@yourrestaurant"/>
      <button style={S.btn} onClick={handleNext} disabled={saving}>{saving ? 'Saving…' : 'Continue →'}</button>
      <button style={{...S.btnSec, marginTop:10}} onClick={onBack}>← Back</button>
      <button style={{...S.btnSec, marginTop:8, border:'none', color:'#444'}} onClick={()=>onNext(data)}>Skip for now</button>
    </>
  );
}

// ── Step 4: Loyalty ─────────────────────────────────────────────────────────────
function StepLoyalty({ data, onNext, onBack }) {
  const [form, setForm] = useState({ program_name:'', program_tagline:'Earn points every visit', accent_color:'#E8A020' });
  const [saving, setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleNext = async () => {
    if (form.program_name) {
      setSaving(true);
      try {
        await fetch(`${API}/api/agent-8/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` },
          body: JSON.stringify(form),
        });
      } catch(_) {}
      setSaving(false);
    }
    onNext({ ...data, ...form });
  };

  return (
    <>
      <div style={S.step}>Step 4 of 5</div>
      <div style={S.title}>Name your loyalty program</div>
      <div style={S.sub}>Customers will see this in their digital loyalty card. Make it memorable.</div>
      <Input label="Program name" value={form.program_name} onChange={e=>f('program_name',e.target.value)} placeholder="e.g. Spice Circle, The Inner Circle, Gold Table"/>
      <Input label="Tagline" value={form.program_tagline} onChange={e=>f('program_tagline',e.target.value)} placeholder="e.g. Earn points every visit"/>
      <div style={S.group}>
        <label style={S.label}>Accent colour</label>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <input type="color" value={form.accent_color} onChange={e=>f('accent_color',e.target.value)}
            style={{ width:44, height:40, borderRadius:6, border:'1px solid #333', cursor:'pointer', padding:2, background:'#1A1A1A' }}/>
          <input value={form.accent_color} onChange={e=>f('accent_color',e.target.value)}
            style={{...S.input, flex:1}} placeholder="#E8A020"
            onFocus={e=>e.target.style.borderColor='#E8A020'}
            onBlur={e=>e.target.style.borderColor='#333'}
          />
        </div>
      </div>
      {/* Preview */}
      <div style={{ background:'#1A1A1A', borderRadius:12, padding:16, border:`1px solid ${form.accent_color}40`, marginBottom:20 }}>
        <div style={{ fontSize:11, color:'#555', marginBottom:4 }}>Preview</div>
        <div style={{ fontSize:18, fontWeight:700, color:form.accent_color }}>{form.program_name || 'Your Program Name'}</div>
        <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{form.program_tagline}</div>
        <div style={{ fontFamily:'monospace', fontSize:24, fontWeight:700, color:'#fff', marginTop:8 }}>1,240 pts</div>
        <div style={{ height:4, background:'#111', borderRadius:2, marginTop:8, overflow:'hidden' }}>
          <div style={{ height:'100%', width:'35%', background:form.accent_color, borderRadius:2 }}/>
        </div>
      </div>
      <button style={S.btn} onClick={handleNext} disabled={saving}>{saving ? 'Saving…' : 'Continue →'}</button>
      <button style={{...S.btnSec, marginTop:10}} onClick={onBack}>← Back</button>
      <button style={{...S.btnSec, marginTop:8, border:'none', color:'#444'}} onClick={()=>onNext(data)}>Skip for now</button>
    </>
  );
}

// ── Step 5: Billing ─────────────────────────────────────────────────────────────
function StepBilling({ data, onNext, onBack }) {
  const [plans, setPlans]   = useState([]);
  const [selected, setSelected] = useState('entree');
  const [loading, setLoading]   = useState(true);
  const [going, setGoing]       = useState(false);
  const [error, setError]       = useState('');
  // Fall back to localStorage if data not passed (direct /onboarding/billing link)
  const token    = data.token    || localStorage.getItem('ros_token') || '';
  const tenantId = data.tenantId || JSON.parse(localStorage.getItem('ros_user')||'{}').tenantId || '';
  const email    = data.email    || JSON.parse(localStorage.getItem('ros_user')||'{}').email    || '';

  useEffect(() => {
    fetch(`${API}/api/billing/plans`)
      .then(r=>r.json())
      .then(r=>{ if(r.ok) setPlans(r.data); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  const handleCheckout = async () => {
    const plan = plans.find(p=>p.id===selected);
    if (!plan) return;
    setGoing(true); setError('');
    try {
      const res = await fetch(`${API}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ planId: selected, tenantId, email }),
      });
      const d = await res.json();
      if (!d.ok) {
        // Stripe price not configured yet — allow them to skip and enter app
        if (d.error?.includes('price not configured') || d.error?.includes('Invalid plan')) {
          setError('Billing not configured yet — you can set it up later in Settings.');
          setTimeout(() => onNext(data), 2000);
          return;
        }
        throw new Error(d.error || 'Failed to create checkout session');
      }
      window.location.href = d.data.url;
    } catch(e) {
      // Don't lose their account — show error and let them retry or skip
      setError(`Billing error: ${e.message}. You can skip and add billing later in Settings.`);
      setGoing(false);
    }
  };

  const handleSkip = () => onNext(data);

  return (
    <>
      <div style={S.step}>Step 5 of 5</div>
      <div style={S.title}>Choose your plan</div>
      <div style={S.sub}>14-day free trial on all plans. No credit card charged until your trial ends.</div>
      {error && <div style={S.error}>{error}</div>}
      {loading ? <div style={{ textAlign:'center', color:'#555', padding:20 }}>Loading plans…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {plans.map(plan => (
            <div key={plan.id} onClick={()=>setSelected(plan.id)} style={{ padding:'16px', borderRadius:10, border:`2px solid ${selected===plan.id?'#E8A020':'#222'}`, cursor:'pointer', background: selected===plan.id?'#1A1A10':'#1A1A1A', transition:'all .15s', position:'relative' }}>
              {plan.popular && <div style={{ position:'absolute', top:-1, right:16, background:'#E8A020', color:'#000', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'0 0 6px 6px', letterSpacing:'.06em' }}>POPULAR</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                <div style={{ fontSize:15, fontWeight:600 }}>{plan.name}</div>
                <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700, color: selected===plan.id?'#E8A020':'#fff' }}>${plan.amount}<span style={{ fontSize:12, color:'#555', fontFamily:'sans-serif' }}>/mo</span></div>
              </div>
              <div style={{ fontSize:12, color:'#666', marginBottom:10 }}>{plan.description}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {plan.features.map((f,i) => (
                  <span key={i} style={{ fontSize:11, color:'#888', background:'#111', padding:'3px 8px', borderRadius:4 }}>✓ {f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button style={S.btn} onClick={handleCheckout} disabled={going||loading}>
        {going ? 'Redirecting to Stripe…' : 'Start 14-day free trial →'}
      </button>
      <div style={{ textAlign:'center', fontSize:12, color:'#444', margin:'10px 0' }}>No credit card charged during trial</div>
      <button style={{...S.btnSec, marginTop:4}} onClick={handleSkip}>Skip billing for now</button>
      <button style={{...S.btnSec, marginTop:8, border:'none', color:'#444'}} onClick={onBack}>← Back</button>
    </>
  );
}

// ── Success ─────────────────────────────────────────────────────────────────────
function Success() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate('/'), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
      <div style={S.title}>You're all set!</div>
      <div style={S.sub}>Your 14-day free trial has started. Redirecting to your dashboard…</div>
      <div style={{ width:40, height:40, border:'3px solid #333', borderTopColor:'#E8A020', borderRadius:'50%', animation:'spin .6s linear infinite', margin:'20px auto' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep]   = useState('company');
  const [data, setData]   = useState({});

  // Handle Stripe redirects and direct billing link
  useEffect(() => {
    if (searchParams.get('session_id')) { setStep('success'); return; }
    if (window.location.pathname === '/onboarding/billing') {
      // User came from banner or cancel — jump to billing step
      // Restore token from localStorage if already logged in
      const stored = localStorage.getItem('ros_user');
      const token  = localStorage.getItem('ros_token');
      if (stored && token) {
        const user = JSON.parse(stored);
        setData({ tenantId: user.tenantId, email: user.email, token });
      }
      setStep('billing');
    }
  }, []);

  const next = (newData) => {
    setData(newData);
    const steps = STEPS.map(s=>s.id);
    const idx   = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
    else setStep('success');
  };

  const back = () => {
    const steps = STEPS.map(s=>s.id);
    const idx   = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  return (
    <div style={S.page}>
      {/* Logo */}
      <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.03em', marginBottom:32, color:'#fff' }}>
        Pulse<span style={{ color:'#E8A020' }}>.</span>
      </div>

      {step !== 'success' && <StepBar current={step}/>}

      <div style={S.card}>
        {step === 'company'  && <StepCompany  onNext={next}/>}
        {step === 'location' && <StepLocation onNext={next} onBack={back} data={data}/>}
        {step === 'branding' && <StepBranding onNext={next} onBack={back} data={data}/>}
        {step === 'loyalty'  && <StepLoyalty  onNext={next} onBack={back} data={data}/>}
        {step === 'billing'  && <StepBilling  onNext={next} onBack={back} data={data}/>}
        {step === 'success'  && <Success/>}
      </div>
    </div>
  );
}
