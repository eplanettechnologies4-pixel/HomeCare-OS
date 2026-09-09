import React, { useState } from 'react';
import {
  User, Activity, Pill, FileText, FlaskConical, DollarSign, Clock,
  Calendar, Phone, MapPin, Heart, Shield, Edit, MoreVertical, Download,
  CheckCircle, ChevronRight, File, Plus, AlertTriangle
} from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from '../components/UniversalPrintButton';
import { format } from 'date-fns';
import DailyReportForm from '../components/DailyReportForm';

import NursesNotesFormA from '../components/NursesNotesFormA';
import VitalsRecordFormB from '../components/VitalsRecordFormB';
import MarSheetFormC from '../components/MarSheetFormC';

export default function Patient360() {
  const patient = useStore((s) => s.selectedPatient) || useStore((s) => s.patients[0]);
  const setActivePage = useStore((s) => s.setActivePage);
  const bookings = useStore((s) => s.bookings).filter(b => b.patient_name === patient.full_name || b.patient?.id === patient.id);
  const invoices = useStore((s) => s.invoices).filter(i => i.patient_id === patient.id || i.patient_name === patient.full_name);
  const dailyReports = useStore((s) => s.dailyReports).filter(r => r.patient_id === patient.id || r.patient_name === patient.full_name);
  const storeVitals = useStore((s) => s.vitals).filter(v => v.patient_id === patient.id);
  const storeMarMeds = useStore((s) => s.marMedications).filter(m => m.patient_id === patient.id && !m.is_discontinued);

  const currentRole = useStore((s) => s.currentRole);
  const [activeTab, setActiveTab] = useState('overview');
  const [showNewReportModal, setShowNewReportModal] = useState(false);

  const allTabs = [
    { id: 'overview',     label: 'Overview' },
    { id: 'notes',        label: 'Nurses Notes (Form A)' },
    { id: 'vitals',       label: 'Vitals History (Form B)' },
    { id: 'mar',          label: 'MAR Sheet / PRN Meds (Form C)' },
    { id: 'history',      label: 'Medical History' },
    { id: 'careplan',     label: 'Care Plan' },
    { id: 'reports',      label: 'Visit Reports' },
    { id: 'invoices',     label: 'Invoices' },
    { id: 'payments',     label: 'Payments' },
    { id: 'documents',    label: 'Documents' },
  ];

  // Role Field-Level Security: Nurse never sees financial tabs (Invoices/Payments)
  const tabs = allTabs.filter(t => {
    if (currentRole === 'nurse' && ['invoices', 'payments'].includes(t.id)) return false;
    if (currentRole === 'crm_executive' && ['history', 'vitals', 'notes', 'mar'].includes(t.id)) return false;
    return true;
  });

  const assignedNurse = useStore((s) => s.staff).find(s => s.role === 'nurse') || {
    full_name: 'Sarah Mitchell',
    phone: '+92-300-1234567',
    role_display: 'Nurse',
    hire_date: '2022-03-15'
  };



  return (
    <div>
      {/* Back button */}
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 12 }}
        onClick={() => setActivePage('patients')}
      >
        ← Back to Patients Directory
      </button>

      {/* ── 360° Patient Header Bar ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div className="avatar avatar-lg" style={{ width: 72, height: 72, fontSize: '1.6rem', background: 'var(--teal-700)', color: 'white' }}>
            {patient.full_name.split(' ').map(n=>n[0]).join('')}
          </div>

          {/* Core Info */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', margin: 0, color: 'var(--teal-800)' }}>
                {patient.full_name}
              </h1>
              <span className="badge badge-teal" style={{ fontFamily: 'var(--font-mono)' }}>
                P-000{patient.id} / {patient.mr_number}
              </span>
              <span className={`badge ${patient.is_active ? 'badge-green' : 'badge-grey'}`}>
                {patient.is_active ? 'Active Patient' : 'Inactive'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.85rem', color: '#4b5563', flexWrap: 'wrap' }}>
              <span><strong>Age/Gender:</strong> {patient.age}y ({patient.gender_display})</span>
              <span><strong>Blood Group:</strong> {patient.blood_type || 'O+'}</span>
              <span><strong>Care Manager:</strong> {patient.care_manager_name || 'Hina Malik'}</span>
              <span><strong>Joined:</strong> Jan 2024</span>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.82rem', color: 'var(--status-grey)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> {patient.phone}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {patient.address}</span>
            </div>
          </div>

          {/* Quick Actions & Universal Print Button */}
          <div style={{ display: 'flex', gap: 8 }}>
            <UniversalPrintButton type="patient_summary" data={patient} label="Print Summary" variant="ghost" size="sm" />
            <button className="btn btn-ghost"><Edit size={14} /> Edit Profile</button>
            <button className="btn btn-primary" onClick={() => setShowNewReportModal(true)}>
              <Plus size={14} /> Add Visit Report
            </button>
          </div>
        </div>
      </div>

      {/* ── 9 Navigation Tabs ───────────────────────────────────────────── */}
      <div className="tabs-bar" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-item${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid-2" style={{ gap: 20 }}>
            {/* Current Package Card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-700)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Active Clinical EMR Scope</span>
                <span className="badge badge-teal">Long-Term Admission / Home Visit EMR</span>
              </div>
              <div className="info-row"><span className="info-label">Package Type</span><span className="info-value font-semibold">Skilled Nursing Long-Term Care</span></div>
              <div className="info-row"><span className="info-label">Duration</span><span className="info-value">3 Months (Monthly renewal)</span></div>
              <div className="info-row"><span className="info-label">Monthly Cost</span><span className="info-value ts" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>PKR 70,000</span></div>
              <div className="info-row"><span className="info-label">Status</span><span className="info-value">Paid for August 2026</span></div>
            </div>

            {/* Assigned Nurse Card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-700)', marginBottom: 12 }}>
                Assigned Primary Nurse
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="avatar avatar-lg" style={{ background: 'var(--teal-700)', color: 'white' }}>
                  {assignedNurse.full_name.split(' ').map(n=>n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--teal-800)' }}>{assignedNurse.full_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>{assignedNurse.role_display} · Wound Care Specialist</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--teal-700)', marginTop: 4 }}>
                    <Phone size={12} inline /> {assignedNurse.phone}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 2 }}>
                    Assigned since: Jan 2024
                  </div>
                </div>
              </div>
            </div>

            {/* MAR Medication Tasks Widget */}
            <div className="card" style={{ padding: 20, borderLeft: storeMarMeds.some(m => !m.days?.[7]?.given) ? '5px solid #f59e0b' : '5px solid var(--teal-700)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pill size={16} /> Today's Scheduled MAR Medications
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('mar')}>Open MAR Sheet →</button>
              </div>
              {storeMarMeds.some(m => !m.days?.[7]?.given) ? (
                <div style={{ background: '#fffbeb', padding: 12, borderRadius: 8, fontSize: '0.82rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                  <div>
                    <strong>Action Required:</strong> {storeMarMeds.filter(m => !m.days?.[7]?.given).length} active medication doses are pending administration today!
                  </div>
                </div>
              ) : (
                <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, fontSize: '0.82rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div>
                    All scheduled medication doses for today have been administered and signed by nursing staff.
                  </div>
                </div>
              )}
            </div>

            {/* Recent Vitals Summary Widget */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={16} /> Most Recent Vitals Report
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('vitals')}>Vitals History →</button>
              </div>
              {storeVitals[0] ? (
                <div style={{ background: 'var(--sage-50)', padding: 12, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--teal-800)' }}>Recorded by {storeVitals[0].recorded_by_name}</span>
                    <span className="ts">{format(new Date(storeVitals[0].recorded_at), 'dd MMM HH:mm')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: '0.82rem', color: '#1f2937', flexWrap: 'wrap' }}>
                    <span>BP: <strong>{storeVitals[0].blood_pressure_systolic}/{storeVitals[0].blood_pressure_diastolic} mmHg</strong></span>
                    <span>Pulse: <strong>{storeVitals[0].heart_rate} bpm</strong></span>
                    <span>SpO2: <strong>{storeVitals[0].spo2}%</strong></span>
                    <span>BSR: <strong>{storeVitals[0].bsr} mg/dL</strong></span>
                  </div>
                  {storeVitals[0].anomalies?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: '0.74rem', color: 'var(--status-red)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      ⚠️ AI Anomaly Flag: {storeVitals[0].anomalies.join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--status-grey)', fontSize: '0.82rem' }}>No vitals recorded yet.</p>
              )}
            </div>
          </div>
        )}

        {/* 2. FORM A: NURSES NOTES TAB */}
        {activeTab === 'notes' && (
          <NursesNotesFormA patient={patient} />
        )}

        {/* 3. FORM B: VITALS HISTORY TAB */}
        {activeTab === 'vitals' && (
          <VitalsRecordFormB patient={patient} />
        )}

        {/* 4. FORM C: MAR SHEET TAB */}
        {activeTab === 'mar' && (
          <MarSheetFormC patient={patient} />
        )}

        {/* 5. MEDICAL HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: '0 0 16px' }}>Medical History & Conditions</h3>
            <div className="info-row"><span className="info-label">Primary Diagnosis</span><span className="info-value font-semibold">{patient.primary_diagnosis}</span></div>
            <div className="info-row"><span className="info-label">Secondary Conditions</span><span className="info-value">Hypertension, Chronic Kidney Disease Stage II</span></div>
            <div className="info-row"><span className="info-label">Allergies</span><span className="info-value" style={{ color: 'var(--status-red)', fontWeight: 600 }}>{patient.allergies || 'Penicillin (Severe Rash)'}</span></div>
            <div className="info-row"><span className="info-label">Surgical History</span><span className="info-value">Right Eye Cataract Surgery (2021)</span></div>
          </div>
        )}

        {/* 6. CARE PLAN TAB */}
        {activeTab === 'careplan' && (
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: '0 0 12px' }}>Active Care Plan</h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#374151' }}>
              1. Daily sterile wound dressing for diabetic foot ulcer on right plantar aspect.<br/>
              2. Blood glucose monitoring before breakfast and dinner.<br/>
              3. Insulin Glargine 20 units SC administration at bedtime.<br/>
              4. Weekly gait stability & ROM exercise session with physiotherapist.
            </p>
          </div>
        )}

        {/* 7. REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Daily Visit Reports</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewReportModal(true)}>+ New Report</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Nurse</th><th>Status</th><th>Notes Summary</th><th>Action</th></tr></thead>
              <tbody>
                {dailyReports.map(r => (
                  <tr key={r.id}>
                    <td className="ts">{format(new Date(r.visit_date), 'dd MMM yyyy HH:mm')}</td>
                    <td style={{ fontWeight: 600 }}>{r.nurse_name}</td>
                    <td><span className={`badge ${r.status==='submitted'?'badge-green':'badge-amber'}`}>{r.status}</span></td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{r.notes}</td>
                    <td><button className="btn btn-ghost btn-sm">View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. INVOICES TAB */}
        {activeTab === 'invoices' && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Invoices for {patient.full_name}</h3></div>
            <table className="data-table">
              <thead><tr><th>Invoice #</th><th>Issued Date</th><th>Due Date</th><th>Total Amount</th><th>Paid</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="ts" style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td className="ts">{inv.issued_date}</td>
                    <td className="ts">{inv.due_date}</td>
                    <td className="ts">PKR {inv.total?.toLocaleString()}</td>
                    <td className="ts" style={{ color: 'var(--status-green)' }}>PKR {inv.amount_paid?.toLocaleString()}</td>
                    <td><span className={`badge ${inv.status==='paid'?'badge-green':'badge-amber'}`}>{inv.status_display || inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 7. PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Payment Receipts</h3></div>
            <table className="data-table">
              <thead><tr><th>Receipt #</th><th>Date</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead>
              <tbody>
                {invoices.flatMap(inv => inv.payments || []).map((p, idx) => (
                  <tr key={idx}>
                    <td className="ts">RCPT-00{p.id || idx+1}</td>
                    <td className="ts">{p.received_at}</td>
                    <td>{p.method}</td>
                    <td className="ts" style={{ fontWeight: 700, color: 'var(--status-green)' }}>PKR {p.amount?.toLocaleString()}</td>
                    <td className="ts">{p.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 8. DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: '0 0 16px' }}>Uploaded Visit Photos & Medical Documents</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {[
                { name: 'Wound Photo Aug 28', type: 'IMG', size: '1.2 MB' },
                { name: 'Discharge Summary', type: 'PDF', size: '450 KB' },
                { name: 'Lab Report - HbA1c', type: 'PDF', size: '320 KB' },
              ].map((doc, idx) => (
                <div key={idx} style={{ border: '1px solid var(--sage-200)', borderRadius: 8, padding: 12, textAlign: 'center', background: 'var(--sage-50)' }}>
                  <File size={28} style={{ color: 'var(--teal-600)', margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1a2e2b' }}>{doc.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', marginTop: 2 }}>{doc.size}</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }}><Download size={11} /> Download</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* End of EMR Tabs */}

      </div>

      {/* Daily Report Form Modal */}
      {showNewReportModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowNewReportModal(false)}>
          <div style={{ maxWidth: 700, width: '95vw', margin: '40px auto' }}>
            <DailyReportForm
              patient={patient}
              onSave={() => setShowNewReportModal(false)}
              onClose={() => setShowNewReportModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
