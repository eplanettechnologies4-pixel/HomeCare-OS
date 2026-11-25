import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle, Clock, AlertCircle, FileText, Upload, Shield,
  ChevronRight, Award, MessageSquare, ArrowRight, ArrowLeft, RefreshCw,
  Printer, Check, AlertTriangle, Eye, ShieldAlert, UserCheck
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import { getStageBadge, isReviewDue } from '../utils/staffLifecycleHelpers';

export default function StaffOnboardingDrawer({ staff, isOpen, onClose, onUpdated }) {
  const currentRole = useStore((s) => s.currentRole);
  const currentUser = useStore((s) => s.currentUser);
  const isSuperAdmin = currentRole === 'super_admin' || currentUser?.is_superuser;
  const isAdminOrSuper = isSuperAdmin || currentRole === 'admin';
  const isCareManager = currentRole === 'care_manager';

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeTabStage, setActiveTabStage] = useState('trainee'); // 'trainee' | 'probation' | 'active'

  // Modals inside drawer
  const [uploadReq, setUploadReq] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading, setUploading] = useState(false);

  const [rejectReq, setRejectReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [waiveReq, setWaiveReq] = useState(null);
  const [waiveReason, setWaiveReason] = useState('');

  const [assessmentReq, setAssessmentReq] = useState(null);
  const [assessmentForm, setAssessmentForm] = useState({
    course_name: '',
    completed_date: '',
    exam_result: 'pass',
    score: '',
    exam_date: '',
    assessor: '',
    competency_passed: true,
    competency_date: '',
    notes: '',
  });

  const [feedbackReq, setFeedbackReq] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({
    source: 'management',
    rating: 5,
    comment: '',
  });

  const [returnModal, setReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const [advanceNote, setAdvanceNote] = useState('');
  const [advanceModal, setAdvanceModal] = useState(false);

  const [newCodeData, setNewCodeData] = useState(null);

  const fetchOnboarding = async () => {
    if (!staff?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/staff/members/${staff.id}/onboarding/`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.staff?.lifecycle_stage === 'probation') {
          setActiveTabStage('probation');
        } else if (json.staff?.lifecycle_stage === 'active') {
          setActiveTabStage('active');
        } else {
          setActiveTabStage('trainee');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || 'Failed to load onboarding data.');
      }
    } catch (e) {
      setError(e.message || 'Error connecting to onboarding service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && staff?.id) {
      fetchOnboarding();
    }
  }, [isOpen, staff?.id]);

  if (!isOpen) return null;

  const currentStage = data?.staff?.lifecycle_stage;
  const stageBadge = getStageBadge(currentStage);
  const reviewDue = data?.staff?.review_due || false;

  // Handle Upload
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile || !uploadReq) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadExpiry) formData.append('expiry_date', uploadExpiry);

      const res = await apiFetch(`/staff/requirements/${uploadReq.id}/upload/`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadReq(null);
        setUploadFile(null);
        setUploadExpiry('');
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to upload document.');
      }
    } catch (err) {
      alert(err.message || 'Network error during upload.');
    } finally {
      setUploading(false);
    }
  };

  // Handle Verify
  const handleVerify = async (reqId) => {
    try {
      const res = await apiFetch(`/staff/requirements/${reqId}/verify/`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to verify requirement.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Reject
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReq || !rejectReason.trim()) return;
    try {
      const res = await apiFetch(`/staff/requirements/${rejectReq.id}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setRejectReq(null);
        setRejectReason('');
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to reject requirement.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Waive (Super Admin only)
  const handleWaiveSubmit = async (e) => {
    e.preventDefault();
    if (!waiveReq || !waiveReason.trim()) return;
    try {
      const res = await apiFetch(`/staff/requirements/${waiveReq.id}/waive/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: waiveReason.trim() }),
      });
      if (res.ok) {
        setWaiveReq(null);
        setWaiveReason('');
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to waive requirement.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Assessment Submit
  const handleAssessmentSubmit = async (e) => {
    e.preventDefault();
    if (!assessmentReq) return;
    try {
      const res = await apiFetch(`/staff/requirements/${assessmentReq.id}/record-assessment/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessmentForm),
      });
      if (res.ok) {
        setAssessmentReq(null);
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to record assessment.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Feedback Submit
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackReq || !feedbackForm.comment.trim()) return;
    try {
      const res = await apiFetch(`/staff/requirements/${feedbackReq.id}/add-feedback/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackForm),
      });
      if (res.ok) {
        setFeedbackReq(null);
        setFeedbackForm({ source: 'management', rating: 5, comment: '' });
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to record feedback.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Stage Advance
  const handleAdvanceSubmit = async () => {
    try {
      const res = await apiFetch(`/staff/members/${staff.id}/stage/advance/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: advanceNote.trim() }),
      });
      if (res.ok) {
        setAdvanceModal(false);
        setAdvanceNote('');
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to advance stage.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Stage Return
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnReason.trim()) return;
    try {
      const res = await apiFetch(`/staff/members/${staff.id}/stage/return/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      if (res.ok) {
        setReturnModal(false);
        setReturnReason('');
        await fetchOnboarding();
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to return stage.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Regenerate Activation Code
  const handleRegenerateCode = async () => {
    if (!window.confirm('Regenerating will invalidate the previous activation code. Continue?')) return;
    try {
      const res = await apiFetch(`/staff/members/${staff.id}/regenerate-code/`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setNewCodeData(json);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to regenerate code.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter requirements for active tab stage
  const gateMap = {
    trainee: 'trainee_to_probation',
    probation: 'probation_to_active',
    active: 'probation_to_active',
  };
  const activeGate = gateMap[activeTabStage];
  const stageRequirements = (data?.requirements || []).filter(
    (r) => r.requirement_type.gate === activeGate
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 620,
        background: '#ffffff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--sage-50)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--teal-900)' }}>
              {staff?.full_name || staff?.name}
            </h2>
            <span
              className={`badge ${stageBadge.className}`}
              style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700 }}
            >
              {stageBadge.label}
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
            {staff?.employee_id} • {staff?.role_display || staff?.role}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          aria-label="Close drawer"
          style={{ padding: 6 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Probation Review Due Banner */}
      {reviewDue && (
        <div
          style={{
            background: '#FEF3C7',
            borderBottom: '1px solid #FDE68A',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#92400E',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={16} />
          <span>Probation Review Due: Evaluation window is active within 14 days of end date.</span>
        </div>
      )}

      {/* Stepper Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderBottom: '1px solid #e5e7eb',
          background: '#f8fafc',
        }}
      >
        {[
          { key: 'trainee', label: '1. Trainee Gate', sub: 'Docs & Verifications' },
          { key: 'probation', label: '2. Probation Gate', sub: 'Assessments' },
          { key: 'active', label: '3. Active Employee', sub: 'Feedback & Full Duty' },
        ].map((step) => {
          const isSelected = activeTabStage === step.key;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveTabStage(step.key)}
              style={{
                padding: '10px 8px',
                border: 'none',
                background: isSelected ? '#ffffff' : 'transparent',
                borderBottom: isSelected ? '3px solid var(--teal-600)' : '3px solid transparent',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? 'var(--teal-800)' : '#64748b' }}>
                {step.label}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>{step.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Main Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--status-grey)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
            <div>Loading onboarding checklist...</div>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 20, textAlign: 'center', color: '#b91c1c', background: '#fef2f2' }}>
            <AlertCircle size={28} style={{ margin: '0 auto 8px' }} />
            <div>{error}</div>
          </div>
        ) : (
          <div>
            {/* Progress Card */}
            <div className="card" style={{ padding: 14, marginBottom: 18, background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--teal-800)' }}>
                  {activeTabStage === 'trainee' ? 'Trainee Requirements Progress' : 'Probation & Feedback Progress'}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--teal-700)' }}>
                  {activeTabStage === 'trainee'
                    ? data?.progress?.trainee_to_probation?.docs_label
                    : data?.progress?.probation_to_active?.docs_label}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--teal-600)',
                    width: `${
                      activeTabStage === 'trainee'
                        ? data?.progress?.trainee_to_probation?.percentage || 0
                        : data?.progress?.probation_to_active?.percentage || 0
                    }%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Stage Actions Bar */}
            {isAdminOrSuper && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 18,
                  padding: 12,
                  background: 'var(--sage-50)',
                  borderRadius: 8,
                  alignItems: 'center',
                }}
              >
                {currentStage === 'trainee' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!data?.can_advance_to_probation}
                    onClick={() => setAdvanceModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    title={
                      !data?.can_advance_to_probation
                        ? `Missing: ${data?.missing_trainee_requirements?.join(', ')}`
                        : 'Advance to Probation'
                    }
                  >
                    <ArrowRight size={14} /> Advance to Probation
                  </button>
                )}

                {currentStage === 'probation' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!data?.can_advance_to_active}
                    onClick={() => setAdvanceModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    title={
                      !data?.can_advance_to_active
                        ? `Missing: ${data?.missing_probation_requirements?.join(', ')}`
                        : 'Advance to Active'
                    }
                  >
                    <ArrowRight size={14} /> Advance to Active Employee
                  </button>
                )}

                {(currentStage === 'probation' || currentStage === 'active') && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReturnModal(true)}
                    style={{ color: '#b91c1c', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <ArrowLeft size={13} /> Return Stage
                  </button>
                )}

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleRegenerateCode}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem' }}
                  title="Generate a new one-time activation code"
                >
                  <RefreshCw size={13} /> Regenerate Login Code
                </button>
              </div>
            )}

            {/* Incomplete Requirements Banner */}
            {currentStage === 'trainee' && data?.missing_trainee_requirements?.length > 0 && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 16,
                  fontSize: '0.78rem',
                  color: '#991b1b',
                }}
              >
                <strong>Pending Trainee Requirements ({data.missing_trainee_requirements.length}):</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {data.missing_trainee_requirements.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements Checklist */}
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 12 }}>
              Requirement Checklist
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stageRequirements.map((req) => {
                const isVerified = req.status === 'verified';
                const isWaived = req.status === 'waived';
                const isRejected = req.status === 'rejected';
                const isSubmitted = req.status === 'submitted';
                const isPending = req.status === 'pending';

                const isSensitive = req.requirement_type.code === 'blood_tests' || req.requirement_type.code === 'police_verification';
                const isDocument = req.requirement_type.kind === 'document';
                const isAssessment = req.requirement_type.kind === 'assessment';
                const isFeedback = req.requirement_type.kind === 'feedback';

                const reqCount = req.requirement_type.required_count || 1;
                const docsCount = (req.documents || []).length;

                return (
                  <div
                    key={req.id}
                    className="card"
                    style={{
                      padding: 14,
                      borderLeft: isVerified
                        ? '4px solid #10b981'
                        : isWaived
                        ? '4px solid #8b5cf6'
                        : isRejected
                        ? '4px solid #ef4444'
                        : isSubmitted
                        ? '4px solid #3b82f6'
                        : '4px solid #94a3b8',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{req.requirement_type.label}</span>
                          {isSensitive && (
                            <span className="badge badge-amber" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                              🔒 Confidential
                            </span>
                          )}
                          {reqCount > 1 && (
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              ({docsCount}/{reqCount} uploaded)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          Type: {req.requirement_type.kind_display} • Code: {req.requirement_type.code}
                        </div>
                      </div>

                      {/* Status Chip */}
                      <span
                        className={`badge ${
                          isVerified
                            ? 'badge-green'
                            : isWaived
                            ? 'badge-purple'
                            : isRejected
                            ? 'badge-red'
                            : isSubmitted
                            ? 'badge-blue'
                            : 'badge-grey'
                        }`}
                        style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}
                      >
                        {req.status}
                      </span>
                    </div>

                    {/* Rejection / Waiver notes */}
                    {isRejected && req.rejection_reason && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          background: '#fef2f2',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          color: '#b91c1c',
                        }}
                      >
                        <strong>Rejection Reason:</strong> {req.rejection_reason}
                      </div>
                    )}
                    {isWaived && req.waiver_reason && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          background: '#f5f3ff',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          color: '#6d28d9',
                        }}
                      >
                        <strong>Waived by {req.waived_by_name || 'Super Admin'}:</strong> {req.waiver_reason}
                      </div>
                    )}

                    {/* Uploaded Documents List */}
                    {isDocument && (req.documents || []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {req.documents.map((doc) => (
                          <div
                            key={doc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: '#f8fafc',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <FileText size={14} color="var(--teal-700)" />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.original_filename}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                ({Math.round(doc.size / 1024)} KB)
                              </span>
                            </div>

                            {doc.download_url && (
                              <a
                                href={doc.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Eye size={12} /> View
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assessment Details */}
                    {isAssessment && (req.assessments || []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {req.assessments.map((ass) => (
                          <div
                            key={ass.id}
                            style={{
                              padding: '8px 10px',
                              background: '#f8fafc',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                              {ass.course_name || req.requirement_type.label}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Result: <strong>{ass.exam_result || (ass.competency_passed ? 'Passed' : 'Pending')}</strong>
                              {ass.score && ` • Score: ${ass.score}%`}
                              {ass.assessor && ` • Assessor: ${ass.assessor}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Feedbacks List */}
                    {isFeedback && (req.feedbacks || []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {req.feedbacks.map((fb) => (
                          <div
                            key={fb.id}
                            style={{
                              padding: '8px 10px',
                              background: '#f8fafc',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{fb.source_display} Feedback</span>
                              <span style={{ color: 'var(--status-amber)', fontWeight: 700 }}>★ {fb.rating}/5</span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#4b5563', marginTop: 4 }}>
                              "{fb.comment}"
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                              By {fb.entered_by_name || 'Staff'} • {new Date(fb.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: '1px dashed #e2e8f0',
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Document Upload Button */}
                      {isDocument && (isAdminOrSuper || currentUser?.id === staff?.user_id) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setUploadReq(req)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Upload size={12} /> Upload
                        </button>
                      )}

                      {/* Assessment Form Button */}
                      {isAssessment && isAdminOrSuper && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setAssessmentReq(req)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Award size={12} /> Record Assessment
                        </button>
                      )}

                      {/* Feedback Form Button */}
                      {isFeedback && (isAdminOrSuper || isCareManager) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setFeedbackReq(req);
                            setFeedbackForm({
                              source: req.requirement_type.code === 'feedback_family' ? 'patient_family' : 'management',
                              rating: 5,
                              comment: '',
                            });
                          }}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <MessageSquare size={12} /> Add Feedback
                        </button>
                      )}

                      {/* Admin Verify Button */}
                      {isAdminOrSuper && !isVerified && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleVerify(req.id)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Check size={12} /> Verify
                        </button>
                      )}

                      {/* Admin Reject Button */}
                      {isAdminOrSuper && !isRejected && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setRejectReq(req)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#b91c1c' }}
                        >
                          Reject
                        </button>
                      )}

                      {/* Super Admin Waive Button */}
                      {isSuperAdmin && !isWaived && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setWaiveReq(req)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#7c3aed' }}
                          title="Waive requirement (Super Admin only with written reason)"
                        >
                          Waive
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage History Timeline */}
            <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 12 }}>
                Stage Transition History
              </h3>

              {(data?.stage_events || []).length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  No stage transitions recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.stage_events.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--teal-800)', textTransform: 'capitalize' }}>
                          {ev.from_stage || 'Created'} → {ev.to_stage}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          {new Date(ev.decided_at).toLocaleString()}
                        </span>
                      </div>
                      {ev.note && (
                        <div style={{ fontSize: '0.74rem', color: '#4b5563', marginTop: 4 }}>
                          "{ev.note}"
                        </div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                        Decided by: {ev.decided_by_name || 'Administrator'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Upload Document Modal */}
      {uploadReq && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !uploading && setUploadReq(null)}>
          <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                Upload {uploadReq.requirement_type.label}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setUploadReq(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.8rem', color: 'var(--status-grey)', margin: '0 0 14px' }}>
                  Accepted formats: PDF, JPEG, PNG (Max 10MB). Stored securely in encrypted private media.
                </p>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Select File *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="form-input"
                    required
                  />
                </div>
                {uploadReq.requirement_type.requires_expiry && (
                  <div className="form-group">
                    <label className="form-label">Expiry Date (if applicable)</label>
                    <input
                      type="date"
                      value={uploadExpiry}
                      onChange={(e) => setUploadExpiry(e.target.value)}
                      className="form-input"
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setUploadReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!uploadFile || uploading}>
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Requirement Modal */}
      {rejectReq && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setRejectReq(null)}>
          <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#b91c1c' }}>
                Reject Requirement
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setRejectReq(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.82rem', color: 'var(--status-grey)', margin: '0 0 12px' }}>
                  Please enter the rejection reason for <strong>{rejectReq.requirement_type.label}</strong>.
                </p>
                <div className="form-group">
                  <label className="form-label">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="e.g. Document copy is illegible or missing back page..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setRejectReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={!rejectReason.trim()}>
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waive Requirement Modal (Super Admin only) */}
      {waiveReq && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setWaiveReq(null)}>
          <div className="modal" style={{ width: 460, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#7c3aed' }}>
                Waive Requirement (Super Admin Override)
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setWaiveReq(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleWaiveSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.82rem', color: 'var(--status-grey)', margin: '0 0 12px' }}>
                  A formal waiver bypasses this gate requirement for <strong>{waiveReq.requirement_type.label}</strong>. A documented business reason is required.
                </p>
                <div className="form-group">
                  <label className="form-label">Waiver Reason *</label>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="e.g. Fresh graduate trainee with exceptional university transcript..."
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setWaiveReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }} disabled={!waiveReason.trim()}>
                  Confirm Waiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Assessment Modal */}
      {assessmentReq && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAssessmentReq(null)}>
          <div className="modal" style={{ width: 500, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                Record Assessment: {assessmentReq.requirement_type.label}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setAssessmentReq(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAssessmentSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Course / Assessment Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={assessmentForm.course_name}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, course_name: e.target.value })}
                    placeholder="e.g. Clinical Nursing Induction Course"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Result</label>
                    <select
                      className="form-select"
                      value={assessmentForm.exam_result}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, exam_result: e.target.value })}
                    >
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Score (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={assessmentForm.score}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, score: e.target.value })}
                      placeholder="85.0"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Exam / Assessment Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={assessmentForm.exam_date}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, exam_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assessor Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={assessmentForm.assessor}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, assessor: e.target.value })}
                      placeholder="Senior Nurse Lead"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes & Observations</label>
                  <textarea
                    rows={2}
                    className="form-input"
                    value={assessmentForm.notes}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAssessmentReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Feedback Modal */}
      {feedbackReq && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setFeedbackReq(null)}>
          <div className="modal" style={{ width: 460, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                Record Feedback: {feedbackReq.requirement_type.label}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setFeedbackReq(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleFeedbackSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <select
                    className="form-select"
                    value={feedbackForm.source}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, source: e.target.value })}
                  >
                    <option value="management">Management Feedback</option>
                    <option value="patient_family">Patient / Family Feedback</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rating (1 to 5 Stars)</label>
                  <select
                    className="form-select"
                    value={feedbackForm.rating}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: parseInt(e.target.value, 10) })}
                  >
                    <option value={5}>★★★★★ (5 - Excellent)</option>
                    <option value={4}>★★★★☆ (4 - Good)</option>
                    <option value={3}>★★★☆☆ (3 - Satisfactory)</option>
                    <option value={2}>★★☆☆☆ (2 - Needs Improvement)</option>
                    <option value={1}>★☆☆☆☆ (1 - Unsatisfactory)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Comments & Feedback *</label>
                  <textarea
                    rows={3}
                    className="form-input"
                    value={feedbackForm.comment}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, comment: e.target.value })}
                    placeholder="Enter detailed evaluation notes..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setFeedbackReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!feedbackForm.comment.trim()}>
                  Save Feedback
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance Stage Modal */}
      {advanceModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAdvanceModal(false)}>
          <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                Advance to {currentStage === 'trainee' ? 'Probation' : 'Active Employee'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setAdvanceModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.82rem', color: 'var(--status-grey)', margin: '0 0 12px' }}>
                All required verification items for this gate have been satisfied. Advancing will update permissions and system access.
              </p>
              <div className="form-group">
                <label className="form-label">Decision Note (Optional)</label>
                <textarea
                  rows={2}
                  className="form-input"
                  placeholder="e.g. All trainee documents verified, advancing to clinical probation..."
                  value={advanceNote}
                  onChange={(e) => setAdvanceNote(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setAdvanceModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAdvanceSubmit}>
                Confirm Advancement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Stage Modal */}
      {returnModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setReturnModal(false)}>
          <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#b91c1c' }}>
                Return to Previous Stage
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setReturnModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.82rem', color: 'var(--status-grey)', margin: '0 0 12px' }}>
                  Returning stage will re-apply previous restrictions. A written reason is mandatory.
                </p>
                <div className="form-group">
                  <label className="form-label">Return Reason *</label>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="Enter reason for returning stage..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setReturnModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={!returnReason.trim()}>
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Activation Code Slip Modal */}
      {newCodeData && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setNewCodeData(null)}>
          <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--teal-900)' }}>
                New Activation Code Generated
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setNewCodeData(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '2px dashed var(--teal-600)',
                  padding: '16px',
                  borderRadius: 8,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  One-Time Activation Code
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.8rem',
                    fontWeight: 900,
                    letterSpacing: '4px',
                    color: 'var(--teal-800)',
                    margin: '8px 0',
                  }}
                >
                  {newCodeData.activation_code}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Expires: {new Date(newCodeData.activation_expires_at).toLocaleDateString()}
                </div>
              </div>
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  color: '#92400e',
                  textAlign: 'left',
                }}
              >
                ⚠️ <strong>Important:</strong> This activation code is displayed only once. Please write down or print this slip now.
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.print()}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Printer size={14} /> Print Slip
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setNewCodeData(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
