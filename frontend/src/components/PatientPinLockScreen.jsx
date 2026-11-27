import React, { useState } from 'react';
import { Lock, Unlock, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react';
import apiFetch from '../services/api';
import { sanitizePinInput, isValidSixDigitPin } from '../utils/pinHelpers';

export default function PatientPinLockScreen({
  patientId,
  patientName,
  lockReason,
  onUnlocked,
  onBack,
}) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [lockedOutUntil, setLockedOutUntil] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleaned = sanitizePinInput(pin);
    if (!isValidSixDigitPin(cleaned)) {
      setErrorMsg('Please enter the 6-digit Duty PIN.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiFetch(`/patients/${patientId}/unlock/`, {
        method: 'POST',
        body: JSON.stringify({ pin: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.unlocked) {
        setPin('');
        setAttemptsRemaining(null);
        setLockedOutUntil(null);
        if (onUnlocked) onUnlocked(data);
      } else {
        setErrorMsg(data.detail || 'Invalid or expired Duty PIN.');
        if (typeof data.attempts_remaining === 'number') {
          setAttemptsRemaining(data.attempts_remaining);
        }
        if (data.locked_until) {
          setLockedOutUntil(data.locked_until);
        }
      }
    } catch (err) {
      setErrorMsg('Network error while verifying Duty PIN.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#FFFFFF',
          border: '1.5px solid #DDD6FE',
          borderRadius: '16px',
          padding: '28px 24px',
          boxShadow: '0 10px 30px rgba(109, 40, 217, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#FAF5FF',
              border: '1px solid #DDD6FE',
              color: '#6D28D9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Lock size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1E1B4B' }}>
              Patient File Locked
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748B' }}>
              {patientName ? `${patientName} — ` : ''}Enter your 6-digit Duty PIN to unlock
            </p>
          </div>
        </div>

        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '12.5px',
            color: '#475569',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <ShieldCheck size={16} color="#6D28D9" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            {lockReason || 'Patient file locked. Get the PIN from your admin or supervisor.'}
          </span>
        </div>

        {errorMsg && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              padding: '10px 12px',
              color: '#991B1B',
              fontSize: '12.5px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700 }}>{errorMsg}</div>
              {attemptsRemaining !== null && attemptsRemaining > 0 && (
                <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                  Attempts remaining before lockout: {attemptsRemaining}
                </div>
              )}
              {lockedOutUntil && (
                <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                  Locked out until {new Date(lockedOutUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Contact your admin.
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              htmlFor="duty-pin-input"
              style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}
            >
              6-Digit Duty PIN
            </label>
            <input
              id="duty-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(sanitizePinInput(e.target.value))}
              placeholder="••••••"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                fontSize: '22px',
                letterSpacing: '0.45em',
                textAlign: 'center',
                fontWeight: 800,
                borderRadius: '10px',
                border: '1.5px solid #CBD5E1',
                outline: 'none',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || pin.length !== 6}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              background: submitting || pin.length !== 6 ? '#CBD5E1' : '#6D28D9',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '14px',
              cursor: submitting || pin.length !== 6 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Unlock size={16} />
            <span>{submitting ? 'Verifying PIN...' : 'Unlock Patient File'}</span>
          </button>
        </form>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              marginTop: '14px',
              width: '100%',
              padding: '8px',
              background: 'none',
              border: 'none',
              color: '#6D28D9',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Patients Directory</span>
          </button>
        )}
      </div>
    </div>
  );
}
