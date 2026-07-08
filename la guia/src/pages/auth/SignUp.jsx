import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ email: '', brandName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.brandName || !form.password) {
      return setError('All fields are required.');
    }
    setLoading(true);
    setError('');
    try {
      await signUp(form.email, form.password, form.brandName);
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
        <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, fontWeight: 500, marginBottom: 6 }}>Create your workspace</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 24 }}>One account, one brand to start — you can add more later.</p>
        
        {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@studio.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Brand name</label>
            <input className="form-input" placeholder="e.g. Aldercreek Studio" value={form.brandName} onChange={e => setForm({...form, brandName: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 6 }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--ink-3)' }}>
          Already have an account? <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Log in</a>
        </div>
      </div>
    </div>
  );
}