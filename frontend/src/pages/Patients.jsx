import React, { useState, useEffect } from 'react';
import { Search, X, AlertCircle, CheckCircle, TrendingUp, Pill, Activity, FileText, FlaskConical, DollarSign, Clock, Plus, Eye, Edit3, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import AddPatientModal from '../components/AddPatientModal';
import { format, formatDistanceToNow } from 'date-fns';

function EditPatientModal({ patient, onClose }) {
  const updatePatient = useStore((s) => s.updatePatient);
  const [form, setForm] = useState({
    full_name: patient.full_name,
    age: patient.age,
    phone: patient.phone,
    primary_diagnosis: patient.primary_diagnosis,
    address: patient.address,
    is_active: patient.is_active,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameParts = (form.full_name || '').trim().split(/\s+/);
    const first_name = nameParts[0] || 'Unknown';
    const last_name = nameParts.slice(1).join(' ') || '.';
    const birthYear = new Date().getFullYear() - (parseInt(form.age, 10) || 30);
    const payload = {
      first_name,
      last_name,
      date_of_birth: `${birthYear}-01-01`,
      phone: form.phone,
      primary_diagnosis: form.primary_diagnosis,
      address: form.address,
      is_active: form.is_active,
    };
    await updatePatient(patient.id, payload);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-heading)' }}>Edit Patient Information</h3>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>MR Number: {patient.mr_number}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 20 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input type="text" className="form-input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Age</label>
                <input type="number" className="form-input" value={form.age} onChange={e => setForm({...form, age: parseInt(e.target.value) || 0})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="text" className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Primary Diagnosis</label>
              <input type="text" className="form-input" value={form.primary_diagnosis} onChange={e => setForm({...form, primary_diagnosis: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-textarea" rows={2} value={form.address} onChange={e => setForm({...form, address: e.target.value})} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Status</label>
              <select className="form-select" value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm({...form, is_active: e.target.value === 'active'})}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: '#611F8C' }}>Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Patients() {
  const patients           = useStore((s) => s.patients);
  const fetchPatients      = useStore((s) => s.fetchPatients);
  const bookings           = useStore((s) => s.bookings);
  const fetchBookings      = useStore((s) => s.fetchBookings);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);
  const deletePatient      = useStore((s) => s.deletePatient);
  const setActivePage     = useStore((s) => s.setActivePage);
  const currentRole       = useStore((s) => s.currentRole);

  const [selected, setSelected]             = useState(null);
  const [editingPatient, setEditingPatient] = useState(null);
  const [search, setSearch]                 = useState('');
  const [showAddModal, setShowAddModal]     = useState(false);

  useEffect(() => {
    fetchPatients();
    fetchBookings();
  }, [fetchPatients, fetchBookings]);

  const canAddPatient    = ['super_admin', 'admin', 'branch_manager', 'care_manager'].includes(currentRole);
  const canEditPatient   = ['super_admin', 'admin', 'branch_manager', 'care_manager'].includes(currentRole);
  const canDeletePatient = ['super_admin', 'admin'].includes(currentRole);

  const handlePatientClick = (p) => {
    setSelectedPatient(p);
    setActivePage('patient-360');
  };

  const handleDeletePatient = (p, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete patient "${p.full_name}" (${p.mr_number})?`)) {
      deletePatient(p.id);
    }
  };

  const filtered = patients.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.full_name || '').toLowerCase().includes(q) ||
           (p.mr_number || '').toLowerCase().includes(q) ||
           (p.primary_diagnosis || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Patients (EMR)</h1>
          <p className="page-subtitle">{filtered.length} patients · {patients.filter(p=>p.is_active).length} active</p>
        </div>
        {canAddPatient && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ background: '#611F8C' }}>
            <Plus size={16} /> Add Patient (A)
          </button>
        )}
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap" style={{ flex: '0 1 260px' }}>
          <Search size={13} />
          <input className="form-input search-input" placeholder="Search name, MR#, diagnosis…" value={search} onChange={e=>setSearch(e.target.value)} style={{ fontSize: '0.85rem' }} />
        </div>
      </div>

      <div className="card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>MR #</th>
                <th>Patient</th>
                <th>Age / Gender</th>
                <th>Diagnosis</th>
                <th>Care Manager</th>
                <th>Bookings</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Actions (View / Edit / Delete)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--teal-800)', marginBottom: 6 }}>
                      No Patients Found
                    </div>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>
                      {search
                        ? 'No patients match your search criteria.'
                        : 'No patients have been registered in the system yet. Click "Add Patient" above to create an EMR profile.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => {
                  const pBookings = bookings.filter(b => b.patient_name === p.full_name);
                  return (
                    <tr key={p.id}>
                      <td className="ts">{p.mr_number}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar">{(p.full_name || 'Patient').split(' ').map(n=>n[0]).join('')}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>{p.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="ts">{p.age}y</span> · {p.gender_display || (p.gender === 'M' ? 'Male' : 'Female')}</td>
                      <td style={{ maxWidth: 220 }}><div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.primary_diagnosis || '—'}</div></td>
                      <td style={{ fontSize: '0.85rem' }}>{p.care_manager_name || 'Unassigned'}</td>
                      <td><span className="badge badge-teal" style={{fontSize:'0.7rem'}}>{pBookings.length}</span></td>
                      <td><span className={`badge ${p.is_active?'badge-green':'badge-grey'}`}>{p.is_active?'Active':'Inactive'}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          {/* View Button (V) */}
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View Patient 360 Profile (V)"
                            onClick={() => handlePatientClick(p)}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', gap: 4, color: '#611F8C', borderColor: '#e9d5ff' }}
                          >
                            <Eye size={13} /> View (V)
                          </button>
                          {/* Edit Button (E) */}
                          {canEditPatient && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Edit Patient Record (E)"
                              onClick={() => setEditingPatient(p)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', gap: 4, color: '#b87320', borderColor: '#fef3c7' }}
                            >
                              <Edit3 size={13} /> Edit (E)
                            </button>
                          )}
                          {/* Delete Button (D) */}
                          {canDeletePatient && (
                            <button
                              className="btn btn-danger btn-sm"
                              title="Delete Patient Record (D)"
                              onClick={(e) => handleDeletePatient(p, e)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', gap: 4 }}
                            >
                              <Trash2 size={13} /> Delete (D)
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <PatientDetail patient={selected} bookings={bookings} onClose={() => setSelected(null)} />}
      {showAddModal && <AddPatientModal onClose={() => setShowAddModal(false)} />}
      {editingPatient && <EditPatientModal patient={editingPatient} onClose={() => setEditingPatient(null)} />}
    </div>
  );
}

const STATUS_BADGE_MAP = {
  pending:     'badge-amber',
  assigned:    'badge-teal',
  en_route:    'badge-amber',
  in_progress: 'badge-green',
  completed:   'badge-grey',
  cancelled:   'badge-grey',
  late:        'badge-red',
  no_show:     'badge-red',
};

function PatientDetail({ patient, bookings, onClose }) {
  const [tab, setTab] = useState('overview');

  const tabs = [
    { id: 'overview',      label: 'Overview',       icon: Activity },
    { id: 'prescriptions', label: 'Prescriptions',  icon: Pill },
    { id: 'vitals',        label: 'Vitals & I/O',   icon: TrendingUp },
    { id: 'notes',         label: 'Nurse Notes',    icon: FileText },
    { id: 'labs',          label: 'Labs',           icon: FlaskConical },
    { id: 'timeline',      label: 'Timeline',       icon: Clock },
    { id: 'accounts',      label: 'Accounts',       icon: DollarSign },
  ];

  const storeVitals         = useStore((s) => s.vitals || []);
  const storeNurseNotes     = useStore((s) => s.nurseNotes || []);
  const storePrescriptions  = useStore((s) => s.prescriptions || []);
  const storeLabResults     = useStore((s) => s.labResults || []);

  const patientVitals       = storeVitals.filter(v => v.patient_id === patient.id);
  const patientNotes        = storeNurseNotes.filter(n => n.patient_id === patient.id);
  const patientPrescriptions = storePrescriptions.filter(p => p.patient === patient.id);
  const patientLabs         = storeLabResults.filter(l => l.patient === patient.id);
  const patientBookings     = bookings.filter(b => b.patient?.id === patient.id || b.patient_name === patient.full_name);

  return (
    <div>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" style={{ width: 600 }}>
        {/* Header */}
        <div className="drawer-header" style={{ background: 'var(--teal-700)', padding: '18px 24px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', margin: 0, color: 'white' }}>{patient.full_name}</h2>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: 3 }}>
              <span className="ts">{patient.mr_number}</span> · {patient.age}y {patient.gender_display} · {patient.primary_diagnosis}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
            <span className={`badge ${patient.is_active ? 'badge-green' : 'badge-grey'}`}>
              {patient.is_active ? 'Active' : 'Inactive'}
            </span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-bar" style={{ padding: '0 16px', background: 'white', borderBottom: '2px solid var(--sage-200)', marginBottom: 0, overflowX: 'auto' }}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`tab-item${tab===id?' active':''}`}
              onClick={() => setTab(id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {/* ── Overview ──────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div>
              <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 8 }}>Demographics</div>
                  <div className="info-row"><span className="info-label">Date of Birth</span><span className="info-value ts">{patient.date_of_birth}</span></div>
                  <div className="info-row"><span className="info-label">Blood Type</span><span className="info-value">{patient.blood_type || '—'}</span></div>
                  <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{patient.phone}</span></div>
                  <div className="info-row"><span className="info-label">Address</span><span className="info-value" style={{ fontSize: '0.8rem' }}>{patient.address}</span></div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 8 }}>Clinical</div>
                  <div className="info-row"><span className="info-label">Diagnosis</span><span className="info-value" style={{ fontSize: '0.82rem' }}>{patient.primary_diagnosis}</span></div>
                  <div className="info-row"><span className="info-label">Allergies</span><span className="info-value">{patient.allergies || 'NKDA'}</span></div>
                  <div className="info-row"><span className="info-label">Care Manager</span><span className="info-value">{patient.care_manager_name}</span></div>
                </div>
              </div>
              {/* Latest vitals summary */}
              {patientVitals[0] && (
                <div style={{ background: 'var(--sage-50)', borderRadius: 10, padding: 14, marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 10 }}>Latest Vitals</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[
                      { label: 'BP', value: `${patientVitals[0].blood_pressure_systolic}/${patientVitals[0].blood_pressure_diastolic}`, unit: 'mmHg' },
                      { label: 'HR', value: patientVitals[0].heart_rate, unit: 'bpm' },
                      { label: 'SpO₂', value: patientVitals[0].spo2, unit: '%' },
                      { label: 'BGL', value: patientVitals[0].blood_glucose, unit: 'mg/dL', alert: patientVitals[0].blood_glucose > 180 },
                    ].map(v => (
                      <div key={v.label} style={{ textAlign: 'center', background: 'white', padding: '10px 6px', borderRadius: 8 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{v.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: v.alert ? 'var(--status-red)' : 'var(--teal-700)' }}>{v.value}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--status-grey)' }}>{v.unit}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Prescriptions ─────────────────────────────────────────────── */}
          {tab === 'prescriptions' && (
            <div>
              {patientPrescriptions.map(p => (
                <div key={p.id} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--sage-200)', marginBottom: 10, background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)' }}>{p.medication}</div>
                      <div style={{ fontSize: '0.82rem', color: '#4b5563', marginTop: 2 }}>
                        <span className="badge badge-teal" style={{ fontSize: '0.68rem', marginRight: 6 }}>{p.dosage}</span>
                        {p.frequency} · {p.route}
                      </div>
                    </div>
                    <div className="ts" style={{ fontSize: '0.72rem' }}>{p.date.toString().substring(0,10)}</div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 6 }}>By: {p.prescribed_by} {p.notes && `· ${p.notes}`}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Vitals ────────────────────────────────────────────────────── */}
          {tab === 'vitals' && (
            <div>
              {patientVitals.map(v => (
                <div key={v.id} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--sage-200)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{v.recorded_by_name}</span>
                    <span className="ts">{format(new Date(v.recorded_at), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { label: 'BP', value: `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg`, alert: v.blood_pressure_systolic > 140 },
                      { label: 'HR', value: `${v.heart_rate} bpm` },
                      { label: 'Temp', value: `${v.temperature}°C` },
                      { label: 'SpO₂', value: `${v.spo2}%`, alert: v.spo2 < 94 },
                      { label: 'BGL', value: `${v.blood_glucose} mg/dL`, alert: v.blood_glucose > 180 },
                      { label: 'Weight', value: `${v.weight_kg} kg` },
                    ].map(item => (
                      <div key={item.label} style={{ background: 'var(--sage-50)', padding: '8px 10px', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--status-grey)' }}>{item.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', color: item.alert ? 'var(--status-red)' : 'var(--teal-700)' }}>
                          {item.value} {item.alert && '⚠'}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(v.intake_ml || v.output_ml) && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--teal-50)', borderRadius: 6, fontSize: '0.82rem' }}>
                      I/O Balance: <strong>Intake {v.intake_ml}mL</strong> · <strong>Output {v.output_ml}mL</strong> = <strong style={{ color: v.intake_ml > v.output_ml ? 'var(--status-green)' : 'var(--status-red)' }}>
                        {v.intake_ml - v.output_ml > 0 ? '+' : ''}{v.intake_ml - v.output_ml}mL
                      </strong>
                    </div>
                  )}
                  {v.notes && <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#4b5563' }}>{v.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── Nurse Notes ───────────────────────────────────────────────── */}
          {tab === 'notes' && (
            <div>
              {patientNotes.map(n => (
                <div key={n.id} style={{ padding: 14, borderRadius: 10, border: `1px solid ${n.is_flagged ? 'var(--status-red)' : 'var(--sage-200)'}`, marginBottom: 12, background: n.is_flagged ? '#fff5f5' : 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{n.recorded_by_name}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {n.is_flagged && <span className="badge badge-red" style={{ fontSize: '0.68rem' }}>⚑ Flagged</span>}
                      <span className="ts">{format(new Date(n.recorded_at), 'dd MMM HH:mm')}</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, color: '#374151' }}>{n.note}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Labs ─────────────────────────────────────────────────────── */}
          {tab === 'labs' && (
            <table className="data-table">
              <thead>
                <tr><th>Test</th><th>Result</th><th>Reference</th><th>Date</th><th>Flag</th></tr>
              </thead>
              <tbody>
                {patientLabs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.test_name}</td>
                    <td className="ts" style={{ fontWeight: 700, color: l.is_abnormal ? 'var(--status-red)' : 'var(--teal-700)' }}>{l.result_value} {l.unit}</td>
                    <td className="ts" style={{ color: 'var(--status-grey)' }}>{l.reference_range}</td>
                    <td className="ts">{l.collected_at.toString().substring(0,10)}</td>
                    <td>{l.is_abnormal ? <span className="badge badge-red" style={{fontSize:'0.68rem'}}>Abnormal</span> : <span className="badge badge-green" style={{fontSize:'0.68rem'}}>Normal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Timeline ─────────────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <div className="timeline">
              {patientBookings.map((b) => (
                <div key={b.id} className="timeline-item">
                  <div className="timeline-dot" style={{ background: b.status==='completed'?'var(--sage-100)':b.status==='in_progress'?'var(--status-green-bg)':'var(--amber-100)' }}>
                    <Clock size={13} />
                  </div>
                  <div className="timeline-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.service_type_display}</div>
                      <span className={`badge ${STATUS_BADGE_MAP[b.status] || 'badge-grey'}`} style={{ fontSize: '0.68rem' }}>{b.status_display}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
                      {b.staff_name || 'Unassigned'} · <span className="ts">{(() => { try { return b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM yyyy HH:mm') : '—'; } catch(e) { return '—'; } })()}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#374151', marginTop: 4 }}>PKR {b.amount?.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Accounts ─────────────────────────────────────────────────── */}
          {tab === 'accounts' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Billed', value: patientBookings.reduce((s,b)=>s+b.amount,0).toLocaleString(), color: 'var(--teal-700)' },
                  { label: 'Total Paid',   value: patientBookings.reduce((s,b)=>s+b.amount_paid,0).toLocaleString(), color: 'var(--status-green)' },
                  { label: 'Balance Due',  value: patientBookings.reduce((s,b)=>s+b.balance_due,0).toLocaleString(), color: patientBookings.reduce((s,b)=>s+b.balance_due,0)>0?'var(--status-red)':'var(--status-grey)' },
                ].map(c => (
                  <div key={c.label} style={{ background: 'var(--sage-50)', padding: '14px', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', textTransform: 'uppercase' }}>{c.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: c.color }}>PKR {c.value}</div>
                  </div>
                ))}
              </div>
              <table className="data-table">
                <thead><tr><th>Booking</th><th>Service</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {patientBookings.map(b => (
                    <tr key={b.id}>
                      <td className="ts">#{b.id}</td>
                      <td>{b.service_type_display}</td>
                      <td className="ts">PKR {b.amount?.toLocaleString()}</td>
                      <td className="ts">PKR {b.amount_paid?.toLocaleString()}</td>
                      <td><span className={`badge ${b.payment_status==='advance'?'badge-green':b.balance_due>0?'badge-red':'badge-grey'}`} style={{fontSize:'0.68rem'}}>{b.payment_status_display}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
