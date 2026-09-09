import React, { useState } from 'react';
import { Activity, Plus, ShieldCheck, Clock, TrendingUp, Table, AlertTriangle, CheckCircle2 } from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from './UniversalPrintButton';
import { format } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function VitalsRecordFormB({ patient, isReadOnly = false }) {
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = useStore((s) => s.currentRole);
  const vitals      = useStore((s) => s.vitals).filter(v => v.patient_id === patient.id);
  const addVitalReading = useStore((s) => s.addVitalReading);

  const [viewMode, setViewMode] = useState('table'); // 'table' | 'chart'
  const [selectedChartVital, setSelectedChartVital] = useState('all'); // 'all' | 'bp' | 'bsr' | 'pulse'
  const [showAddModal, setShowAddModal] = useState(false);

  // Auto-captured Signature
  const loggedInNurseName = currentUser?.full_name || (currentRole === 'doctor' ? 'Dr. Raza Khan' : 'Sarah Mitchell');
  const loggedInNurseRole = currentUser?.role_display || (currentRole === 'doctor' ? 'Consultant Physician' : 'Registered Nurse (RN)');
  const autoSignature = `${loggedInNurseName} (${loggedInNurseRole})`;

  const consultantName = patient.care_manager_name || 'Dr. Raza Khan (Consultant)';

  // Form State
  const [formData, setFormData] = useState({
    recorded_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    blood_pressure_systolic: '',
    blood_pressure_diastolic: '',
    temperature: '',
    heart_rate: '',
    respiratory_rate: '',
    spo2: '',
    weight_kg: '',
    intake_ng: '',
    intake_iv: '',
    output_urine: '',
    output_drain: '',
    bsr: '',
    insulin: '',
    notes: ''
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveVitals = (e) => {
    e.preventDefault();
    addVitalReading({
      patient_id: patient.id,
      consultant_name: consultantName,
      ward_room: 'Home Care Bed #1 / Ward 4B',
      ...formData
    });

    setFormData({
      recorded_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      blood_pressure_systolic: '',
      blood_pressure_diastolic: '',
      temperature: '',
      heart_rate: '',
      respiratory_rate: '',
      spo2: '',
      weight_kg: '',
      intake_ng: '',
      intake_iv: '',
      output_urine: '',
      output_drain: '',
      bsr: '',
      insulin: '',
      notes: ''
    });
    setShowAddModal(false);
  };

  // Recharts trend data (chronological order)
  const chartData = [...vitals].reverse().map(v => ({
    time: format(new Date(v.recorded_at), 'dd MMM HH:mm'),
    sys: v.blood_pressure_systolic,
    dia: v.blood_pressure_diastolic,
    pulse: v.heart_rate,
    temp: v.temperature,
    spo2: v.spo2,
    bsr: v.bsr
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── FORM B HEADER (South East Hospital Format) ────────────────────── */}
      <div className="card" style={{ padding: 20, background: 'var(--sage-50)', borderLeft: '4px solid var(--teal-700)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span className="badge badge-teal" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              FORM B — FREQUENT VITAL SIGNS RECORD
            </span>
            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '4px 0 0', color: 'var(--teal-800)', fontSize: '1.25rem' }}>
              South East Hospital Clinical Monitoring Sheet
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <UniversalPrintButton type="vitals_history" data={{ patient, vitals }} label="Print Vitals Sheet" variant="ghost" size="sm" />
          </div>
        </div>

        {/* Auto-filled Metadata Header Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, background: 'white', padding: 14, borderRadius: 8, border: '1px solid var(--sage-200)', fontSize: '0.83rem' }}>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>CONSULTANT</strong><span>{consultantName}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>LOCATION / WARD</strong><span>Home Care / Ward 4B</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>PATIENT NAME</strong><span style={{ fontWeight: 700 }}>{patient.full_name}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>AGE / SEX</strong><span>{patient.age}y / {patient.gender_display || patient.gender}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>PATIENT # / MR</strong><span className="ts" style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{patient.mr_number}</span></div>
        </div>
      </div>

      {/* ── CONTROLS & VIEW TOGGLE (Chart View vs Table View) ─────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="btn-group" style={{ background: 'white', padding: 4, borderRadius: 8, border: '1px solid var(--sage-200)' }}>
            <button
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('table')}
              style={{ gap: 6 }}
            >
              <Table size={14} /> Table View (Paper Layout)
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'chart' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('chart')}
              style={{ gap: 6 }}
            >
              <TrendingUp size={14} /> Chart View (Trends)
            </button>
          </div>

          {viewMode === 'chart' && (
            <select
              className="form-control"
              style={{ width: 'auto', fontSize: '0.8rem', padding: '4px 10px' }}
              value={selectedChartVital}
              onChange={(e) => setSelectedChartVital(e.target.value)}
            >
              <option value="all">All Vitals Overview</option>
              <option value="bp">Blood Pressure (sys/dia)</option>
              <option value="bsr">BSR / Blood Sugar</option>
              <option value="pulse">Pulse & SpO2</option>
            </select>
          )}
        </div>

        {!isReadOnly && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ gap: 6 }}>
            <Plus size={14} /> Add Vitals Reading
          </button>
        )}
      </div>

      {/* ── VIEW MODE A: PAPER-STYLE TABLE VIEW ─────────────────────────── */}
      {viewMode === 'table' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: 'var(--teal-800)', color: 'white' }}>
                <th style={{ color: 'white' }}>Date / Time</th>
                <th style={{ color: 'white' }}>BP (sys/dia)</th>
                <th style={{ color: 'white' }}>Temp (°C)</th>
                <th style={{ color: 'white' }}>Pulse (bpm)</th>
                <th style={{ color: 'white' }}>Resp (bpm)</th>
                <th style={{ color: 'white' }}>SpO2 (%)</th>
                <th style={{ color: 'white' }}>Intake (N/G | I/V)</th>
                <th style={{ color: 'white' }}>Output (Urine | Drain)</th>
                <th style={{ color: 'white' }}>BSR & Insulin</th>
                <th style={{ color: 'white' }}>Staff Signature</th>
              </tr>
            </thead>
            <tbody>
              {vitals.length > 0 ? (
                vitals.map((v) => {
                  const hasAnomaly = v.anomalies && v.anomalies.length > 0;
                  return (
                    <tr key={v.id} style={{ background: hasAnomaly ? '#fff5f5' : 'transparent' }}>
                      {/* Date & Time */}
                      <td className="ts font-semibold" style={{ color: 'var(--teal-800)' }}>
                        {format(new Date(v.recorded_at), 'dd MMM yyyy HH:mm')}
                        {hasAnomaly && (
                          <div style={{ color: 'var(--status-red)', fontSize: '0.68rem', fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <AlertTriangle size={11} /> {v.anomalies[0]}
                          </div>
                        )}
                      </td>

                      {/* BP */}
                      <td className="ts" style={{ fontWeight: 700, color: (v.blood_pressure_systolic > 140 || v.blood_pressure_systolic < 90) ? 'var(--status-red)' : 'inherit' }}>
                        {v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg` : '—'}
                      </td>

                      {/* Temp */}
                      <td className="ts" style={{ color: v.temperature > 37.8 ? 'var(--status-red)' : 'inherit' }}>
                        {v.temperature ? `${v.temperature}°C` : '—'}
                      </td>

                      {/* Pulse */}
                      <td className="ts">
                        {v.heart_rate ? `${v.heart_rate} bpm` : '—'}
                      </td>

                      {/* Resp */}
                      <td className="ts">
                        {v.respiratory_rate ? `${v.respiratory_rate}` : '—'}
                      </td>

                      {/* SpO2 */}
                      <td className="ts" style={{ fontWeight: 700, color: v.spo2 < 95 ? 'var(--status-red)' : 'var(--teal-700)' }}>
                        {v.spo2 ? `${v.spo2}%` : '—'}
                      </td>

                      {/* Intake Subfields */}
                      <td className="ts" style={{ fontSize: '0.78rem' }}>
                        N/G: <strong>{v.intake_ng || 0}ml</strong> | I/V: <strong>{v.intake_iv || 0}ml</strong>
                      </td>

                      {/* Output Subfields */}
                      <td className="ts" style={{ fontSize: '0.78rem' }}>
                        Urine: <strong>{v.output_urine || 0}ml</strong> | Drain: <strong>{v.output_drain || 0}ml</strong>
                      </td>

                      {/* BSR & Insulin */}
                      <td className="ts">
                        {v.bsr ? (
                          <div>
                            <span style={{ fontWeight: 700, color: v.bsr > 180 ? 'var(--status-red)' : 'var(--teal-700)' }}>
                              {v.bsr} mg/dL
                            </span>
                            {v.insulin && <div style={{ fontSize: '0.7rem', color: '#4b5563' }}>{v.insulin}</div>}
                          </div>
                        ) : '—'}
                      </td>

                      {/* Staff Name */}
                      <td style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal-800)' }}>
                          <ShieldCheck size={13} style={{ color: 'var(--teal-700)' }} />
                          {v.recorded_by_name || 'Sarah Mitchell (RN)'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--status-grey)' }}>
                    No vitals readings recorded for this patient yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VIEW MODE B: TREND LINE CHART VIEW ──────────────────────────── */}
      {viewMode === 'chart' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', marginBottom: 16 }}>
            Patient Physiological Trends over Time
          </div>

          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sage-200)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />

                {(selectedChartVital === 'all' || selectedChartVital === 'bp') && (
                  <Line type="monotone" dataKey="sys" stroke="#c0392b" strokeWidth={2.5} name="Systolic BP (mmHg)" dot={{ r: 4 }} />
                )}
                {(selectedChartVital === 'all' || selectedChartVital === 'bp') && (
                  <Line type="monotone" dataKey="dia" stroke="#e67e22" strokeWidth={2} name="Diastolic BP (mmHg)" dot={{ r: 3 }} />
                )}
                {(selectedChartVital === 'all' || selectedChartVital === 'bsr') && (
                  <Line type="monotone" dataKey="bsr" stroke="#8e44ad" strokeWidth={2.5} name="BSR Glucose (mg/dL)" dot={{ r: 4 }} />
                )}
                {(selectedChartVital === 'all' || selectedChartVital === 'pulse') && (
                  <Line type="monotone" dataKey="pulse" stroke="#27ae60" strokeWidth={2} name="Pulse (bpm)" dot={{ r: 3 }} />
                )}
                {(selectedChartVital === 'all' || selectedChartVital === 'pulse') && (
                  <Line type="monotone" dataKey="spo2" stroke="#2980b9" strokeWidth={2} name="SpO2 (%)" dot={{ r: 3 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── ADD VITALS READING COMPACT MODAL ────────────────────────────── */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ width: 660, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">Form B — Add Frequent Vitals Reading</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveVitals}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Header Auto-filled Banner */}
                <div style={{ background: 'var(--sage-50)', padding: 10, borderRadius: 6, fontSize: '0.8rem', color: 'var(--teal-800)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Patient: <strong>{patient.full_name} ({patient.mr_number})</strong></span>
                  <span>Consultant: <strong>{consultantName}</strong></span>
                </div>

                <div className="form-group">
                  <label className="form-label">Reading Date & Time (Timestamp)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={formData.recorded_at}
                    onChange={(e) => handleInputChange('recorded_at', e.target.value)}
                    required
                  />
                </div>

                {/* GROUP 1: CORE VITALS */}
                <div style={{ border: '1px solid var(--sage-200)', borderRadius: 8, padding: 14, background: '#fafafa' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={15} /> 1. Core Vital Signs (BP, Temp, Pulse, Resp, SpO2)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>BP Systolic (mmHg)</label>
                      <input type="number" placeholder="120" className="form-control" value={formData.blood_pressure_systolic} onChange={(e) => handleInputChange('blood_pressure_systolic', e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>BP Diastolic (mmHg)</label>
                      <input type="number" placeholder="80" className="form-control" value={formData.blood_pressure_diastolic} onChange={(e) => handleInputChange('blood_pressure_diastolic', e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Temperature (°C)</label>
                      <input type="number" step="0.1" placeholder="37.0" className="form-control" value={formData.temperature} onChange={(e) => handleInputChange('temperature', e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Pulse Rate (bpm)</label>
                      <input type="number" placeholder="75" className="form-control" value={formData.heart_rate} onChange={(e) => handleInputChange('heart_rate', e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Respiration Rate (bpm)</label>
                      <input type="number" placeholder="16" className="form-control" value={formData.respiratory_rate} onChange={(e) => handleInputChange('respiratory_rate', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>SpO2 Oxygen Sat (%)</label>
                      <input type="number" placeholder="98" className="form-control" value={formData.spo2} onChange={(e) => handleInputChange('spo2', e.target.value)} required />
                    </div>
                  </div>
                </div>

                {/* GROUP 2: INTAKE & OUTPUT */}
                <div style={{ border: '1px solid var(--sage-200)', borderRadius: 8, padding: 14, background: '#fafafa' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)', marginBottom: 10 }}>
                    2. Fluid Intake & Output Sub-fields (ml)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Intake: N/G (ml)</label>
                      <input type="number" placeholder="0" className="form-control" value={formData.intake_ng} onChange={(e) => handleInputChange('intake_ng', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Intake: I/V (ml)</label>
                      <input type="number" placeholder="0" className="form-control" value={formData.intake_iv} onChange={(e) => handleInputChange('intake_iv', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Output: Urine (ml)</label>
                      <input type="number" placeholder="0" className="form-control" value={formData.output_urine} onChange={(e) => handleInputChange('output_urine', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Output: Drain (ml)</label>
                      <input type="number" placeholder="0" className="form-control" value={formData.output_drain} onChange={(e) => handleInputChange('output_drain', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* GROUP 3: BSR & INSULIN */}
                <div style={{ border: '1px solid var(--sage-200)', borderRadius: 8, padding: 14, background: '#fafafa' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)', marginBottom: 10 }}>
                    3. Blood Sugar Rate (BSR) & Insulin Given
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>BSR Glucose (mg/dL)</label>
                      <input type="number" placeholder="140" className="form-control" value={formData.bsr} onChange={(e) => handleInputChange('bsr', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Insulin Administered (Units / Details)</label>
                      <input type="text" placeholder="e.g. 6 Units Regular SC" className="form-control" value={formData.insulin} onChange={(e) => handleInputChange('insulin', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* AUTO-CAPTURED STAFF SIGNATURE BOX */}
                <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px solid var(--sage-200)' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700 }}>
                    RECORDING STAFF MEMBER (AUTO-CAPTURED)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--teal-800)', marginTop: 2 }}>
                    <ShieldCheck size={16} style={{ color: 'var(--teal-700)' }} />
                    {autoSignature}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Vitals & Run AI Check →</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
