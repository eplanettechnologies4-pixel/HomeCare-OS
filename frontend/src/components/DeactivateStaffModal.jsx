import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ShieldAlert, CheckCircle, Info } from 'lucide-react';
import { apiFetch } from '../services/api';
import useStore from '../store/useStore';

export default function DeactivateStaffModal({ staff, isOpen, onClose, onSuccess }) {
  const [commitments, setCommitments] = useState(null);
  const [loadingCommitments, setLoadingCommitments] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchStaff = useStore((s) => s.fetchStaff);

  useEffect(() => {
    if (!isOpen || !staff) return;
    setReason('');
    setConfirmed(false);
    setError('');
    setSuccessMsg('');
    setLoadingCommitments(true);

    apiFetch(`/staff/members/${staff.id}/deactivate/`)
      .then((res) => res.json())
      .then((data) => {
        setCommitments(data);
      })
      .catch((err) => {
        console.warn('Failed to load commitments:', err);
      })
      .finally(() => {
        setLoadingCommitments(false);
      });
  }, [isOpen, staff]);

  if (!isOpen || !staff) return null;

  const hasCommitments =
    commitments &&
    (commitments.active_duties_count > 0 ||
      commitments.active_bookings_count > 0 ||
      commitments.managed_patients_count > 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A written reason is required to deactivate this staff account.');
      return;
    }
    if (hasCommitments && !confirmed) {
      setError('Please check the confirmation box acknowledging active duties and patients.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch(`/staff/members/${staff.id}/deactivate/`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to deactivate staff member.');
      } else {
        setSuccessMsg(data.message || 'Staff member deactivated successfully.');
        if (fetchStaff) fetchStaff();
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
          onClose();
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Network error while deactivating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#991b1b' }}>
                Deactivate Staff Account
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                {staff.full_name || staff.username} ({staff.employee_id}) · {staff.role_display}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={submitting}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Safety policy notice */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: '0.82rem',
                color: '#475569',
                display: 'flex',
                gap: 10,
              }}
            >
              <Info size={18} style={{ flexShrink: 0, color: '#64748b', marginTop: 1 }} />
              <div>
                <strong>Non-Destructive Deactivation:</strong> This account will be set inactive and login will be blocked.
                All historical notes, MAR entries, attendance records, and past bookings remain permanently preserved.
              </div>
            </div>

            {/* Active commitments warning */}
            {loadingCommitments ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>Checking active commitments...</div>
            ) : hasCommitments ? (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: '0.84rem',
                  color: '#92400e',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
                  <AlertTriangle size={16} /> Active Commitments Found
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.82rem', lineHeight: 1.4 }}>
                  This staff member has active or scheduled commitments:
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8rem', lineHeight: 1.5 }}>
                  {commitments.active_duties_count > 0 && (
                    <li>
                      <strong>{commitments.active_duties_count}</strong> upcoming published roster duties
                    </li>
                  )}
                  {commitments.active_bookings_count > 0 && (
                    <li>
                      <strong>{commitments.active_bookings_count}</strong> upcoming/in-progress patient bookings
                    </li>
                  )}
                  {commitments.managed_patients_count > 0 && (
                    <li>
                      <strong>{commitments.managed_patients_count}</strong> active managed patients (Care Manager)
                    </li>
                  )}
                </ul>
              </div>
            ) : null}

            {/* Mandatory Reason */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 6 }}>
                Reason for Deactivation <span style={{ color: '#dc2626' }}>* (Required)</span>
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Specify the reason (e.g. Contract ended, extended leave, resignation, disciplinary)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                disabled={submitting}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Checkbox confirmation if commitments exist */}
            {hasCommitments && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: '0.82rem',
                  color: '#334155',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I confirm that I understand this staff member has scheduled duties/patients and supervisor coverage must be arranged.
                </span>
              </label>
            )}

            {error && (
              <div style={{ color: '#dc2626', fontSize: '0.82rem' }}>
                ⚠️ {error}
              </div>
            )}
            {successMsg && (
              <div style={{ color: '#16a34a', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={15} /> {successMsg}
              </div>
            )}
          </div>

          <div
            className="modal-footer"
            style={{ borderTop: '1px solid var(--sage-200)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}
          >
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={submitting || !reason.trim() || (hasCommitments && !confirmed)}
            >
              {submitting ? 'Deactivating...' : 'Confirm Deactivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

