import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Filter, X, MapPin, FileText, User, CreditCard, ChevronDown,
  Clock, AlertTriangle, ShieldCheck, Upload, Phone, CheckCircle2,
  Calendar, Hash, Stethoscope, HeartPulse, UserPlus, FileCheck
} from 'lucide-react';
import useStore from '../store/useStore';
import NurseAssignPanel from '../components/NurseAssignPanel';
import { format } from 'date-fns';

const STATUS_BADGE = {
  pending:     'badge-amber',
  assigned:    'badge-teal',
  en_route:    'badge-amber',
  in_progress: 'badge-green',
  completed:   'badge-grey',
  cancelled:   'badge-grey',
  late:        'badge-red',
  no_show:     'badge-red',
};
const PAYMENT_BADGE = { advance: 'badge-green', pending: 'badge-red', partial: 'badge-amber', waived: 'badge-grey' };

// ── New Booking Modal ─────────────────────────────────────────────────────────
function NewBookingModal({ onClose, onSubmit }) {
  const patients      = useStore((s) => s.patients);
  const staff         = useStore((s) => s.staff);
  const fetchStaff    = useStore((s) => s.fetchStaff);
  const fetchPatients = useStore((s) => s.fetchPatients);

  useEffect(() => {
    fetchStaff();
    fetchPatients();
  }, [fetchStaff, fetchPatients]);

  const [mode, setMode] = useState('existing'); // 'existing' | 'new'

  // Full Intake State (Required & Optional fields)
  const [form, setForm] = useState({
    patient_id: '',
    patient_name: '',
    patient_age: '',
    patient_dob: '',
    phone: '',
    address: '',
    latitude: 33.5700,
    longitude: 73.1500,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    diagnosis: '',
    has_prescription: true,
    consult_doctor_needed: false,
    prescription_name: '',
    allergies: 'NKDA',
    service_type: 'short_service',
    scheduled_time: '',
    shift_duration: '4_hours',
    shift_frequency: 'once',
    payment_method: 'cash_on_delivery',
    amount: '2500',
    assigned_staff_id: '',
    backup_staff_id: '',
    email: '',
    consultant_name: '',
    consultant_details: '',
    gender_preference: 'any',
    notes: '',
  });

  const [prescriptionPreview, setPrescriptionPreview] = useState(null);
  const [validationError, setValidationError] = useState('');

  const set = (k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Two-way sync for Age and DOB
      if (k === 'patient_age' && v) {
        const year = new Date().getFullYear() - Number(v);
        next.patient_dob = `${year}-01-01`;
      } else if (k === 'patient_dob' && v) {
        const birthYear = new Date(v).getFullYear();
        if (!isNaN(birthYear)) {
          next.patient_age = Math.max(0, new Date().getFullYear() - birthYear);
        }
      }
      return next;
    });
  };

  // When an existing patient is selected, auto-populate all demographic & clinical fields
  const handleExistingPatientSelect = (pId) => {
    set('patient_id', pId);
    if (!pId) return;
    const p = patients.find(item => String(item.id) === String(pId));
    if (p) {
      setForm(f => ({
        ...f,
        patient_id: p.id,
        patient_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        patient_age: p.age || (p.date_of_birth ? Math.max(0, 2026 - new Date(p.date_of_birth).getFullYear()) : 65),
        patient_dob: p.date_of_birth || '1961-01-01',
        phone: p.phone || '+92-300-1234567',
        address: p.address || 'House #, Sector, Islamabad',
        latitude: p.latitude || 33.5700,
        longitude: p.longitude || 73.1500,
        emergency_contact_name: p.emergency_contact_name || (p.emergency_contact ? p.emergency_contact.split('(')[0].trim() : 'Family'),
        emergency_contact_phone: p.emergency_contact_phone || p.phone || '',
        diagnosis: p.primary_diagnosis || '',
        allergies: p.allergies || 'NKDA',
      }));
    }
  };

  const handleUseCurrentGps = () => {
    setForm(f => ({
      ...f,
      latitude: 33.5762,
      longitude: 73.1485,
      address: f.address ? f.address : 'PWD Housing Scheme, Sector O-9, Islamabad'
    }));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    setValidationError('');

    // Strict Validation for 13 Required Intake Fields
    if (!form.patient_name.trim()) {
      setValidationError('1. Patient Name is required.');
      return;
    }
    if (!form.patient_age || !form.patient_dob) {
      setValidationError('2. Patient Age and Date of Birth (DOB) are required.');
      return;
    }
    if (!form.phone.trim()) {
      setValidationError('3. Patient Contact Number is required.');
      return;
    }
    if (!form.address.trim()) {
      setValidationError('4. Home Address written is required.');
      return;
    }
    if (!form.latitude || !form.longitude) {
      setValidationError('5. Current Location coordinates (GPS Latitude/Longitude) are required.');
      return;
    }
    if (!form.emergency_contact_name.trim() || !form.emergency_contact_phone.trim()) {
      setValidationError('6. Emergency Contact Name and Phone Number are required.');
      return;
    }
    if (!form.diagnosis.trim()) {
      setValidationError('7. Diagnosis or Medical Condition is required.');
      return;
    }
    if (form.has_prescription && !form.prescription_name) {
      setValidationError('8. Please upload a Picture (Pic) or Document of the Prescription / Hospital Discharge Summary.');
      return;
    }
    if (!form.has_prescription && !form.consult_doctor_needed) {
      setValidationError('8. Consult a Doctor is required when no prescription is available.');
      return;
    }
    if (!form.allergies || !form.allergies.trim()) {
      setValidationError('9. Allergies field is required (specify NKDA if no known allergies).');
      return;
    }
    if (!form.service_type) {
      setValidationError('10. Required Service Type must be selected.');
      return;
    }
    if (!form.scheduled_time) {
      setValidationError('11. Required Start Date and Time is required.');
      return;
    }
    if (!form.shift_duration || !form.shift_frequency) {
      setValidationError('12. Shift Duration and Frequency are required.');
      return;
    }
    if (!form.payment_method) {
      setValidationError('13. Payment Method is required.');
      return;
    }

    onSubmit(form);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'var(--teal-800)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stethoscope size={20} style={{ color: 'var(--teal-600)' }} />
              Create Clinical Home Booking
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
              Standardized Clinical Intake & Scheduling Protocol
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Mode Selector Tab */}
        <div style={{ padding: '0 24px', marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', background: 'var(--sage-100)', padding: 3, borderRadius: 8, gap: 4, width: '100%' }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: '0.82rem',
                fontWeight: mode === 'existing' ? 700 : 500,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'existing' ? 'var(--teal-700)' : 'transparent',
                color: mode === 'existing' ? '#fff' : 'var(--teal-900)',
                transition: 'all 0.15s',
              }}
              onClick={() => setMode('existing')}
            >
              Select Existing Patient
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: '0.82rem',
                fontWeight: mode === 'new' ? 700 : 500,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'new' ? 'var(--teal-700)' : 'transparent',
                color: mode === 'new' ? '#fff' : 'var(--teal-900)',
                transition: 'all 0.15s',
              }}
              onClick={() => {
                setMode('new');
                set('patient_id', '');
              }}
            >
              + Register New Patient for Booking
            </button>
          </div>
        </div>

        {validationError && (
          <div style={{ margin: '0 24px 10px', background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', borderRadius: 6, padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{validationError}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="modal-body" style={{ overflowY: 'auto', padding: '0 24px 20px' }}>
          
          {/* ── SECTION 1: PATIENT DEMOGRAPHICS & LOCATION (REQUIRED) ─────────── */}
          <div style={{ marginBottom: 18, borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--teal-900)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={15} style={{ color: 'var(--teal-600)' }} />
              1. Patient Demographics & Location (Required)
            </div>

            {mode === 'existing' && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Select Existing Patient *</label>
                <select
                  className="form-select"
                  value={form.patient_id}
                  onFocus={() => fetchPatients()}
                  onChange={e => handleExistingPatientSelect(e.target.value)}
                >
                  <option value="">Choose patient profile…</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.mr_number || `MR-${p.id}`}) — {p.phone}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid-3" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Patient Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Tariq Mehmood"
                  value={form.patient_name}
                  onChange={e => set('patient_name', e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Age (Years) *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="65"
                  value={form.patient_age}
                  onChange={e => set('patient_age', e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date of Birth (DOB) *</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.patient_dob}
                  onChange={e => set('patient_dob', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Patient Contact Number *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+92-300-1234567"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Patient Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="patient@example.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
            </div>

            {/* Address & Location Coordinates */}
            <div className="form-group" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Home Address Written *</label>
                <button
                  type="button"
                  onClick={handleUseCurrentGps}
                  style={{ background: 'none', border: 'none', color: 'var(--teal-700)', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <MapPin size={12} /> Auto-Fill Coordinates (Islamabad GPS)
                </button>
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="House #, Street #, Block/Sector, Area (PWD / Soan Garden, Islamabad)"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                required
              />
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Location Latitude (GPS) *</label>
                <input
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={form.latitude}
                  onChange={e => set('latitude', parseFloat(e.target.value) || 33.57)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Location Longitude (GPS) *</label>
                <input
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={form.longitude}
                  onChange={e => set('longitude', parseFloat(e.target.value) || 73.15)}
                  required
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="grid-2" style={{ gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Emergency Contact Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Asim Tariq (Son)"
                  value={form.emergency_contact_name}
                  onChange={e => set('emergency_contact_name', e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Emergency Contact Phone *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+92-333-9876543"
                  value={form.emergency_contact_phone}
                  onChange={e => set('emergency_contact_phone', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* ── SECTION 2: CLINICAL INTAKE & PRESCRIPTIONS (REQUIRED) ─────────── */}
          <div style={{ marginBottom: 18, borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--teal-900)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <HeartPulse size={15} style={{ color: 'var(--status-red)' }} />
              2. Clinical Condition, Prescription & Allergies (Required)
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Diagnosis or Medical Condition *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Post-CVA Rehabilitation, Hypertension, Stage II Bed Sore"
                  value={form.diagnosis}
                  onChange={e => set('diagnosis', e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Allergies (Drug/Food) *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Penicillin, NSAIDs (Default NKDA if none)"
                  value={form.allergies}
                  onChange={e => set('allergies', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Prescription / Discharge Summary Protocol */}
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 8 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>
                Prescription of Medication or Hospital Discharge Summary Available? *
              </label>
              
              <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="prescription_check"
                    checked={form.has_prescription === true}
                    onChange={() => setForm(f => ({ ...f, has_prescription: true, consult_doctor_needed: false }))}
                    style={{ accentColor: 'var(--teal-700)' }}
                  />
                  <span>Yes, Prescription / Discharge Summary Available</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="prescription_check"
                    checked={form.has_prescription === false}
                    onChange={() => setForm(f => ({ ...f, has_prescription: false, consult_doctor_needed: true }))}
                    style={{ accentColor: 'var(--teal-700)' }}
                  />
                  <span>No Prescription Available</span>
                </label>
              </div>

              {form.has_prescription ? (
                /* Pic / File Upload if Yes */
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', padding: 10, borderRadius: 6, border: '1px dashed var(--teal-400)' }}>
                  {prescriptionPreview ? (
                    <img
                      src={prescriptionPreview}
                      alt="Prescription preview"
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--teal-300)' }}
                    />
                  ) : (
                    <Upload size={18} style={{ color: 'var(--teal-600)' }} />
                  )}
                  <div style={{ flex: 1, fontSize: '0.78rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--teal-800)' }}>Upload Prescription Picture (Pic) or Hospital Discharge Summary</div>
                    <div style={{ color: 'var(--status-grey)' }}>JPG, PNG or PDF up to 10MB</div>
                  </div>
                  <input
                    type="file"
                    id="modal-rx-file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        set('prescription_name', file.name);
                        if (file.type.startsWith('image/')) {
                          setPrescriptionPreview(URL.createObjectURL(file));
                        } else {
                          setPrescriptionPreview(null);
                        }
                      }
                    }}
                  />
                  <label htmlFor="modal-rx-file" className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    {form.prescription_name ? 'Change File' : 'Choose File / Picture'}
                  </label>
                  {form.prescription_name && (
                    <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                      ✓ {form.prescription_name}
                    </span>
                  )}
                </div>
              ) : (
                /* Consult a Doctor if No */
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={form.consult_doctor_needed}
                      onChange={e => set('consult_doctor_needed', e.target.checked)}
                      style={{ accentColor: '#d97706' }}
                    />
                    <span><strong>Consult a Doctor Required:</strong> Schedule initial clinical doctor review before medication administration.</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 3: SERVICE, SHIFT TIMING & FREQUENCY (REQUIRED) ────────── */}
          <div style={{ marginBottom: 18, borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--teal-900)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={15} style={{ color: 'var(--teal-600)' }} />
              3. Service & Shift Details (Required)
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Required Clinical Service *</label>
                <select className="form-select" value={form.service_type} onChange={e => set('service_type', e.target.value)}>
                  <option value="short_service">Short Service (Nursing Procedure / Vitals)</option>
                  <option value="long_term">Long-Term Home Nursing (Day/Night)</option>
                  <option value="long_term_admission">Hospital at Home ICU Admission</option>
                  <option value="physiotherapy">Physiotherapy & Rehabilitation</option>
                  <option value="elderly_care">Elderly Attendant & Palliative</option>
                  <option value="doctor_consultation">Doctor Home Visit Consultation</option>
                  <option value="medicine_delivery">Medicine Delivery & Phlebotomy</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Required Start Date & Time *</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={form.scheduled_time}
                  onChange={e => set('scheduled_time', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shift Duration *</label>
                <select className="form-select" value={form.shift_duration} onChange={e => set('shift_duration', e.target.value)}>
                  <option value="1_hour">1 Hour (Single Clinical Procedure)</option>
                  <option value="2_hours">2 Hours</option>
                  <option value="4_hours">4 Hours (Half Day Shift)</option>
                  <option value="8_hours">8 Hours (Full Day / Night Shift)</option>
                  <option value="12_hours">12 Hours (Extended Hospital Shift)</option>
                  <option value="24_hours">24 Hours (Full Bedside ICU Cover)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shift Frequency *</label>
                <select className="form-select" value={form.shift_frequency} onChange={e => set('shift_frequency', e.target.value)}>
                  <option value="once">Once (Single Visit)</option>
                  <option value="daily">Daily</option>
                  <option value="alternate_days">Alternate Days</option>
                  <option value="twice_weekly">Twice Weekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly Admission</option>
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Method *</label>
                <select className="form-select" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                  <option value="cash_on_delivery">Cash on Service Arrival</option>
                  <option value="advance">Advance Online / Card Payment</option>
                  <option value="bank_transfer">Direct Bank Transfer / IBFT</option>
                  <option value="insurance">Corporate / Insurance Coverage</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rate / Estimated Amount (PKR)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="2500"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── SECTION 4: OPTIONAL FIELDS & CLINICAL PREFERENCES ─────────────── */}
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--status-grey)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              4. Optional Preferences & Consultant Details
            </div>

            <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Staff Gender Preference (Optional)</label>
                <select className="form-select" value={form.gender_preference} onChange={e => set('gender_preference', e.target.value)}>
                  <option value="any">No Preference (First Available)</option>
                  <option value="female">Female Staff Only</option>
                  <option value="male">Male Staff Only</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Referring Consultant / Doctor Name (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Prof. Dr. Tariq Aziz (Cardiology)"
                  value={form.consultant_name}
                  onChange={e => set('consultant_name', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Consultant Hospital / Contact Details (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Shifa International Hospital, +92-51-8463000"
                value={form.consultant_details}
                onChange={e => set('consultant_details', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Additional Instructions / Family Notes (Optional)</label>
              <textarea
                className="form-textarea"
                placeholder="Specific entry instructions, gate pass code, pet at home, family preferences..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', padding: '14px 24px' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} style={{ padding: '8px 24px', fontWeight: 800 }}>
            Create & Register Booking →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Booking Detail Drawer ──────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose }) {
  const staff = useStore((s) => s.staff);
  const fetchStaff = useStore((s) => s.fetchStaff);
  const assignNurseToBooking = useStore((s) => s.assignNurseToBooking);

  useEffect(() => {
    if (booking) {
      fetchStaff();
    }
  }, [fetchStaff, booking]);

  if (!booking) return null;

  const bookingRef = booking.reference_code || `BK-2026-${String(booking.id).padStart(4, '0')}`;

  return (
    <div>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" style={{ width: 540 }}>
        <div className="drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0, color: 'var(--teal-800)' }}>
                {bookingRef}
              </h2>
              <span className={`badge ${STATUS_BADGE[booking.status] || 'badge-teal'}`}>
                {booking.status_display || booking.status}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginTop: 2 }}>
              {booking.service_type_display} · {booking.shift_duration_display || '4 Hours Shift'}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="drawer-body" style={{ padding: 18 }}>
          
          {/* Patient Overview */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <User size={15} style={{ color: 'var(--teal-600)' }} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--teal-900)' }}>Patient Dossier</span>
            </div>
            <div className="info-row"><span className="info-label">Name</span><span className="info-value" style={{ fontWeight: 700 }}>{booking.patient_name}</span></div>
            <div className="info-row"><span className="info-label">MR Number</span><span className="info-value ts">{booking.patient?.mr_number || booking.patient_mr || 'MR-2026-N/A'}</span></div>
            <div className="info-row"><span className="info-label">Age & DOB</span><span className="info-value">{booking.patient_age || booking.patient?.age || '—'} yrs {booking.patient_dob ? `(${booking.patient_dob})` : ''}</span></div>
            <div className="info-row"><span className="info-label">Contact</span><span className="info-value">{booking.patient?.phone || booking.phone || '—'}</span></div>
            <div className="info-row"><span className="info-label">Emergency Contact</span><span className="info-value">{booking.emergency_contact_name ? `${booking.emergency_contact_name} (${booking.emergency_contact_phone})` : (booking.patient?.emergency_contact || '—')}</span></div>
            <div className="info-row"><span className="info-label">Diagnosis</span><span className="info-value" style={{ color: 'var(--status-red)', fontWeight: 600 }}>{booking.diagnosis || booking.patient?.primary_diagnosis || '—'}</span></div>
            <div className="info-row"><span className="info-label">Allergies</span><span className="info-value">{booking.allergies || booking.patient?.allergies || 'NKDA'}</span></div>
          </div>

          {/* Location & Map Pin */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MapPin size={15} style={{ color: 'var(--amber-600)' }} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--teal-900)' }}>Home Location</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
              {booking.address}
            </div>
            {booking.latitude && booking.longitude && (
              <div style={{ height: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sage-200)' }}>
                <iframe
                  title="Patient location map"
                  width="100%" height="140" style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${booking.longitude-0.01},${booking.latitude-0.01},${booking.longitude+0.01},${booking.latitude+0.01}&layer=mapnik&marker=${booking.latitude},${booking.longitude}`}
                />
              </div>
            )}
          </div>

          {/* Shift Details & Schedule */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Calendar size={15} style={{ color: 'var(--teal-600)' }} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--teal-900)' }}>Service & Shift Timing</span>
            </div>
            <div className="info-row"><span className="info-label">Shift Duration</span><span className="info-value"><strong>{booking.shift_duration_display || booking.shift_duration || '4 Hours'}</strong></span></div>
            <div className="info-row"><span className="info-label">Frequency</span><span className="info-value"><strong>{booking.shift_frequency_display || booking.shift_frequency || 'Once'}</strong></span></div>
            <div className="info-row"><span className="info-label">Scheduled Time</span><span className="info-value ts">{booking.scheduled_time ? format(new Date(booking.scheduled_time), 'dd MMM yyyy HH:mm') : '—'}</span></div>
            {booking.actual_start_time && <div className="info-row"><span className="info-label">Visit Started</span><span className="info-value ts">{format(new Date(booking.actual_start_time), 'HH:mm')}</span></div>}
            {booking.actual_end_time && <div className="info-row"><span className="info-label">Visit Ended</span><span className="info-value ts">{format(new Date(booking.actual_end_time), 'HH:mm')}</span></div>}
            
            {/* Prescription Protocol Badge */}
            <div style={{ marginTop: 8 }}>
              {booking.has_prescription ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', background: '#ecfdf5', color: '#065f46', padding: '4px 10px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                  <FileCheck size={14} /> Doctor Prescription / Discharge Summary Attached
                </div>
              ) : booking.consult_doctor_needed ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', background: '#fffbeb', color: '#92400e', padding: '4px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                  <AlertTriangle size={14} /> Doctor Consultation Required
                </div>
              ) : null}
            </div>

            {booking.notes && (
              <p style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 6, borderLeft: '3px solid var(--teal-600)' }}>
                "{booking.notes}"
              </p>
            )}
          </div>

          {/* Payment Details */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <CreditCard size={15} style={{ color: 'var(--teal-600)' }} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--teal-900)' }}>Billing & Payment</span>
            </div>
            <div className="info-row"><span className="info-label">Payment Method</span><span className="info-value">{booking.payment_method ? booking.payment_method.replace('_', ' ').toUpperCase() : 'CASH ON DELIVERY'}</span></div>
            <div className="info-row"><span className="info-label">Total Amount</span><span className="info-value ts">PKR {Number(booking.amount || 2500).toLocaleString()}</span></div>
            <div className="info-row"><span className="info-label">Amount Paid</span><span className="info-value ts">PKR {Number(booking.amount_paid || 0).toLocaleString()}</span></div>
            <div className="info-row">
              <span className="info-label">Payment Status</span>
              <span className={`badge ${PAYMENT_BADGE[booking.payment_status] || 'badge-grey'}`}>
                {booking.payment_status_display || booking.payment_status}
              </span>
            </div>
          </div>

          {/* 10 Required Assignment Fields via NurseAssignPanel */}
          <div style={{ marginTop: 20 }}>
            <NurseAssignPanel
              booking={booking}
              staffList={staff}
              onConfirmAssignment={(data) => assignNurseToBooking(booking.id, data)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Bookings Page Component ──────────────────────────────────────────────
export default function Bookings() {
  const bookings      = useStore((s) => s.bookings);
  const fetchBookings = useStore((s) => s.fetchBookings);
  const fetchPatients = useStore((s) => s.fetchPatients);
  const fetchStaff    = useStore((s) => s.fetchStaff);
  const addBooking    = useStore((s) => s.addBooking);
  const createBooking = useStore((s) => s.createBooking);
  const createPatient = useStore((s) => s.createPatient);
  const [selected, setSelected]     = useState(null);
  const [showNew, setShowNew]       = useState(false);
  const [filters, setFilters]       = useState({ status: '', service_type: '', search: '' });

  useEffect(() => {
    fetchBookings();
    fetchPatients();
    fetchStaff();
  }, [fetchBookings, fetchPatients, fetchStaff]);

  const isBookingLate = (b) => {
    if (b.status === 'late') return true;
    if (['pending', 'assigned', 'en_route'].includes(b.status) && b.scheduled_time) {
      const sched = new Date(b.scheduled_time).getTime();
      return !isNaN(sched) && sched < Date.now();
    }
    return false;
  };

  const matchesServiceType = (b, selectedType) => {
    if (!selectedType) return true;
    const st = (b.service_type || '').toLowerCase();
    const std = (b.service_type_display || '').toLowerCase();

    if (selectedType === 'short_service') {
      return st === 'short_service' || st === 'short_services' || std.includes('short');
    }
    if (selectedType === 'medicine_delivery') {
      return st === 'medicine_delivery' || std.includes('medicine');
    }
    if (selectedType === 'long_term') {
      return (st === 'long_term' && st !== 'long_term_admission') || (std.includes('long-term care') || std === 'long-term');
    }
    if (selectedType === 'long_term_admission') {
      return st === 'long_term_admission' || std.includes('admission');
    }
    return st === selectedType;
  };

  const filtered = useMemo(() => bookings.filter((b) => {
    if (filters.status) {
      if (filters.status === 'late') {
        if (!isBookingLate(b)) return false;
      } else {
        if (b.status !== filters.status) return false;
      }
    }

    if (filters.service_type && !matchesServiceType(b, filters.service_type)) {
      return false;
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      const ref = (b.reference_code || '').toLowerCase();
      return (b.patient_name || '').toLowerCase().includes(q) ||
             (b.staff_name || '').toLowerCase().includes(q) ||
             (b.backup_staff_name || '').toLowerCase().includes(q) ||
             (b.patient_mr || '').toLowerCase().includes(q) ||
             (b.service_type_display || '').toLowerCase().includes(q) ||
             ref.includes(q);
    }
    return true;
  }), [bookings, filters]);

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Bookings & Scheduling</h1>
          <p className="page-subtitle">{filtered.length} of {bookings.length} patient bookings listed</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <Plus size={16} /> New Booking
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="search-input-wrap" style={{ flex: '0 1 240px' }}>
          <Filter size={13} />
          <input
            className="form-input search-input"
            placeholder="Search ref, patient, staff…"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Status Filter */}
        <select
          className="form-select"
          style={{ width: 170 }}
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="en_route">En Route</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="late">Late Arrival</option>
        </select>

        {/* Service Type Filter */}
        <select
          className="form-select"
          style={{ width: 210 }}
          value={filters.service_type}
          onChange={(e) => setFilters(f => ({ ...f, service_type: e.target.value }))}
        >
          <option value="">All Services</option>
          <option value="short_service">Short Service</option>
          <option value="long_term">Long-Term Care</option>
          <option value="long_term_admission">Hospital at Home ICU</option>
          <option value="physiotherapy">Physiotherapy</option>
          <option value="medicine_delivery">Medicine Delivery</option>
        </select>
      </div>

      {/* Bookings Data Table */}
      <div className="card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Ref #</th>
                <th>Patient & Demographics</th>
                <th>Service & Shift</th>
                <th>Status</th>
                <th>Assigned Clinical Team</th>
                <th>Scheduled Time</th>
                <th>Payment</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--teal-800)', marginBottom: 6 }}>
                      No Bookings Found
                    </div>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>
                      {filters.search || filters.status || filters.service_type
                        ? 'No bookings match the selected filters.'
                        : 'No patient bookings created yet. Click "New Booking" to schedule one.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} onClick={() => setSelected(b)} style={{ cursor: 'pointer' }}>
                    <td className="ts">
                      <span className="badge badge-teal" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                        {b.reference_code || `BK-${b.id}`}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{b.patient_name}</div>
                      <div className="ts" style={{ color: 'var(--status-grey)', fontSize: '0.74rem' }}>
                        {b.patient_mr || b.patient?.mr_number || `MR-${b.patient_id || b.id}`}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{b.service_type_display}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                        {b.shift_duration_display || '4 Hours'} · {b.shift_frequency_display || 'Once'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[b.status] || 'badge-grey'}`}>{b.status_display || b.status}</span>
                    </td>
                    <td>
                      {b.staff_name ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="avatar" style={{ width: 22, height: 22, fontSize: '0.65rem', background: 'var(--teal-700)', color: '#fff' }}>
                              {b.staff_name.split(' ').map(n=>n[0]).join('')}
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.staff_name}</span>
                          </div>
                          {b.backup_staff_name && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', marginLeft: 28 }}>
                              Backup: {b.backup_staff_name}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--status-red)', fontSize: '0.78rem', fontStyle: 'italic' }}>Pending Staff</span>
                      )}
                    </td>
                    <td className="ts">
                      {(() => {
                        try {
                          return b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM, HH:mm') : '—';
                        } catch(e) {
                          return '—';
                        }
                      })()}
                    </td>
                    <td>
                      <span className={`badge ${PAYMENT_BADGE[b.payment_status] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                        {b.payment_status_display || b.payment_status}
                      </span>
                    </td>
                    <td className="ts" style={{ fontWeight: 700 }}>
                      PKR {Number(b.amount || 2500).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {selected && <BookingDrawer booking={selected} onClose={() => setSelected(null)} />}

      {/* New Booking Modal with all Required & Optional Fields */}
      {showNew && (
        <NewBookingModal
          onClose={() => setShowNew(false)}
          onSubmit={async (form) => {
            const state = useStore.getState();
            let patientId = form.patient_id;
            let patientObj = state.patients.find(p => String(p.id) === String(patientId));

            // If creating a new patient directly inside booking intake
            if (!patientId || !patientObj) {
              const newPatientPayload = {
                first_name: form.patient_name.split(' ')[0],
                last_name: form.patient_name.split(' ').slice(1).join(' ') || '',
                mr_number: `MR-2026-${String(state.patients.length + 1).padStart(3, '0')}`,
                phone: form.phone,
                date_of_birth: form.patient_dob || '1965-01-01',
                gender: form.gender_preference === 'female' ? 'F' : 'M',
                address: form.address,
                latitude: form.latitude,
                longitude: form.longitude,
                primary_diagnosis: form.diagnosis,
                allergies: form.allergies || 'NKDA',
                emergency_contact_name: form.emergency_contact_name,
                emergency_contact_phone: form.emergency_contact_phone,
              };
              
              const pRes = await createPatient(newPatientPayload);
              if (pRes.success && pRes.data) {
                patientId = pRes.data.id;
                patientObj = pRes.data;
              } else {
                patientId = state.patients.length + 1;
                patientObj = { id: patientId, full_name: form.patient_name, ...newPatientPayload };
              }
            }

            const amt = Number(form.amount) || 2500;
            const paid = form.payment_method === 'advance' ? amt : 0;
            const bkRef = `BK-2026-${String(state.bookings.length + 1).padStart(4, '0')}`;

            const bookingPayload = {
              reference_code: bkRef,
              patient_id: Number(patientId),
              service_type: form.service_type || 'short_service',
              scheduled_time: form.scheduled_time ? new Date(form.scheduled_time).toISOString() : new Date().toISOString(),
              shift_duration: form.shift_duration || '4_hours',
              shift_frequency: form.shift_frequency || 'once',
              payment_method: form.payment_method || 'cash_on_delivery',
              status: form.assigned_staff_id ? 'assigned' : 'pending',
              payment_status: form.payment_method === 'advance' ? 'advance' : 'pending',
              address: form.address,
              latitude: form.latitude,
              longitude: form.longitude,
              patient_dob: form.patient_dob,
              patient_age: Number(form.patient_age) || 60,
              emergency_contact_name: form.emergency_contact_name,
              emergency_contact_phone: form.emergency_contact_phone,
              email: form.email,
              diagnosis: form.diagnosis,
              allergies: form.allergies || 'NKDA',
              has_prescription: !!form.has_prescription,
              consult_doctor_needed: !!form.consult_doctor_needed,
              gender_preference: form.gender_preference || 'any',
              consultant_name: form.consultant_name || '',
              consultant_details: form.consultant_details || '',
              notes: form.notes || '',
              amount: amt,
              amount_paid: paid,
              assigned_staff_id: form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
              backup_staff_id: form.backup_staff_id ? Number(form.backup_staff_id) : null,
              care_manager_name: 'Hina Malik (Care Coordinator)',
            };

            const res = await createBooking(bookingPayload);
            if (!res.success) {
              // Local store fallback
              addBooking({
                id: Date.now(),
                ...bookingPayload,
                patient: patientObj,
                patient_name: form.patient_name,
                patient_mr: patientObj?.mr_number || 'MR-NEW',
                service_type_display: form.service_type.replace('_', ' ').replace(/\b\w/g, c=>c.toUpperCase()),
                status_display: form.assigned_staff_id ? 'Assigned' : 'Pending',
                payment_status_display: form.payment_method === 'advance' ? 'Advance Paid' : 'Payment Pending',
                created_at: new Date().toISOString()
              });
            }
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}
