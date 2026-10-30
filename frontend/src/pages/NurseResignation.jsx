import React, { useState, useEffect } from 'react';
import { UserMinus, AlertTriangle, CheckCircle2, RotateCcw, AlertCircle, ShieldAlert } from 'lucide-react';
import apiFetch from '../services/api';
import { Modal, Textarea, Button, Badge, EmptyState, Card } from '../components/ui';

export default function NurseResignation() {
  const [resignations, setResignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);

  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadResignations = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff-portal/resignation/');
      if (res.ok) {
        const json = await res.json();
        setResignations(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResignations();
  }, []);

  const activePending = resignations.find((r) => r.status === 'pending');
  const isFormValid = reason.trim().length > 0 && confirmed;
  const isDirty = Boolean(reason || confirmed);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/resignation/', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const data = await res.json();
        const refId = data.id ? `RES-${String(data.id).padStart(4, '0')}` : 'RES-SUBMITTED';
        setToast({ type: 'success', text: `Formal resignation notice submitted. Reference: ${refId}. HR workflow initiated.` });
        loadResignations();
        setShowModal(false);
        setReason('');
        setConfirmed(false);
        setTimeout(() => setToast(null), 6000);
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.detail || 'Could not submit resignation notice.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network connection error. Your draft has been kept.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id) => {
    if (!window.confirm('Are you sure you wish to withdraw your resignation notice? This will reinstate your active employee status.')) return;
    try {
      const res = await apiFetch(`/staff-portal/resignation/${id}/withdraw/`, {
        method: 'POST',
      });
      if (res.ok) {
        setToast({ type: 'success', text: 'Resignation notice successfully withdrawn.' });
        loadResignations();
        setTimeout(() => setToast(null), 5000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'accepted') return <Badge variant="green">Accepted</Badge>;
    if (s === 'withdrawn') return <Badge variant="grey">Withdrawn</Badge>;
    return <Badge variant="amber">Under Review</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            Resignation & Employment Transition
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Formal resignation submission with standard 30-day notice period. Active submissions may be withdrawn.
          </p>
        </div>
        {!activePending && (
          <Button
            variant="danger"
            isPill
            icon={UserMinus}
            onClick={() => setShowModal(true)}
          >
            Submit Resignation
          </Button>
        )}
      </div>

      {/* ── Toast confirmation notification ── */}
      {toast && (
        <div className={`alert-callout alert-callout-${toast.type === 'error' ? 'danger' : 'success'}`}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Active Pending Notice Warning Box ── */}
      {activePending && (
        <div className="alert-callout alert-callout-warning" style={{ borderRadius: 'var(--radius-lg)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertTriangle size={22} style={{ color: 'var(--warning)', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text)' }}>
                Active Resignation Notice in Effect
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                Submitted on: <strong>{new Date(activePending.created_at).toLocaleDateString()}</strong> • Notice Period: <strong>{activePending.notice_period_days} days</strong> • Last Working Day: <strong>{activePending.last_working_day}</strong>
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text)', marginTop: 6, fontStyle: 'italic', background: '#FFFFFF', padding: '6px 10px', borderRadius: 6, border: '1px solid #FDE68A' }}>
                "{activePending.reason}"
              </div>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => handleWithdraw(activePending.id)}>
            Withdraw Notice
          </Button>
        </div>
      )}

      {/* ── Resignation History ── */}
      <Card style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '0 0 14px 0' }}>Resignation History</h3>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div className="skeleton-line" style={{ width: '45%' }} />
            <div className="skeleton-line" style={{ width: '75%' }} />
          </div>
        ) : resignations.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resignations.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '14px 16px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                      Notice submitted {new Date(r.created_at).toLocaleDateString()}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      • Projected Last Working Day: <strong>{r.last_working_day || 'Calculated by HR'}</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginTop: 4 }}>
                    {r.reason}
                  </div>
                  {r.reviewer_note && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--primary)', marginTop: 4 }}>
                      HR Note: {r.reviewer_note}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {getStatusBadge(r.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="Active Employee in Good Standing"
            description="No resignation records on file. You are actively rostered on clinical duties."
          />
        )}
      </Card>

      {/* ── Submit Resignation Notice Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Submit Resignation Notice"
        subtitle="Formal employment transition submission with 30-day notice"
        size="md"
        isDirty={isDirty}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isPill
              disabled={!isFormValid || submitting}
              isLoading={submitting}
              onClick={handleSubmit}
            >
              Submit Notice
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Warning Callout Panel */}
          <div className="alert-callout alert-callout-danger">
            <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Important Notice:</strong> Per standard hospital employment terms, submitting a resignation notice initiates a mandatory <strong>30-day notice period</strong> from today's date. Your rostered clinical shifts during this period must be completed or transitioned to replacement staff.
            </div>
          </div>

          <Textarea
            label="Reason for Resignation"
            required
            showCount
            maxLength={600}
            rows={4}
            placeholder="State your formal reason for resignation, availability for handover transition, and expected last working date..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {/* Confirm Checkbox */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--gray-50)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              id="confirmResignation"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--danger)' }}
            />
            <label htmlFor="confirmResignation" style={{ fontSize: '0.82rem', color: 'var(--text)', cursor: 'pointer', lineHeight: 1.4 }}>
              <strong>I confirm that I have reviewed the transition policy</strong> and wish to formally submit my resignation notice with standard 30-day notice period.
            </label>
          </div>

          {feedback && (
            <div className={`alert-callout alert-callout-${feedback.type === 'error' ? 'danger' : 'success'}`}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{feedback.text}</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
