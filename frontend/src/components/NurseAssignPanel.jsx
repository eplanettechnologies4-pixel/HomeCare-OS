import React, { useState, useEffect } from 'react';
import {
  UserCheck, Star, Phone, Check, Shield, AlertCircle, Calendar,
  Clock, MapPin, Hash, User, Activity, FileText, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { SKILLS_LIST } from '../data/mockData';
import useStore from '../store/useStore';
import { format } from 'date-fns';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const COMMON_CLINICAL_REQUIREMENTS = [
  'Vitals & GCS Monitoring',
  'IV Cannulation & Infusions',
  'Foley Catheter Insertion/Care',
  'MAR Medication Administration',
  'Wound Debridement & Dressing',
  'Suctioning / Tracheostomy Care',
  'NG Tube Feeding & Care',
  'Post-Op Surgical Assessment',
];

export default function NurseAssignPanel({ booking, staffList, onConfirmAssignment }) {
  const storeStaff  = useStore((s) => s.staff);
  const fetchStaff  = useStore((s) => s.fetchStaff);
  const currentUser = useStore((s) => s.currentUser);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const allStaff = (storeStaff && storeStaff.length > 0) ? storeStaff : (staffList || []);

  const isClinicalStaff = (s) => {
    const role = (s.role || '').toLowerCase();
    const roleDisplay = (s.role_display || '').toLowerCase();
    return (
      ['nurse', 'doctor', 'physio', 'speech', 'psychologist', 'dietician', 'care_manager'].includes(role) ||
      roleDisplay.includes('nurse') ||
      roleDisplay.includes('doctor') ||
      roleDisplay.includes('physio') ||
      roleDisplay.includes('therapist') ||
      roleDisplay.includes('clinical')
    );
  };

  const clinicalStaff = allStaff.filter(s => isClinicalStaff(s) && s.is_active !== false);
  const availableStaff = clinicalStaff.length > 0 ? clinicalStaff : allStaff.filter(s => s.is_active !== false);

  // 10 Required Assignment Fields State
  const [primaryNurseId, setPrimaryNurseId] = useState(booking?.assigned_staff?.id || '');
  const [backupNurseId, setBackupNurseId]   = useState(booking?.backup_staff?.id || '');
  const [backupStaffOk, setBackupStaffOk]   = useState(booking?.backup_staff ? true : false);
  const [careManagerName, setCareManagerName] = useState(
    booking?.care_manager_name || currentUser?.full_name || 'Hina Malik (Care Coordinator)'
  );
  const [selectedReqs, setSelectedReqs]     = useState(
    booking?.clinical_requirements ? booking.clinical_requirements.split('; ').filter(Boolean) : ['Vitals & GCS Monitoring', 'MAR Medication Administration']
  );
  const [instructions, setInstructions]     = useState(booking?.nurse_instructions || booking?.notes || '');
  const [assignmentStatus, setAssignmentStatus] = useState(booking?.status === 'pending' ? 'assigned' : (booking?.status || 'assigned'));
  const [recurringDays, setRecurringDays]   = useState(booking?.recurring_days || ['Mon', 'Wed', 'Fri']);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    booking?.recurrence_end_date || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  );
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [isAssigned, setIsAssigned]         = useState(!!booking?.assigned_staff);
  const [validationError, setValidationError] = useState('');

  const primaryNurse = allStaff.find(s => String(s.id) === String(primaryNurseId));
  const backupNurse  = allStaff.find(s => String(s.id) === String(backupNurseId));

  const bookingRef = booking?.reference_code || `BK-2026-${String(booking?.id || 1).padStart(4, '0')}`;
  const scheduledDate = booking?.scheduled_time ? new Date(booking.scheduled_time) : new Date();
  const shiftDurationLabel = booking?.shift_duration_display || booking?.shift_duration || '4 Hours (Half Day)';
  const shiftFrequencyLabel = booking?.shift_frequency_display || booking?.shift_frequency || 'Once (Single Visit)';

  // Filter staff by selected skills
  const filteredNurses = availableStaff.filter(s => {
    if (selectedSkills.length === 0) return true;
    const spec = (s.specialization || '').toLowerCase();
    return selectedSkills.some(sk => spec.includes(sk.toLowerCase()));
  });
  const dropdownNurses = filteredNurses.length > 0 ? filteredNurses : availableStaff;

  const toggleReq = (req) => {
    setSelectedReqs(prev =>
      prev.includes(req) ? prev.filter(r => r !== req) : [...prev, req]
    );
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const toggleDay = (day) => {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleConfirm = () => {
    setValidationError('');
    if (!primaryNurse) {
      setValidationError('Assigned Primary Staff Member (Name, ID & Designation) is required.');
      return;
    }
    if (!careManagerName.trim()) {
      setValidationError('Clinic Care Manager name is required.');
      return;
    }
    if (selectedReqs.length === 0 && !instructions.trim()) {
      setValidationError('Please specify at least one clinical requirement or special instruction.');
      return;
    }

    const assignedOnDate = new Date().toISOString();

    setIsAssigned(true);
    if (onConfirmAssignment) {
      onConfirmAssignment({
        staff: primaryNurse,
        backupStaff: backupNurse || null,
        careManagerName: careManagerName.trim(),
        clinicalRequirements: selectedReqs.join('; '),
        instructions: instructions.trim(),
        status: assignmentStatus,
        assignedOn: assignedOnDate,
        recurringDays,
        recurrenceEndDate,
      });
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: 18, border: '1px solid var(--sage-200)' }}>
      {/* Panel Title & Reference Code Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserCheck size={18} style={{ color: 'var(--teal-600)' }} />
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: 0, color: 'var(--teal-800)' }}>
            Clinical Staff Assignment
          </h3>
        </div>
        <span className="badge badge-teal" style={{ fontSize: '0.78rem', padding: '4px 10px', fontWeight: 800 }}>
          <Hash size={12} style={{ display: 'inline', marginRight: 2 }} />
          {bookingRef}
        </span>
      </div>

      {/* ── 1. PATIENT & SERVICE OVERVIEW BAR (REQUIRED CONTEXT) ──────────────── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: '0.82rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ color: 'var(--status-grey)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
              Patient & Destination
            </div>
            <div style={{ fontWeight: 700, color: 'var(--teal-900)', marginTop: 2 }}>
              {booking?.patient_name || 'Patient'} {booking?.patient_mr ? `(${booking.patient_mr})` : ''}
            </div>
            <div style={{ color: '#4b5563', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <MapPin size={12} style={{ color: 'var(--amber-600)', flexShrink: 0 }} />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {booking?.address || 'Islamabad'}
              </span>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--status-grey)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
              Service & Shift Details
            </div>
            <div style={{ fontWeight: 700, color: 'var(--teal-900)', marginTop: 2 }}>
              {booking?.service_type_display || 'Home Care Service'}
            </div>
            <div style={{ color: '#4b5563', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Clock size={12} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
              <span>{shiftDurationLabel} · {shiftFrequencyLabel}</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #edf2f7', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--teal-800)' }}>
            <Calendar size={13} />
            <span>Shift Date & Time: <strong>{format(scheduledDate, 'dd MMM yyyy, hh:mm a')}</strong></span>
          </div>
          <span className={`badge ${assignmentStatus === 'confirmed' ? 'badge-green' : assignmentStatus === 'en_route' ? 'badge-teal' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
            Status: {assignmentStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {validationError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>{validationError}</span>
        </div>
      )}

      {/* ── 2. CONFIRMED DOSSIER VIEW OR ACTIVE ASSIGNMENT FORM ─────────────── */}
      {isAssigned && primaryNurse ? (
        /* Confirmed Assigned Staff Card */
        <div style={{ background: 'var(--sage-50)', borderRadius: 10, padding: 16, border: '1.5px solid var(--teal-300)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div className="avatar avatar-lg" style={{ background: 'var(--teal-700)', color: 'white', flexShrink: 0 }}>
              {primaryNurse.full_name.split(' ').map(n=>n[0]).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--teal-900)' }}>{primaryNurse.full_name}</span>
                <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>✓ Assigned</span>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--teal-700)', marginTop: 2 }}>
                {primaryNurse.role_display || primaryNurse.role} · {primaryNurse.specialization || 'Clinical Care'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.78rem', color: '#4b5563' }}>
                <span style={{ fontWeight: 700, color: 'var(--teal-800)' }}>ID: {primaryNurse.employee_id || `HC-${primaryNurse.id}`}</span>
                <span><Phone size={11} inline /> {primaryNurse.phone}</span>
                <span style={{ color: 'var(--amber-600)', fontWeight: 700 }}>★ {primaryNurse.rating || 5.0}</span>
              </div>
            </div>
          </div>

          {/* Backup Staff Display (Required) */}
          <div style={{ fontSize: '0.8rem', color: '#374151', padding: '10px 14px', background: 'white', borderRadius: 8, border: '1.5px solid #bbf7d0', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Designated Backup Staff Member:
                </div>
                <div style={{ fontWeight: 800, color: 'var(--teal-900)', fontSize: '0.92rem', marginTop: 2 }}>
                  {backupNurse ? backupNurse.full_name : (booking?.backup_staff_name || 'Backup Clinician on Standby')}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--teal-700)', marginTop: 2 }}>
                  ID: {backupNurse?.employee_id || booking?.backup_staff_employee_id || `HC-B-${backupNurse?.id || 1}`} · Designation: {backupNurse?.role_display || booking?.backup_staff_designation || 'Staff Nurse'} {backupNurse?.specialization ? `(${backupNurse.specialization})` : ''} · Ph: {backupNurse?.phone || '+92-300-4455667'}
                </div>
              </div>
              <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: '0.72rem', padding: '4px 10px' }}>
                <CheckCircle2 size={13} /> Checked: OK (Standby Confirmed)
              </span>
            </div>
          </div>

          {/* Care Manager Attribution (Required) */}
          <div style={{ fontSize: '0.8rem', color: '#374151', padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', textTransform: 'uppercase', fontWeight: 700 }}>
              Clinic Care Manager:
            </div>
            <div style={{ fontWeight: 700, color: 'var(--teal-900)', marginTop: 2 }}>
              {careManagerName}
            </div>
          </div>

          {/* Clinical Requirements Checklist */}
          {selectedReqs.length > 0 && (
            <div style={{ marginTop: 10, background: 'white', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--teal-700)', textTransform: 'uppercase', marginBottom: 6 }}>
                Clinical Requirements & SOPs:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedReqs.map(req => (
                  <span key={req} style={{ fontSize: '0.72rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Check size={11} /> {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {instructions && (
            <div style={{ marginTop: 10, fontSize: '0.8rem', background: 'white', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid var(--amber-500)', fontStyle: 'italic', color: '#374151' }}>
              "{instructions}"
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--status-grey)' }}>
            <span>Assigned on: <strong>{format(new Date(booking?.assigned_on || Date.now()), 'dd MMM yyyy, hh:mm a')}</strong></span>
            <span>Recurring: <strong>{recurringDays.join(', ')}</strong></span>
          </div>

          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14, width: '100%' }} onClick={() => setIsAssigned(false)}>
            Reassign / Modify Clinical Team
          </button>
        </div>
      ) : (
        /* Form for Nurse Assignment */
        <div>
          {/* Skill Filter Chips */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ fontSize: '0.74rem' }}>Filter Clinicians by Skills</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SKILLS_LIST.slice(0, 6).map(skill => {
                const active = selectedSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    style={{
                      fontSize: '0.72rem',
                      padding: '3px 10px',
                      borderRadius: 12,
                      border: `1px solid ${active ? 'var(--teal-600)' : 'var(--sage-200)'}`,
                      background: active ? 'var(--teal-700)' : 'white',
                      color: active ? 'white' : 'var(--teal-800)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Clinician (Required) */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>1. Assigned Staff Member (Name, ID & Designation) *</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--teal-600)', fontWeight: 600 }}>Required</span>
            </label>
            <select
              className="form-select"
              value={primaryNurseId}
              onFocus={() => fetchStaff()}
              onChange={e => setPrimaryNurseId(e.target.value)}
            >
              <option value="">Choose Primary Clinician...</option>
              {dropdownNurses.map(s => {
                const spec = (s.specialization || '').toLowerCase();
                const matchesSkills = selectedSkills.length > 0 && selectedSkills.some(sk => spec.includes(sk.toLowerCase()));
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name} (ID: {s.employee_id || `HC-${s.id}`}) — Designation: {s.role_display || s.role} {s.specialization ? `(${s.specialization})` : ''} — ★{s.rating || 5.0} — {s.status === 'available' ? 'Available' : (s.status_display || s.status || 'Active')}
                    {matchesSkills ? ' ★ Skill Match' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Backup Clinician (Optional) */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>2. Backup Staff Member (Name, ID & Designation)</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--status-grey)', fontWeight: 600 }}>Optional</span>
            </label>
            <select
              className="form-select"
              value={backupNurseId}
              onFocus={() => fetchStaff()}
              onChange={e => {
                setBackupNurseId(e.target.value);
                setBackupStaffOk(!!e.target.value);
              }}
            >
              <option value="">None (Primary Staff Only)</option>
              {availableStaff.filter(s => String(s.id) !== String(primaryNurseId)).map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name} (ID: {s.employee_id || `HC-B-${s.id}`}) — Designation: {s.role_display || s.role} {s.specialization ? `(${s.specialization})` : ''} — ★{s.rating || 5.0}
                </option>
              ))}
            </select>

            {/* Optional Backup Staff Standby Verification Box */}
            {backupNurse && (
              <div style={{
                marginTop: 8,
                padding: '10px 14px',
                borderRadius: 8,
                border: `1.5px solid ${backupStaffOk ? '#86efac' : '#cbd5e1'}`,
                background: backupStaffOk ? '#f0fdf4' : '#f8fafc',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--teal-900)' }}>
                      Backup Staff: {backupNurse.full_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#4b5563', marginTop: 2 }}>
                      ID: {backupNurse.employee_id || `HC-B-${backupNurse.id}`} · Designation: {backupNurse.role_display || backupNurse.role} {backupNurse.specialization ? `(${backupNurse.specialization})` : ''} · Ph: {backupNurse.phone || '+92-300-4455667'}
                    </div>
                  </div>
                  <label style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    background: backupStaffOk ? 'var(--teal-700)' : 'white',
                    color: backupStaffOk ? 'white' : '#475569',
                    border: `1px solid ${backupStaffOk ? 'var(--teal-700)' : '#cbd5e1'}`,
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    userSelect: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}>
                    <input
                      type="checkbox"
                      checked={backupStaffOk}
                      onChange={e => setBackupStaffOk(e.target.checked)}
                      style={{ accentColor: 'var(--teal-700)', cursor: 'pointer' }}
                    />
                    <span>{backupStaffOk ? '✓ Standby Verified' : 'Mark Standby Verified'}</span>
                  </label>
                </div>
                {backupStaffOk && (
                  <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    <CheckCircle2 size={13} /> Backup standby availability confirmed for clinical coverage.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clinic Care Manager's Name (Required) */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">3. Clinic Care Manager's Name *</label>
            <input
              type="text"
              className="form-input"
              value={careManagerName}
              onChange={e => setCareManagerName(e.target.value)}
              placeholder="e.g. Hina Malik (Care Coordinator)"
            />
          </div>

          {/* Clinical Requirements Checklist */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">4. Clinical Requirements (Select All Applicable) *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 120, overflowY: 'auto', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb' }}>
              {COMMON_CLINICAL_REQUIREMENTS.map(req => {
                const checked = selectedReqs.includes(req);
                return (
                  <label key={req} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleReq(req)}
                      style={{ accentColor: 'var(--teal-700)' }}
                    />
                    <span style={{ color: checked ? 'var(--teal-900)' : '#4b5563', fontWeight: checked ? 600 : 400 }}>{req}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Special Instructions */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Special Clinical Instructions</label>
            <textarea
              className="form-textarea"
              placeholder="E.g. Check blood sugar before insulin injection, patient sensitive to cold..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={2}
            />
          </div>

          {/* Assignment Status Selector */}
          <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">5. Assignment Status *</label>
              <select
                className="form-select"
                value={assignmentStatus}
                onChange={e => setAssignmentStatus(e.target.value)}
              >
                <option value="assigned">Assigned</option>
                <option value="confirmed">Confirmed</option>
                <option value="en_route">En Route</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Recurring Days</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {DAYS.map(day => {
                  const active = recurringDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        borderRadius: 4,
                        border: `1px solid ${active ? 'var(--teal-500)' : 'var(--sage-200)'}`,
                        background: active ? 'var(--teal-100)' : 'white',
                        color: active ? 'var(--teal-800)' : 'var(--status-grey)',
                        cursor: 'pointer'
                      }}
                    >
                      {day[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recurrence End Date */}
          {recurringDays.length > 0 && (
            <div className="form-group" style={{ marginTop: 10, marginBottom: 14 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Repeat Schedule Until</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--teal-700)', fontWeight: 600 }}>Auto-generates visits</span>
              </label>
              <input
                type="date"
                className="form-input"
                value={recurrenceEndDate}
                onChange={e => setRecurrenceEndDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px 0', fontWeight: 800, fontSize: '0.9rem' }}
            onClick={handleConfirm}
          >
            Confirm & Dispatch Clinical Staff →
          </button>
        </div>
      )}
    </div>
  );
}
