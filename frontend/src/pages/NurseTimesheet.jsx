import React, { useState, useEffect } from 'react';
import { Clock, PlusCircle, CheckCircle2, AlertCircle, Calendar, Check } from 'lucide-react';
import apiFetch from '../services/api';
import { Modal, Textarea, Button, Badge, EmptyState, Card } from '../components/ui';

export default function NurseTimesheet() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [toast, setToast] = useState(null);

  // Overtime Claim state
  const [selectedShift, setSelectedShift] = useState(null);
  const [claimReason, setClaimReason] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff/attendance/');
      if (res.ok) {
        const json = await res.json();
        setRecords(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  // Filter claimable shifts (shifts with overtime_hours > 0)
  const claimableShifts = records.filter((r) => Number(r.overtime_hours) > 0);

  const isClaimValid = selectedShift && claimReason.trim().length > 0;
  const isDirty = Boolean(selectedShift || claimReason);

  const handleSubmitClaim = async (e) => {
    e.preventDefault();
    if (!isClaimValid || submittingClaim) return;

    setSubmittingClaim(true);
    setClaimFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/overtime-claims/', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedShift.date,
          hours: selectedShift.overtime_hours,
          reason: claimReason,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const refId = data.id ? `OTC-${String(data.id).padStart(4, '0')}` : 'OTC-SUBMITTED';
        setToast({ type: 'success', text: `Overtime claim submitted for supervisor approval (${selectedShift.overtime_hours}h on ${selectedShift.date}). Ref: ${refId}` });
        setShowClaimModal(false);
        setSelectedShift(null);
        setClaimReason('');
        loadAttendance();
        setTimeout(() => setToast(null), 6000);
      } else {
        const err = await res.json();
        setClaimFeedback({ type: 'error', text: err.detail || 'Could not submit overtime claim.' });
      }
    } catch (err) {
      setClaimFeedback({ type: 'error', text: 'Network connection error. Your draft has been kept.' });
    } finally {
      setSubmittingClaim(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            My Timesheet & Attendance
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Electronic attendance logs, shift check-in/out timestamps, and derived overtime hours.
          </p>
        </div>
        <Button
          variant="primary"
          isPill
          icon={PlusCircle}
          onClick={() => {
            if (claimableShifts.length > 0 && !selectedShift) {
              setSelectedShift(claimableShifts[0]);
            }
            setShowClaimModal(true);
          }}
        >
          Submit Overtime Claim
        </Button>
      </div>

      {/* ── Toast confirmation notification ── */}
      {toast && (
        <div className={`alert-callout alert-callout-${toast.type === 'error' ? 'danger' : 'success'}`}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Timesheet Table Card ── */}
      <Card style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div className="skeleton-line" style={{ width: '40%' }} />
            <div className="skeleton-line" style={{ width: '95%' }} />
            <div className="skeleton-line" style={{ width: '80%' }} />
          </div>
        ) : records.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th>Shift Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Total Hours</th>
                  <th>Overtime Hours</th>
                  <th>Visits Completed</th>
                  <th>Shift Notes</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const hasOvertime = Number(r.overtime_hours) > 0;
                  return (
                    <tr key={r.id}>
                      <td><strong>{r.date}</strong></td>
                      <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td><strong style={{ color: 'var(--primary)' }}>{r.total_hours}h</strong></td>
                      <td>
                        {hasOvertime ? (
                          <Badge variant="amber">{r.overtime_hours}h Overtime</Badge>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>0.0h</span>
                        )}
                      </td>
                      <td>{r.visits_completed ?? '-'}</td>
                      <td style={{ color: 'var(--muted)' }}>{r.notes || 'Normal shift completion'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="No electronic timesheet records"
            description="Attendance logs and check-in timestamps will appear here as field shifts are completed."
            action={
              <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowClaimModal(true)}>
                Submit Overtime Claim
              </Button>
            }
          />
        )}
      </Card>

      {/* ── Submit Overtime Claim Modal ── */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="Submit Overtime Claim"
        subtitle="Claim validated overtime derived from electronic attendance logs"
        size="md"
        isDirty={isDirty}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowClaimModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!isClaimValid || submittingClaim}
              isLoading={submittingClaim}
              onClick={handleSubmitClaim}
            >
              Submit Overtime Claim
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitClaim} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="alert-callout alert-callout-info">
            <Clock size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Attendance-Derived Claims:</strong> Select a completed shift below. Overtime hours are read-only and automatically derived from verified check-in/out timestamps.
            </div>
          </div>

          {/* Selectable Shift Cards */}
          <div>
            <label className="form-label" style={{ marginBottom: 8 }}>
              Select Eligible Shift <span className="required-marker">*</span>
            </label>
            {claimableShifts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {claimableShifts.map((shift) => {
                  const isSelected = selectedShift?.id === shift.id;
                  return (
                    <div
                      key={shift.id}
                      className={`selectable-shift-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedShift(shift)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            border: isSelected ? '2px solid var(--primary)' : '2px solid var(--border)',
                            background: isSelected ? 'var(--primary)' : '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected && <Check size={13} strokeWidth={3} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                            {shift.date}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2 }}>
                            Total Shift: <strong>{shift.total_hours}h</strong> • Visits: {shift.visits_completed || 1}
                          </div>
                        </div>
                      </div>
                      <Badge variant="amber">
                        +{shift.overtime_hours}h OT
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
                No completed shifts with uncalimed overtime detected in your recent attendance records.
              </div>
            )}
          </div>

          {/* Read-Only Hours Display */}
          {selectedShift && (
            <div style={{ background: 'var(--primary-soft)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #DDD6FE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Claimable Overtime Hours (Read-Only)
                </span>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--primary)', marginTop: 1 }}>
                  {selectedShift.overtime_hours} Hours
                </div>
              </div>
              <Badge variant="purple">Shift Date: {selectedShift.date}</Badge>
            </div>
          )}

          <Textarea
            label="Reason for Overtime"
            required
            showCount
            maxLength={400}
            rows={3}
            placeholder="e.g. Delayed patient handover, post-shift vitals stabilization, emergency ambulance escort..."
            value={claimReason}
            onChange={(e) => setClaimReason(e.target.value)}
          />

          {claimFeedback && (
            <div className={`alert-callout alert-callout-${claimFeedback.type === 'error' ? 'danger' : 'success'}`}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{claimFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
