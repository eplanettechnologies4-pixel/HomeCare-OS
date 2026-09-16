import React, { useState } from 'react';
import { X, Eye, EyeOff, Shield, User, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import useStore from '../store/useStore';

const ROLE_OPTIONS = [
  { value: 'nurse', label: 'Nurse', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'doctor', label: 'Doctor', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'physio', label: 'Physiotherapist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'speech', label: 'Speech & Language Therapist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'psychologist', label: 'Psychologist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'dietician', label: 'Dietician', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'care_manager', label: 'Client Care Manager', category: 'Operations & Management', defaultPlatform: 'both' },
  { value: 'branch_manager', label: 'Branch Manager', category: 'Operations & Management', defaultPlatform: 'web' },
  { value: 'admin', label: 'System Admin', category: 'Administration', defaultPlatform: 'web' },
  { value: 'accountant', label: 'Accountant', category: 'Finance', defaultPlatform: 'web' },
  { value: 'crm_executive', label: 'CRM Executive', category: 'Client Relations', defaultPlatform: 'web' },
];

export default function AddStaffUserModal({ onClose, onSuccess }) {
  const createStaffMember = useStore((s) => s.createStaffMember);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    password_confirm: '',
    role: 'nurse',
    specialization: '',
    phone: '',
    email: '',
    platform_allowed: 'mobile',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setF = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleRoleChange = (newRole) => {
    const matched = ROLE_OPTIONS.find((r) => r.value === newRole);
    setForm((prev) => ({
      ...prev,
      role: newRole,
      platform_allowed: matched ? matched.defaultPlatform : prev.platform_allowed,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedUsername = form.username.trim();
    if (!trimmedUsername) {
      setError('Username is required.');
      return;
    }
    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!form.password) {
      setError('Password is required. Please type the password directly.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.password_confirm) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);
    const res = await createStaffMember({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      username: trimmedUsername,
      password: form.password,
      password_confirm: form.password_confirm,
      role: form.role,
      specialization: form.specialization.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      platform_allowed: form.platform_allowed,
    });
    setLoading(false);

    if (res.success) {
      if (onSuccess) onSuccess(res.data);
    } else {
      setError(res.error || 'Failed to create user account. Please check your inputs.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0, color: 'var(--teal-800)' }}>
              Add New User / Staff Account
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--status-grey)' }}>
              Creates an authentic Django User and Staff record. Set login credentials directly below.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  color: '#b91c1c',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Names */}
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={form.first_name}
                  onChange={(e) => setF('first_name', e.target.value)}
                  placeholder="e.g. Abdullah"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={form.last_name}
                  onChange={(e) => setF('last_name', e.target.value)}
                  placeholder="e.g. Fouzan"
                />
              </div>
            </div>

            {/* Role & Platform */}
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">System Role *</label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.category})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Platform Allowed *</label>
                <select
                  className="form-select"
                  value={form.platform_allowed}
                  onChange={(e) => setF('platform_allowed', e.target.value)}
                >
                  <option value="mobile">Mobile App Only</option>
                  <option value="web">Web Dashboard Only</option>
                  <option value="both">Both Mobile & Web</option>
                </select>
              </div>
            </div>

            {/* Specialization */}
            <div className="form-group">
              <label className="form-label">Specialization / Designation / Department</label>
              <input
                type="text"
                className="form-input"
                value={form.specialization}
                onChange={(e) => setF('specialization', e.target.value)}
                placeholder="e.g. ICU Nurse, General Physician, Main Office (Islamabad)"
              />
            </div>

            {/* Contact Info */}
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.phone}
                  onChange={(e) => setF('phone', e.target.value)}
                  placeholder="+92-300-1234567"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={(e) => setF('email', e.target.value)}
                  placeholder="user@ehealth.com"
                />
              </div>
            </div>

            {/* Credentials Block */}
            <div
              style={{
                padding: '14px 16px',
                background: 'var(--sage-50)',
                borderRadius: 8,
                border: '1px solid var(--sage-200)',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: 'var(--teal-800)',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Lock size={15} /> Login Credentials (Admin-Set, No Auto-Generation)
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={form.username}
                  onChange={(e) => setF('username', e.target.value)}
                  placeholder="e.g. abdullah_fouzan"
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                  Unique username used to log into Web Dashboard and/or Mobile App.
                </span>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      required
                      style={{ paddingRight: 36 }}
                      value={form.password}
                      onChange={(e) => setF('password', e.target.value)}
                      placeholder="Min 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--status-grey)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input"
                      required
                      style={{ paddingRight: 36 }}
                      value={form.password_confirm}
                      onChange={(e) => setF('password_confirm', e.target.value)}
                      placeholder="Re-type password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--status-grey)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="modal-footer"
            style={{ borderTop: '1px solid var(--sage-200)', paddingTop: 14 }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {loading ? 'Creating Backend Record...' : 'Create Account & Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
