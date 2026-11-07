import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, User, Heart, Activity, Pill, FlaskConical, Stethoscope,
  FileText, ClipboardList, Users, FileCheck, FolderHeart, Plus, Lock,
  CheckCircle2, Clock, AlertTriangle, ShieldCheck, RefreshCw, X, MessageSquare
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import {
  CHART_TABS,
  canWriteTab,
  canReadTab,
  normalizeRole,
  getClinicianConfig
} from '../config/clinicianRoleConfig';

export default function ClinicianPatientChart() {
  const currentRole = useStore((s) => s.currentRole);
  const currentUser = useStore((s) => s.currentUser);
  const selectedPatient = useStore((s) => s.selectedPatient);
  const setActivePage = useStore((s) => s.setActivePage);

  const [activeTab, setActiveTab] = useState('medical_records');
  const [patient, setPatient] = useState(null);
  const [tabData, setTabData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Addendum Modal state
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [targetNote, setTargetNote] = useState(null); // { type: 'doctor' | 'therapy', id, title }
  const [addendumText, setAddendumText] = useState('');
  const [addendumReason, setAddendumReason] = useState('');
  const [submittingAddendum, setSubmittingAddendum] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // New Note Modal state (Doctor / Therapy)
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [newNoteAssessment, setNewNoteAssessment] = useState('');
  const [newNotePlan, setNewNotePlan] = useState('');
  const [newNoteSignImmediately, setNewNoteSignImmediately] = useState(true);
  const [submittingNewNote, setSubmittingNewNote] = useState(false);

  // Load patient metadata and active tab data
  const loadPatientProfile = useCallback(async () => {
    let pid = selectedPatient?.id;
    if (!pid) {
      // Try to get from staff-portal home
      try {
        const homeRes = await apiFetch('/staff-portal/clinician-home/');
        if (homeRes.ok) {
          const homeJson = await homeRes.json();
          pid = homeJson.today_visits?.[0]?.patient_id;
        }
      } catch (e) { }
    }

    if (!pid) {
      setError('No patient selected. Please select a patient from the clinician home or directory.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch(`/staff-portal/patients/${pid}/`);
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Patient record not accessible or not assigned to your clinical shift.' : 'Error loading patient record.');
      }
      const pJson = await res.json();
      setPatient(pJson);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  const loadTabData = useCallback(async (tabKey, pid) => {
    if (!pid) return;
    try {
      let endpoint = '';
      if (tabKey === 'medical_records') endpoint = `/patients/${pid}/medical-records/`;
      else if (tabKey === 'doctor_notes') endpoint = `/patients/${pid}/doctor-notes/`;
      else if (tabKey === 'physiotherapy') endpoint = `/patients/${pid}/therapy-notes/`;
      else if (tabKey === 'consents') endpoint = `/patients/${pid}/consents/`;
      else if (tabKey === 'procedures') endpoint = `/patients/${pid}/procedures/`;
      else if (tabKey === 'referrals') endpoint = `/patients/${pid}/referrals/`;
      else if (tabKey === 'nursing_notes') endpoint = `/patients/${pid}/notes/`;
      else if (tabKey === 'vital_charts') endpoint = `/patients/${pid}/vitals/`;
      else if (tabKey === 'lab_results') endpoint = `/patients/${pid}/labs/`;
      else if (tabKey === 'medications') endpoint = `/patients/${pid}/prescriptions/`;

      if (!endpoint) return;

      const res = await apiFetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        setTabData((prev) => ({ ...prev, [tabKey]: json.results || json }));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadPatientProfile();
  }, [loadPatientProfile]);

  useEffect(() => {
    if (patient?.id) {
      loadTabData(activeTab, patient.id);
    }
  }, [patient?.id, activeTab, loadTabData]);

  const canWrite = useMemo(() => canWriteTab(currentRole, activeTab), [currentRole, activeTab]);
  const canRead = useMemo(() => canReadTab(currentRole, activeTab), [currentRole, activeTab]);

  // Submit Addendum to Signed Entry
  const handleSaveAddendum = async (e) => {
    e.preventDefault();
    if (!addendumText.trim() || !addendumReason.trim()) {
      alert('Please provide both the addendum note text and the clinical audit reason.');
      return;
    }

    setSubmittingAddendum(true);
    setActionFeedback(null);
    try {
      const endpoint = targetNote.type === 'doctor'
        ? `/patients/${patient.id}/doctor-notes/${targetNote.id}/addendum/`
        : `/patients/${patient.id}/therapy-notes/${targetNote.id}/addendum/`;

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: addendumText.trim(),
          reason: addendumReason.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to append addendum');
      }

      setShowAddendumModal(false);
      setAddendumText('');
      setAddendumReason('');
      setActionFeedback({ type: 'success', text: 'Clinical addendum securely appended and locked.' });
      loadTabData(activeTab, patient.id);
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmittingAddendum(false);
    }
  };

  // Submit New Doctor or Therapy Note
  const handleCreateNewNote = async (e) => {
    e.preventDefault();
    if (!newNoteAssessment.trim()) {
      alert('Please write clinical assessment notes.');
      return;
    }

    setSubmittingNewNote(true);
    setActionFeedback(null);
    try {
      const isDoctorTab = activeTab === 'doctor_notes';
      const endpoint = isDoctorTab
        ? `/patients/${patient.id}/doctor-notes/`
        : `/patients/${patient.id}/therapy-notes/`;

      const payload = isDoctorTab
        ? {
            notes: newNoteAssessment.trim(),
            plan: newNotePlan.trim(),
            is_signed: newNoteSignImmediately,
          }
        : {
            session_notes: newNoteAssessment.trim(),
            plan: newNotePlan.trim(),
            is_signed: newNoteSignImmediately,
          };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || 'Failed to submit clinical note.');
      }

      setShowNewNoteModal(false);
      setNewNoteAssessment('');
      setNewNotePlan('');
      setActionFeedback({ type: 'success', text: 'Clinical entry successfully recorded.' });
      loadTabData(activeTab, patient.id);
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmittingNewNote(false);
    }
  };

  if (loading && !patient) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
        <p style={{ color: '#6B7280', fontSize: '0.92rem' }}>Loading patient clinical chart...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div style={{ padding: '40px', maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: 32, borderTop: '4px solid #EF4444' }}>
          <AlertTriangle size={36} style={{ color: '#EF4444', margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            Patient Access Restricted
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
            {error || 'Patient record could not be loaded.'}
          </p>
          <button className="btn btn-primary" onClick={() => setActivePage('overview')}>
            Return to Clinician Home
          </button>
        </div>
      </div>
    );
  }

  const primaryDiagnosis = patient.current_care_plan?.diagnosis || patient.primary_diagnosis || 'Clinical bedside supervision';
  const allergies = patient.current_care_plan?.allergies || patient.allergies || 'NKDA';
  const careManager = patient.current_care_plan?.care_manager || patient.assigned_care_manager_name || 'Care Coordinator';

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* ── Top Bar: Back & Action Feedback ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button
          onClick={() => setActivePage('overview')}
          className="btn btn-ghost btn-sm"
          style={{ gap: 6, color: '#4B5563', fontWeight: 600 }}
        >
          <ArrowLeft size={15} /> Back to Overview
        </button>

        {actionFeedback && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: actionFeedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
              color: actionFeedback.type === 'success' ? '#065F46' : '#991B1B',
              border: `1px solid ${actionFeedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
            }}
          >
            {actionFeedback.text}
          </div>
        )}
      </div>

      {/* ── Patient Header Shell ── */}
      <div
        className="card"
        style={{
          padding: '24px',
          background: '#FFFFFF',
          borderRadius: 14,
          borderTop: '4px solid #0284C7',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {(patient.name || patient.full_name || 'PT').split(' ').map((n) => n[0]).slice(0, 2).join('')}
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#111827' }}>
                {patient.name || patient.full_name}
              </h1>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#E0F2FE', color: '#0369A1' }}>
                {patient.patient_code || `P-000${patient.id}`}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>
                MRN: <strong>{patient.mr_number}</strong>
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#DCFCE7', color: '#15803D' }}>
                Assigned Clinical Patient
              </span>
            </div>

            <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: '0.84rem', color: '#4B5563', flexWrap: 'wrap' }}>
              <span><strong>Age / Sex:</strong> {patient.age}y ({patient.gender || 'Unknown'})</span>
              <span><strong>Care Manager:</strong> {careManager}</span>
              <span>
                <strong>Primary Diagnosis:</strong>{' '}
                <span style={{ color: '#0369A1', fontWeight: 700 }}>{primaryDiagnosis}</span>
              </span>
              <span>
                <strong>Allergies:</strong>{' '}
                <span style={{ color: allergies === 'NKDA' ? '#059669' : '#DC2626', fontWeight: 700 }}>
                  {allergies}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 10 Chart Tabs Navigation ── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          borderBottom: '1px solid #E5E7EB',
          whiteSpace: 'nowrap',
        }}
      >
        {CHART_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const userCanWrite = canWriteTab(currentRole, tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                borderBottom: isActive ? '3px solid #7C3AED' : '3px solid transparent',
                background: isActive ? '#FAF5FF' : 'transparent',
                color: isActive ? '#6D28D9' : '#64748B',
                fontWeight: isActive ? 800 : 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {userCanWrite && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED' }} title="Clinical write permission active" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Action Banner (Read-only vs Entry Allowed) ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          background: '#F8FAFC',
          borderRadius: 8,
          border: '1px solid #E2E8F0',
          fontSize: '0.82rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#64748B' }}>Role Access Mode:</span>
          {canWrite ? (
            <span style={{ fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: 999 }}>
              Clinical Entry Allowed
            </span>
          ) : (
            <span style={{ fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 999 }}>
              Read-Only
            </span>
          )}
          <span style={{ color: '#94A3B8' }}>• Protected by tamper-evident audit log</span>
        </div>

        {canWrite && ['doctor_notes', 'physiotherapy'].includes(activeTab) && (
          <button
            onClick={() => setShowNewNoteModal(true)}
            className="btn btn-primary btn-sm"
            style={{ gap: 6, background: '#7C3AED', borderColor: '#7C3AED' }}
          >
            <Plus size={14} /> Record Clinical Entry
          </button>
        )}
      </div>

      {/* ── Tab Contents Area ── */}
      <div className="card" style={{ padding: '24px', background: '#FFFFFF', borderRadius: 14, minHeight: 380 }}>
        
        {/* TAB 1: Medical Records */}
        {activeTab === 'medical_records' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Comprehensive Medical Record & Surgical History
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#6B7280' }}>Primary Diagnosis</div>
                <div style={{ fontWeight: 800, color: '#111827', fontSize: '1rem', marginTop: 4 }}>{primaryDiagnosis}</div>
              </div>
              <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#6B7280' }}>Allergies & Adverse Reactions</div>
                <div style={{ fontWeight: 800, color: allergies === 'NKDA' ? '#059669' : '#DC2626', fontSize: '1rem', marginTop: 4 }}>{allergies}</div>
              </div>
              <div style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#6B7280' }}>Blood Group</div>
                <div style={{ fontWeight: 800, color: '#111827', fontSize: '1rem', marginTop: 4 }}>{patient.blood_type || 'O+'}</div>
              </div>
            </div>
            <div style={{ marginTop: 20, padding: 16, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: 6 }}>Clinical Intake Summary</div>
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#334155', lineHeight: 1.6 }}>
                Patient admitted for bedside clinical care under hospital-at-home supervision. Routine vitals monitoring, fluid tracking, and daily medication administration active.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: Doctor Notes */}
        {activeTab === 'doctor_notes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
                Physician Assessment & Progress Notes
              </h3>
            </div>

            {(!tabData.doctor_notes || tabData.doctor_notes.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Stethoscope size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No doctor notes recorded yet</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>Physician assessments will appear here. Signed notes are permanently locked.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tabData.doctor_notes.map((n) => (
                  <div key={n.id} style={{ padding: 18, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#111827', fontSize: '0.95rem' }}>{n.doctor_name || 'Attending Physician'}</span>
                          {n.is_signed ? (
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#ECFDF5', color: '#047857', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Lock size={11} /> Signed & Locked
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#B45309' }}>
                              Draft
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 2 }}>
                          Recorded on {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>

                      {canWrite && (
                        <button
                          onClick={() => {
                            setTargetNote({ type: 'doctor', id: n.id, title: `Doctor Note #${n.id}` });
                            setShowAddendumModal(true);
                          }}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.76rem', padding: '3px 10px', gap: 4, borderColor: '#DDD6FE', color: '#7C3AED' }}
                        >
                          + Add Addendum
                        </button>
                      )}
                    </div>

                    <div style={{ marginTop: 12, fontSize: '0.88rem', color: '#1F2937', lineHeight: 1.6 }}>
                      {n.notes}
                    </div>

                    {n.plan && (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, fontSize: '0.82rem', color: '#334155' }}>
                        <strong>Management Plan:</strong> {n.plan}
                      </div>
                    )}

                    {/* Immutable Addenda Thread */}
                    {n.addenda && n.addenda.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: '#7C3AED', letterSpacing: '0.04em' }}>
                          Addenda Trail ({n.addenda.length})
                        </div>
                        {n.addenda.map((ad, idx) => (
                          <div key={idx} style={{ padding: '8px 12px', background: '#FAF5FF', borderRadius: 6, borderLeft: '3px solid #7C3AED' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6D28D9', fontWeight: 700 }}>
                              <span>Addendum by {ad.author} ({ad.role})</span>
                              <span>{new Date(ad.timestamp).toLocaleString()}</span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#1F2937', marginTop: 4 }}>{ad.text}</div>
                            <div style={{ fontSize: '0.72rem', color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>
                              Clinical Reason: {ad.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Consents */}
        {activeTab === 'consents' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Informed Treatment & PHI Release Consents
            </h3>
            {(!tabData.consents || tabData.consents.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <FileCheck size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No consents registered</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>Signed treatment authorizations and tele-health releases will be displayed here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.consents.map((c) => (
                  <div key={c.id} style={{ padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827' }}>{c.title}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857', background: '#ECFDF5', padding: '2px 8px', borderRadius: 999 }}>
                        {c.is_granted ? 'Granted & Active' : 'Declined'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 4 }}>
                      Authorized by: {c.granted_by} ({c.relationship}) • {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Procedures */}
        {activeTab === 'procedures' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Clinical Procedure Requests & Orders
            </h3>
            {(!tabData.procedures || tabData.procedures.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <ClipboardList size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No procedure requests on file</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>IV cannulation, wound debridement, catheter care requests appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.procedures.map((pr) => (
                  <div key={pr.id} style={{ padding: 16, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827' }}>{pr.details || 'Procedure Change Request'}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: 999 }}>
                        {pr.urgency?.toUpperCase()} • {pr.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#4B5563', marginTop: 6 }}>{pr.notes}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Referrals */}
        {activeTab === 'referrals' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Specialist & Cross-Discipline Referrals
            </h3>
            {(!tabData.referrals || tabData.referrals.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Users size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No active referrals</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>Consultation referrals between doctors, physiotherapists, and speech pathologists appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.referrals.map((rf) => (
                  <div key={rf.id} style={{ padding: 16, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827' }}>{rf.details || 'Clinical Referral'}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', padding: '2px 8px', borderRadius: 999 }}>
                        {rf.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#4B5563', marginTop: 6 }}>{rf.notes}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: Nursing Notes */}
        {activeTab === 'nursing_notes' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Bedside Nursing Progress Notes (Form A)
            </h3>
            {(!tabData.nursing_notes || tabData.nursing_notes.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <FileText size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No nursing notes recorded yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.nursing_notes.map((nn) => (
                  <div key={nn.id} style={{ padding: 16, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#111827' }}>
                        {nn.recorded_by_name || 'Bedside Nurse'}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#6B7280' }}>
                        {new Date(nn.recorded_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#374151', marginTop: 8, lineHeight: 1.6 }}>
                      {nn.note}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: Physiotherapy & Therapy Notes */}
        {activeTab === 'physiotherapy' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
                Therapy Assessments & Rehabilitation Regimens
              </h3>
            </div>

            {(!tabData.physiotherapy || tabData.physiotherapy.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Activity size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No therapy entries recorded</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>Physiotherapy, speech pathology, and psychotherapy session notes appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tabData.physiotherapy.map((t) => (
                  <div key={t.id} style={{ padding: 18, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#111827', fontSize: '0.95rem' }}>{t.author_name || 'Therapist'}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8' }}>
                            {t.discipline_display || t.discipline}
                          </span>
                          {t.is_signed && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#ECFDF5', color: '#047857' }}>
                              Locked
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 2 }}>
                          {new Date(t.created_at).toLocaleString()}
                        </div>
                      </div>

                      {canWrite && (
                        <button
                          onClick={() => {
                            setTargetNote({ type: 'therapy', id: t.id, title: `Therapy Note #${t.id}` });
                            setShowAddendumModal(true);
                          }}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.76rem', padding: '3px 10px', gap: 4, borderColor: '#DDD6FE', color: '#7C3AED' }}
                        >
                          + Add Addendum
                        </button>
                      )}
                    </div>

                    <div style={{ marginTop: 12, fontSize: '0.88rem', color: '#1F2937', lineHeight: 1.6 }}>
                      {t.session_notes}
                    </div>

                    {t.plan && (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, fontSize: '0.82rem', color: '#334155' }}>
                        <strong>Rehab Plan & Exercises:</strong> {t.plan}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: Vital Charts */}
        {activeTab === 'vital_charts' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Physiological Vitals History (Form B)
            </h3>
            {(!tabData.vital_charts || tabData.vital_charts.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Heart size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No vital signs recorded yet</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#6B7280', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 12px' }}>Recorded At</th>
                      <th style={{ padding: '8px 12px' }}>BP (mmHg)</th>
                      <th style={{ padding: '8px 12px' }}>Heart Rate</th>
                      <th style={{ padding: '8px 12px' }}>SpO2 (%)</th>
                      <th style={{ padding: '8px 12px' }}>Temp (°C)</th>
                      <th style={{ padding: '8px 12px' }}>Blood Sugar</th>
                      <th style={{ padding: '8px 12px' }}>Intake / Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabData.vital_charts.map((v) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{new Date(v.recorded_at).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>{v.blood_pressure_systolic}/{v.blood_pressure_diastolic || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>{v.heart_rate || '-'} bpm</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: v.spo2 < 92 ? '#DC2626' : '#15803D' }}>{v.spo2 ? `${v.spo2}%` : '-'}</td>
                        <td style={{ padding: '10px 12px' }}>{v.temperature ? `${v.temperature}°C` : '-'}</td>
                        <td style={{ padding: '10px 12px' }}>{v.blood_glucose || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>{v.intake_ml || 0} / {v.output_ml || 0} mL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 9: Lab Results */}
        {activeTab === 'lab_results' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Diagnostic Laboratory Reports & Panels
            </h3>
            {(!tabData.lab_results || tabData.lab_results.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <FlaskConical size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No lab results on file</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>Phlebotomy orders and validated lab results will display here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.lab_results.map((l) => (
                  <div key={l.id} style={{ padding: 16, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827' }}>{l.test_name}</span>
                      <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: l.is_abnormal ? '#FEE2E2' : '#DCFCE7', color: l.is_abnormal ? '#DC2626' : '#15803D' }}>
                        {l.result_value} {l.unit} {l.is_abnormal ? '(Abnormal)' : '(Normal)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 10: Medication Record */}
        {activeTab === 'medications' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
              Prescriptions & Form C MAR Administration
            </h3>
            {(!tabData.medications || tabData.medications.length === 0) ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Pill size={36} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No active prescriptions</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tabData.medications.map((m) => (
                  <div key={m.id} style={{ padding: 16, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#111827', fontSize: '0.95rem' }}>{m.medication}</span>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#6D28D9', background: '#FAF5FF', padding: '2px 8px', borderRadius: 999 }}>
                        {m.dosage} • {m.frequency}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 4 }}>
                      Prescribed by: {m.prescribed_by} ({m.date})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Addendum Modal ── */}
      {showAddendumModal && targetNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ maxWidth: 540, width: '100%', padding: 24, borderRadius: 14, background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                Append Clinical Addendum
              </h3>
              <button onClick={() => setShowAddendumModal(false)} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Signed clinical records are permanent and immutable. Your addendum will be permanently appended to this entry with your role identity and a server timestamp.
            </p>

            <form onSubmit={handleSaveAddendum} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Addendum Clinical Text *
                </label>
                <textarea
                  rows={4}
                  value={addendumText}
                  onChange={(e) => setAddendumText(e.target.value)}
                  placeholder="Enter clarification, updated clinical finding, or revised plan..."
                  className="input"
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Clinical Audit Reason *
                </label>
                <input
                  type="text"
                  value={addendumReason}
                  onChange={(e) => setAddendumReason(e.target.value)}
                  placeholder="e.g. Laboratory result reconciliation, patient response to therapy"
                  className="input"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setShowAddendumModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submittingAddendum} className="btn btn-primary" style={{ background: '#7C3AED', borderColor: '#7C3AED' }}>
                  {submittingAddendum ? 'Appending...' : 'Save & Lock Addendum'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Clinical Entry Modal ── */}
      {showNewNoteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ maxWidth: 580, width: '100%', padding: 24, borderRadius: 14, background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                {activeTab === 'doctor_notes' ? 'Record Physician Assessment' : 'Record Therapy Clinical Session'}
              </h3>
              <button onClick={() => setShowNewNoteModal(false)} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewNote} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Clinical Assessment & Findings *
                </label>
                <textarea
                  rows={4}
                  value={newNoteAssessment}
                  onChange={(e) => setNewNoteAssessment(e.target.value)}
                  placeholder="Document patient examination, symptoms, findings, and evaluation..."
                  className="input"
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Management & Follow-up Plan
                </label>
                <textarea
                  rows={3}
                  value={newNotePlan}
                  onChange={(e) => setNewNotePlan(e.target.value)}
                  placeholder="Treatment regimen, follow-up directives, or prescribed exercises..."
                  className="input"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FAF5FF', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  id="signCheckbox"
                  checked={newNoteSignImmediately}
                  onChange={(e) => setNewNoteSignImmediately(e.target.checked)}
                />
                <label htmlFor="signCheckbox" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#6D28D9', cursor: 'pointer' }}>
                  Digitally sign and lock entry immediately upon submission
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setShowNewNoteModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={submittingNewNote} className="btn btn-primary" style={{ background: '#7C3AED', borderColor: '#7C3AED' }}>
                  {submittingNewNote ? 'Submitting...' : 'Save Clinical Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

