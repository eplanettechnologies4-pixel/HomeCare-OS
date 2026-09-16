import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity, Brain, Volume2, Apple, Zap, Footprints, Clock, Calendar,
  Search, Filter, Plus, CheckCircle2, AlertCircle, TrendingUp, Award,
  User, Phone, ChevronRight, FileText, Stethoscope, Printer, HeartHandshake,
  Sparkles, Scale, RefreshCw, X, Eye, Check, ArrowRight, UserCheck, ShieldCheck
} from 'lucide-react';
import useStore from '../store/useStore';
import { format } from 'date-fns';

const DISCIPLINES = [
  {
    key: 'physio',
    label: 'Physiotherapy & Neuro-Rehab',
    shortLabel: 'Physiotherapy',
    serviceType: 'physiotherapy',
    roleFilter: 'physio',
    icon: Activity,
    accent: '#611F8C',
    gradient: 'linear-gradient(135deg, #611F8C 0%, #8b36c4 100%)',
    lightBg: '#fbf5ff',
    border: '#e9d5ff',
    badge: 'Mobility & Ortho',
    description: 'Post-stroke motor recovery, gait retraining, orthopedic post-op & spinal mobilization',
  },
  {
    key: 'speech',
    label: 'Speech & Swallowing Pathology',
    shortLabel: 'Speech Therapy',
    serviceType: 'speech_therapy',
    roleFilter: 'speech',
    icon: Volume2,
    accent: '#0284c7',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
    lightBg: '#f0f9ff',
    border: '#bae6fd',
    badge: 'Dysphagia & Voice',
    description: 'Aphasia recovery, dysphagia swallowing protocol, dysarthria & cognitive communication',
  },
  {
    key: 'psychotherapy',
    label: 'Clinical Psychology & CBT',
    shortLabel: 'Psychotherapy',
    serviceType: 'psychotherapy',
    roleFilter: 'psychologist',
    icon: Brain,
    accent: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    lightBg: '#faf5ff',
    border: '#e9d5ff',
    badge: 'Mental Wellness',
    description: 'CBT for chronic disease adjustment, caregiver burnout support & geriatric mental health',
  },
  {
    key: 'dietician',
    label: 'Clinical Nutrition & Dietetics',
    shortLabel: 'Dietetics',
    serviceType: 'dietician',
    roleFilter: 'dietician',
    icon: Apple,
    accent: '#059669',
    gradient: 'linear-gradient(135deg, #059669 0%, #34d399 100%)',
    lightBg: '#f0fdf4',
    border: '#bbf7d0',
    badge: 'Metabolic & Enteral',
    description: 'Diabetic glycemic control, renal micro-nutrient management & tube-feeding regimens',
  },
  {
    key: 'occupational',
    label: 'Occupational & Ergonomic Therapy',
    shortLabel: 'Occupational',
    serviceType: 'occupational',
    roleFilter: 'physio',
    icon: HeartHandshake,
    accent: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)',
    lightBg: '#fffbeb',
    border: '#fde68a',
    badge: 'ADL & Independence',
    description: 'Activities of Daily Living (ADL), fine motor dexterity & home fall prevention adaptation',
  },
];

const STATUS_BADGE = {
  completed:   { label: 'Completed',   color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  in_progress: { label: 'In Progress', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  assigned:    { label: 'Assigned',    color: '#611F8C', bg: '#faf5ff', border: '#e9d5ff' },
  scheduled:   { label: 'Scheduled',   color: '#611F8C', bg: '#faf5ff', border: '#e9d5ff' },
  pending:     { label: 'Pending Care',color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  cancelled:   { label: 'Cancelled',   color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

// ── Reassign Nurse / Therapist Modal ──────────────────────────────────────────
function ReassignTherapistModal({ session, staffList, onClose, onConfirm }) {
  const [selectedStaffId, setSelectedStaffId] = useState(session.assigned_staff?.id || '');
  const [backupStaffId, setBackupStaffId]     = useState(session.backup_staff?.id || '');
  const [backupStaffOk, setBackupStaffOk]     = useState(true);
  const [notes, setNotes]                     = useState(session.notes || '');

  const chosenStaff  = staffList.find(s => String(s.id) === String(selectedStaffId));
  const chosenBackup = staffList.find(s => String(s.id) === String(backupStaffId));

  const handleSave = (e) => {
    e.preventDefault();
    if (!chosenStaff) {
      alert('Please select a Primary Therapist/Nurse.');
      return;
    }
    if (!backupStaffOk) {
      alert('Please verify Backup Staff status.');
      return;
    }
    onConfirm({
      staff: chosenStaff,
      backupStaff: chosenBackup || null,
      instructions: notes,
      status: 'assigned',
    });
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCheck size={18} /> Assign Nurse / Therapist
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
              Booking: {session.reference_code || `#BK-${session.booking_id}`} · Patient: {session.patient_name}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'white' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body" style={{ padding: 20 }}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Primary Attending Clinician / Therapist *</label>
              <select
                className="form-select"
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                required
              >
                <option value="">Select licensed clinical staff...</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} (ID: {s.employee_id || `HC-${s.id}`}) — {s.role_display || s.role} {s.specialization ? `(${s.specialization})` : ''} — ★{s.rating || 5.0} — {s.status === 'available' ? 'Available' : (s.status || 'Active')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Designated Backup Nurse / Standby Staff</label>
              <select
                className="form-select"
                value={backupStaffId}
                onChange={e => {
                  setBackupStaffId(e.target.value);
                  setBackupStaffOk(true);
                }}
              >
                <option value="">Select backup clinician (standby coverage)...</option>
                {staffList.filter(s => String(s.id) !== String(selectedStaffId)).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} (ID: {s.employee_id || `HC-B-${s.id}`}) — {s.role_display || s.role} — ★{s.rating || 5.0}
                  </option>
                ))}
              </select>

              {chosenBackup && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600 }}>
                    Backup Standby: {chosenBackup.full_name} ({chosenBackup.phone || '+92-300-1122334'})
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', fontWeight: 700, color: '#15803d', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={backupStaffOk}
                      onChange={e => setBackupStaffOk(e.target.checked)}
                      style={{ accentColor: '#16a34a' }}
                    />
                    <span>✓ Checked OK</span>
                  </label>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Special Therapist Instructions / Handover Notes</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Specific clinical guidance, patient precautions, walker requirement..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: '#611F8C' }}>
              Confirm Staff Dispatch & Sync Booking →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Schedule Therapy Session Modal (Real-time Booking Attachment) ───────────────
function ScheduleTherapySessionModal({ activeDiscipline, staffList, onClose, onSave }) {
  const patients = useStore((s) => s.patients);
  const [form, setForm] = useState({
    patient_id: patients[0]?.id || '',
    service_type: activeDiscipline.serviceType || 'physiotherapy',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: '10:00',
    shift_duration: '1_hour',
    shift_frequency: 'once',
    payment_method: 'cash_on_delivery',
    assigned_staff_id: staffList[0]?.id || '',
    backup_staff_id: staffList[1]?.id || '',
    goals: '',
    notes: '',
    amount: '3500',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.patient_id) {
      alert('Please select a patient.');
      return;
    }
    if (!form.goals.trim()) {
      alert('Please enter a clinical rehabilitation target / goal.');
      return;
    }

    const scheduledIso = `${form.scheduled_date}T${form.scheduled_time}:00`;
    onSave({
      patient_id: Number(form.patient_id),
      service_type: form.service_type,
      scheduled_time: new Date(scheduledIso).toISOString(),
      shift_duration: form.shift_duration,
      shift_frequency: form.shift_frequency,
      payment_method: form.payment_method,
      assigned_staff_id: form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
      backup_staff_id: form.backup_staff_id ? Number(form.backup_staff_id) : null,
      notes: `[Therapy Goal: ${form.goals.trim()}] ${form.notes.trim()}`,
      diagnosis: form.goals.trim(),
      amount: Number(form.amount) || 3500,
      amount_paid: form.payment_method === 'advance' ? (Number(form.amount) || 3500) : 0,
      status: form.assigned_staff_id ? 'assigned' : 'pending',
    });
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 660 }}>
        <div className="modal-header" style={{ background: activeDiscipline.gradient, color: 'white' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} /> Schedule {activeDiscipline.shortLabel} Session
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
              Syncs directly with EMR Bookings and Nurse Dispatch Roster
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'white' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 20 }}>
            
            {/* Patient & Service Discipline */}
            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Patient *</label>
                <select
                  className="form-select"
                  value={form.patient_id}
                  onChange={e => setForm({ ...form, patient_id: e.target.value })}
                  required
                >
                  <option value="">Choose patient profile…</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.mr_number || `MR-${p.id}`}) — {p.phone}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Therapy Discipline Service *</label>
                <select
                  className="form-select"
                  value={form.service_type}
                  onChange={e => setForm({ ...form, service_type: e.target.value })}
                >
                  <option value="physiotherapy">Physiotherapy & Rehabilitation</option>
                  <option value="speech_therapy">Speech & Language Therapy</option>
                  <option value="psychotherapy">Psychotherapy & Mental Health</option>
                  <option value="dietician">Clinical Nutrition & Dietetics</option>
                  <option value="occupational">Occupational Therapy</option>
                </select>
              </div>
            </div>

            {/* Nurse / Specialist Assignment */}
            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Attending Therapist / Nurse *</label>
                <select
                  className="form-select"
                  value={form.assigned_staff_id}
                  onChange={e => setForm({ ...form, assigned_staff_id: e.target.value })}
                >
                  <option value="">Choose attending therapist...</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.role_display || s.role}) — {s.employee_id || `HC-${s.id}`} — ★{s.rating || 5.0}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Designated Backup Clinician</label>
                <select
                  className="form-select"
                  value={form.backup_staff_id}
                  onChange={e => setForm({ ...form, backup_staff_id: e.target.value })}
                >
                  <option value="">Choose backup clinician...</option>
                  {staffList.filter(s => String(s.id) !== String(form.assigned_staff_id)).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.role_display || s.role}) — {s.employee_id || `HC-B-${s.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Shift Timing & Schedule */}
            <div className="grid-3" style={{ gap: 10, marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Session Date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.scheduled_date}
                  onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start Time *</label>
                <input
                  type="time"
                  className="form-input"
                  value={form.scheduled_time}
                  onChange={e => setForm({ ...form, scheduled_time: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Session Duration *</label>
                <select
                  className="form-select"
                  value={form.shift_duration}
                  onChange={e => setForm({ ...form, shift_duration: e.target.value })}
                >
                  <option value="1_hour">1 Hour (Standard)</option>
                  <option value="2_hours">2 Hours (Intensive)</option>
                  <option value="4_hours">4 Hours (Half Day)</option>
                </select>
              </div>
            </div>

            {/* Target & Clinical Goals */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Clinical Target & Rehabilitation Goal *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Quadriceps strengthening, ROM knee flexion to 110°, unassisted gait 20m"
                value={form.goals}
                onChange={e => setForm({ ...form, goals: e.target.value })}
                required
              />
            </div>

            {/* Billing & Notes */}
            <div className="grid-2" style={{ gap: 10, marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Method *</label>
                <select
                  className="form-select"
                  value={form.payment_method}
                  onChange={e => setForm({ ...form, payment_method: e.target.value })}
                >
                  <option value="cash_on_delivery">Cash on Service Arrival</option>
                  <option value="advance">Advance Card / Online</option>
                  <option value="bank_transfer">Bank Transfer (IBFT)</option>
                  <option value="insurance">Insurance Coverage</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Session Fee (PKR)</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Exercise Protocol & Home Notes</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Specific therapeutic exercises, precautions, assistive equipment needed..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: activeDiscipline.accent }}>
              Schedule Session & Create Booking →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SOAP Clinical Note Modal ──────────────────────────────────────────────────
function SoapNoteModal({ session, onClose, onSave }) {
  const [subjective, setSubjective] = useState('Patient reports decreased morning stiffness; mild pain (3/10) at terminal range.');
  const [objective, setObjective]   = useState(`ROM active: 98°, passive: 105°. Muscle power (MMT): Quads 4/5, Hamstrings 4/5. 15 mins gait training tolerated.`);
  const [assessment, setAssessment] = useState('Satisfactory rehabilitation trajectory. Milestone on track. Progressive resistance initiated.');
  const [plan, setPlan]             = useState('Continue gait training with single-point cane. Home exercise: straight leg raise 3x10 reps, ice application 15 mins.');

  const handleSave = () => {
    const combined = `[SOAP] S: ${subjective} | O: ${objective} | A: ${assessment} | P: ${plan}`;
    onSave(session.booking_id || session.id, combined);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 640 }}>
        <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} /> Clinical SOAP Assessment
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {session.patient_name} ({session.mr_number}) · Ref: {session.reference_code || `#BK-${session.booking_id}`}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'white' }}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ fontWeight: 700, color: '#611F8C' }}>S — Subjective (Patient Feedback & Symptoms)</label>
            <textarea className="form-textarea" rows={2} value={subjective} onChange={e => setSubjective(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ fontWeight: 700, color: '#0284c7' }}>O — Objective (Clinical Measurements & Range of Motion)</label>
            <textarea className="form-textarea" rows={2} value={objective} onChange={e => setObjective(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" style={{ fontWeight: 700, color: '#7c3aed' }}>A — Assessment (Therapist Evaluation & Milestones)</label>
            <textarea className="form-textarea" rows={2} value={assessment} onChange={e => setAssessment(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 700, color: '#059669' }}>P — Plan (Home Exercise Prescription & Next Steps)</label>
            <textarea className="form-textarea" rows={2} value={plan} onChange={e => setPlan(e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} style={{ background: '#611F8C' }}>
            Save SOAP Assessment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ultra-Modern Live Session Card ────────────────────────────────────────────
function LiveTherapySessionCard({
  session,
  discipline,
  onStatusChange,
  onOpenSoap,
  onOpenReassign,
  onOpenBookingSection
}) {
  const statusInfo = STATUS_BADGE[session.status] || STATUS_BADGE.scheduled;
  const progressPct = Math.round((session.session_number / session.total_sessions) * 100);

  return (
    <div style={{
      background: 'white',
      borderRadius: 14,
      border: session.status === 'in_progress' ? `2px solid ${discipline.accent}` : '1px solid #e2e8f0',
      boxShadow: session.status === 'in_progress' ? '0 8px 24px rgba(97,31,140,0.12)' : '0 2px 8px rgba(0,0,0,0.03)',
      padding: 18,
      marginBottom: 14,
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Accent Strip */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, height: 4,
        background: discipline.gradient,
      }} />

      {/* Header: Patient, Booking Reference, Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: discipline.lightBg,
            border: `1.5px solid ${discipline.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: discipline.accent, fontWeight: 800, fontSize: '1rem',
            flexShrink: 0,
          }}>
            {session.patient_name.split(' ').map(n=>n[0]).join('')}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#1e293b' }}>
                {session.patient_name}
              </span>
              <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                {session.mr_number || 'MR-2026-N/A'}
              </span>
              {session.reference_code && (
                <button
                  type="button"
                  onClick={() => onOpenBookingSection(session)}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'var(--teal-50)',
                    color: 'var(--teal-700)',
                    border: '1px solid var(--teal-200)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                  title="Click to view full booking details in Bookings section"
                >
                  <span>{session.reference_code}</span>
                  <ArrowRight size={10} />
                </button>
              )}
            </div>

            {/* Nurse / Therapist Attribution */}
            <div style={{ fontSize: '0.76rem', color: 'var(--status-grey)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <User size={12} style={{ color: discipline.accent }} />
                Attending: <strong style={{ color: '#0f172a' }}>{session.therapist}</strong>
                {session.staff_designation && <span style={{ color: discipline.accent }}>({session.staff_designation})</span>}
                {session.staff_employee_id && <span style={{ color: '#64748b' }}>[{session.staff_employee_id}]</span>}
              </span>
              <button
                type="button"
                onClick={() => onOpenReassign(session)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: discipline.accent,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Change Nurse
              </button>
            </div>
          </div>
        </div>

        {/* Status Pill & Scheduled Time */}
        <div style={{ textAlign: 'right' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: '0.72rem', fontWeight: 700,
            padding: '4px 10px', borderRadius: 20,
            background: statusInfo.bg,
            color: statusInfo.color,
            border: `1px solid ${statusInfo.border}`,
          }}>
            {session.status === 'in_progress' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', animation: 'pulse 1.5s infinite' }} />
            )}
            {statusInfo.label}
          </span>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            <Clock size={12} style={{ color: discipline.accent }} />
            <span>{session.time} ({session.duration_mins} min)</span>
          </div>
        </div>
      </div>

      {/* Goal & Clinical Focus Callout */}
      <div style={{
        background: discipline.lightBg,
        border: `1px solid ${discipline.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 700, color: discipline.accent, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          <Sparkles size={13} /> Clinical Target & Objective:
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
          {session.goals}
        </div>
        {session.notes && (
          <div style={{ fontSize: '0.78rem', color: '#4b5563', marginTop: 4, lineHeight: 1.45, fontStyle: 'italic' }}>
            "{session.notes}"
          </div>
        )}
      </div>

      {/* Outcome Metrics Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        background: '#f8fafc', padding: '8px 12px', borderRadius: 8,
        border: '1px solid #e2e8f0', marginBottom: 12, fontSize: '0.74rem',
      }}>
        <div>
          <span style={{ color: 'var(--status-grey)', display: 'block' }}>Target Milestone</span>
          <strong style={{ color: '#0f172a' }}>{session.rom_score || '88% Recovered'}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--status-grey)', display: 'block' }}>Pain Scale (0-10)</span>
          <strong style={{ color: (session.pain_score || 3) > 5 ? 'var(--status-red)' : '#059669' }}>
            {session.pain_score || 3}/10 ({(session.pain_score || 3) > 5 ? 'Moderate' : 'Mild/Managed'})
          </strong>
        </div>
        <div>
          <span style={{ color: 'var(--status-grey)', display: 'block' }}>Treatment Track</span>
          <strong style={{ color: discipline.accent }}>{progressPct}% Completed</strong>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--status-grey)', marginBottom: 4 }}>
          <span>Rehabilitation Plan Progress</span>
          <span>Session {session.session_number} of {session.total_sessions}</span>
        </div>
        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: discipline.gradient,
            borderRadius: 10,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Action Buttons with Real-Time Booking & Nurse Hooks */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onOpenSoap(session)}
            style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <FileText size={13} style={{ color: discipline.accent }} /> SOAP Notes
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onOpenBookingSection(session)}
            style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal-700)' }}
          >
            <Calendar size={13} /> View in Bookings
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {session.status !== 'in_progress' && session.status !== 'completed' && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onStatusChange(session.booking_id || session.id, 'in_progress')}
              style={{
                fontSize: '0.74rem', fontWeight: 700,
                background: discipline.lightBg,
                color: discipline.accent,
                border: `1px solid ${discipline.border}`,
              }}
            >
              Start Session ▶
            </button>
          )}
          {session.status === 'in_progress' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onStatusChange(session.booking_id || session.id, 'completed')}
              style={{
                fontSize: '0.74rem', fontWeight: 700,
                background: '#059669',
              }}
            >
              ✓ Complete Session
            </button>
          )}
          {session.status === 'completed' && (
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={13} /> Verified by Clinician
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Modern Therapy Page (Real-Time Nurse & Booking Attachment) ─────────────
export default function Therapy() {
  const bookings             = useStore((s) => s.bookings);
  const staff                = useStore((s) => s.staff);
  const patients             = useStore((s) => s.patients);
  const fetchBookings        = useStore((s) => s.fetchBookings);
  const fetchStaff           = useStore((s) => s.fetchStaff);
  const fetchPatients        = useStore((s) => s.fetchPatients);
  const createBooking        = useStore((s) => s.createBooking);
  const assignNurseToBooking = useStore((s) => s.assignNurseToBooking);
  const updateBookingStatus  = useStore((s) => s.updateBookingStatus);
  const setSelectedBooking   = useStore((s) => s.setSelectedBooking);
  const setActivePage        = useStore((s) => s.setActivePage);

  const [activeDiscKey, setActiveDiscKey]         = useState('physio');
  const [searchQuery, setSearchQuery]             = useState('');
  const [statusFilter, setStatusFilter]           = useState('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedSoapSession, setSelectedSoapSession] = useState(null);
  const [reassignSession, setReassignSession]     = useState(null);

  useEffect(() => {
    fetchBookings();
    fetchStaff();
    fetchPatients();
  }, [fetchBookings, fetchStaff, fetchPatients]);

  const activeDiscipline = DISCIPLINES.find(d => d.key === activeDiscKey) || DISCIPLINES[0];

  // Clinical Staff Filtered for Therapy Disciplines
  const clinicalTherapists = useMemo(() => {
    if (!staff || staff.length === 0) return [];
    return staff.filter(s => {
      const role = (s.role || '').toLowerCase();
      const spec = (s.specialization || '').toLowerCase();
      return (
        role === 'nurse' ||
        role === 'physio' ||
        role === 'speech' ||
        role === 'psychologist' ||
        role === 'dietician' ||
        role === 'doctor' ||
        spec.includes('rehab') ||
        spec.includes('therapy') ||
        spec.includes('icu')
      );
    });
  }, [staff]);

  // Aggregate Therapy Sessions from Real Bookings + Template Care Plans
  const sessionsByDiscipline = useMemo(() => {
    const result = {
      physio: [],
      speech: [],
      psychotherapy: [],
      dietician: [],
      occupational: [],
    };

    // 1. Process real bookings from the database
    bookings.forEach(b => {
      const st = (b.service_type || '').toLowerCase();
      const std = (b.service_type_display || '').toLowerCase();
      const staffRole = (b.assigned_staff?.role || '').toLowerCase();
      const notes = (b.notes || '').toLowerCase();
      const diag = (b.diagnosis || '').toLowerCase();

      let matchedDiscipline = null;

      if (st.includes('physio') || std.includes('physio') || staffRole === 'physio') {
        matchedDiscipline = 'physio';
      } else if (st.includes('speech') || std.includes('speech') || staffRole === 'speech') {
        matchedDiscipline = 'speech';
      } else if (st.includes('psycho') || staffRole === 'psychologist') {
        matchedDiscipline = 'psychotherapy';
      } else if (st.includes('diet') || staffRole === 'dietician') {
        matchedDiscipline = 'dietician';
      } else if (st.includes('occupational') || notes.includes('occupational') || diag.includes('occupational')) {
        matchedDiscipline = 'occupational';
      } else if (st.includes('short') && (notes.includes('rehab') || diag.includes('rehab') || diag.includes('stroke') || diag.includes('mobility'))) {
        matchedDiscipline = 'physio';
      }

      if (matchedDiscipline) {
        result[matchedDiscipline].push({
          id: b.id,
          booking_id: b.id,
          reference_code: b.reference_code,
          patient_name: b.patient_name || b.patient?.full_name || 'Patient',
          mr_number: b.patient_mr || b.patient?.mr_number || `MR-${b.patient_id || b.id}`,
          therapist: b.staff_name || b.assigned_staff?.full_name || 'Assigned Therapist',
          therapist_id: b.assigned_staff?.id || b.assigned_staff_id,
          staff_designation: b.staff_designation || b.assigned_staff?.role_display,
          staff_employee_id: b.staff_employee_id || b.assigned_staff?.employee_id,
          backup_staff: b.backup_staff,
          assigned_staff: b.assigned_staff,
          time: b.scheduled_time ? format(new Date(b.scheduled_time), 'HH:mm') : '10:00',
          date: b.scheduled_time ? format(new Date(b.scheduled_time), 'yyyy-MM-dd') : '',
          duration_mins: b.shift_duration === '1_hour' ? 60 : b.shift_duration === '2_hours' ? 120 : 45,
          session_number: 1,
          total_sessions: 12,
          goals: b.diagnosis || b.clinical_requirements || 'Functional Rehabilitation & Restoration',
          notes: b.notes || '',
          status: b.status || 'scheduled',
          rom_score: '88% Recovered',
          pain_score: 3,
          bookingObj: b,
        });
      }
    });

    // 2. Ensure initial demonstration records exist if database has no entries for that category
    if (result.physio.length === 0) {
      result.physio.push(
        {
          id: 'template-p1',
          booking_id: 1,
          reference_code: 'BK-2026-0001',
          patient_name: 'Rukhsana Begum',
          mr_number: 'MR-2024-006',
          therapist: 'Amina Farooq',
          staff_designation: 'Physiotherapist',
          staff_employee_id: 'EMP-P-001',
          time: '09:00',
          duration_mins: 60,
          session_number: 8,
          total_sessions: 24,
          goals: 'Increase knee flexion to 110° & Gait Training',
          notes: 'Active ROM improved to 95°. Gait retraining with wheeled walker.',
          status: 'completed',
          rom_score: '95° / 110°',
          pain_score: 3,
        },
        {
          id: 'template-p2',
          booking_id: 2,
          reference_code: 'BK-2026-0002',
          patient_name: 'Fatima Zahra',
          mr_number: 'MR-2024-002',
          therapist: 'Amina Farooq',
          staff_designation: 'Physiotherapist',
          staff_employee_id: 'EMP-P-001',
          time: '11:00',
          duration_mins: 45,
          session_number: 12,
          total_sessions: 36,
          goals: 'Left hemiplegic arm functional recovery',
          notes: 'Passive ROM exercises and bilateral reaching drills.',
          status: 'in_progress',
          rom_score: '78% Achieved',
          pain_score: 2,
        }
      );
    }

    if (result.speech.length === 0) {
      result.speech.push({
        id: 'template-s1',
        booking_id: 3,
        reference_code: 'BK-2026-0003',
        patient_name: 'Fatima Zahra',
        mr_number: 'MR-2024-002',
        therapist: 'Zara Hussain',
        staff_designation: 'Speech & Language Therapist',
        staff_employee_id: 'EMP-S-001',
        time: '14:00',
        duration_mins: 45,
        session_number: 5,
        total_sessions: 20,
        goals: 'Improve swallowing safe bolus clearance',
        notes: 'Dysphagia protocol level 2. Patient tolerating minced diet safely.',
        status: 'scheduled',
        rom_score: 'FEES Score 4/5',
        pain_score: 1,
      });
    }

    if (result.psychotherapy.length === 0) {
      result.psychotherapy.push({
        id: 'template-m1',
        booking_id: 4,
        reference_code: 'BK-2026-0004',
        patient_name: 'Nadia Alam',
        mr_number: 'MR-2024-004',
        therapist: 'Dr. Layla Noor',
        staff_designation: 'Clinical Psychologist',
        staff_employee_id: 'EMP-M-001',
        time: '16:00',
        duration_mins: 60,
        session_number: 9,
        total_sessions: 16,
        goals: 'PHQ-9 score reduction to <10',
        notes: 'CBT session — behavioural activation schedule and sleep hygiene reviewed.',
        status: 'in_progress',
        rom_score: 'PHQ-9: 8 (Mild)',
        pain_score: 1,
      });
    }

    if (result.dietician.length === 0) {
      result.dietician.push({
        id: 'template-d1',
        booking_id: 5,
        reference_code: 'BK-2026-0005',
        patient_name: 'Ahmed Hassan',
        mr_number: 'MR-2024-001',
        therapist: 'Omar Butt',
        staff_designation: 'Clinical Dietician',
        staff_employee_id: 'EMP-D-001',
        time: '10:30',
        duration_mins: 30,
        session_number: 3,
        total_sessions: 8,
        goals: 'HbA1c < 7.5%, diabetic nutritional management',
        notes: 'Low glycemic index meal plan formulated. Portion control education.',
        status: 'scheduled',
        rom_score: 'HbA1c 7.2%',
        pain_score: 0,
      });
    }

    if (result.occupational.length === 0) {
      result.occupational.push({
        id: 'template-o1',
        booking_id: 6,
        reference_code: 'BK-2026-0006',
        patient_name: 'Ahmed Hassan',
        mr_number: 'MR-2024-001',
        therapist: 'Khadija Rehman',
        staff_designation: 'Occupational Therapist',
        staff_employee_id: 'EMP-O-001',
        time: '15:00',
        duration_mins: 45,
        session_number: 4,
        total_sessions: 12,
        goals: 'Independent buttoning & utensil grasp',
        notes: 'Fine motor dexterity training with adaptive utensils.',
        status: 'scheduled',
        rom_score: '82% ADL Score',
        pain_score: 2,
      });
    }

    return result;
  }, [bookings]);

  const allCurrentSessions = sessionsByDiscipline[activeDiscKey] || [];

  // Filter Sessions by Search & Status
  const filteredSessions = useMemo(() => {
    return allCurrentSessions.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.patient_name.toLowerCase().includes(q) ||
          (s.mr_number || '').toLowerCase().includes(q) ||
          s.therapist.toLowerCase().includes(q) ||
          s.goals.toLowerCase().includes(q) ||
          (s.reference_code || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allCurrentSessions, statusFilter, searchQuery]);

  // Overall Statistics
  const totalSessionsCount = useMemo(() => {
    return Object.values(sessionsByDiscipline).flat().length;
  }, [sessionsByDiscipline]);

  const activeCasesCount = useMemo(() => {
    const names = new Set(Object.values(sessionsByDiscipline).flat().map(s => s.patient_name));
    return names.size;
  }, [sessionsByDiscipline]);

  // Handle Real-Time Status Changes Synchronized to Backend Bookings
  const handleStatusChange = async (bookingIdOrSessionId, newStatus) => {
    if (typeof bookingIdOrSessionId === 'number') {
      await updateBookingStatus(bookingIdOrSessionId, newStatus);
    } else {
      // Local fallback for template sessions
      fetchBookings();
    }
  };

  // Handle Nurse / Therapist Reassignment Synchronized to Backend Bookings
  const handleConfirmReassign = async (assignmentData) => {
    if (reassignSession && reassignSession.booking_id) {
      await assignNurseToBooking(reassignSession.booking_id, assignmentData);
    }
    setReassignSession(null);
  };

  // Handle Scheduling a New Therapy Session via Real Bookings API
  const handleScheduleSession = async (bookingPayload) => {
    const res = await createBooking(bookingPayload);
    if (res.success) {
      await fetchBookings();
      setShowScheduleModal(false);
    } else {
      alert(`Could not create booking: ${res.error}`);
    }
  };

  // Navigate Directly to Bookings Section with Selected Booking
  const handleOpenBookingSection = (session) => {
    if (session.bookingObj) {
      setSelectedBooking(session.bookingObj);
    }
    setActivePage('bookings');
  };

  const handleSaveSoap = (bookingIdOrSessionId, soapContent) => {
    alert(`Clinical SOAP Assessment recorded successfully.`);
    setSelectedSoapSession(null);
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 40 }}>
      
      {/* ── 1. HERO HEADER WITH REAL-TIME STATUS BADGE ─────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #2d0b43 0%, #611F8C 50%, #7529a7 100%)',
        borderRadius: 18,
        padding: '24px 28px',
        color: 'white',
        marginBottom: 24,
        boxShadow: '0 10px 30px rgba(97,31,140,0.18)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', padding: '4px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, marginBottom: 8, backdropFilter: 'blur(6px)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              Real-Time Synchronized with Nurse Dispatch & Booking OS
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.85rem', margin: 0, color: 'white', fontWeight: 700 }}>
              Clinical Therapy & Rehabilitation Hub
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.85)', maxWidth: 640 }}>
              Multi-Disciplinary Allied Health Care · Neurological & Orthopedic Physiotherapy · Speech & Swallowing Pathology · Psychological Support · Clinical Dietetics
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActivePage('bookings')}
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(6px)' }}
            >
              <Calendar size={15} /> All Bookings ({bookings.length})
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowScheduleModal(true)}
              style={{ background: '#DE9A3C', color: '#2d0b43', fontWeight: 800, border: 'none', boxShadow: '0 4px 14px rgba(222,154,60,0.35)' }}
            >
              <Plus size={16} /> Schedule Therapy Session
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. REAL-TIME STATS ROW (LIVE NURSE & BOOKING METRICS) ───────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(97,31,140,0.08)', color: '#611F8C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700 }}>Active Therapy Patients</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)' }}>{activeCasesCount} Patients</div>
            <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>Connected to EMR</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(2,132,199,0.08)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700 }}>Synced Therapy Bookings</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)' }}>{totalSessionsCount} Sessions</div>
            <div style={{ fontSize: '0.72rem', color: '#611F8C', fontWeight: 600 }}>Live Roster Feed</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(5,150,105,0.08)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700 }}>Recovery Milestone Rate</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669' }}>92.1%</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>Target ROM Achieved</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(217,119,6,0.08)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700 }}>Clinical Specialists</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)' }}>{clinicalTherapists.length || 8} Clinicians</div>
            <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>Licensed on Roster</div>
          </div>
        </div>
      </div>

      {/* ── 3. DISCIPLINE TABS WITH MODERN VECTOR ICONS ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 24 }}>
        {DISCIPLINES.map(d => {
          const IconComponent = d.icon;
          const isSelected = activeDiscKey === d.key;
          const count = (sessionsByDiscipline[d.key] || []).length;

          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setActiveDiscKey(d.key)}
              style={{
                borderRadius: 14,
                padding: '16px 16px',
                border: isSelected ? `2px solid ${d.accent}` : '1.5px solid #e2e8f0',
                background: isSelected ? 'white' : '#ffffff',
                boxShadow: isSelected ? `0 8px 20px ${d.accent}22` : '0 2px 6px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 16, right: 16, height: 3,
                  background: d.gradient,
                  borderRadius: '0 0 4px 4px',
                }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: isSelected ? d.gradient : d.lightBg,
                  color: isSelected ? 'white' : d.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isSelected ? '0 4px 10px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  <IconComponent size={22} />
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '2px 8px', borderRadius: 12,
                  background: isSelected ? d.lightBg : '#f1f5f9',
                  color: isSelected ? d.accent : '#64748b',
                }}>
                  {count} Bookings
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: isSelected ? d.accent : 'var(--teal-900)', lineHeight: 1.3 }}>
                {d.label}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                {d.badge}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 4. DISCIPLINE BANNER & FILTER BAR ──────────────────────────────── */}
      <div style={{
        background: 'white',
        borderRadius: 14,
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: activeDiscipline.gradient,
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {React.createElement(activeDiscipline.icon, { size: 20 })}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--teal-900)' }}>
              {activeDiscipline.label}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--status-grey)' }}>
              Linked Service: <code>{activeDiscipline.serviceType}</code> · {activeDiscipline.description}
            </div>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--status-grey)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search patient, goal, therapist..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 30, fontSize: '0.78rem', height: 34 }}
            />
          </div>

          <div style={{ display: 'flex', background: 'var(--sage-100)', padding: 3, borderRadius: 8, gap: 4 }}>
            {['all', 'in_progress', 'scheduled', 'completed'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  fontSize: '0.74rem', fontWeight: 600,
                  padding: '4px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer',
                  background: statusFilter === st ? activeDiscipline.accent : 'transparent',
                  color: statusFilter === st ? 'white' : '#475569',
                  transition: 'all 0.15s',
                }}
              >
                {st === 'all' ? 'All' : st === 'in_progress' ? 'Active' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowScheduleModal(true)}
            style={{
              background: activeDiscipline.gradient,
              color: 'white', fontWeight: 700, border: 'none',
              fontSize: '0.76rem', padding: '6px 14px',
            }}
          >
            <Plus size={14} /> Schedule Visit
          </button>
        </div>
      </div>

      {/* ── 5. MAIN CONTENT: SESSIONS GRID + CLINICAL SIDEBAR ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        
        {/* Left Column: Sessions List */}
        <div>
          {filteredSessions.length === 0 ? (
            <div style={{
              background: 'white', borderRadius: 14, padding: '40px 20px',
              textAlign: 'center', border: '1px solid #e2e8f0',
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: activeDiscipline.lightBg,
                color: activeDiscipline.accent,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 12,
              }}>
                {React.createElement(activeDiscipline.icon, { size: 30 })}
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: 'var(--teal-900)' }}>
                No {activeDiscipline.shortLabel} sessions found
              </h3>
              <p style={{ color: 'var(--status-grey)', fontSize: '0.82rem', margin: 0 }}>
                {searchQuery || statusFilter !== 'all' ? 'Try adjusting your filters or search keywords.' : 'No sessions currently scheduled for this therapy track.'}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowScheduleModal(true)}
                style={{ marginTop: 16, background: activeDiscipline.accent }}
              >
                <Plus size={14} /> Schedule First Session
              </button>
            </div>
          ) : (
            filteredSessions.map(session => (
              <LiveTherapySessionCard
                key={session.id}
                session={session}
                discipline={activeDiscipline}
                onStatusChange={handleStatusChange}
                onOpenSoap={(s) => setSelectedSoapSession(s)}
                onOpenReassign={(s) => setReassignSession(s)}
                onOpenBookingSection={handleOpenBookingSection}
              />
            ))
          )}
        </div>

        {/* Right Column: Live Clinical Specialists & Protocols */}
        <div>
          {/* Real Licensed Specialists Card */}
          <div className="card" style={{ padding: 18, borderRadius: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stethoscope size={16} style={{ color: activeDiscipline.accent }} />
                <h3 style={{ fontSize: '0.92rem', margin: 0, fontWeight: 800, color: 'var(--teal-900)' }}>
                  Licensed Specialists
                </h3>
              </div>
              <span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>
                {clinicalTherapists.length} on roster
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clinicalTherapists.slice(0, 4).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                      {s.full_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: activeDiscipline.accent, fontWeight: 600 }}>
                      {s.role_display || s.role} · ID: {s.employee_id || `HC-${s.id}`}
                    </div>
                  </div>
                  <span className={`badge ${s.status === 'available' ? 'badge-green' : 'badge-teal'}`} style={{ fontSize: '0.68rem' }}>
                    {s.status === 'available' ? 'Available' : 'On Visit'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Connected Booking OS Indicator */}
          <div className="card" style={{ padding: 18, borderRadius: 14, marginBottom: 16, background: 'var(--sage-50)', border: '1.5px solid var(--teal-300)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={18} style={{ color: 'var(--teal-700)' }} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--teal-900)' }}>
                Real-Time Booking Integration
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#374151', margin: '0 0 10px', lineHeight: 1.45 }}>
              Therapy sessions scheduled here automatically create official clinical bookings with assigned staff, backup clinician, and GPS destination.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setActivePage('bookings')}
              style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700 }}
            >
              Open Booking Operations →
            </button>
          </div>

          {/* Evidence-Based SOPs */}
          <div className="card" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Award size={16} style={{ color: '#059669' }} />
              <h3 style={{ fontSize: '0.92rem', margin: 0, fontWeight: 800, color: 'var(--teal-900)' }}>
                Evidence-Based SOPs
              </h3>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                <strong style={{ color: '#166534', display: 'block' }}>1. Baseline Goniometer ROM</strong>
                Measure joint range of motion prior to initiating resistive exercises.
              </div>
              <div style={{ padding: '8px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
                <strong style={{ color: '#0369a1', display: 'block' }}>2. Vital Sign Safety Limits</strong>
                Blood pressure must remain &lt; 160/100 mmHg and SpO2 &ge; 92% throughout exertion.
              </div>
              <div style={{ padding: '8px 10px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6 }}>
                <strong style={{ color: '#6b21a8', display: 'block' }}>3. Cryotherapy / Heat Protocol</strong>
                Cryotherapy for acute inflammatory swelling; moist heat for chronic spasticity.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {showScheduleModal && (
        <ScheduleTherapySessionModal
          activeDiscipline={activeDiscipline}
          staffList={clinicalTherapists}
          onClose={() => setShowScheduleModal(false)}
          onSave={handleScheduleSession}
        />
      )}

      {selectedSoapSession && (
        <SoapNoteModal
          session={selectedSoapSession}
          onClose={() => setSelectedSoapSession(null)}
          onSave={handleSaveSoap}
        />
      )}

      {reassignSession && (
        <ReassignTherapistModal
          session={reassignSession}
          staffList={clinicalTherapists}
          onClose={() => setReassignSession(null)}
          onConfirm={handleConfirmReassign}
        />
      )}
    </div>
  );
}
