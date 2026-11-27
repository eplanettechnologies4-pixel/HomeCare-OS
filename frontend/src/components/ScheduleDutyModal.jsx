import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, CheckCircle, AlertCircle, Shield, Car } from 'lucide-react';
import { apiFetch } from '../services/api';
import useStore from '../store/useStore';
import { canScheduleDuty } from '../utils/staffDirectoryHelpers';

const SHIFT_PRESETS = [
  { name: 'Morning Shift', start: '08:00', end: '16:00' },
  { name: 'Evening Shift', start: '16:00', end: '00:00' },
  { name: 'Night Shift', start: '00:00', end: '08:00' },
  { name: '12h Day Shift', start: '08:00', end: '20:00' },
  { name: '12h Night Shift', start: '20:00', end: '08:00' },
];

export default function ScheduleDutyModal({ staff, isOpen, onClose, onSuccess }) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(todayStr);
  const [shiftName, setShiftName] = useState('Morning Shift');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [selectedPatientIds, setSelectedPatientIds] = useState([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [buddyId, setBuddyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [driverPickupTime, setDriverPickupTime] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const patients = useStore((s) => s.patients) || [];
  const allStaff = useStore((s) => s.staff) || [];
  const fetchStaff = useStore((s) => s.fetchStaff);

  const dutyCheck = canScheduleDuty(staff);

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setShiftName('Morning Shift');
      setStartTime('08:00');
      setEndTime('16:00');
      setSelectedPatientIds([]);
      setSupervisorId('');
      setBuddyId('');
      setDriverId('');
      setDriverPickupTime('');
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen]);

  if (!isOpen || !staff) return null;

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
    if (!dutyCheck.allowed) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        nurse_id: staff.id,
        date,
        shift_name: shiftName,
        start_time: startTime,
        end_time: endTime,
        patient_ids: selectedPatientIds,
        supervisor_id: supervisorId ? Number(supervisorId) : null,
        buddy_id: buddyId ? Number(buddyId) : null,
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
        if (fetchStaff) fetchStaff();
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
          onClose();
        }, 1200);
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
                Schedule Duty — {staff.full_name || staff.username}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                {staff.role_display} · ID: {staff.employee_id}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={loading}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <div style={{ color: '#16a34a', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={15} /> {successMsg}
              </div>
            )}
          </div>

          <div
            className="modal-footer"
            style={{ borderTop: '1px solid var(--sage-200)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}
          >
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
          </div>
        </form>
      </div>
    </div>
  );
}

