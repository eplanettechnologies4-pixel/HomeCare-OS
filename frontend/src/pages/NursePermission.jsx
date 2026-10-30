import React, { useState, useEffect, useMemo } from 'react';
import { Clock, PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import apiFetch from '../services/api';
import { Modal, Input, Textarea, FormRow, Button, Badge, EmptyState, Card } from '../components/ui';

export default function NursePermission() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff-portal/permission-requests/');
      if (res.ok) {
        const json = await res.json();
        setPermissions(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  // Compute live duration
  const durationText = useMemo(() => {
    if (!startTime || !endTime) return '';
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const totalStart = startH * 60 + startM;
    const totalEnd = endH * 60 + endM;
    const diff = totalEnd - totalStart;
    if (diff <= 0) return 'Invalid time range';
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hrs === 0) return `${mins} mins`;
    if (mins === 0) return `${hrs} hour${hrs > 1 ? 's' : ''}`;
    return `${hrs}h ${mins}m`;
  }, [startTime, endTime]);

  const isFormValid = date && startTime && endTime && durationText !== 'Invalid time range' && reason.trim().length > 0;
  const isDirty = Boolean(reason || startTime !== '14:00' || endTime !== '16:00');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/permission-requests/', {
        method: 'POST',
        body: JSON.stringify({
          date,
          start_time: startTime,
          end_time: endTime,
          reason,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const refId = data.id ? `PRM-${String(data.id).padStart(4, '0')}` : 'PRM-SUBMITTED';
        setToast({ type: 'success', text: `Permission request logged for supervisor review (${durationText}). Ref: ${refId}` });
        loadPermissions();
        setShowModal(false);
        setReason('');
        setTimeout(() => setToast(null), 6000);
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.detail || 'Could not submit permission request.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network connection error. Your draft has been kept.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return <Badge variant="green">Approved</Badge>;
    if (s === 'rejected') return <Badge variant="red">Rejected</Badge>;
    return <Badge variant="amber">Pending Review</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            Permission Requests (Short Leave)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Request short partial-shift leave by time range (1-3 hours) with prior supervisor approval.
          </p>
        </div>
        <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
          Request Permission
        </Button>
      </div>

      {/* ── Toast confirmation notification ── */}
      {toast && (
        <div className={`alert-callout alert-callout-${toast.type === 'error' ? 'danger' : 'success'}`}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Permission Requests List Card ── */}
      <Card style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div className="skeleton-line" style={{ width: '50%' }} />
            <div className="skeleton-line" style={{ width: '80%' }} />
            <div className="skeleton-line" style={{ width: '65%' }} />
          </div>
        ) : permissions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {permissions.map((p) => (
              <div
                key={p.id}
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
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                      {p.start_date || p.date} • {p.start_time} to {p.end_time}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', background: '#FFFFFF', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      PRM-{String(p.id).padStart(4, '0')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                    Reason: <strong style={{ color: 'var(--text)' }}>{p.reason}</strong>
                  </div>
                  {p.reviewer_name && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--primary)', marginTop: 4 }}>
                      Reviewed by: {p.reviewer_name}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {getStatusBadge(p.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="No permission requests"
            description="You have not submitted any partial-shift short leave requests."
            action={
              <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
                Request Permission
              </Button>
            }
          />
        )}
      </Card>

      {/* ── Request Short Leave Permission Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Request Short Leave Permission"
        subtitle="Submit partial-shift absence request with time window"
        size="md"
        isDirty={isDirty}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!isFormValid || submitting}
              isLoading={submitting}
              onClick={handleSubmit}
            >
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            type="date"
            label="Shift Date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <FormRow>
            <Input
              type="time"
              label="Start Time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Input
              type="time"
              label="End Time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </FormRow>

          {/* Time Duration Badge */}
          {durationText && durationText !== 'Invalid time range' ? (
            <div className="alert-callout alert-callout-info" style={{ padding: '8px 12px' }}>
              <Clock size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
              <div>
                Requested Partial Absence Duration: <strong>{durationText}</strong>. Please ensure buddy nurse or shift lead is notified before departure.
              </div>
            </div>
          ) : durationText === 'Invalid time range' ? (
            <div className="alert-callout alert-callout-danger" style={{ padding: '8px 12px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>End time must be after start time.</span>
            </div>
          ) : null}

          <Textarea
            label="Reason for Short Leave"
            required
            showCount
            maxLength={400}
            rows={3}
            placeholder="Specify reason (e.g. Medical appointment, urgent family necessity) and handover status..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

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
