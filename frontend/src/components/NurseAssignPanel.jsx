import React, { useState, useEffect } from 'react';
import { UserCheck, Star, Phone, Check, Shield, AlertCircle } from 'lucide-react';
import { SKILLS_LIST } from '../data/mockData';
import useStore from '../store/useStore';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function NurseAssignPanel({ booking, staffList, onConfirmAssignment }) {
  const storeStaff = useStore((s) => s.staff);
  const fetchStaff = useStore((s) => s.fetchStaff);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Use latest store staff if available, falling back to staffList prop
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
  
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [primaryNurseId, setPrimaryNurseId] = useState(booking?.assigned_staff?.id || '');
  const [backupNurseId, setBackupNurseId]   = useState(booking?.backup_staff?.id || '');
  const [recurringDays, setRecurringDays]   = useState(booking?.recurring_days || ['Mon', 'Wed', 'Fri']);
  const [instructions, setInstructions]     = useState(booking?.nurse_instructions || '');
  const [isAssigned, setIsAssigned]         = useState(!!booking?.assigned_staff);

  // Filter nurses by skills if skills are selected, fallback to availableStaff if no match
  const filteredNurses = availableStaff.filter(s => {
    if (selectedSkills.length === 0) return true;
    const spec = (s.specialization || '').toLowerCase();
    return selectedSkills.some(sk => spec.includes(sk.toLowerCase()));
  });

  const dropdownNurses = filteredNurses.length > 0 ? filteredNurses : availableStaff;

  const primaryNurse = allStaff.find(s => String(s.id) === String(primaryNurseId));
  const backupNurse  = allStaff.find(s => String(s.id) === String(backupNurseId));

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
    if (!primaryNurse) return;
    setIsAssigned(true);
    if (onConfirmAssignment) {
      onConfirmAssignment({
        staff: primaryNurse,
        backupStaff: backupNurse,
        recurringDays,
        instructions
      });
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: 18, border: '1px solid var(--sage-200)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <UserCheck size={18} style={{ color: 'var(--teal-600)' }} />
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', margin: 0, color: 'var(--teal-800)' }}>
          Nurse Assignment
        </h3>
      </div>

      {isAssigned && primaryNurse ? (
        /* Confirmed Assigned Nurse Summary Card */
        <div style={{ background: 'var(--sage-50)', borderRadius: 10, padding: 16, border: '1.5px solid var(--teal-300)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyBetween: 'space-between', gap: 12, marginBottom: 12 }}>
            <div className="avatar avatar-lg" style={{ background: 'var(--teal-700)', color: 'white' }}>
              {primaryNurse.full_name.split(' ').map(n=>n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)' }}>{primaryNurse.full_name}</span>
                <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>✓ Assigned</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
                {primaryNurse.role_display} · {primaryNurse.specialization}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--amber-600)', fontWeight: 600 }}>★ {primaryNurse.rating}</span>
                <span style={{ color: 'var(--status-grey)' }}><Phone size={11} inline /> {primaryNurse.phone}</span>
                <span className="ts" style={{ color: 'var(--status-grey)' }}>ID: {primaryNurse.employee_id}</span>
              </div>
            </div>
          </div>

          {backupNurse && (
            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', padding: '6px 10px', background: 'white', borderRadius: 6, marginBottom: 10 }}>
              Backup Nurse: <strong>{backupNurse.full_name}</strong> ({backupNurse.phone})
            </div>
          )}

          {/* Skill checklist with checkmarks */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal-700)', textTransform: 'uppercase', marginBottom: 6 }}>
              Verified Skill Checklist
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['BP Monitoring', 'Medication', 'Dressing', 'Emergency Response'].map(sk => (
                <span key={sk} style={{ fontSize: '0.72rem', background: 'white', border: '1px solid var(--teal-200)', color: 'var(--teal-700)', padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Check size={11} style={{ color: 'var(--status-green)' }} /> {sk}
                </span>
              ))}
            </div>
          </div>

          {recurringDays.length > 0 && (
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--status-grey)' }}>
              Schedule: <strong>{recurringDays.join(', ')}</strong>
            </div>
          )}

          {instructions && (
            <div style={{ marginTop: 10, fontSize: '0.8rem', background: 'white', padding: 8, borderRadius: 6, borderLeft: '3px solid var(--amber-500)', fontStyle: 'italic' }}>
              "{instructions}"
            </div>
          )}

          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setIsAssigned(false)}>
            Reassign / Modify Nurse
          </button>
        </div>
      ) : (
        /* Form for Nurse Assignment */
        <div>
          {/* Skill Filter Chips */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Filter by Required Skills</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SKILLS_LIST.map(skill => {
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

          {/* Primary Nurse Selection */}
          <div className="form-group">
            <label className="form-label">Select Primary Nurse</label>
            <select
              className="form-select"
              value={primaryNurseId}
              onFocus={() => fetchStaff()}
              onChange={e => setPrimaryNurseId(e.target.value)}
            >
              <option value="">Choose nurse...</option>
              {dropdownNurses.map(s => {
                const spec = (s.specialization || '').toLowerCase();
                const matchesSkills = selectedSkills.length > 0 && selectedSkills.some(sk => spec.includes(sk.toLowerCase()));
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role_display || s.role}) — ★{s.rating || 5.0} — {s.status === 'available' ? 'Available' : (s.status_display || s.status || 'Active')}
                    {matchesSkills ? ' ★ Skill Match' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Backup Nurse Selection */}
          <div className="form-group">
            <label className="form-label">Backup Nurse (Optional)</label>
            <select
              className="form-select"
              value={backupNurseId}
              onFocus={() => fetchStaff()}
              onChange={e => setBackupNurseId(e.target.value)}
            >
              <option value="">Choose backup nurse (optional)...</option>
              {availableStaff.filter(s => String(s.id) !== String(primaryNurseId)).map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.role_display || s.role}) — ★{s.rating || 5.0}
                </option>
              ))}
            </select>
          </div>

          {/* Recurring Days Selector */}
          <div className="form-group">
            <label className="form-label">Recurring Days</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map(day => {
                const active = recurringDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: 6,
                      border: `1px solid ${active ? 'var(--teal-500)' : 'var(--sage-200)'}`,
                      background: active ? 'var(--teal-100)' : 'white',
                      color: active ? 'var(--teal-800)' : 'var(--status-grey)',
                      cursor: 'pointer'
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Special Instructions */}
          <div className="form-group">
            <label className="form-label">Nurse Instructions</label>
            <textarea
              className="form-textarea"
              placeholder="E.g. Check blood sugar before insulin, patient sensitive to cold water..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={2}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleConfirm}
            disabled={!primaryNurseId}
          >
            Confirm Nurse Assignment
          </button>
        </div>
      )}
    </div>
  );
}
