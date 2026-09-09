import React, { useState } from 'react';
import { Activity, CheckSquare, FileText, Camera, Check, Upload, Clock } from 'lucide-react';
import useStore from '../store/useStore';

export default function DailyReportForm({ booking, patient, initialReport, onSave, onClose }) {
  const addDailyReport = useStore((s) => s.addDailyReport);

  const [status, setStatus] = useState(initialReport?.status || 'draft');
  
  // Vitals
  const [vitals, setVitals] = useState(initialReport?.vitals || {
    bp_sys: 120,
    bp_dia: 80,
    pulse: 72,
    temp: 36.8,
    spo2: 98,
    blood_sugar: 110,
    weight: 75,
    pain_level: 1,
  });

  // Checklist
  const [checklist, setChecklist] = useState(initialReport?.care_checklist || {
    medication_given: true,
    bp_check: true,
    injection: false,
    dressing: false,
    physiotherapy: false,
    spo2_check: true,
    others: false,
  });

  // Notes
  const [notes, setNotes] = useState(initialReport?.notes || '');

  // Photos
  const [photos, setPhotos] = useState(initialReport?.photos || []);

  const updateVital = (key, val) => setVitals(prev => ({ ...prev, [key]: val }));
  const toggleCheck = (key) => setChecklist(prev => ({ ...prev, [key]: !prev[key] }));

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = (newStatus) => {
    const reportObj = {
      id: initialReport?.id || `rep-${Date.now()}`,
      booking_id: booking?.id || 1001,
      patient_id: patient?.id || booking?.patient?.id || 1,
      patient_name: patient?.full_name || booking?.patient_name || 'Patient',
      patient_mr: patient?.mr_number || booking?.patient_mr || 'MR-2024-001',
      nurse_name: booking?.staff_name || 'Sarah Mitchell',
      visit_date: new Date().toISOString(),
      status: newStatus,
      vitals,
      care_checklist: checklist,
      notes,
      photos,
    };

    addDailyReport(reportObj);
    if (onSave) onSave(reportObj);
    if (onClose) onClose();
  };

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: 22, boxShadow: 'var(--shadow-modal)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--sage-200)', paddingBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'var(--teal-800)' }}>
            Daily Visit Report
          </h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginTop: 2 }}>
            Patient: <strong>{patient?.full_name || booking?.patient_name}</strong> · Booking #{booking?.id || 1001}
          </div>
        </div>
        <span className={`badge ${status === 'submitted' ? 'badge-green' : 'badge-amber'}`}>
          {status === 'submitted' ? 'Submitted' : 'Draft'}
        </span>
      </div>

      {/* ── Section 1: Vitals ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--teal-700)', fontWeight: 700, fontSize: '0.95rem' }}>
          <Activity size={16} /> Section 1: Vital Signs
        </div>
        <div className="grid-3" style={{ gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">BP Systolic (mmHg)</label>
            <input type="number" className="form-input" value={vitals.bp_sys} onChange={e => updateVital('bp_sys', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">BP Diastolic (mmHg)</label>
            <input type="number" className="form-input" value={vitals.bp_dia} onChange={e => updateVital('bp_dia', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Pulse (bpm)</label>
            <input type="number" className="form-input" value={vitals.pulse} onChange={e => updateVital('pulse', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Temp (°C)</label>
            <input type="number" step="0.1" className="form-input" value={vitals.temp} onChange={e => updateVital('temp', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">SpO2 (%)</label>
            <input type="number" className="form-input" value={vitals.spo2} onChange={e => updateVital('spo2', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Blood Sugar (mg/dL)</label>
            <input type="number" className="form-input" value={vitals.blood_sugar} onChange={e => updateVital('blood_sugar', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Weight (kg)</label>
            <input type="number" step="0.1" className="form-input" value={vitals.weight} onChange={e => updateVital('weight', Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
            <label className="form-label">Pain Level (0 - 10): <strong>{vitals.pain_level}</strong></label>
            <input type="range" min="0" max="10" value={vitals.pain_level} onChange={e => updateVital('pain_level', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--amber-500)' }} />
          </div>
        </div>
      </div>

      {/* ── Section 2: Care & Services Checklist ────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--teal-700)', fontWeight: 700, fontSize: '0.95rem' }}>
          <CheckSquare size={16} /> Section 2: Care & Services Rendered
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          {[
            { key: 'medication_given', label: 'Medication Given' },
            { key: 'bp_check',         label: 'BP Check' },
            { key: 'injection',        label: 'Injection Administered' },
            { key: 'dressing',         label: 'Wound Dressing' },
            { key: 'physiotherapy',    label: 'Physiotherapy Session' },
            { key: 'spo2_check',       label: 'SpO2 Monitoring' },
            { key: 'others',           label: 'Others' },
          ].map(item => (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={checklist[item.key]} onChange={() => toggleCheck(item.key)} style={{ accentColor: 'var(--teal-700)' }} />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      {/* ── Section 3: Clinical Notes ──────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--teal-700)', fontWeight: 700, fontSize: '0.95rem' }}>
          <FileText size={16} /> Section 3: Clinical Notes
        </div>
        <textarea
          className="form-textarea"
          placeholder="Enter observation notes (e.g. patient condition is stable, wound healing normally, family informed...)"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* ── Section 4: Photos / Documents Upload ────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--teal-700)', fontWeight: 700, fontSize: '0.95rem' }}>
          <Camera size={16} /> Section 4: Photos & Visit Documentation
        </div>
        
        {/* Upload Button */}
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', gap: 6, marginBottom: 12 }}>
          <Upload size={14} /> Upload Visit Photo / Doc
          <input type="file" accept="image/*,.pdf" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>

        {/* Thumbnail Grid */}
        {photos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((url, idx) => (
              <div key={idx} style={{ width: 70, height: 70, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sage-200)', position: 'relative' }}>
                <img src={url} alt={`Visit attachment ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--sage-200)', paddingTop: 16 }}>
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button className="btn btn-ghost" onClick={() => handleSave('draft')}>
          Save as Draft
        </button>
        <button className="btn btn-primary" onClick={() => handleSave('submitted')}>
          Submit Daily Report
        </button>
      </div>
    </div>
  );
}
