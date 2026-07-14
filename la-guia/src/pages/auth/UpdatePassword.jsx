import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function UpdatePassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      return setError('Please fill out both fields.');
    }
    if (password !== confirmPassword) {
      return setError('Those two passwords don\'t match.');
    }
    if (password.length < 6) {
      return setError('Use at least 6 characters.');
    }

    setLoading(true);
    setError('');

    try {
      await updatePassword(password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'That reset link may have expired — request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Almost done"
      title="Set a new password"
      subtitle="Pick something you'll remember — six characters or more."
    >
      {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13, border: '1px solid var(--red-border)' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">New password</label>
          <input className="form-input" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm password</label>
          <input className="form-input" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 6 }}>
          {loading ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthLayout>
  );
}
