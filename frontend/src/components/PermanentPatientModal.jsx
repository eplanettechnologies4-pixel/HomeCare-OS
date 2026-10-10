import React, { useState } from 'react';
import { UserCheck, Copy, Check, Share2, AlertCircle, X, Shield, RefreshCw } from 'lucide-react';

export default function PermanentPatientModal({ data, onClose }) {
  const [copiedField, setCopiedField] = useState(null); // 'username' | 'password' | 'both'

  if (!data) return null;

  const { patientName, username, password, isNew = true } = data;
  const loginUrl = 'https://portal.ehealthpk.com';
  const fullMessage = `eHealth Hospital at Home - Username: ${username}, Password: ${password}, Login: ${loginUrl}`;

  const copyToClipboard = (text, fieldKey) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldKey ? null : curr));
    }, 2000);
  };

  const handleShareWhatsApp = () => {
    const encoded = encodeURIComponent(fullMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ width: 480, maxWidth: '95vw', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div
          className="modal-header"
          style={{
            background: isNew
              ? 'linear-gradient(135deg, #0f766e, #115e59)'
              : 'linear-gradient(135deg, #6d28d9, #5b21b6)',
            color: 'white',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isNew ? (
              <UserCheck size={22} style={{ color: '#86efac' }} />
            ) : (
              <RefreshCw size={22} style={{ color: '#c4b5fd' }} />
            )}
            <div>
              <h3 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700 }}>
                {isNew ? 'Permanent Patient Portal Account' : 'Portal Password Reset'}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {patientName || 'Patient'}
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            style={{ color: 'white', opacity: 0.85 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151', lineHeight: 1.45 }}>
            {isNew
              ? 'A portal user account has been created for this patient. Share these credentials to grant family portal access:'
              : 'A new password has been generated for this patient family portal account:'}
          </p>

          {/* Credentials Box */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Username Row */}
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                Username
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    background: 'white',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {username}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(username, 'username')}
                  title="Copy Username"
                  style={{ minWidth: 70, gap: 4, fontSize: '0.75rem' }}
                >
                  {copiedField === 'username' ? (
                    <>
                      <Check size={13} style={{ color: '#16a34a' }} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Password Row */}
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                Password
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    background: 'white',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {password}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(password, 'password')}
                  title="Copy Password"
                  style={{ minWidth: 70, gap: 4, fontSize: '0.75rem' }}
                >
                  {copiedField === 'password' ? (
                    <>
                      <Check size={13} style={{ color: '#16a34a' }} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Portal Link Reference */}
            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
              <Shield size={12} style={{ color: '#0f766e' }} />
              Login Portal: <a href={loginUrl} target="_blank" rel="noreferrer" style={{ color: '#0f766e', fontWeight: 600 }}>{loginUrl}</a>
            </div>
          </div>

          {/* Action Sharing Buttons: Copy Both & Share on WhatsApp */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => copyToClipboard(fullMessage, 'both')}
              style={{
                flex: 1,
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 600,
                borderColor: copiedField === 'both' ? '#86efac' : '#cbd5e1',
                background: copiedField === 'both' ? '#f0fdf4' : 'white',
                color: copiedField === 'both' ? '#15803d' : '#334155',
              }}
            >
              {copiedField === 'both' ? (
                <>
                  <Check size={14} style={{ color: '#16a34a' }} /> Credentials Copied!
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy Both Credentials
                </>
              )}
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleShareWhatsApp}
              style={{
                flex: 1,
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 600,
                background: '#25D366',
                color: 'white',
                border: 'none',
              }}
            >
              <Share2 size={14} /> Share on WhatsApp
            </button>
          </div>

          {/* Warning notice */}
          <div
            style={{
              fontSize: '0.75rem',
              color: '#b45309',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 6,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, color: '#d97706', marginTop: 1 }} />
            <div>
              <strong>Note:</strong> The password is shown <strong>only once</strong>. If the patient loses their password, use <strong>Reset Password</strong> to generate a new one.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ minWidth: 90 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
