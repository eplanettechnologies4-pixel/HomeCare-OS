import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import useStore from '../store/useStore';

export default function EditPatientModal({ patient, onClose, onUpdated }) {
  const updatePatient = useStore((s) => s.updatePatient);
  const [form, setForm] = useState({
    full_name: patient.full_name || '',
    age: patient.age || '',
    gender: patient.gender || (patient.gender_display === 'Female' ? 'F' : 'M'),
    blood_type: patient.blood_type || 'O+',
    phone: patient.phone || '',
    primary_diagnosis: patient.primary_diagnosis || '',
    allergies: patient.allergies || '',
    address: patient.address || '',
    is_active: patient.is_active !== undefined ? patient.is_active : true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const nameParts = (form.full_name || '').trim().split(/\s+/);
    const first_name = nameParts[0] || 'Unknown';
    const last_name = nameParts.slice(1).join(' ') || '.';
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - (parseInt(form.age, 10) || 30);

    const payload = {
      first_name,
      last_name,
      date_of_birth: `${birthYear}-01-01`,
      gender: form.gender,
      blood_type: form.blood_type,
      phone: form.phone,
      primary_diagnosis: form.primary_diagnosis,
      allergies: form.allergies,
      address: form.address,
      is_active: form.is_active,
    };

    try {
      await updatePatient(patient.id, payload);
      setSaving(false);
      if (onUpdated) onUpdated({ ...patient, ...payload, full_name: form.full_name });
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Failed to update patient record.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-heading)' }}>
              Edit Patient Information
            </h3>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              MR Number: {patient.mr_number || `P-000${patient.id}`}
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
                <label className="form-label" style={{ fontWeight: 600 }}>Age (Years)</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: parseInt(e.target.value, 10) || '' })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Gender</label>
                <select
                  className="form-select"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Blood Type</label>
                <select
                  className="form-select"
                  value={form.blood_type}
                  onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
                >
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
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
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Primary Diagnosis / Condition</label>
              <input
                type="text"
                className="form-input"
                value={form.primary_diagnosis}
                onChange={(e) => setForm({ ...form, primary_diagnosis: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Allergies / Special Warnings</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Penicillin, NSAIDs, None"
                value={form.allergies}
                onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Residential Address</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Patient Status</label>
              <select
                className="form-select"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
              >
                <option value="active">Active (Under Home Care)</option>
                <option value="inactive">Inactive / Discharged</option>
              </select>
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
