import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, CheckCircle, AlertCircle, Shield, Car, Copy, KeyRound } from 'lucide-react';
import { apiFetch } from '../services/api';
import useStore from '../store/useStore';
import { canScheduleDuty } from '../utils/staffDirectoryHelpers';
import { buildDutyPinShareMessage } from '../utils/pinHelpers';

const SHIFT_PRESETS = [
  { name: 'Morning Shift', start: '08:00', end: '16:00' },
  { name: 'Evening Shift', start: '16:00', end: '00:00' },
  { name: 'Night Shift', start: '00:00', end: '08:00' },
  { name: '12h Day Shift', start: '08:00', end: '20:00' },
  { name: '12h Night Shift', start: '20:00', end: '08:00' },
];

export default function ScheduleDutyModal({
  staff = null,
  initialPatientId = null,
  initialDate = null,
  initialStartTime = null,
  initialEndTime = null,
  isOpen,
  onClose,
  onSuccess,
}) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedStaffId, setSelectedStaffId] = useState(staff?.id || '');
  const [date, setDate] = useState(initialDate || todayStr);
  const [shiftName, setShiftName] = useState('Morning Shift');
  const [startTime, setStartTime] = useState(initialStartTime || '08:00');
  const [endTime, setEndTime] = useState(initialEndTime || '16:00');
  const [selectedPatientIds, setSelectedPatientIds] = useState(initialPatientId ? [Number(initialPatientId)] : []);
  const [supervisorId, setSupervisorId] = useState('');
  const [buddyId, setBuddyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [driverPickupTime, setDriverPickupTime] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [revealedPin, setRevealedPin] = useState(null);
  const [pinCopyState, setPinCopyState] = useState('');
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = currentUser?.role || '';

  const patients = useStore((s) => s.patients) || [];
  const allStaff = useStore((s) => s.staff) || [];
  const fetchStaff = useStore((s) => s.fetchStaff);
  const fetchPatients = useStore((s) => s.fetchPatients);
  const fetchBookings = useStore((s) => s.fetchBookings);

  const activeStaff = staff || allStaff.find((s) => Number(s.id) === Number(selectedStaffId)) || null;
  const dutyCheck = activeStaff ? canScheduleDuty(activeStaff) : { allowed: true };

  useEffect(() => {
    if (isOpen) {
      if (fetchStaff && allStaff.length === 0) fetchStaff();
      if (fetchPatients && patients.length === 0) fetchPatients();
      setSelectedStaffId(staff?.id || '');
      setDate(initialDate || new Date().toISOString().split('T')[0]);
      setShiftName('Morning Shift');
      setStartTime(initialStartTime || '08:00');
      setEndTime(initialEndTime || '16:00');
      setSelectedPatientIds(initialPatientId ? [Number(initialPatientId)] : []);
      setSupervisorId('');
      setBuddyId('');
      setDriverId('');
      setDriverPickupTime('');
      setError('');
      setSuccessMsg('');
      setSummaryData(null);
    }
  }, [isOpen, staff?.id, initialPatientId, initialDate, initialStartTime, initialEndTime]);

  if (!isOpen) return null;

  const handlePresetSelect = (preset) => {
    setShiftName(preset.name);
    setStartTime(preset.start);
    setEndTime(preset.end);
  };

  const togglePatient = (patientId) => {
    setSelectedPatientIds((prev) =>
      prev.includes(patientId) ? prev.filter((id) => id !== patientId) : [...prev, patientId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeStaff) {
      setError('Please select a nurse or clinical staff member.');
      return;
    }
    if (!dutyCheck.allowed) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        nurse_id: activeStaff.id,
        date,
        shift_name: shiftName,
        start_time: startTime,
        end_time: endTime,
        patient_ids: selectedPatientIds,
        supervisor_id: supervisorId ? Number(supervisorId) : null,
        buddy_staff_id: buddyId ? Number(buddyId) : null,
        driver_id: driverId ? Number(driverId) : null,
        driver_pickup_time: driverPickupTime || null,
        is_published: isPublished,
      };

      const res = await apiFetch('/staff/roster/schedule-duty/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.detail || 'Failed to schedule duty.');
      } else {
        setSuccessMsg(data.message || 'Duty scheduled and published successfully!');
        setSummaryData(data);
        setRevealedPin(null);
        setPinCopyState('');
        if (data.duty_pin_id && ['admin', 'super_admin'].includes(currentRole)) {
          try {
            const pinRes = await apiFetch(`/staff/duty-pins/${data.duty_pin_id}/reveal/`);
            if (pinRes.ok) {
              const pinData = await pinRes.json();
              setRevealedPin(pinData);
            }
          } catch (_) {
            // ignore reveal error
          }
        }
        if (fetchStaff) fetchStaff();
        if (fetchBookings) fetchBookings();
        if (onSuccess) onSuccess(data);
      }
    } catch (err) {
      setError(err.message || 'Network error while scheduling duty.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620, maxWidth: '95vw' }}>
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
              <Calendar size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-900)' }}>
                Schedule Duty {activeStaff ? `— ${activeStaff.full_name || activeStaff.username}` : ''}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                {activeStaff ? `${activeStaff.role_display || activeStaff.role} · ID: ${activeStaff.employee_id}` : 'Select a nurse or clinical staff member'}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={loading}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!staff && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Nurse / Clinical Staff *
                </label>
                <select
                  className="form-select"
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                >
                  <option value="">Select Nurse / Therapist...</option>
                  {allStaff
                    .filter((s) => ['nurse', 'physio', 'speech', 'psychologist', 'dietician'].includes(s.role) && s.is_active && s.lifecycle_stage !== 'trainee')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role_display || s.role})
                      </option>
                    ))}
                </select>
              </div>
            )}
            {!dutyCheck.allowed && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: 12,
                  color: '#991b1b',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} /> {dutyCheck.reason}
              </div>
            )}

            {/* Shift Presets */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 6 }}>
                Shift Preset
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SHIFT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`btn btn-sm ${shiftName === p.name ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={() => handlePresetSelect(p)}
                  >
                    {p.name} ({p.start}–{p.end})
                  </button>
                ))}
              </div>
            </div>

            {/* Date and Time Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Duty Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Start Time
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  End Time (Next Day if overnight)
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Patients Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                Assign Patient(s) for this Duty ({selectedPatientIds.length} selected)
              </label>
              <div
                style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  border: '1px solid var(--sage-200)',
                  borderRadius: 6,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: '#fff',
                }}
              >
                {patients.slice(0, 15).map((p) => {
                  const isChecked = selectedPatientIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.82rem',
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: isChecked ? 'var(--sage-50)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePatient(p.id)}
                      />
                      <span>
                        <strong>{p.full_name || `${p.first_name || ''} ${p.last_name || ''}`}</strong> ({p.mr_number})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Optional Supervisor and Buddy */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Shift Supervisor (Optional)
                </label>
                <select
                  className="form-select"
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                >
                  <option value="">None (Independent Duty)</option>
                  {allStaff
                    .filter((s) => s.id !== staff.id && ['admin', 'care_manager', 'doctor', 'nurse'].includes(s.role))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role_display})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Buddy Staff (Optional)
                </label>
                <select
                  className="form-select"
                  value={buddyId}
                  onChange={(e) => setBuddyId(e.target.value)}
                >
                  <option value="">None</option>
                  {allStaff
                    .filter((s) => s.id !== staff.id && ['nurse', 'physio', 'speech'].includes(s.role))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role_display})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Optional Driver */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Driver (Optional)
                </label>
                <select
                  className="form-select"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">No Driver Required</option>
                  {allStaff
                    .filter((s) => s.role === 'delivery_rider')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} (Driver)
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-900)', marginBottom: 4 }}>
                  Driver Pickup Time
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={driverPickupTime}
                  onChange={(e) => setDriverPickupTime(e.target.value)}
                  disabled={!driverId}
                />
              </div>
            </div>

            {/* Publish Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              <span>
                <strong>Publish duty immediately</strong> (visible on nurse's roster and calendar)
              </span>
            </label>

            {error && (
              <div style={{ color: '#dc2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}
            {successMsg && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 12, color: '#065f46', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <CheckCircle size={15} /> {successMsg}
                </div>
                {summaryData && (
                  <div style={{ fontSize: '0.78rem', color: '#047857', marginLeft: 21 }}>
                    <div><strong>Staff:</strong> {activeStaff?.full_name} · <strong>Date:</strong> {summaryData.date} · <strong>Shift:</strong> {summaryData.duty_time}</div>
                    <div><strong>Patients:</strong> {(summaryData.patients || []).map((p) => p.name).join(', ') || 'Shift only'}</div>
                    <div><strong>Appears in:</strong> My Roster, My Patients, Patient File, Start Visit</div>
                    {revealedPin?.pin && (
                      <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFFFFF', border: '1.5px solid #6D28D9', borderRadius: 8, color: '#1E1B4B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <KeyRound size={15} color="#6D28D9" />
                            <span style={{ fontWeight: 700 }}>Duty File Unlock PIN:</span>
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.18em', color: '#6D28D9' }}>
                              {revealedPin.pin}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.72rem', padding: '3px 8px', borderColor: '#DDD6FE', color: '#6D28D9' }}
                              onClick={() => {
                                navigator.clipboard?.writeText(revealedPin.pin);
                                setPinCopyState('pin');
                              }}
                            >
                              <Copy size={12} style={{ marginRight: 4 }} />
                              {pinCopyState === 'pin' ? 'Copied PIN' : 'Copy'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.72rem', padding: '3px 8px', borderColor: '#DDD6FE', color: '#6D28D9' }}
                              onClick={() => {
                                const msg = buildDutyPinShareMessage({
                                  date: summaryData.date,
                                  shiftLabel: shiftName,
                                  pin: revealedPin.pin,
                                });
                                navigator.clipboard?.writeText(msg);
                                setPinCopyState('msg');
                              }}
                            >
                              <Copy size={12} style={{ marginRight: 4 }} />
                              {pinCopyState === 'msg' ? 'Copied message' : 'Copy message'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="modal-footer"
            style={{ borderTop: '1px solid var(--sage-200)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}
          >
            {summaryData ? (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!dutyCheck.allowed || loading}
                >
                  {loading ? 'Scheduling...' : 'Confirm Schedule Duty'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

