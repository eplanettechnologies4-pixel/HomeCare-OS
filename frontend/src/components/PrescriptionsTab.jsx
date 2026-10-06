import React, { useState, useEffect } from 'react';
import {
  Pill, Plus, FileText, Download, Eye, Trash2, Calendar,
  Clock, AlertCircle, CheckCircle, Upload, X, ExternalLink
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

  // Preview Modal
  const [previewFile, setPreviewFile] = useState(null);

  // Form State
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Twice daily');
  const [durationDays, setDurationDays] = useState('7');
  const [prescribedBy, setPrescribedBy] = useState('Dr. Asim Raza (Consultant)');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);

  // RBAC permissions
  const canAdd = ['super_admin', 'admin', 'branch_manager', 'doctor', 'nurse', 'care_manager'].includes(currentRole);
  const canDelete = ['super_admin', 'admin', 'branch_manager'].includes(currentRole);

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

    setSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append('drug_name', drugName.trim());
      formData.append('dosage', dosage.trim() || 'Standard');
      formData.append('frequency', frequency);
      formData.append('days_prescribed', durationDays || '7');
      formData.append('prescribed_by', prescribedBy.trim() || 'Attending Physician');
      formData.append('start_date', startDate);
      formData.append('notes', notes.trim());

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
            Active prescriptions, medical orders, and uploaded prescription documents for {patient.full_name}.
          </p>
        </div>

        {canAdd && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> + Add Prescription
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
              + Upload First Prescription
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
                <th>Prescribed By</th>
                <th>Start Date</th>
                <th>Document / Photo</th>
                <th>Status</th>
                {canDelete && <th style={{ textAlign: 'right' }}>Action</th>}
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
                      <div style={{ fontSize: '0.85rem' }}>{rx.prescribed_by || 'Physician'}</div>
                      {rx.uploaded_by_name && (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Uploaded: {rx.uploaded_by_name}</div>
                      )}
                    </td>
                    <td className="ts">{rx.date || rx.start_date}</td>
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
                    <td>
                      <span className={`badge ${rx.is_active !== false ? 'badge-green' : 'badge-grey'}`}>
                        {rx.is_active !== false ? 'Active' : 'Completed'}
                      </span>
                    </td>
                    {canDelete && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--status-red)', padding: '4px 6px' }}
                          onClick={() => handleDelete(rx.id)}
                          title="Delete Prescription"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
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
                <Pill size={18} style={{ color: 'var(--teal-600)' }} /> Add Prescription & Medicine Order
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Prescribing Doctor / Consultant</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Doctor name"
                    value={prescribedBy}
                    onChange={(e) => setPrescribedBy(e.target.value)}
                  />
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
                  {submitting ? 'Saving...' : 'Save Prescription'}
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
    </div>
  );
}
