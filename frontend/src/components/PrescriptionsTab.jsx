import React, { useState, useEffect } from 'react';
import {
  Pill, Plus, FileText, Download, Eye, Trash2, Calendar,
  Clock, AlertCircle, CheckCircle, Upload, X, ExternalLink, Check, Ban
} from 'lucide-react';
import api from '../services/api';
import useStore from '../store/useStore';

export default function PrescriptionsTab({ patient }) {
  const currentRole = useStore((s) => s.currentRole);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Action Modals State (Verify, Reject, Discontinue, Cancel)
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalRx, setRejectModalRx] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [discontinueModalRx, setDiscontinueModalRx] = useState(null);
  const [discontinueReason, setDiscontinueReason] = useState('');
  const [cancelModalRx, setCancelModalRx] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // Preview Modal
  const [previewFile, setPreviewFile] = useState(null);

  // Form State
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Twice daily');
  const [durationDays, setDurationDays] = useState('7');
  const [route, setRoute] = useState('Oral');
  const [prescribedBy, setPrescribedBy] = useState('Dr. Asim Raza (Consultant)');
  const [orderingDoctorName, setOrderingDoctorName] = useState('');
  const [orderSource, setOrderSource] = useState('written');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);

  // RBAC permissions
  const isDoctor = currentRole === 'doctor';
  const isNurse = ['nurse', 'nursing_assistant'].includes(currentRole);
  const canAdd = isDoctor || isNurse;
  // Physical deletion is removed; old UI button hidden
  const canDelete = false;

  const fetchPrescriptions = async () => {
    if (!patient?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/patients/${patient.id}/prescriptions/`);
      setPrescriptions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[PrescriptionsTab] Error fetching prescriptions:', err);
      setError('Unable to load prescriptions for this patient.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, [patient?.id]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!drugName.trim()) {
      setFormError('Drug name is required.');
      return;
    }
    if (isNurse && !orderingDoctorName.trim() && !prescribedBy.trim()) {
      setFormError('Ordering doctor name is required for transcribed orders.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append('drug_name', drugName.trim());
      formData.append('dosage', dosage.trim() || 'Standard');
      formData.append('frequency', frequency);
      formData.append('route', route);
      formData.append('days_prescribed', durationDays || '7');
      formData.append('start_date', startDate);
      formData.append('notes', notes.trim());

      if (isNurse) {
        formData.append('ordering_doctor_name', orderingDoctorName.trim() || prescribedBy.trim());
        formData.append('order_source', orderSource);
        formData.append('prescribed_by', orderingDoctorName.trim() || prescribedBy.trim());
      } else {
        formData.append('prescribed_by', prescribedBy.trim() || 'Attending Physician');
        formData.append('order_source', 'written');
      }

      if (file) {
        formData.append('prescription_file', file);
      }

      await api.post(`/api/patients/${patient.id}/prescriptions/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Reset form & close modal
      setDrugName('');
      setDosage('');
      setNotes('');
      setFile(null);
      setOrderingDoctorName('');
      setShowAddModal(false);
      await fetchPrescriptions();
    } catch (err) {
      console.error('[PrescriptionsTab] Error adding prescription:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || JSON.stringify(err.response?.data) || err.message;
      setFormError(`Failed to save prescription: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (rx) => {
    if (!window.confirm(`Verify and digitally sign prescription for ${rx.medication || rx.drug_name}? This action confirms physician authorization and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await api.post(`/api/patients/${patient.id}/prescriptions/${rx.id}/verify/`);
      await fetchPrescriptions();
    } catch (err) {
      alert('Verification failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/api/patients/${patient.id}/prescriptions/${rejectModalRx.id}/reject/`, {
        reason: rejectReason.trim()
      });
      setRejectModalRx(null);
      setRejectReason('');
      await fetchPrescriptions();
    } catch (err) {
      alert('Rejection failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscontinueSubmit = async (e) => {
    e.preventDefault();
    if (!discontinueReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/api/patients/${patient.id}/prescriptions/${discontinueModalRx.id}/discontinue/`, {
        reason: discontinueReason.trim()
      });
      setDiscontinueModalRx(null);
      setDiscontinueReason('');
      await fetchPrescriptions();
    } catch (err) {
      alert('Discontinuation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/api/patients/${patient.id}/prescriptions/${cancelModalRx.id}/cancel/`, {
        reason: cancelReason.trim()
      });
      setCancelModalRx(null);
      setCancelReason('');
      await fetchPrescriptions();
    } catch (err) {
      alert('Cancellation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (rxId) => {
    if (!window.confirm('Are you sure you want to delete this prescription record?')) return;
    try {
      await api.delete(`/api/patients/${patient.id}/prescriptions/${rxId}/`);
      setPrescriptions(prescriptions.filter((p) => p.id !== rxId));
    } catch (err) {
      alert('Error deleting prescription: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill size={22} style={{ color: 'var(--teal-600)' }} /> Prescriptions & Medication Orders
          </h3>
          <p style={{ color: 'var(--status-grey)', fontSize: '0.85rem', margin: 0 }}>
            Active prescriptions, transcribed doctor orders, and MAR medication schedules for {patient.full_name}.
          </p>
        </div>

        {canAdd && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> {isDoctor ? '+ New Prescription' : isNurse ? "+ Enter doctor's order" : '+ Add Prescription'}
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--status-grey)' }}>
          Loading prescription records...
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 14, borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Prescriptions Table */}
      {!loading && prescriptions.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--sage-50)', borderRadius: 12 }}>
          <Pill size={36} style={{ color: 'var(--teal-400)', marginBottom: 12, opacity: 0.6 }} />
          <h4 style={{ margin: '0 0 6px', color: 'var(--teal-800)' }}>No Prescriptions Found</h4>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--status-grey)' }}>
            There are currently no active or historical prescriptions on file for this patient.
          </p>
          {canAdd && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)} style={{ marginTop: 14 }}>
              {isDoctor ? '+ Prescribe Medication' : "+ Enter Doctor's Order"}
            </button>
          )}
        </div>
      )}

      {!loading && prescriptions.length > 0 && (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medication / Drug</th>
                <th>Dosage & Route</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Prescribed / Transcribed By</th>
                <th>Start Date</th>
                <th>Verification & Status</th>
                <th>Document / Photo</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((rx) => {
                const docUrl = rx.file_url || rx.document || rx.prescription_file;
                const isImage = docUrl && (docUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) || docUrl.includes('report_photos'));

                return (
                  <tr key={rx.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                        {rx.medication || rx.drug_name}
                      </div>
                      {rx.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 2 }}>
                          {rx.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{rx.dosage}</span>
                      {rx.route && <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>({rx.route})</span>}
                    </td>
                    <td>{rx.frequency}</td>
                    <td>
                      {rx.duration_days || rx.days_prescribed ? `${rx.duration_days || rx.days_prescribed} days` : 'Ongoing'}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rx.prescribed_by || 'Physician'}</div>
                      {rx.ordering_doctor_name && rx.entry_mode === 'transcribed' && (
                        <div style={{ fontSize: '0.74rem', color: '#4B5563' }}>
                          Ordering Doctor: <strong>{rx.ordering_doctor_name}</strong> ({rx.order_source === 'phone_order' ? 'Phone Order' : 'Written'})
                        </div>
                      )}
                      {rx.entered_by_name && rx.entry_mode === 'transcribed' && (
                        <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Recorded by: {rx.entered_by_name}</div>
                      )}
                    </td>
                    <td className="ts">{rx.date || rx.start_date}</td>
                    <td>
                      {rx.verification_status === 'verified' && (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Check size={12} /> Verified {rx.verified_by_name ? `by Dr. ${rx.verified_by_name}` : ''}
                        </span>
                      )}
                      {rx.verification_status === 'pending_verification' && (
                        <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                          ⏳ Pending Doctor Verification
                        </span>
                      )}
                      {rx.verification_status === 'rejected' && (
                        <span className="badge badge-red" title={rx.status_reason}>
                          ✗ Rejected {rx.status_reason ? `(${rx.status_reason})` : ''}
                        </span>
                      )}
                      {rx.verification_status === 'discontinued' && (
                        <span className="badge" style={{ background: '#E2E8F0', color: '#475569' }}>
                          Discontinued {rx.status_reason ? `(${rx.status_reason})` : ''}
                        </span>
                      )}
                      {rx.verification_status === 'cancelled' && (
                        <span className="badge badge-grey">
                          Cancelled {rx.status_reason ? `(${rx.status_reason})` : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      {docUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => setPreviewFile({ url: docUrl, name: rx.medication || 'Prescription', isImage })}
                            title="View Document"
                          >
                            <Eye size={14} /> View
                          </button>
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Download File"
                          >
                            <Download size={14} />
                          </a>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No file attached</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {isDoctor && rx.verification_status === 'pending_verification' && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#16A34A', border: 'none' }}
                              onClick={() => handleVerify(rx)}
                              disabled={actionLoading}
                              title="Verify Order"
                            >
                              Verify
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#DC2626' }}
                              onClick={() => { setRejectModalRx(rx); setRejectReason(''); }}
                              disabled={actionLoading}
                              title="Reject Order"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {isDoctor && rx.verification_status === 'verified' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#64748B' }}
                            onClick={() => { setDiscontinueModalRx(rx); setDiscontinueReason(''); }}
                            disabled={actionLoading}
                            title="Discontinue Order"
                          >
                            Discontinue
                          </button>
                        )}
                        {isNurse && rx.verification_status === 'pending_verification' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#DC2626' }}
                            onClick={() => { setCancelModalRx(rx); setCancelReason(''); }}
                            disabled={actionLoading}
                            title="Cancel Order"
                          >
                            Cancel
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--status-red)', padding: '4px 6px' }}
                            onClick={() => handleDelete(rx.id)}
                            title="Delete Prescription"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Prescription Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill size={18} style={{ color: 'var(--teal-600)' }} />
                {isDoctor ? 'New Doctor Prescription & Order' : "Transcribe Doctor's Prescription Order"}
              </h3>
              <button className="btn-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {formError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 10, borderRadius: 6, color: '#991b1b', fontSize: '0.85rem' }}>
                    {formError}
                  </div>
                )}

                {isNurse && (
                  <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: '0.82rem', color: '#92400E' }}>
                    <strong>Transcribed Order Notice:</strong> Nurse enters written or phone order. A treating doctor must review and verify before standard administration.
                  </div>
                )}

                {isNurse && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Ordering Doctor Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Dr. Tariq Alam"
                        value={orderingDoctorName}
                        onChange={(e) => setOrderingDoctorName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Order Source *</label>
                      <select
                        className="form-input"
                        value={orderSource}
                        onChange={(e) => setOrderSource(e.target.value)}
                      >
                        <option value="written">Written Prescription Slip</option>
                        <option value="phone_order">Phone / Verbal Order</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Drug / Medicine Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Augmentin 625mg / Metformin / Insulin"
                    value={drugName}
                    onChange={(e) => setDrugName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Dosage</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 500mg, 1 tablet, 10 units"
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Route</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Oral, IV, IM, SC, Topical"
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Frequency</label>
                    <select
                      className="form-input"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    >
                      <option value="Once daily">Once daily (OD)</option>
                      <option value="Twice daily">Twice daily (BD)</option>
                      <option value="Three times daily">Three times daily (TDS)</option>
                      <option value="Four times daily">Four times daily (QDS)</option>
                      <option value="Every 8 hours">Every 8 hours</option>
                      <option value="Every 12 hours">Every 12 hours</option>
                      <option value="At bedtime">At bedtime (HS)</option>
                      <option value="As needed (PRN)">As needed (PRN)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration (Days)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      placeholder="7"
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isDoctor ? '1fr 1fr' : '1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  {isDoctor && (
                    <div className="form-group">
                      <label className="form-label">Prescribing Physician</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Doctor name"
                        value={prescribedBy}
                        onChange={(e) => setPrescribedBy(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Special Clinical Instructions / Notes</label>
                  <textarea
                    className="form-input"
                    rows="2"
                    placeholder="e.g. Take after meals with full glass of water. Monitor blood pressure."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Prescription Document / Photo (PDF or Image)
                  </label>
                  <input
                    type="file"
                    className="form-input"
                    accept="image/*,application/pdf"
                    onChange={(e) => setFile(e.target.files[0] || null)}
                  />
                  <small style={{ color: 'var(--status-grey)', display: 'block', marginTop: 4 }}>
                    Attach scanned prescription, paper slip photograph, or hospital discharge Rx.
                  </small>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : (isNurse ? "Submit Transcribed Order" : "Save Prescription")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectModalRx && (
        <div className="modal-backdrop" onClick={() => setRejectModalRx(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#DC2626' }}>Reject Prescription Order</h3>
              <button className="btn-close" onClick={() => setRejectModalRx(null)}>✕</button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>
                  Please state the clinical reason for rejecting this order for <strong>{rejectModalRx.medication}</strong>:
                </p>
                <textarea
                  className="form-input"
                  rows="3"
                  placeholder="e.g. Inappropriate dosage, drug interaction with current care plan, duplicate order..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRejectModalRx(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#DC2626', border: 'none' }} disabled={actionLoading}>
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discontinue Order Modal */}
      {discontinueModalRx && (
        <div className="modal-backdrop" onClick={() => setDiscontinueModalRx(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#475569' }}>Discontinue Medication</h3>
              <button className="btn-close" onClick={() => setDiscontinueModalRx(null)}>✕</button>
            </div>
            <form onSubmit={handleDiscontinueSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>
                  State the clinical reason for discontinuing <strong>{discontinueModalRx.medication}</strong>:
                </p>
                <textarea
                  className="form-input"
                  rows="3"
                  placeholder="e.g. Course completed, symptoms resolved, adverse side effect..."
                  value={discontinueReason}
                  onChange={(e) => setDiscontinueReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDiscontinueModalRx(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#475569', border: 'none' }} disabled={actionLoading}>
                  Confirm Discontinuation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Pending Order Modal */}
      {cancelModalRx && (
        <div className="modal-backdrop" onClick={() => setCancelModalRx(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#DC2626' }}>Cancel Transcribed Order</h3>
              <button className="btn-close" onClick={() => setCancelModalRx(null)}>✕</button>
            </div>
            <form onSubmit={handleCancelSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>
                  State the reason for cancelling this pending transcribed order for <strong>{cancelModalRx.medication}</strong>:
                </p>
                <textarea
                  className="form-input"
                  rows="3"
                  placeholder="e.g. Entered in error, patient refused order, corrected on subsequent slip..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCancelModalRx(null)}>Back</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#DC2626', border: 'none' }} disabled={actionLoading}>
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="modal-backdrop" onClick={() => setPreviewFile(null)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} /> {previewFile.name} — Prescription Document
              </h3>
              <button className="btn-close" onClick={() => setPreviewFile(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: 20 }}>
              {previewFile.isImage ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
              ) : (
                <div style={{ padding: 40, background: '#f8fafc', borderRadius: 8 }}>
                  <FileText size={48} style={{ color: 'var(--teal-600)', marginBottom: 12 }} />
                  <p style={{ margin: '0 0 16px', fontWeight: 600 }}>PDF Document Attached</p>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={16} /> Open Document in New Tab
                  </a>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <a
                href={previewFile.url}
                download
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={15} /> Download Copy
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewFile(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="modal-backdrop" onClick={() => setPreviewFile(null)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} /> {previewFile.name} — Prescription Document
              </h3>
              <button className="btn-close" onClick={() => setPreviewFile(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: 20 }}>
              {previewFile.isImage ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
              ) : (
                <div style={{ padding: 40, background: '#f8fafc', borderRadius: 8 }}>
                  <FileText size={48} style={{ color: 'var(--teal-600)', marginBottom: 12 }} />
                  <p style={{ margin: '0 0 16px', fontWeight: 600 }}>PDF Document Attached</p>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={16} /> Open Document in New Tab
                  </a>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <a
                href={previewFile.url}
                download
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={15} /> Download Copy
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewFile(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
