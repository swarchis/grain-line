import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuth();
  
  const [form, setForm] = useState({ email: '', brandName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInvite, setIsInvite] = useState(false);

  // Catch the URL parameter if they clicked an invite email link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const prefillEmail = params.get('email');
    if (prefillEmail) {
      setForm(f => ({ ...f, email: prefillEmail, brandName: 'My Personal Workspace' }));
      setIsInvite(true);
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || (!form.brandName && !isInvite) || !form.password) {
      return setError('All fields are required.');
    }
    setLoading(true);
    setError('');
    try {
      await signUp(form.email, form.password, form.brandName || 'Workspace');
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card enter">
        <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, fontWeight: 500, marginBottom: 6 }}>
          {isInvite ? 'Accept your invitation' : 'Create your workspace'}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 24 }}>
          {isInvite ? "Sign up to join your team's workspace." : "One account, one brand to start — you can add more later."}
        </p>
        
        {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@studio.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={isInvite} style={isInvite ? { background: 'var(--bg-2)', color: 'var(--ink-3)' } : {}}/>
          </div>
          {!isInvite && (
            <div className="form-group">
              <label className="form-label">Brand name</label>
              <input className="form-input" placeholder="e.g. Aldercreek Studio" value={form.brandName} onChange={e => setForm({...form, brandName: e.target.value})} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', margin: '6px 0 14px' }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'center', marginBottom: 14, lineHeight: 1.4 }}>
            By creating an account, you agree to our <a href="#" onClick={e => { e.preventDefault(); navigate('/terms'); }} style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>Terms of Service</a> and <a href="#" onClick={e => { e.preventDefault(); navigate('/privacy'); }} style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>Privacy Policy</a>.
          </div>
        </form>
        {isInvite && (
          <div className="form-hint" style={{ textAlign: 'center', marginBottom: 14 }}>
            Once your account is created, you will automatically be added to the shared workspace.
          </div>
        )}
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
          Already have an account? <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Log in</a>
        </div>
      </div>
    </div>
  );
}