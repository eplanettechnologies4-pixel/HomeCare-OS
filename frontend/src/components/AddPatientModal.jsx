import React, { useState } from 'react';
import { User, Phone, MapPin, Heart, AlertTriangle, Upload, X, CheckCircle, Shield, FileText } from 'lucide-react';
import useStore from '../store/useStore';

export default function AddPatientModal({ onClose }) {
  const patients           = useStore((s) => s.patients);
  const staff              = useStore((s) => s.staff);
  const createPatient      = useStore((s) => s.createPatient);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);
  const setActivePage     = useStore((s) => s.setActivePage);

  const careManagers = staff.filter(s => s.role === 'care_manager' || s.role === 'doctor');

  // Form State
  const [form, setForm] = useState({
    full_name: '',
    age: '',
    gender: 'M',
    phone: '+92-3',
    address: '',
    blood_type: 'O+',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    primary_diagnosis: '',
    referring_doctor: '',
    allergies: '',
    care_manager_id: careManagers[0]?.id || '',
    service_type: 'long_term',
    plan_type: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
  });

  const [documents, setDocuments] = useState([]);
  const [errors, setErrors]       = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [serverError, setServerError]           = useState('');
  const [isSubmitting, setIsSubmitting]         = useState(false);

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    // Live Duplicate Check
    if (key === 'full_name' || key === 'phone') {
      const nameMatch = key === 'full_name' ? val.toLowerCase() : form.full_name.toLowerCase();
      const phoneMatch = key === 'phone' ? val : form.phone;
      if (nameMatch.length > 3) {
        const existing = patients.find(p => p.full_name?.toLowerCase() === nameMatch || (phoneMatch.length > 8 && p.phone === phoneMatch));
        if (existing) {
          setDuplicateWarning(`Warning: Patient "${existing.full_name}" (${existing.mr_number}) already exists with contact ${existing.phone}.`);
        } else {
          setDuplicateWarning('');
        }
      } else {
        setDuplicateWarning('');
      }
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(f => {
      setDocuments(prev => [...prev, { name: f.name, size: `${(f.size/1024).toFixed(0)} KB` }]);
    });
  };

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = 'Full name is required';
    if (!form.age || Number(form.age) <= 0) errs.age = 'Valid age is required';
    if (!form.phone || form.phone.length < 10 || !form.phone.startsWith('+92')) errs.phone = 'Valid phone format (+92-3xxxxxxxxx) required';
    if (!form.address.trim()) errs.address = 'Address is required';
    if (!form.primary_diagnosis.trim()) errs.primary_diagnosis = 'Diagnosis is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setServerError('');
    setIsSubmitting(true);

    const nameParts = form.full_name.trim().split(/\s+/);
    const first_name = nameParts[0] || 'Unknown';
    const last_name = nameParts.slice(1).join(' ') || '.';
    const birthYear = new Date().getFullYear() - (parseInt(form.age, 10) || 30);
    const date_of_birth = `${birthYear}-01-01`;

    const payload = {
      first_name,
      last_name,
      date_of_birth,
      gender: form.gender,
      phone: form.phone.trim(),
      address: form.address.trim(),
      primary_diagnosis: form.primary_diagnosis.trim(),
      blood_type: form.blood_type || '',
      allergies: form.allergies || 'NKDA',
      emergency_contact_name: form.emergency_contact_name || '',
      emergency_contact_phone: form.emergency_contact_phone || '',
      emergency_contact_relation: 'Emergency Contact',
      assigned_care_manager: form.care_manager_id ? Number(form.care_manager_id) : null,
      latitude: 33.57,
      longitude: 73.15,
      is_active: true,
    };

    const res = await createPatient(payload);
    setIsSubmitting(false);

    if (res.success) {
      if (onClose) onClose();
      setSelectedPatient(res.data);
      setActivePage('patients');
    } else {
      setServerError(res.error || 'Failed to create patient on server. Please verify required fields.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
      <div className="modal" style={{ width: 680 }}>
        <div className="modal-header" style={{ background: 'var(--teal-700)', color: 'white' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'white' }}>
              Patient Onboarding Registration
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              Add new patient to HomeCare OS EMR system
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={isSubmitting} style={{ color: 'white' }}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: 22 }}>
          
          {/* Server Error Alert */}
          {serverError && (
            <div style={{ background: '#fff5f5', border: '1px solid var(--status-red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.85rem', color: 'var(--status-red)' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>{serverError}</div>
            </div>
          )}

          {/* Duplicate Warning Alert */}
          {duplicateWarning && (
            <div style={{ background: '#fffbeb', border: '1px solid var(--amber-500)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.82rem', color: '#92400e' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>{duplicateWarning}</div>
            </div>
          )}

          {/* Section 1: Personal Information */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-700)', borderBottom: '1px solid var(--sage-200)', paddingBottom: 6, marginBottom: 12 }}>
              1. Personal Information
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Tariq Mehmood" />
                {errors.full_name && <span style={{ fontSize: '0.72rem', color: 'var(--status-red)' }}>{errors.full_name}</span>}
              </div>
              <div className="grid-2" style={{ gap: 8, marginBottom: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Age *</label>
                  <input type="number" className="form-input" value={form.age} onChange={e => set('age', e.target.value)} placeholder="65" />
                  {errors.age && <span style={{ fontSize: '0.72rem', color: 'var(--status-red)' }}>{errors.age}</span>}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contact Number (+92 format) *</label>
                <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+92-300-1234567" />
                {errors.phone && <span style={{ fontSize: '0.72rem', color: 'var(--status-red)' }}>{errors.phone}</span>}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Blood Group</label>
                <select className="form-select" value={form.blood_type} onChange={e => set('blood_type', e.target.value)}>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Home Address *</label>
                <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="House/Flat #, Block, Sector / Society, Islamabad (PWD / Soan Garden)" />
                {errors.address && <span style={{ fontSize: '0.72rem', color: 'var(--status-red)' }}>{errors.address}</span>}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Emergency Contact Name</label>
                <input className="form-input" value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} placeholder="Relative/Kin Name" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Emergency Contact Phone</label>
                <input className="form-input" value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} placeholder="+92-3xx-xxxxxxx" />
              </div>
            </div>
          </div>

          {/* Section 2: Clinical & Medical Info */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-700)', borderBottom: '1px solid var(--sage-200)', paddingBottom: 6, marginBottom: 12 }}>
              2. Medical & Clinical Background
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Primary Diagnosis / Condition *</label>
                <input className="form-input" value={form.primary_diagnosis} onChange={e => set('primary_diagnosis', e.target.value)} placeholder="e.g. Type 2 Diabetes with Diabetic Foot Ulcer, Post-Stroke Rehab..." />
                {errors.primary_diagnosis && <span style={{ fontSize: '0.72rem', color: 'var(--status-red)' }}>{errors.primary_diagnosis}</span>}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Referring Doctor / Hospital</label>
                <input className="form-input" value={form.referring_doctor} onChange={e => set('referring_doctor', e.target.value)} placeholder="e.g. Dr. Aslam (Aga Khan Hospital)" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Known Allergies</label>
                <input className="form-input" value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="e.g. Penicillin, Sulfa, NKDA..." />
              </div>
            </div>
          </div>

          {/* Section 3: Package & Care Manager Assignment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-700)', borderBottom: '1px solid var(--sage-200)', paddingBottom: 6, marginBottom: 12 }}>
              3. Package Plan & Care Manager
            </div>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Client Care Manager</label>
                <select className="form-select" value={form.care_manager_id} onChange={e => set('care_manager_id', e.target.value)}>
                  {careManagers.map(cm => <option key={cm.id} value={cm.id}>{cm.full_name} ({cm.role_display})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Service Package Type</label>
                <select className="form-select" value={form.service_type} onChange={e => set('service_type', e.target.value)}>
                  <option value="long_term">Long-Term Care</option>
                  <option value="short_service">Short Service Visits</option>
                  <option value="medicine_delivery">Medicine Management</option>
                  <option value="long_term_admission">24/7 Long-Term Admission</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Billing Plan</label>
                <select className="form-select" value={form.plan_type} onChange={e => set('plan_type', e.target.value)}>
                  <option value="monthly">Monthly Package</option>
                  <option value="visit">Per-Visit Billing</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Document Uploads */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-700)', borderBottom: '1px solid var(--sage-200)', paddingBottom: 6, marginBottom: 12 }}>
              4. Documents & Medical Reports
            </div>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', gap: 6, marginBottom: 10 }}>
              <Upload size={14} /> Upload CNIC / Prescription / Medical Reports
              <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            {documents.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {documents.map((doc, i) => (
                  <span key={i} className="badge badge-teal" style={{ fontSize: '0.75rem' }}>
                    <FileText size={12} /> {doc.name} ({doc.size})
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating Patient…' : 'Create Patient Record & View 360° Profile →'}
          </button>
        </div>
      </div>
    </div>
  );
}
