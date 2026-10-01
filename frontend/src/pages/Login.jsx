import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Shield, AlertCircle, CheckCircle, X, Key, Activity, Smartphone } from 'lucide-react';
import useStore from '../store/useStore';

export default function Login() {
  const login = useStore((s) => s.login);
  const setCurrentRole = useStore((s) => s.setCurrentRole);
  const setActivePage = useStore((s) => s.setActivePage);

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [isMobileOnly, setIsMobileOnly] = useState(false);

  // Forgot Password Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Request, 2: Reset Form
  const [resetTarget, setResetTarget] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setIsSuspended(false);
    setIsMobileOnly(false);
    setLoading(true);

    try {
      const res = await login({ emailOrPhone, password });
      setLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Authentication failed');
        if (res.isSuspended) setIsSuspended(true);
        if (res.isMobileOnly) setIsMobileOnly(true);
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
    <div className="login-page-container">

      {/* ── HERO / BRAND PANEL (Mobile: compact top header; Desktop: full split column) ── */}
      <div className="login-hero-panel">
        {/* Glow ambient circle */}
        <div className="login-hero-glow" />

        {/* Brand Logo Header */}
        <div className="login-brand-header">
          <img
            src="/ehealth-logo.png"
            alt="eHealth Logo"
            className="login-brand-logo"
          />
          <div>
            <h1 className="login-brand-title">
              e<span className="login-brand-accent">Health</span>
            </h1>
            <div className="login-brand-sub">
              HOSPITAL AT HOME
            </div>
          </div>
        </div>

        {/* Hero Tagline, Description & Feature Bullets (hidden on mobile < 768px, visible on tablet & desktop) */}
        <div className="login-hero-details">
          <h2 className="login-hero-title">
            Compassionate Home Healthcare Management
          </h2>
          <p className="login-hero-desc">
            Dispatch field staff, track live GPS locations, manage patient medical records, automated billing & instant family portal access.
          </p>

          <div className="login-features-list">
            {[
              { icon: Shield, label: 'Role-based Permissions & Audit Trails' },
              { icon: Activity, label: 'Real-time GPS Tracking & SOS Dispatch' },
              { icon: Key, label: 'Secure JWT Auth with Refresh Tokens' },
            ].map(({ icon: Icon, label }, idx) => (
              <div key={idx} className="login-feature-item">
                <div className="login-feature-icon">
                  <Icon size={14} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info (hidden on mobile < 768px, visible on tablet & desktop) */}
        <div className="login-hero-footer">
          HomeCare OS · Enterprise Healthcare OS v2.0
        </div>
      </div>

      {/* ── FORM PANEL ── */}
      <div className="login-form-panel">
        <div className="login-form-card">

          <div className="login-header-group">
            <h2 className="login-heading">
              Sign In to Your Account
            </h2>
            <p className="login-subheading">
              Enter your credential to access the HomeCare OS admin portal
            </p>
          </div>

          {/* Inline Error / Suspended / Mobile-Only Alert */}
          {errorMsg && (
            <div
              className="login-alert-box"
              style={{
                background: isSuspended ? '#fff5f5' : (isMobileOnly ? 'rgba(245, 158, 11, 0.1)' : '#fff8f0'),
                borderColor: isSuspended ? 'var(--status-red)' : (isMobileOnly ? 'var(--status-amber)' : 'var(--amber-500)'),
                color: isSuspended ? 'var(--status-red)' : (isMobileOnly ? '#92400e' : '#b87320'),
              }}
            >
              {isMobileOnly ? (
                <Smartphone size={20} className="login-alert-icon" style={{ color: 'var(--status-amber)' }} />
              ) : (
                <AlertCircle size={18} className="login-alert-icon" />
              )}
              <div className="login-alert-text">{errorMsg}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit}>
            <div className="login-form-group">
              <label className="form-label">Email Address or Phone Number</label>
              <div className="login-input-wrapper">
                <Mail size={18} className="login-input-icon" />
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  enterKeyHint="next"
                  className="login-field"
                  placeholder="admin@homecareos.com or +92-300..."
                  value={emailOrPhone}
                  onChange={e => setEmailOrPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  className="login-forgot-btn"
                  onClick={() => setShowForgotModal(true)}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="login-input-wrapper">
                <Lock size={18} className="login-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  className="login-field login-field-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-eye-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="login-options-row">
              <label className="login-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="login-remember-checkbox"
                />
                Remember me on this device
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary login-submit-btn"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In to Dashboard →'}
            </button>
          </form>

          <div className="login-copyright">
            © 2026 HomeCare OS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Forgot Password OTP Modal */}
      {showForgotModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowForgotModal(false)}>
          <div className="modal login-modal-responsive">
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', fontSize: 'clamp(1.1rem, 2.5vw, 1.25rem)' }}>Password Reset Flow</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForgotModal(false)} aria-label="Close modal"><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 18px' }}>
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
                      className="form-input login-field"
                      style={{ paddingLeft: 14 }}
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
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label className="form-label">Enter 6-Digit OTP Code</label>
                    <input className="form-input login-field" style={{ paddingLeft: 14 }} placeholder="123456" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input type="password" className="form-input login-field" style={{ paddingLeft: 14 }} placeholder="Enter new password..." value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
            {!resetSuccess && (
              <div className="modal-footer" style={{ padding: '14px 18px', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => setShowForgotModal(false)}>Cancel</button>
                {forgotStep === 1 ? (
                  <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={handleSendOtp} disabled={!resetTarget}>
                    Send OTP Reset Code →
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={handleConfirmReset} disabled={!otpCode || !newPassword}>
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
