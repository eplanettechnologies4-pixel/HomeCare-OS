import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Activity, Pill, FileText, Stethoscope, UserCheck,
  AlertTriangle, PlusCircle, CheckCircle2, Phone, Calendar,
  MessageSquare, Send, X, ClipboardCheck, Heart, AlertCircle
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import { Modal, Select, Textarea, SegmentedControl, Button, Badge } from '../components/ui';

export default function NursePatientDetail() {
  const setActivePage = useStore((s) => s.setActivePage);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active chart detail view: null (grid) or tile name
  const [activeChart, setActiveChart] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);

  // Action Modals: 'supervisor', 'order', 'appointment', 'procedure'
  const [activeModal, setActiveModal] = useState(null);
  const [reqUrgency, setReqUrgency] = useState('routine');
  const [reqNotes, setReqNotes] = useState('');
  const [reqDetails, setReqDetails] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);
  const [modalFeedback, setModalFeedback] = useState(null);

  // Family Concern response modal
  const [selectedConcern, setSelectedConcern] = useState(null);
  const [concernAction, setConcernAction] = useState('acknowledge');
  const [concernNote, setConcernNote] = useState('');
  const [submittingConcern, setSubmittingConcern] = useState(false);

  // Load patient detail
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const storePatient = useStore.getState().selectedPatient;
        let ptId = storePatient?.id;

        if (!ptId) {
          // First get home/ to find current assigned patient ID
          const homeRes = await apiFetch('/staff-portal/home/');
          if (!homeRes.ok) throw new Error('Could not load portal data');
          const homeData = await homeRes.json();
          ptId = homeData.patient?.id;
        }

        if (!ptId) {
          throw new Error('No patient is currently assigned to your shift.');
        }

        const ptRes = await apiFetch(`/staff-portal/patients/${ptId}/`);
        if (!ptRes.ok) throw new Error('Patient record not accessible or not assigned to you.');
        const ptJson = await ptRes.json();
        setPatient(ptJson);
      } catch (err) {
        setError(err.message || 'Error loading patient');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Fetch chart records when a chart tile is opened
  const openChartDetail = async (chartKey) => {
    setActiveChart(chartKey);
    setLoadingChart(true);
    setChartData([]);
    try {
      if (!patient) return;
      let endpoint = '';
      if (chartKey === 'vitals') endpoint = `/patients/${patient.id}/vitals/`;
      else if (chartKey === 'medication') endpoint = `/patients/${patient.id}/prescriptions/`;
      else if (chartKey === 'nursing_notes') endpoint = `/patients/${patient.id}/notes/`;
      else if (chartKey === 'doctor_notes') endpoint = `/patients/${patient.id}/doctor-notes/`;
      else if (chartKey === 'physio') endpoint = `/patients/${patient.id}/physio-notes/`;
      else if (chartKey === 'manager_checklist') endpoint = `/patients/${patient.id}/manager-checklist/`;
      else if (chartKey === 'family_concerns') endpoint = `/staff-portal/family-concerns/?patient=${patient.id}`;

      if (endpoint) {
        const res = await apiFetch(endpoint);
        if (res.ok) {
          const json = await res.json();
          setChartData(json.results || json || []);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChart(false);
    }
  };

  // Submit staff request
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmittingReq(true);
    setModalFeedback(null);
    try {
      let requestType = 'supervisor_visit';
      if (activeModal === 'order') requestType = 'pharmacy_order';
      else if (activeModal === 'appointment') requestType = 'appointment';
      else if (activeModal === 'procedure') requestType = 'procedure_change';

      const payload = {
        patient: patient.id,
        request_type: requestType,
        urgency: reqUrgency,
        notes: reqNotes,
        details: { detail_text: reqDetails },
      };

      const res = await apiFetch('/staff-portal/requests/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        setModalFeedback({ type: 'error', text: resData.detail || 'Could not submit request.' });
      } else {
        setModalFeedback({ type: 'success', text: 'Request submitted for supervisor review.' });
        setTimeout(() => {
          setActiveModal(null);
          setModalFeedback(null);
          setReqNotes('');
          setReqDetails('');
        }, 1400);
      }
    } catch (err) {
      setModalFeedback({ type: 'error', text: 'Network error submitting request.' });
    } finally {
      setSubmittingReq(false);
    }
  };

  // Handle Family Concern Response
  const handleRespondConcern = async (e) => {
    e.preventDefault();
    if (!selectedConcern) return;
    setSubmittingConcern(true);
    try {
      const res = await apiFetch(`/staff-portal/family-concerns/${selectedConcern.id}/respond/`, {
        method: 'POST',
        body: JSON.stringify({
          action: concernAction,
          note: concernNote,
        }),
      });
      if (res.ok) {
        openChartDetail('family_concerns');
        setSelectedConcern(null);
        setConcernNote('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingConcern(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--muted)' }}>
        <div className="spinner" style={{ margin: '40px auto 16px' }} />
        <p>Loading patient chart...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setActivePage('overview')} style={{ marginBottom: 16 }}>
          <ArrowLeft size={14} /> Back to Overview
        </button>
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--danger)', maxWidth: 600 }}>
          <h3 style={{ color: 'var(--danger)', margin: '0 0 8px 0' }}>Patient Chart Inaccessible</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Top Header & Return CTA ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setActivePage('overview')} style={{ borderRadius: 'var(--radius-pill)' }}>
            <ArrowLeft size={14} />
            <span>Overview</span>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                {patient.name}
              </h2>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                {patient.patient_code}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                MRN: <strong>{patient.mr_number}</strong>
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
              {patient.age}y • {patient.gender} • {patient.current_care_plan?.care_manager || 'Care Coordinator'}
            </div>
          </div>
        </div>

        {/* ── 3 Action Request Buttons ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setActiveModal('supervisor')}
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
          >
            <UserCheck size={14} />
            <span>Request Supervisor Visit</span>
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={() => setActiveModal('order')}
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
          >
            <Pill size={14} />
            <span>Order Pharmacy / Equipment</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setActiveModal('appointment')}
          >
            <Calendar size={14} />
            <span>Book / Ask for Consultation</span>
          </button>
        </div>
      </div>

      {/* ── Care Plan & Patient Banner ── */}
      <div className="card" style={{ padding: '12px 18px', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: '0.82rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Primary Diagnosis</div>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{patient.current_care_plan?.diagnosis || 'Bedside care'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Allergies & Alerts</div>
            <div style={{ fontWeight: 700, color: 'var(--danger)', marginTop: 2 }}>{patient.current_care_plan?.allergies || 'NKDA'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Address & Coordinates</div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{patient.location?.address || 'Islamabad, Pakistan'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Open Family Concerns</div>
            <div style={{ fontWeight: 700, color: patient.open_family_concern_count > 0 ? 'var(--warning)' : 'var(--success)', marginTop: 2 }}>
              {patient.open_family_concern_count} open concern(s)
            </div>
          </div>
        </div>
      </div>

      {/* ── Chart Tiles Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 'var(--space-3)' }}>
        {/* Tile 1: Medication Chart (MAR) */}
        <div
          className="card"
          onClick={() => openChartDetail('medication')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'medication' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
            transition: 'all 150ms ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Medication Chart (MAR)</h4>
            </div>
            {patient.open_family_concern_count > 0 && (
              <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'var(--warning-soft)', color: 'var(--warning)', padding: '2px 6px', borderRadius: 'var(--radius-pill)' }}>
                Concern Badge
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Daily prescriptions, dosage schedule, and Form C dose-tick tracking.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Medications →</div>
        </div>

        {/* Tile 2: Nursing Notes */}
        <div
          className="card"
          onClick={() => openChartDetail('nursing_notes')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'nursing_notes' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Nursing Notes</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Shift progress notes, critical event observations, and flag status.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Notes Timeline →</div>
        </div>

        {/* Tile 3: Vitals / Intake Output */}
        <div
          className="card"
          onClick={() => openChartDetail('vitals')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'vitals' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Vitals & Intake / Output</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            BP, pulse, SpO2, temp, glucose, fluid intake (ml), urine output balance.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Flowsheet →</div>
        </div>

        {/* Tile 4: Doctor's Notes */}
        <div
          className="card"
          onClick={() => openChartDetail('doctor_notes')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'doctor_notes' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stethoscope size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Doctor's Notes & Addenda</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Consultant evaluations, treatment plans, and post-visit clinical addenda.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Clinical Notes →</div>
        </div>

        {/* Tile 5: Physiotherapy */}
        <div
          className="card"
          onClick={() => openChartDetail('physio')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'physio' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Heart size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Physiotherapy</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Mobility status, rehabilitation goals, and prescribed home exercises.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Physio Records →</div>
        </div>

        {/* Tile 6: Procedure Change Request */}
        <div
          className="card"
          onClick={() => setActiveModal('procedure')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardCheck size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Procedure Change Request</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Request adjustments for PEG, Tracheostomy, NG tube, or Foley catheter care.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>Raise Change Request →</div>
        </div>

        {/* Tile 7: Manager Visit Notes / Checklist */}
        <div
          className="card"
          onClick={() => openChartDetail('manager_checklist')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'manager_checklist' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCheck size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Manager Visit Checklist</h4>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Care coordinator spot-check inspections, hygiene checks & guardian feedback.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Manager Visits →</div>
        </div>

        {/* Tile 8: Family Concerns & Pending Alerts */}
        <div
          className="card"
          onClick={() => openChartDetail('family_concerns')}
          style={{
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            border: activeChart === 'family_concerns' ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Family Concerns</h4>
            </div>
            {patient.open_family_concern_count > 0 && (
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: 'var(--warning-soft)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                {patient.open_family_concern_count} Open
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
            Direct queries and clinical concerns raised by family members on this patient.
          </p>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)' }}>View Concerns →</div>
        </div>
      </div>

      {/* ── Active Chart Detail Slideout / Table ── */}
      {activeChart && (
        <div className="card" style={{ padding: 18, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, textTransform: 'capitalize' }}>
              {activeChart.replace('_', ' ')} Records
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveChart(null)}>
              <X size={16} /> Close View
            </button>
          </div>

          {loadingChart ? (
            <div style={{ padding: 30, textAlign: 'center' }}>
              <div className="spinner" />
            </div>
          ) : chartData.length > 0 ? (
            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeChart === 'vitals' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Recorded At</th>
                        <th>BP (Sys/Dia)</th>
                        <th>Heart Rate</th>
                        <th>Temp</th>
                        <th>SpO2</th>
                        <th>Intake / Output</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((v) => (
                        <tr key={v.id}>
                          <td>{new Date(v.recorded_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td><strong>{v.blood_pressure_systolic || '-'}/{v.blood_pressure_diastolic || '-'}</strong></td>
                          <td>{v.heart_rate ? `${v.heart_rate} bpm` : '-'}</td>
                          <td>{v.temperature ? `${v.temperature}°C` : '-'}</td>
                          <td><strong>{v.spo2 ? `${v.spo2}%` : '-'}</strong></td>
                          <td>In: {v.intake_ml || 0}ml / Out: {v.output_ml || 0}ml</td>
                          <td>{v.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeChart === 'family_concerns' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {chartData.map((fc) => (
                    <div
                      key={fc.id}
                      style={{
                        padding: '12px 14px',
                        background: 'var(--gray-50)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', background: 'var(--primary-soft)', padding: '2px 6px', borderRadius: 4 }}>
                            {fc.chart_type}
                          </span>
                          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                            by {fc.raised_by_name || 'Family Guardian'} on {new Date(fc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>
                          "{fc.message}"
                        </div>
                        {fc.response_note && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 4, background: 'var(--success-soft)', padding: '4px 8px', borderRadius: 4 }}>
                            Response: {fc.response_note}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)', textTransform: 'capitalize', background: fc.status === 'open' ? 'var(--warning-soft)' : 'var(--success-soft)', color: fc.status === 'open' ? 'var(--warning)' : 'var(--success)' }}>
                          {fc.status}
                        </span>
                        {fc.status === 'open' && (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => setSelectedConcern(fc)}
                          >
                            Respond
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeChart !== 'vitals' && activeChart !== 'family_concerns' && (
                chartData.map((item, idx) => (
                  <div key={idx} style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {item.medication || item.title || item.note || item.notes || item.session_notes || `Record #${item.id}`}
                    </div>
                    {item.dosage && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Dose: {item.dosage} • {item.frequency}</div>}
                    {item.created_at && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</div>}
                  </div>
                ))
              )}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
              No clinical records found under this section.
            </p>
          )}
        </div>
      )}

      {/* ── Action Request Modal ── */}
      <Modal
        isOpen={Boolean(activeModal)}
        onClose={() => setActiveModal(null)}
        title={
          activeModal === 'supervisor'
            ? 'Request Supervisor Visit'
            : activeModal === 'order'
            ? 'Order from Pharmacy / Equipment'
            : activeModal === 'appointment'
            ? 'Book / Ask for Consultation'
            : activeModal === 'procedure'
            ? 'Procedure Change Request'
            : 'Clinical Request'
        }
        subtitle="Formal coordinator escalation and clinical supply request"
        size="md"
        isDirty={Boolean(reqNotes || reqDetails)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!reqNotes.trim() || submittingReq}
              isLoading={submittingReq}
              onClick={handleSubmitRequest}
            >
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Patient Chip on Top */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--primary-soft)', borderRadius: 'var(--radius-md)', border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>Patient:</span>
              <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{patient.name}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>({patient.patient_code})</span>
            </div>
            <Badge variant="purple">MR: {patient.mr_number}</Badge>
          </div>

          {/* Care Plan Disclaimer Notice */}
          <div className="alert-callout alert-callout-info" style={{ padding: '8px 12px' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
            <div>
              <strong>Advisory:</strong> This transmits an escalation request to your shift coordinator. It does not alter the patient's existing care plan directly.
            </div>
          </div>

          {/* Urgency as Segmented Control */}
          <SegmentedControl
            label="Urgency Level"
            required
            options={[
              { value: 'routine', label: 'Routine' },
              { value: 'urgent', label: 'Urgent (2-4 hrs)' },
              { value: 'emergency', label: 'Emergency' },
            ]}
            value={reqUrgency}
            onChange={setReqUrgency}
          />

          {activeModal === 'procedure' && (
            <Select
              label="Procedure Type"
              required
              value={reqDetails}
              onChange={(e) => setReqDetails(e.target.value)}
            >
              <option value="">Select procedure...</option>
              <option value="peg">PEG (Percutaneous Endoscopic Gastrostomy)</option>
              <option value="tracheostomy">Tracheostomy Tube Care / Change</option>
              <option value="ng">NG (Nasogastric Tube)</option>
              <option value="foley">Foley Catheter (Urinary)</option>
            </Select>
          )}

          <Textarea
            label="Clinical Notes & Justification"
            required
            showCount
            maxLength={600}
            rows={3}
            placeholder="Describe patient condition, reason for request, and required supplies or urgency rationale..."
            value={reqNotes}
            onChange={(e) => setReqNotes(e.target.value)}
          />

          {modalFeedback && (
            <div className={`alert-callout alert-callout-${modalFeedback.type === 'error' ? 'danger' : 'success'}`}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{modalFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Family Concern Response Modal ── */}
      <Modal
        isOpen={Boolean(selectedConcern)}
        onClose={() => setSelectedConcern(null)}
        title="Respond to Family Concern"
        subtitle="Provide clinical acknowledgment or resolution note visible to guardian"
        size="md"
        isDirty={Boolean(concernNote)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedConcern(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!concernNote.trim() || submittingConcern}
              isLoading={submittingConcern}
              onClick={handleRespondConcern}
            >
              Submit Response
            </Button>
          </>
        }
      >
        {selectedConcern && (
          <form onSubmit={handleRespondConcern} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Patient chip & context */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Concern for: </span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{patient.name}</strong>
              </div>
              <Badge variant="amber">Family Query</Badge>
            </div>

            {/* Concern text callout */}
            <div className="alert-callout alert-callout-warning" style={{ fontStyle: 'italic' }}>
              <MessageSquare size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--warning)' }} />
              <div>"{selectedConcern.message}"</div>
            </div>

            <Select
              label="Response Action"
              required
              value={concernAction}
              onChange={(e) => setConcernAction(e.target.value)}
            >
              <option value="acknowledge">Acknowledge (Under review by care team)</option>
              <option value="resolve">Resolve (Care action completed / addressed)</option>
            </Select>

            <Textarea
              label="Response Note for Family"
              required
              showCount
              maxLength={500}
              rows={3}
              placeholder="e.g. Oxygen concentrator checked; vitals re-checked and stable at 96%."
              value={concernNote}
              onChange={(e) => setConcernNote(e.target.value)}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
