export function sanitizePinInput(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

export function isValidSixDigitPin(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin.trim());
}

export function getPinStatusMeta(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') {
    return { label: 'Active', color: '#065F46', bg: '#D1FAE5' };
  }
  if (s === 'locked_out') {
    return { label: 'Locked Out', color: '#991B1B', bg: '#FEE2E2' };
  }
  if (s === 'revoked') {
    return { label: 'Revoked', color: '#9A3412', bg: '#FFEDD5' };
  }
  return { label: 'Expired', color: '#475569', bg: '#E2E8F0' };
}

export function getUnlockCountdown(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) {
    return { expired: true, remainingMinutes: 0, showWarning: false, timeLabel: '' };
  }
  const targetMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(targetMs)) {
    return { expired: true, remainingMinutes: 0, showWarning: false, timeLabel: '' };
  }
  const diffMs = targetMs - nowMs;
  const expired = diffMs <= 0;
  const remainingMinutes = expired ? 0 : Math.ceil(diffMs / 60000);
  const showWarning = !expired && remainingMinutes <= 5;
  const d = new Date(targetMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return {
    expired,
    remainingMinutes,
    showWarning,
    timeLabel: `${hh}:${mm}`,
  };
}

export function buildDutyPinShareMessage({ date, shiftLabel, pin }) {
  const safeDate = date || 'your upcoming duty';
  const safeShift = shiftLabel || 'Scheduled Shift';
  const safePin = pin || '------';
  return `Duty Schedule (${safeDate} — ${safeShift}): Your Patient File Unlock PIN is ${safePin}. Do not share this PIN.`;
}

