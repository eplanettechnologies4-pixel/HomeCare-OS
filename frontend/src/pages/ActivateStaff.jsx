import React, { useState } from 'react';
import { ShieldCheck, Lock, User, KeyRound, CheckCircle, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import apiFetch from '../services/api';

export default function ActivateStaff() {
  const [form, setForm] = useState({
    username: '',
    code: '',
    new_password: '',
    new_password_confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const username = form.username.trim();
    const code = form.code.trim().toUpperCase();
    const newPassword = form.new_password;
    const confirmPassword = form.new_password_confirm;

    if (!username || !code || !newPassword) {
      setError('Please fill in all required fields.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/activate-staff/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          code,
          new_password: newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess(true);
      } else {
        if (data.password) {
          setError(Array.isArray(data.password) ? data.password.join(' ') : data.password);
        } else {
          setError(data.error || 'Activation failed. Please check your credentials.');
        }
      }
    } catch (err) {
      setError(err.message || 'Network error connecting to activation service.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    window.location.href = '/';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--teal-900) 0%, #064e3b 100%)',
        fontFamily: 'var(--font-body)',
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 36,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          borderRadius: 12,
          background: '#ffffff',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--sage-100)',
              color: 'var(--teal-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--teal-950)' }}>
            Staff Account Activation
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--status-grey)' }}>
            eHealth Hospital at Home • First-Time Account Setup
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle size={36} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#166534', margin: '0 0 8px' }}>
              Account Activated!
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#4b5563', lineHeight: 1.5, margin: '0 0 24px' }}>
              Your password has been successfully configured. You may now log in to the portal using your username and new password.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGoToLogin}
              style={{ width: '100%', minHeight: 44, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              Proceed to Sign In <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: '0.82rem',
                  color: '#991b1b',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                Username *
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="e.g. john.doe"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                One-Time Activation Code *
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{
                    paddingLeft: 38,
                    fontFamily: 'monospace',
                    letterSpacing: '2px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                  placeholder="e.g. 8K2M9XYZ"
                  maxLength={16}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                Provided on your staff credentials slip.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                Create New Password *
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: 38, paddingRight: 38 }}
                  placeholder="At least 8 characters"
                  value={form.new_password}
                  onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                Confirm Password *
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="Repeat your password"
                  value={form.new_password_confirm}
                  onChange={(e) => setForm({ ...form, new_password_confirm: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: '0.95rem',
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {loading ? 'Activating Account...' : 'Activate Account & Set Password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <a
                href="/"
                style={{ fontSize: '0.8rem', color: 'var(--teal-700)', textDecoration: 'none', fontWeight: 600 }}
              >
                Already have an active password? Return to Sign In →
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
