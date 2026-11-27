import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle, AlertCircle, User, Calendar, Clock, ShieldCheck, HeartPulse } from 'lucide-react';
import useStore from '../store/useStore';
import { apiFetch } from '../services/api';
import { canAssignPatient } from '../utils/staffDirectoryHelpers';

export default function AssignPatientModal({ staff, isOpen, onClose, onSuccess }) {
  const [search, setSearch] = useState('');
  const [patientList, setPatientList] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [assignmentType, setAssignmentType] = useState('primary'); // 'primary' | 'buddy'
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const patientsFromStore = useStore((s) => s.patients) || [];
  const fetchStaff = useStore((s) => s.fetchStaff);

  const assignCheck = canAssignPatient(staff);

  useEffect(() => {
    if (!search.trim()) {
      setPatientList(patientsFromStore.slice(0, 10));
      return;
    }
    const q = search.toLowerCase();
    const filtered = patientsFromStore.filter((p) => {
      const name = (p.full_name || `${p.first_name || ''} ${p.last_name || ''}`).toLowerCase();
      const mrn = (p.mr_number || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      return name.includes(q) || mrn.includes(q) || phone.includes(q);
    });
    setPatientList(filtered.slice(0, 10));
  }, [search, patientsFromStore]);

  if (!isOpen || !staff) return null;

  const role = staff.role;
  const isDoctor = role === 'doctor';
  const isCareManager = role === 'care_manager';
  const isNurseOrTherapist = ['nurse', 'physio', 'speech', 'psychologist', 'dietician'].includes(role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assignCheck.allowed) return;
    if (!selectedPatient) {
      setError('Please search and select a patient to assign.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        patient_id: selectedPatient.id,
        assignment_type: assignmentType,
        notes: notes.trim(),
        ...(isNurseOrTherapist ? { date: shiftDate, start_time: startTime, end_time: endTime } : {}),
      };

      const res = await apiFetch(`/staff/members/${staff.id}/assign-patient/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to assign patient.');
      } else {
        setSuccessMsg(data.message || 'Patient successfully assigned!');
        if (fetchStaff) fetchStaff();
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
          onClose();
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Network error while assigning patient.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--teal-50)',
                color: 'var(--teal-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HeartPulse size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-900)' }}>
                Assign Patient to {staff.full_name || staff.username}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                {staff.role_display || staff.role} · ID: {staff.employee_id}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={loading}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Trainee or Non-Clinical Guard Warning */}
            {!assignCheck.allowed ? (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Assignment Blocked:</strong> {assignCheck.reason}
                </div>
              </div>
            ) : null}

            {/* Role Relationship Info Banner */}
            <div
              style={{
                background: 'var(--sage-50)',
                border: '1px solid var(--sage-200)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: '0.82rem',
                color: 'var(--teal-900)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                Assignment Mechanism ({staff.role_display || staff.role})
              </div>
              <div style={{ color: 'var(--status-grey)', lineHeight: 1.4 }}>
                {isCareManager && 'Primary Care Manager link (Patient.assigned_care_manager).'}
                {isDoctor && 'Doctor Consultation Booking — establishes Treating Doctor clinical relationship.'}
                {isNurseOrTherapist && 'Clinical Service Booking (assigned_staff or buddy slot) with full visit audit trail.'}
              </div>
            </div>

            {/* Patient Search */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 6 }}>
                Search Patient (Name, MRN, Phone)
              </label>
              <div className="search-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  className="form-input search-input"
                  placeholder="Type patient name or MR# (e.g. Tariq, MR-001)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!assignCheck.allowed || loading}
                />
              </div>

              {/* Patient suggestions */}
              {!selectedPatient && patientList.length > 0 && (
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--sage-200)',
                    borderRadius: 6,
                    marginTop: 6,
                    background: '#fff',
                  }}
                >
                  {patientList.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: '0.82rem',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sage-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      <div>
                        <strong>{p.full_name || `${p.first_name || ''} ${p.last_name || ''}`}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>
                          MRN: {p.mr_number || '—'} · Phone: {p.phone || '—'}
                        </div>
                      </div>
                      <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>
                        Select
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Patient Card */}
            {selectedPatient && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>
                    {selectedPatient.full_name || `${selectedPatient.first_name || ''} ${selectedPatient.last_name || ''}`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#15803d' }}>
                    MRN: <strong>{selectedPatient.mr_number || '—'}</strong> · Diagnosis: {selectedPatient.primary_diagnosis || 'Under evaluation'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                  onClick={() => setSelectedPatient(null)}
                >
                  Change
                </button>
              </div>
            )}

            {/* Nurse/Therapist assignment slot choice & duty window */}
            {isNurseOrTherapist && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 6 }}>
                    Assignment Type
                  </label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="assignmentType"
                        value="primary"
                        checked={assignmentType === 'primary'}
                        onChange={() => setAssignmentType('primary')}
                      />
                      Primary Clinician (Lead)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="assignmentType"
                        value="buddy"
                        checked={assignmentType === 'buddy'}
                        onChange={() => setAssignmentType('buddy')}
                      />
                      Buddy Staff
                    </label>
                  </div>
                </div>
                {assignmentType === 'primary' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 3 }}>Date</label>
                      <input type="date" className="form-input" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} required />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 3 }}>Start</label>
                      <input type="time" className="form-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 3 }}>End</label>
                      <input type="time" className="form-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 6 }}>
                Assignment Clinical Notes (Optional)
              </label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Reason or instructions for this patient assignment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!assignCheck.allowed || loading}
                style={{ resize: 'vertical' }}
              />
            </div>

            {error && (
              <div style={{ color: '#dc2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}
            {successMsg && (
              <div style={{ color: '#16a34a', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={15} /> {successMsg}
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--sage-200)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!assignCheck.allowed || !selectedPatient || loading}
            >
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

