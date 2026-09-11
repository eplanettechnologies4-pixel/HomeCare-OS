import React, { useState } from 'react';
import { Heart, Eye, EyeOff, Lock, Mail, Shield, AlertCircle, CheckCircle, ArrowRight, X, Phone, Key, Activity } from 'lucide-react';
import useStore from '../store/useStore';

export default function Login() {
  const login         = useStore((s) => s.login);
  const setCurrentRole= useStore((s) => s.setCurrentRole);
  const setActivePage = useStore((s) => s.setActivePage);

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(true);
  const [loading, setLoading]           = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [isSuspended, setIsSuspended]   = useState(false);

  // Forgot Password Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep]           = useState(1); // 1: Request, 2: Reset Form
  const [resetTarget, setResetTarget]         = useState('');
  const [otpCode, setOtpCode]                 = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [resetSuccess, setResetSuccess]       = useState(false);

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setIsSuspended(false);
    setLoading(true);

    try {
      const res = await login({ emailOrPhone, password });
      setLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Authentication failed');
        if (res.isSuspended) setIsSuspended(true);
      } else {
        const role = res.role;
        if (role === 'patient_family') {
          setActivePage('family-portal');
        } else {
          setActivePage('overview');
        }
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg('Login failed. Please check network connection.');
    }
  };

  const handleSendOtp = () => {
    if (!resetTarget) return;
    setForgotStep(2);
  };

  const handleConfirmReset = () => {
    if (!otpCode || !newPassword) return;
    setResetSuccess(true);
    setTimeout(() => {
      setShowForgotModal(false);
      setForgotStep(1);
      setResetSuccess(false);
      setPassword(newPassword);
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', background: 'var(--teal-900)', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>
      
      {/* ── LEFT HERO BRAND COLUMN ────────────────────────────────────── */}
      <div style={{
        flex: '1 1 50%',
        background: 'linear-gradient(135deg, #2d0b43 0%, #611F8C 50%, #7529a7 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 80px',
        position: 'relative',
        boxSizing: 'border-box'
      }} className="login-hero-col">
        {/* Glow ambient circle */}
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(222,154,60,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Brand Logo Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'white', letterSpacing: '-0.02em' }}>
              e<span style={{ color: '#FDE047' }}>Health</span>
            </h1>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              HOSPITAL AT HOME
            </div>
          </div>
        </div>

        {/* Hero Tagline & Stats */}
        <div style={{ maxWidth: 460 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', lineHeight: 1.25, fontWeight: 700, margin: '0 0 16px', color: 'white' }}>
            Compassionate Home Healthcare Management
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', marginBottom: 30 }}>
            Dispatch field staff, track live GPS locations, manage patient medical records, automated billing & instant family portal access.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: Shield, label: 'Role-based Permissions & Audit Trails' },
              { icon: Activity, label: 'Real-time GPS Tracking & SOS Dispatch' },
              { icon: Key, label: 'Secure JWT Auth with Refresh Tokens' },
            ].map(({ icon: Icon, label }, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(222,154,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--amber-400)' }}>
                  <Icon size={14} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
          HomeCare OS · Enterprise Healthcare OS v2.0
        </div>
      </div>

      {/* ── RIGHT FORM COLUMN ─────────────────────────────────────────── */}
      <div style={{
        flex: '1 1 50%',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '50px 40px',
        boxSizing: 'border-box',
        overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--teal-900)' }}>
              Sign In to Your Account
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--status-grey)', margin: 0 }}>
              Enter your credential to access the HomeCare OS admin portal
            </p>
          </div>

          {/* Inline Error / Suspended Alert */}
          {errorMsg && (
            <div style={{
              background: isSuspended ? '#fff5f5' : '#fff8f0',
              border: `1px solid ${isSuspended ? 'var(--status-red)' : 'var(--amber-500)'}`,
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 20,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: '0.85rem',
              color: isSuspended ? 'var(--status-red)' : '#b87320'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Email Address or Phone Number</label>
              <div className="search-input-wrap">
                <Mail size={16} />
                <input
                  type="text"
                  className="form-input search-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="admin@homecareos.com or +92-300..."
                  value={emailOrPhone}
                  onChange={e => setEmailOrPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--teal-600)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setShowForgotModal(true)}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="search-input-wrap" style={{ position: 'relative' }}>
                <Lock size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input search-input"
                  style={{ paddingLeft: 36, paddingRight: 36 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-grey)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--teal-700)' }}
                />
                Remember me on this device
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px 0', fontSize: '0.95rem', fontWeight: 700, borderRadius: 8, justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to Dashboard →'}
            </button>
          </form>

          <div style={{ marginTop: 30, textAlign: 'center', fontSize: '0.75rem', color: 'var(--status-grey)' }}>
            © 2026 HomeCare OS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Forgot Password OTP Modal */}
      {showForgotModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowForgotModal(false)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>Password Reset Flow</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForgotModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              {resetSuccess ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--status-green)' }}>
                  <CheckCircle size={36} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 700 }}>Password Reset Successfully!</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginTop: 4 }}>You can now log in with your new password.</div>
                </div>
              ) : forgotStep === 1 ? (
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--status-grey)', marginBottom: 14 }}>
                    Enter your registered email address or phone number to receive a 6-digit OTP reset code.
                  </p>
                  <div className="form-group">
                    <label className="form-label">Email or Phone Number</label>
                    <input
                      className="form-input"
                      placeholder="admin@homecareos.com"
                      value={resetTarget}
                      onChange={e => setResetTarget(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ background: 'var(--sage-50)', padding: 10, borderRadius: 6, fontSize: '0.8rem', marginBottom: 14, color: 'var(--teal-800)' }}>
                    OTP sent to: <strong>{resetTarget}</strong> (Demo OTP: 123456)
                  </div>
                  <div className="form-group">
                    <label className="form-label">Enter 6-Digit OTP Code</label>
                    <input className="form-input" placeholder="123456" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input type="password" className="form-input" placeholder="Enter new password..." value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
            {!resetSuccess && (
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowForgotModal(false)}>Cancel</button>
                {forgotStep === 1 ? (
                  <button className="btn btn-primary" onClick={handleSendOtp} disabled={!resetTarget}>
                    Send OTP Reset Code →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleConfirmReset} disabled={!otpCode || !newPassword}>
                    Confirm Password Reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
