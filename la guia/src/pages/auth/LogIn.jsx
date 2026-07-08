import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LogIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await logIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card enter">
        <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, fontWeight: 500, marginBottom: 6 }}>Welcome back</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 24 }}>Log in to your production workspace.</p>
        
        {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@studio.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <a href="#" style={{ fontSize: 12.5 }} onClick={e => { e.preventDefault(); navigate('/reset-password'); }}>Forgot password?</a>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 6 }}>
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--ink-3)' }}>
          New to Grainline? <a href="#" onClick={e => { e.preventDefault(); navigate('/signup'); }}>Create a workspace</a>
        </div>
      </div>
    </div>
  );
}