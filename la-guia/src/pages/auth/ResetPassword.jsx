import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthLayout from './AuthLayout.jsx';

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

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Check your inbox"
        title="Link's on its way"
        subtitle={<>We emailed a reset link to <strong style={{ color: 'var(--ink-2)' }}>{email}</strong>. It's good for the next hour.</>}
      >
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={() => navigate('/login')}>Back to sign in</button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Forgot your password?"
      subtitle="Give us the email on your account and we'll send a link to get back in."
      footer={<a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Back to sign in</a>}
    >
      {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}

      <form onSubmit={handleReset}>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" autoComplete="email" placeholder="you@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 6 }} disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
