import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card enter">
        {sent ? (
          <>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <i className="ph ph-check" style={{ fontSize: 20 }} />
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Check your inbox</h1>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 22, lineHeight: 1.6 }}>We sent a password reset link to <strong>{email}</strong>.</p>
            <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={() => navigate('/login')}>Back to log in</button>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, fontWeight: 500, marginBottom: 6 }}>Reset your password</h1>
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 24 }}>We'll email you a link to get back in.</p>
            
            {error && <div className="alert alert-red" style={{ marginBottom: 16, fontSize: 13 }}>{error}</div>}

            <form onSubmit={handleReset}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input 
                  className="form-input" 
                  type="email" 
                  placeholder="you@studio.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 6 }} disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--ink-3)' }}>
              <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Back to log in</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}