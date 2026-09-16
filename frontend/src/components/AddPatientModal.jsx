import React, { useState, useEffect } from 'react';
import {
  User, Phone, MapPin, Heart, AlertTriangle, Upload, X, CheckCircle,
  Shield, FileText, Clock, Stethoscope, HeartPulse, CreditCard, FileCheck
} from 'lucide-react';
import useStore from '../store/useStore';

export default function AddPatientModal({ onClose }) {
  const patients           = useStore((s) => s.patients);
  const staff              = useStore((s) => s.staff);
  const fetchStaff         = useStore((s) => s.fetchStaff);
  const fetchPatients      = useStore((s) => s.fetchPatients);
  const createPatient      = useStore((s) => s.createPatient);
  const createBooking      = useStore((s) => s.createBooking);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);
  const setActivePage      = useStore((s) => s.setActivePage);

  useEffect(() => {
    fetchStaff();
    fetchPatients();
  }, [fetchStaff, fetchPatients]);

  const careManagers = staff.filter(s => s.role === 'care_manager' || s.role === 'doctor');

  // Full Standardized Intake State (13 Required + 4 Optional)
  const [form, setForm] = useState({
    // Demographics & Location
    patient_name: '',
    patient_age: '',
    patient_dob: '',
    gender: 'M',
    phone: '',
    email: '',
    address: '',
    latitude: 33.5700,
    longitude: 73.1500,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_type: 'O+',

    // Clinical Intake
    diagnosis: '',
    allergies: 'NKDA',
    has_prescription: true,
    consult_doctor_needed: false,
    prescription_name: '',

    // Required Service, Shift & Payment
    service_type: 'short_service',
    scheduled_time: '',
    shift_duration: '4_hours',
    shift_frequency: 'once',
    payment_method: 'cash_on_delivery',
    amount: '2500',
    care_manager_id: careManagers[0]?.id || '',

    // Optional Preferences
    gender_preference: 'any',
    consultant_name: '',
    consultant_details: '',
    notes: '',
  });

  const [prescriptionPreview, setPrescriptionPreview] = useState(null);
  const [validationError, setValidationError]         = useState('');
  const [duplicateWarning, setDuplicateWarning]       = useState('');
  const [isSubmitting, setIsSubmitting]               = useState(false);

  const set = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };

      // Two-way sync for Age and Date of Birth
      if (key === 'patient_age' && val) {
        const year = new Date().getFullYear() - Number(val);
        next.patient_dob = `${year}-01-01`;
      } else if (key === 'patient_dob' && val) {
        const birthYear = new Date(val).getFullYear();
        if (!isNaN(birthYear)) {
          next.patient_age = Math.max(0, new Date().getFullYear() - birthYear);
        }
      }
      return next;
    });

    // Live Duplicate Check on Name / Phone
    if (key === 'patient_name' || key === 'phone') {
      const nameMatch = key === 'patient_name' ? val.toLowerCase() : form.patient_name.toLowerCase();
      const phoneMatch = key === 'phone' ? val : form.phone;
      if (nameMatch.length > 3) {
        const existing = patients.find(p =>
          p.full_name?.toLowerCase() === nameMatch ||
          (phoneMatch.length > 8 && p.phone === phoneMatch)
        );
        if (existing) {
          setDuplicateWarning(`Warning: Patient "${existing.full_name}" (${existing.mr_number}) already exists with phone ${existing.phone}.`);
        } else {
          setDuplicateWarning('');
        }
      } else {
        setDuplicateWarning('');
      }
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

  const handleSubmit = async (e) => {
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

    setIsSubmitting(true);

    try {
      const nameParts = form.patient_name.trim().split(/\s+/);
      const first_name = nameParts[0] || 'Unknown';
      const last_name = nameParts.slice(1).join(' ') || '.';

      // 1. Create Patient Record in EMR
      const patientPayload = {
        first_name,
        last_name,
        date_of_birth: form.patient_dob,
        gender: form.gender || 'M',
        phone: form.phone.trim(),
        email: form.email.trim() || '',
        address: form.address.trim(),
        latitude: parseFloat(form.latitude) || 33.57,
        longitude: parseFloat(form.longitude) || 73.15,
        primary_diagnosis: form.diagnosis.trim(),
        allergies: form.allergies.trim() || 'NKDA',
        blood_type: form.blood_type || '',
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        emergency_contact_relation: 'Emergency Contact',
        assigned_care_manager: form.care_manager_id ? Number(form.care_manager_id) : null,
        is_active: true,
      };

      const pRes = await createPatient(patientPayload);
      let patientId = null;
      let createdPatient = null;

      if (pRes.success && pRes.data) {
        patientId = pRes.data.id;
        createdPatient = pRes.data;
      } else {
        patientId = Date.now();
        createdPatient = { id: patientId, full_name: form.patient_name, ...patientPayload };
      }

      // 2. Automatically Create the Initial Clinical Booking
      const amt = Number(form.amount) || 2500;
      const paid = form.payment_method === 'advance' ? amt : 0;

      const bookingPayload = {
        patient_id: Number(patientId),
        service_type: form.service_type || 'short_service',
        scheduled_time: form.scheduled_time ? new Date(form.scheduled_time).toISOString() : new Date().toISOString(),
        shift_duration: form.shift_duration || '4_hours',
        shift_frequency: form.shift_frequency || 'once',
        payment_method: form.payment_method || 'cash_on_delivery',
        status: 'pending',
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
        care_manager_name: 'Hina Malik (Care Coordinator)',
      };

      await createBooking(bookingPayload);

      setIsSubmitting(false);
      if (onClose) onClose();
      setSelectedPatient(createdPatient);
      setActivePage('patient-360');
    } catch (err) {
      setIsSubmitting(false);
      setValidationError(err.message || 'Error onboarding patient. Please check your network.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
      <div className="modal" style={{ width: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'var(--teal-800)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stethoscope size={20} style={{ color: 'var(--teal-600)' }} />
              Register & Onboard New Patient
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
              Standardized Clinical Intake & EMR Registration Protocol
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={isSubmitting}><X size={16} /></button>
        </div>

        {/* Validation Alert */}
        {validationError && (
          <div style={{ margin: '0 24px 10px', background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', borderRadius: 6, padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{validationError}</span>
          </div>
        )}

        {/* Duplicate Warning Alert */}
        {duplicateWarning && (
          <div style={{ margin: '0 24px 10px', background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', borderRadius: 6, padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{duplicateWarning}</span>
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

            <div className="grid-3" style={{ gap: 10, marginBottom: 10 }}>
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

              <div className="grid-2" style={{ gap: 8, marginBottom: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Blood</label>
                  <select className="form-select" value={form.blood_type} onChange={e => set('blood_type', e.target.value)}>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
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
                    name="modal_patient_prescription_check"
                    checked={form.has_prescription === true}
                    onChange={() => setForm(f => ({ ...f, has_prescription: true, consult_doctor_needed: false }))}
                    style={{ accentColor: 'var(--teal-700)' }}
                  />
                  <span>Yes, Prescription / Discharge Summary Available</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="modal_patient_prescription_check"
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
                    id="add-patient-modal-rx-file"
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
                  <label htmlFor="add-patient-modal-rx-file" className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
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

            <div className="grid-3" style={{ gap: 10 }}>
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
                <label className="form-label">Rate / Amount (PKR)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="2500"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Assigned Care Manager</label>
                <select className="form-select" value={form.care_manager_id} onChange={e => set('care_manager_id', e.target.value)}>
                  {careManagers.map(cm => <option key={cm.id} value={cm.id}>{cm.full_name} ({cm.role_display})</option>)}
                </select>
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
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting} style={{ padding: '8px 24px', fontWeight: 800 }}>
            {isSubmitting ? 'Registering Patient…' : 'Register & Onboard Patient →'}
          </button>
        </div>
      </div>
    </div>
  );
}
