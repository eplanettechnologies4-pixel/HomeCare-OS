import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import useStore from '../store/useStore';

const ROLES = [
  { value: 'nurse', label: 'Nurse' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'physio', label: 'Physiotherapist' },
  { value: 'speech', label: 'Speech Therapist' },
  { value: 'psychologist', label: 'Psychologist' },
  { value: 'dietician', label: 'Dietician' },
  { value: 'care_manager', label: 'Care Manager' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'admin', label: 'Admin / Operations' },
];

const STATUSES = [
  { value: 'available', label: 'Available (On Standby)' },
  { value: 'on_visit', label: 'On Visit (In Field)' },
  { value: 'off_duty', label: 'Off Duty' },
  { value: 'on_leave', label: 'On Leave' },
];

export default function EditStaffModal({ staff, onClose, onUpdated }) {
  const updateStaffMember = useStore((s) => s.updateStaffMember);
  const [form, setForm] = useState({
    full_name: staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || '',
    role: staff.role || 'nurse',
    specialization: staff.specialization || '',
    phone: staff.phone || '',
    email: staff.email || '',
    status: staff.status || 'available',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const nameParts = (form.full_name || '').trim().split(/\s+/);
    const first_name = nameParts[0] || 'Staff';
    const last_name = nameParts.slice(1).join(' ') || '';

    const payload = {
      first_name,
      last_name,
      role: form.role,
      role_display: ROLES.find(r => r.value === form.role)?.label || form.role,
      specialization: form.specialization,
      phone: form.phone,
      email: form.email,
      status: form.status,
      status_display: STATUSES.find(s => s.value === form.status)?.label || form.status,
    };

    try {
      await updateStaffMember(staff.id, payload);
      setSaving(false);
      if (onUpdated) onUpdated({ ...staff, ...payload, full_name: form.full_name });
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Failed to update staff member.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500, maxWidth: '95vw' }}>
        <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-heading)' }}>
              Edit Staff Member
            </h3>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Employee ID: {staff.employee_id || `EMP00${staff.id}`}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 22 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Full Name</label>
              <input
                type="text"
                className="form-input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Role / Designation</label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Duty Status</label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Clinical Specialization</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Critical Care, Wound Care, Cardiology"
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--sage-200)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: '#611F8C' }}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
