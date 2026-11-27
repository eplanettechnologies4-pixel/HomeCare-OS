import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Clock, User, AlertTriangle, AlertCircle,
  Plus, Check, X, Printer, RefreshCw, Shield, Edit3, Trash2
} from 'lucide-react';
import apiFetch from '../services/api';
import useStore from '../store/useStore';

export default function PaperNursesNotesSheet({ patientId, readOnly = false }) {
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = useStore((s) => s.currentRole);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState([]);
  const [shiftFilter, setShiftFilter] = useState('all'); // 'all', 'morning', 'night'

  // New Note Form State
  const [noteText, setNoteText] = useState('');
  const [noteShift, setNoteShift] = useState('morning');
  const [isEvent, setIsEvent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState(null);

  // Mark Entered-in-Error Modal
  const [errorModalTarget, setErrorModalTarget] = useState(null);
  const [errorReason, setErrorReason] = useState('');
  const [submittingError, setSubmittingError] = useState(false);
  const [errorFeedback, setErrorFeedback] = useState(null);

  const isNurse = ['nurse', 'chief_nurse', 'staff_nurse'].includes((currentRole || '').toLowerCase());
  const isTrainee = currentUser?.lifecycle_stage === 'trainee';
  const canAuthor = isNurse && !isTrainee && !readOnly;

  const fetchNotes = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/nurse-notes/`);
      setNotes(Array.isArray(res) ? res : res?.results || []);
    } catch (err) {
      console.error('Failed to load nurses notes:', err);
      setError(err?.detail || err?.message || 'Unable to load nursing notes');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmitNote = async (e) => {
    e.preventDefault();
    if (!canAuthor) return;
    if (!noteText.trim()) {
      setFormFeedback({ type: 'error', text: 'Note content cannot be empty.' });
      return;
    }

    setSubmitting(true);
    setFormFeedback(null);
    try {
      await apiFetch(`/api/patients/${patientId}/nurse-notes/`, {
        method: 'POST',
        body: JSON.stringify({
          note: noteText.trim(),
          shift: noteShift,
          is_event: isEvent,
        }),
      });

      setFormFeedback({ type: 'success', text: 'Nursing note recorded successfully.' });
      setNoteText('');
      setIsEvent(false);
      fetchNotes();
      setTimeout(() => setFormFeedback(null), 3000);
    } catch (err) {
      console.error('Submit note error:', err);
      setFormFeedback({ type: 'error', text: err?.detail || err?.message || 'Failed to submit nursing note.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkEnteredInError = async (e) => {
    e.preventDefault();
    if (!errorModalTarget || !errorReason.trim()) return;

    setSubmittingError(true);
    setErrorFeedback(null);
    try {
      await apiFetch(`/api/patients/${patientId}/nurse-notes/${errorModalTarget.id}/mark-entered-in-error/`, {
        method: 'POST',
        body: JSON.stringify({ reason: errorReason.trim() }),
      });

      setErrorModalTarget(null);
      setErrorReason('');
      fetchNotes();
    } catch (err) {
      console.error('Mark error failed:', err);
      setErrorFeedback(err?.detail || err?.message || 'Failed to mark note as entered in error.');
    } finally {
      setSubmittingError(false);
    }
  };

  const filteredNotes = notes.filter((n) => {
    if (shiftFilter === 'all') return true;
    return (n.shift || '').toLowerCase() === shiftFilter;
  });

  return (
    <div className="paper-notes-container" style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20 }}>
      {/* ── Toolbar: Filter & Print ── */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        {/* Shift Filter Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', padding: '3px 4px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          {[
            { id: 'all', label: 'All Shifts' },
            { id: 'morning', label: 'Morning Shift (08:00 - 16:00)' },
            { id: 'night', label: 'Night Shift (20:00 - 08:00)' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setShiftFilter(s.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: '12px',
                fontWeight: shiftFilter === s.id ? 700 : 500,
                color: shiftFilter === s.id ? '#4F46E5' : '#4B5563',
                background: shiftFilter === s.id ? '#FFFFFF' : 'transparent',
                border: 'none',
                boxShadow: shiftFilter === s.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isTrainee && (
            <span style={{ fontSize: '11px', color: '#D97706', background: '#FEF3C7', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              Trainee Mode: Read-Only
            </span>
          )}
          {!isNurse && (
            <span style={{ fontSize: '11px', color: '#4B5563', background: '#F3F4F6', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              Viewing As {currentRole?.toUpperCase() || 'OBSERVER'} (Read-Only)
            </span>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              background: '#4F46E5',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Printer size={14} />
            <span>Print Notes</span>
          </button>
        </div>
      </div>

      {/* ── Paper Sheet Header ── */}
      <div
        style={{
          border: '2px solid #1E293B',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          background: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #CBD5E1', paddingBottom: 8, marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, letterSpacing: '0.04em', color: '#0F172A', textTransform: 'uppercase' }}>
              eHealth Home Care Services
            </h3>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
              NURSES' NOTES & CONTINUITY SHEET
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748B' }}>
            <div>Form: NN-SHEET</div>
            <div>Append-Only Legal Medical Record</div>
          </div>
        </div>
      </div>

      {/* ── Lined Ruled Paper Table of Existing Notes ── */}
      <div
        style={{
          border: '1.5px solid #334155',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #334155', textAlign: 'left' }}>
              <th style={{ width: '140px', padding: '8px 10px', borderRight: '1px solid #CBD5E1', fontWeight: 800, color: '#0F172A' }}>
                Date & Time
              </th>
              <th style={{ width: '90px', padding: '8px 10px', borderRight: '1px solid #CBD5E1', fontWeight: 800, color: '#0F172A' }}>
                Shift
              </th>
              <th style={{ padding: '8px 12px', borderRight: '1px solid #CBD5E1', fontWeight: 800, color: '#0F172A' }}>
                Nursing Observations & Clinical Care
              </th>
              <th style={{ width: '160px', padding: '8px 10px', fontWeight: 800, color: '#0F172A' }}>
                Signatures / Initials
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', color: '#4F46E5' }} />
                  <div>Loading nursing notes...</div>
                </td>
              </tr>
            ) : filteredNotes.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                  No nursing notes recorded for this shift envelope.
                </td>
              </tr>
            ) : (
              filteredNotes.map((n, idx) => {
                const isErr = n.is_entered_in_error;
                const isEvt = n.is_event;
                return (
                  <tr
                    key={n.id || idx}
                    style={{
                      borderBottom: '1px solid #E2E8F0',
                      background: isErr ? '#FFF1F2' : (isEvt ? '#FFFBEB' : (idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA')),
                    }}
                  >
                    {/* Timestamp */}
                    <td style={{ padding: '10px', borderRight: '1px solid #CBD5E1', verticalAlign: 'top', color: '#334155', fontWeight: 600 }}>
                      <div>{n.recorded_at ? new Date(n.recorded_at).toLocaleDateString() : '—'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {n.recorded_at ? new Date(n.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </td>

                    {/* Shift */}
                    <td style={{ padding: '10px', borderRight: '1px solid #CBD5E1', verticalAlign: 'top', textTransform: 'capitalize', fontWeight: 700, color: '#475569' }}>
                      <span style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, fontSize: '11px' }}>
                        {n.shift || 'Morning'}
                      </span>
                    </td>

                    {/* Observations / Content */}
                    <td style={{ padding: '10px 12px', borderRight: '1px solid #CBD5E1', verticalAlign: 'top' }}>
                      {isEvt && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 4, fontSize: '11px', fontWeight: 800, marginBottom: 4 }}>
                          <AlertTriangle size={12} />
                          <span>EVENT / INCIDENT NOTE</span>
                        </div>
                      )}

                      <div style={{ textDecoration: isErr ? 'line-through' : 'none', color: isErr ? '#991B1B' : '#0F172A', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {n.note}
                      </div>

                      {/* Entered in error reason display */}
                      {isErr && (
                        <div style={{ marginTop: 6, fontSize: '11px', color: '#991B1B', background: '#FEE2E2', padding: '4px 8px', borderRadius: 4, fontWeight: 600 }}>
                          ⚠ Entered in Error: {n.entered_in_error_reason || 'Retracted'}
                        </div>
                      )}
                    </td>

                    {/* Signatures / Initials */}
                    <td style={{ padding: '10px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>
                        {n.recorded_by_name || n.recorded_by?.full_name || 'Staff Nurse'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>
                        Verified Signature
                      </div>

                      {/* Mark Entered in Error button */}
                      {!isErr && canAuthor && (
                        <button
                          type="button"
                          onClick={() => setErrorModalTarget(n)}
                          style={{
                            marginTop: 6,
                            background: 'none',
                            border: 'none',
                            color: '#DC2626',
                            fontSize: '10px',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          Mark Entered in Error
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Ruled Form to Add New Note ── */}
      {canAuthor ? (
        <div
          className="no-print"
          style={{
            background: '#F8FAFC',
            border: '1.5px solid #4F46E5',
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: '#4F46E5' }} />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                Record Shift Observation / Nurses Note
              </h4>
            </div>

            <div style={{ fontSize: '12px', color: '#475569' }}>
              Signing as: <strong style={{ color: '#0F172A' }}>{currentUser?.full_name || 'Staff Nurse'}</strong>
            </div>
          </div>

          {formFeedback && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                marginBottom: 12,
                fontSize: '12px',
                fontWeight: 600,
                background: formFeedback.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                color: formFeedback.type === 'success' ? '#166534' : '#991B1B',
              }}
            >
              {formFeedback.text}
            </div>
          )}

          <form onSubmit={handleSubmitNote} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Shift Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Shift:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="shiftChoice"
                    value="morning"
                    checked={noteShift === 'morning'}
                    onChange={() => setNoteShift('morning')}
                  />
                  <span>Morning Shift</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="shiftChoice"
                    value="night"
                    checked={noteShift === 'night'}
                    onChange={() => setNoteShift('night')}
                  />
                  <span>Night Shift</span>
                </label>
              </div>

              {/* Event / Incident Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, color: isEvent ? '#B45309' : '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isEvent}
                  onChange={(e) => setIsEvent(e.target.checked)}
                />
                <span>Flag as Event / Incident (Falls, adverse reactions, escalations)</span>
              </label>
            </div>

            {/* Lined Ruled Textarea */}
            <div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter clinical bedside observations, nursing care delivered, patient status, response to treatment..."
                rows={4}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: isEvent ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
                  background: isEvent ? '#FFFBEB' : '#FFFFFF',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#4F46E5',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                {submitting ? 'Recording...' : 'Submit & Sign Note'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: '12px', color: '#64748B', textAlign: 'center' }}>
          {isTrainee
            ? 'Staff members in Trainee stage are restricted from recording official clinical nursing notes.'
            : 'Nursing notes authorship is reserved for assigned duty nurses. Observer view only.'}
        </div>
      )}

      {/* ── Mark Entered-in-Error Modal ── */}
      {errorModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              maxWidth: 460,
              width: '100%',
              padding: 22,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#991B1B' }}>
                Mark Note Entered in Error
              </h4>
              <button
                type="button"
                onClick={() => setErrorModalTarget(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#475569', marginBottom: 12 }}>
              Clinical records cannot be deleted. Marking this note as entered in error will strike it through and log your audit trail reason.
            </p>

            {errorFeedback && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', fontSize: '12px', marginBottom: 12 }}>
                {errorFeedback}
              </div>
            )}

            <form onSubmit={handleMarkEnteredInError}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Reason for Error *
                </label>
                <input
                  type="text"
                  value={errorReason}
                  onChange={(e) => setErrorReason(e.target.value)}
                  placeholder="e.g. Charted on wrong patient, typographical mistake"
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setErrorModalTarget(null)}
                  disabled={submittingError}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingError}
                  style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: submittingError ? 'not-allowed' : 'pointer' }}
                >
                  {submittingError ? 'Updating...' : 'Confirm Entered in Error'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .paper-notes-container {
            border: none !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

