import React, { useState, useEffect, useMemo } from 'react';
import { CalendarDays, PlusCircle, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import apiFetch from '../services/api';
import { Modal, Select, Input, Textarea, FormRow, Button, Badge, EmptyState, Card } from '../components/ui';

export default function NurseLeave() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);

  const [leaveType, setLeaveType] = useState('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadLeaves = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff/leave-requests/');
      if (res.ok) {
        const json = await res.json();
        setLeaves(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  // Compute live duration in days
  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  const isFormValid = startDate && endDate && dayCount > 0 && reason.trim().length > 0;
  const isDirty = Boolean(startDate || endDate || reason);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/staff/leave-requests/', {
        method: 'POST',
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const refId = data.id ? `LR-${String(data.id).padStart(4, '0')}` : 'LR-SUBMITTED';
        setToast({ type: 'success', text: `Leave application submitted for approval (${dayCount} day${dayCount > 1 ? 's' : ''}). Ref: ${refId}` });
        loadLeaves();
        setShowModal(false);
        setReason('');
        setStartDate('');
        setEndDate('');
        setLeaveType('annual');
        setTimeout(() => setToast(null), 6000);
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.detail || 'Could not submit leave application. Please verify the dates.' });
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
    return <Badge variant="amber">Pending Approval</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            Leave Applications
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Submit and track Annual, Sick, Casual or Emergency leave requests with automatic duty balance check.
          </p>
        </div>
        <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
          Apply for Leave
        </Button>
      </div>

      {/* ── Toast confirmation notification ── */}
      {toast && (
        <div className={`alert-callout alert-callout-${toast.type === 'error' ? 'danger' : 'success'}`}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Leave Records Card ── */}
      <Card style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div className="skeleton-line" style={{ width: '45%' }} />
            <div className="skeleton-line" style={{ width: '85%' }} />
            <div className="skeleton-line" style={{ width: '60%' }} />
          </div>
        ) : leaves.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leaves.map((l) => (
              <div
                key={l.id}
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
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)', textTransform: 'capitalize' }}>
                      {l.leave_type} Leave
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600, background: 'var(--primary-soft)', padding: '1px 8px', borderRadius: 'var(--radius-pill)' }}>
                      {l.start_date} → {l.end_date}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                    Reason: <strong style={{ color: 'var(--text)' }}>{l.reason}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                    Submitted on: {new Date(l.created_at).toLocaleDateString()} {l.approver_name && `• Reviewed by: ${l.approver_name}`}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {getStatusBadge(l.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No leave applications"
            description="You have not submitted any leave requests on your account."
            action={
              <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
                Apply for Leave
              </Button>
            }
          />
        )}
      </Card>

      {/* ── Apply for Leave Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Apply for Leave"
        subtitle="Submit planned absence for coordinator approval and shift coverage"
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
              Submit Application
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="Leave Type"
            required
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
          >
            <option value="annual">Annual Leave</option>
            <option value="sick">Sick Leave</option>
            <option value="emergency">Emergency Leave</option>
            <option value="unpaid">Unpaid Leave</option>
          </Select>

          <FormRow>
            <Input
              type="date"
              label="Start Date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormRow>

          {/* Live Day Count Banner */}
          {dayCount > 0 ? (
            <div className="alert-callout alert-callout-info" style={{ padding: '8px 12px' }}>
              <Calendar size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
              <div>
                Selected Duration: <strong>{dayCount} day{dayCount > 1 ? 's' : ''}</strong> ({startDate} to {endDate}). Roster replacement will be coordinated automatically upon approval.
              </div>
            </div>
          ) : startDate && endDate && new Date(endDate) < new Date(startDate) ? (
            <div className="alert-callout alert-callout-danger" style={{ padding: '8px 12px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>End date cannot be prior to start date.</span>
            </div>
          ) : null}

          <Textarea
            label="Reason for Leave"
            required
            showCount
            maxLength={500}
            rows={3}
            placeholder="Describe reason for leave and emergency contact availability during this period..."
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
