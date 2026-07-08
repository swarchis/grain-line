import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { auth } from '../lib/api.js';

// Paste your Google OAuth Client ID here (safe to hardcode — it's a public value)
// Get it from: console.cloud.google.com → APIs & Services → Credentials
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '201872213910-ejfg8n5jpoh87bo0thb1rq8o4gdt79b5.apps.googleusercontent.com').replace('__PASTE_YOUR_GOOGLE_CLIENT_ID_HERE__','');

export default function Login() {
  const { login, googleLogin, loading } = useAuth();
  const navigate  = useNavigate();
  const loc       = useLocation();
  const dest      = loc.state?.from?.pathname || '/';

  const [mode, setMode]   = useState('login');   // 'login' | 'register'
  const [form, setForm]   = useState({ email:'', password:'', name:'', tenantName:'' });
  const [error, setError] = useState('');
  const [gLoading, setGLoading] = useState(false);
  // For Google → new account flow
  const [googleCred, setGoogleCred]     = useState(null);
  const [googleProfile, setGoogleProfile] = useState(null);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [tenantName, setTenantName]       = useState('');

  const f = (k, v) => setForm(p => ({...p, [k]: v}));

  // Load Google Identity Services script
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  const initGoogle = () => {
    if (!window.google || !GOOGLE_CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
      auto_select: false,
    });
  };

  const handleGoogleResponse = async (response) => {
    setError('');
    setGLoading(true);
    try {
      const res = await auth.googleLogin(response.credential);
      setToken_and_navigate(res);
    } catch(e) {
      if (e.message?.includes('NO_ACCOUNT') || e.message?.includes('No account found')) {
        // Parse profile from token for the registration form
        try {
          const payload = JSON.parse(atob(response.credential.split('.')[1]));
          setGoogleProfile({ name: payload.name, email: payload.email, picture: payload.picture });
          setGoogleCred(response.credential);
          setShowTenantForm(true);
        } catch(_) {}
      } else {
        setError(e.message || 'Google sign-in failed');
      }
    } finally { setGLoading(false); }
  };

  const handleGoogleRegister = async () => {
    if (!tenantName.trim()) return setError('Restaurant / group name required');
    setGLoading(true); setError('');
    try {
      const res = await auth.googleLogin(googleCred, tenantName.trim());
      setToken_and_navigate(res);
    } catch(e) { setError(e.message); }
    finally { setGLoading(false); }
  };

  const setToken_and_navigate = (res) => {
    // AuthProvider handles state, but we need to set token directly here too
    // since we're calling auth.googleLogin directly
    import('../lib/api.js').then(({ setToken }) => {
      setToken(res.token);
      auth.setUser(res.user);
      window.location.href = dest;
    });
  };

  const triggerGoogleButton = () => {
    if (!window.google) return setError('Google sign-in not loaded. Check your Client ID is set in Login.jsx.');
    window.google.accounts.id.prompt();
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        navigate(dest, { replace: true });
      } else {
        if (!form.name.trim())       return setError('Your name is required');
        if (!form.tenantName.trim()) return setError('Restaurant / group name is required');
        if (form.password.length < 8) return setError('Password must be at least 8 characters');
        const res = await auth.register(form.tenantName, form.email, form.password, form.name);
        import('../lib/api.js').then(({ setToken }) => {
          setToken(res.token);
          auth.setUser(res.user);
          window.location.href = '/';
        });
      }
    } catch(err) { setError(err.message || 'Failed'); }
  };

  // ── Google → tenant name step ────────────────────────────────────────────
  if (showTenantForm) {
    return (
      <AuthShell>
        <div style={{textAlign:'center',marginBottom:24}}>
          {googleProfile?.picture && (
            <img src={googleProfile.picture} alt="" style={{width:56,height:56,borderRadius:'50%',marginBottom:10}}/>
          )}
          <div style={{fontSize:15,fontWeight:600}}>Welcome, {googleProfile?.name?.split(' ')[0]}!</div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:4}}>
            {googleProfile?.email} · Just one more thing to set up your account
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Restaurant / Group name</label>
          <input className="form-input" value={tenantName} onChange={e=>setTenantName(e.target.value)}
            placeholder="e.g. Rivaaz Restaurant Group" autoFocus
            onKeyDown={e=>e.key==='Enter'&&handleGoogleRegister()}/>
          <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>This is the name of your restaurant or restaurant group</div>
        </div>
        {error && <div className="alert alert-red" style={{marginBottom:12}}><span>⚠</span> {error}</div>}
        <button className="btn btn-primary" onClick={handleGoogleRegister} disabled={gLoading}
          style={{width:'100%',justifyContent:'center',padding:'10px'}}>
          {gLoading?'Creating account…':'Create account →'}
        </button>
        <button onClick={()=>{setShowTenantForm(false);setError('');}} style={{width:'100%',textAlign:'center',marginTop:10,background:'none',border:'none',color:'var(--ink-3)',fontSize:12,cursor:'pointer'}}>
          ← Back
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {/* Mode toggle */}
      <div style={{display:'flex',background:'var(--bg)',borderRadius:8,padding:3,marginBottom:24}}>
        {['login','register'].map(m => (
          <button key={m} onClick={()=>{setMode(m);setError('');}} style={{flex:1,padding:'7px',borderRadius:6,border:'none',background:mode===m?'var(--bg-2)':'transparent',color:mode===m?'var(--ink)':'var(--ink-3)',fontWeight:mode===m?600:400,fontSize:13,cursor:'pointer',boxShadow:mode===m?'var(--shadow-sm)':'none'}}>
            {m==='login'?'Sign in':'Create account'}
          </button>
        ))}
      </div>

      {/* Google button */}
      {GOOGLE_CLIENT_ID ? (
        <button onClick={triggerGoogleButton} disabled={gLoading}
          style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'10px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)',cursor:'pointer',fontSize:14,fontWeight:500,marginBottom:16,color:'var(--ink)'}}>
          {gLoading ? (
            <span style={{fontSize:12}}>Connecting…</span>
          ) : (
            <>
              <GoogleIcon/>
              {mode==='login'?'Continue with Google':'Sign up with Google'}
            </>
          )}
        </button>
      ) : (
        <div style={{padding:'8px 12px',background:'#2A2010',borderRadius:6,border:'1px solid #E8A02030',fontSize:11,color:'#E8A020',marginBottom:16,textAlign:'center'}}>
          Add your Google Client ID in <code>Login.jsx</code> to enable Google sign-in
        </div>
      )}

      {/* Divider */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
        <div style={{flex:1,height:1,background:'var(--border)'}}/>
        <span style={{fontSize:11,color:'var(--ink-3)'}}>or</span>
        <div style={{flex:1,height:1,background:'var(--border)'}}/>
      </div>

      {/* Email form */}
      <form onSubmit={handleEmailSubmit}>
        {mode==='register' && (
          <>
            <div className="form-group">
              <label className="form-label">Your name</label>
              <input className="form-input" type="text" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Jane Smith" required/>
            </div>
            <div className="form-group">
              <label className="form-label">Restaurant / Group name</label>
              <input className="form-input" type="text" value={form.tenantName} onChange={e=>f('tenantName',e.target.value)} placeholder="Rivaaz Restaurant Group" required/>
            </div>
          </>
        )}
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={form.email} onChange={e=>f('email',e.target.value)} placeholder="owner@restaurant.com" required autoFocus={mode==='login'}/>
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={form.password} onChange={e=>f('password',e.target.value)} placeholder="••••••••" required minLength={mode==='register'?8:1}/>
          {mode==='register'&&<div style={{fontSize:11,color:'var(--ink-3)',marginTop:3}}>Minimum 8 characters</div>}
        </div>

        {error && <div className="alert alert-red" style={{marginBottom:12}}><span>⚠</span> {error}</div>}

        <button className="btn btn-primary" type="submit" disabled={loading}
          style={{width:'100%',justifyContent:'center',padding:'10px'}}>
          {loading ? 'Please wait…' : mode==='login' ? 'Sign in →' : 'Create account →'}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:32,width:400,maxWidth:'95vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:8}}>🍽️</div>
          <h1 style={{fontFamily:'var(--serif)',fontSize:24,fontStyle:'italic',marginBottom:4}}>Pulse</h1>
          <p style={{fontSize:12,color:'var(--ink-3)'}}>Multi-agent restaurant platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
