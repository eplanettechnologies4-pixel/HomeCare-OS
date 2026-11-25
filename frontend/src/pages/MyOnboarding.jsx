import React, { useState, useEffect } from 'react';
import {
  FileText, Upload, CheckCircle, Clock, AlertCircle, Shield,
  RefreshCw, Check, AlertTriangle, Eye, ShieldCheck, User, X
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import { getStageBadge } from '../utils/staffLifecycleHelpers';

export default function MyOnboarding() {
  const currentUser = useStore((s) => s.currentUser);
  const staffId = currentUser?.staff_id;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Upload modal state
  const [uploadReq, setUploadReq] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchMyOnboarding = async () => {
    if (!staffId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/staff/members/${staffId}/onboarding/`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || 'Failed to load onboarding checklist.');
      }
    } catch (err) {
      setError(err.message || 'Error connecting to onboarding service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyOnboarding();
  }, [staffId]);

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
        await fetchMyOnboarding();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Upload failed.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const stageBadge = getStageBadge(data?.staff?.lifecycle_stage || 'trainee');
  const progress = data?.progress?.trainee_to_probation || { total: 9, completed: 0, percentage: 0 };
  const traineeReqs = (data?.requirements || []).filter(
    (r) => r.requirement_type.gate === 'trainee_to_probation'
  );

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 40, fontFamily: 'var(--font-body)' }}>
      {/* Top Banner */}
      <div
        className="card"
        style={{
          padding: 24,
          marginBottom: 20,
          background: 'linear-gradient(135deg, var(--teal-900) 0%, var(--teal-800) 100%)',
          color: '#ffffff',
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Welcome, {currentUser?.full_name || currentUser?.name || 'Staff Member'}
              </h1>
              <span
                className={`badge ${stageBadge.className}`}
                style={{ fontSize: '0.75rem', padding: '3px 10px', fontWeight: 800 }}
              >
                {stageBadge.label}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
              Employee ID: <strong>{data?.staff?.employee_id || currentUser?.employee_id}</strong> • Complete your onboarding document submissions to advance to Probation.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fetchMyOnboarding}
            style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.1)', padding: 14, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
            <span>Trainee Document Verification Progress</span>
            <span style={{ fontWeight: 800 }}>{progress.completed} of {progress.total} Verified</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: '#10b981',
                width: `${progress.percentage}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Stepper overview */}
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <div style={{ padding: 10, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>1. Trainee Stage</div>
          <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginTop: 2 }}>Current Stage (Document Verification)</div>
        </div>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', opacity: 0.7 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b' }}>2. Probation Stage</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Training, Exam & Competency</div>
        </div>
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', opacity: 0.7 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b' }}>3. Active Employee</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Full Clinical & Duty Authorization</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 20, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          <AlertCircle size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Checklist Section */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 14 }}>
        Required Onboarding Documents
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {traineeReqs.map((req) => {
          const isVerified = req.status === 'verified';
          const isWaived = req.status === 'waived';
          const isRejected = req.status === 'rejected';
          const isSubmitted = req.status === 'submitted';
          const isPending = req.status === 'pending';

          const isSensitive = req.requirement_type.code === 'blood_tests' || req.requirement_type.code === 'police_verification';
          const reqCount = req.requirement_type.required_count || 1;
          const docsCount = (req.documents || []).length;
          const needsUpload = !isVerified && !isWaived && docsCount < reqCount;

          return (
            <div
              key={req.id}
              className="card"
              style={{
                padding: 16,
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{req.requirement_type.label}</span>
                    {isSensitive && (
                      <span className="badge badge-amber" style={{ fontSize: '0.62rem', padding: '1px 6px' }}>
                        🔒 Confidential
                      </span>
                    )}
                    {reqCount > 1 && (
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        ({docsCount}/{reqCount} uploaded)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                    {req.requirement_type.code === 'experience_letter'
                      ? 'Experience certificate (Fresh graduates may request a waiver from Super Admin)'
                      : req.requirement_type.code === 'guardian_id'
                      ? 'National ID card copies of two family guardians'
                      : req.requirement_type.code === 'police_verification'
                      ? 'Character / Police clearance certificate'
                      : req.requirement_type.code === 'blood_tests'
                      ? 'Required clinical blood screening report'
                      : 'Mandatory documentation for clinical employee registration'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}
                  >
                    {req.status}
                  </span>

                  {needsUpload && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setUploadReq(req)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
                    >
                      <Upload size={13} /> Upload File
                    </button>
                  )}
                </div>
              </div>

              {/* Rejection / Waiver notes */}
              {isRejected && req.rejection_reason && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#fef2f2',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    color: '#991b1b',
                  }}
                >
                  <strong>⚠️ Document Rejected:</strong> {req.rejection_reason} Please upload a corrected copy.
                </div>
              )}

              {isWaived && req.waiver_reason && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#f5f3ff',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    color: '#6d28d9',
                  }}
                >
                  <strong>Requirement Waived:</strong> {req.waiver_reason}
                </div>
              )}

              {/* Uploaded Documents List */}
              {(req.documents || []).length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {req.documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        background: '#f8fafc',
                        borderRadius: 4,
                        fontSize: '0.8rem',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <FileText size={15} color="var(--teal-700)" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.original_filename}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
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
                          <Eye size={12} /> View File
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
                  Accepted file formats: PDF, JPEG, PNG (Max 10MB). Stored securely.
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
                    <label className="form-label">Document Expiry Date</label>
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
    </div>
  );
}
