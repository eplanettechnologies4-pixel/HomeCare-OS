import React, { useState, useEffect } from 'react';
import { Plus, Megaphone, BookOpen, GraduationCap, DollarSign, Send, CheckCircle, Clock, FileText, Download, Trash2, Upload, AlertCircle, X, Check } from 'lucide-react';
import useStore from '../store/useStore';
import { ANNOUNCEMENTS, SALARY_DATA } from '../data/mockData';
import { format, formatDistanceToNow } from 'date-fns';
import { apiFetch, getAuthToken, API_BASE } from '../services/api';

const PRIORITY_BADGE = { high: 'badge-red', normal: 'badge-teal' };
const TRAINING = [
  { name: 'Basic Life Support (BLS) Refresher',   assigned: 8, completed: 5, due: '2026-09-05', mandatory: true },
  { name: 'Dementia Care Best Practices',          assigned: 4, completed: 4, due: '2026-08-31', mandatory: false },
  { name: 'Infection Prevention & Control',        assigned: 8, completed: 8, due: '2026-08-20', mandatory: true },
  { name: 'Patient Communication Skills',          assigned: 6, completed: 3, due: '2026-09-30', mandatory: false },
];

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'mp4'];
const MAX_SIZES_MB = {
  pdf: 50,
  docx: 50,
  jpg: 20,
  jpeg: 20,
  png: 20,
  mp4: 200,
};

export default function AdminHR() {
  const blogPosts = useStore((s) => s.blogPosts);
  const staffList = useStore((s) => s.staff);
  const patientsList = useStore((s) => s.patients);
  const [tab, setTab] = useState('announcements');
  const [newAnn, setNewAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title: '', content: '', priority: 'normal' });

  // ── Document Library State ──
  const [documents, setDocuments] = useState([]);
  const [docLoading, setDocLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [docToast, setDocToast] = useState('');
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: 'clinical',
    owner_type: 'none',
    staff: '',
    patient: '',
    course: '',
    expiry_date: '',
    file: null,
  });

  const showToast = (msg) => {
    setDocToast(msg);
    setTimeout(() => setDocToast(''), 4000);
  };

  const fetchDocuments = async () => {
    setDocLoading(true);
    try {
      const res = await apiFetch('/documents/');
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (err) {
      console.warn('Failed to fetch documents:', err);
    } finally {
      setDocLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'docs') {
      fetchDocuments();
    }
  }, [tab]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Unsupported file format (.${ext}). Allowed formats are PDF, JPG, PNG, DOCX, and MP4.`);
      e.target.value = '';
      return;
    }

    const maxMb = MAX_SIZES_MB[ext] || 50;
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of ${maxMb} MB for .${ext} files.`);
      e.target.value = '';
      return;
    }

    setUploadError('');
    setUploadForm(prev => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
    }));
  };

  const handleUploadSubmit = (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setUploadError('Please select a file to upload.');
      return;
    }
    if (!uploadForm.title.trim()) {
      setUploadError('Please provide a document title.');
      return;
    }

    setUploadError('');
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', uploadForm.file);
    formData.append('title', uploadForm.title.trim());
    formData.append('category', uploadForm.category);
    formData.append('owner_type', uploadForm.owner_type);
    if (uploadForm.owner_type === 'staff' && uploadForm.staff) formData.append('staff', uploadForm.staff);
    if (uploadForm.owner_type === 'patient' && uploadForm.patient) formData.append('patient', uploadForm.patient);
    if (uploadForm.owner_type === 'course' && uploadForm.course) formData.append('course', uploadForm.course);
    if (uploadForm.expiry_date) formData.append('expiry_date', uploadForm.expiry_date);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/documents/`);
    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setShowUploadModal(false);
        setUploadForm({
          title: '',
          category: 'clinical',
          owner_type: 'none',
          staff: '',
          patient: '',
          course: '',
          expiry_date: '',
          file: null,
        });
        showToast('Document uploaded successfully!');
        fetchDocuments();
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          const firstErr = Object.values(errData)[0];
          const msg = Array.isArray(firstErr) ? firstErr[0] : (typeof firstErr === 'string' ? firstErr : 'Upload failed. Please check file and permissions.');
          setUploadError(msg);
        } catch {
          setUploadError(`Upload failed with status code ${xhr.status}.`);
        }
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setUploadError('Network connection error occurred during document upload.');
    };

    xhr.send(formData);
  };

  const handleDownload = async (doc) => {
    try {
      const res = await apiFetch(`/documents/${doc.id}/download/`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.title || 'document';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download document. Please check permissions.');
      }
    } catch (e) {
      alert('Error downloading document.');
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      const res = await apiFetch(`/documents/${docId}/`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        showToast('Document deleted.');
        fetchDocuments();
      }
    } catch {
      alert('Failed to delete document.');
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Admin / HR</h1>
          <p className="page-subtitle">Announcements, documentation, training, and payroll</p>
        </div>
      </div>

      {docToast && (
        <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} /> {docToast}
        </div>
      )}

      <div className="tabs-bar">
        {[
          { id: 'announcements', label: 'Announcements',  icon: Megaphone },
          { id: 'docs',          label: 'Documentation',  icon: BookOpen },
          { id: 'training',      label: 'Training',       icon: GraduationCap },
          { id: 'salaries',      label: 'Salaries',       icon: DollarSign },
          { id: 'content',       label: 'Public Content / CMS', icon: FileText },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-item${tab===id?' active':''}`}
            onClick={() => setTab(id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Documentation Library ──────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Documentation Library</h3>
              <p className="ts">Compliant repository for clinical protocols, staff credentials, patient charts & SOPs</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => { setUploadError(''); setShowUploadModal(true); }}>
              <Plus size={13} /> Upload Document
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Document Title</th>
                <th>Category</th>
                <th>Owner Linkage</th>
                <th>Uploaded By</th>
                <th>Uploaded Date</th>
                <th>Expiry</th>
                <th>Size</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--status-grey)' }}>
                    {docLoading ? 'Loading documents...' : 'No documents uploaded yet. Click Upload Document above.'}
                  </td>
                </tr>
              ) : (
                documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, background: 'var(--sage-100)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase' }}>
                          {d.file_extension || 'FILE'}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--teal-900)' }}>{d.title}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-teal" style={{ fontSize: '0.68rem', textTransform: 'capitalize' }}>
                        {d.category_display || d.category}
                      </span>
                    </td>
                    <td>
                      <span className="ts" style={{ fontWeight: 600 }}>
                        {d.owner_display || 'General'}
                      </span>
                    </td>
                    <td className="ts">{d.uploaded_by_name || 'Admin'}</td>
                    <td className="ts">{d.uploaded_at ? d.uploaded_at.split('T')[0] : '—'}</td>
                    <td className="ts">
                      {d.expiry_date ? (
                        <span style={{ color: new Date(d.expiry_date) < new Date() ? 'var(--status-red)' : 'inherit' }}>
                          {d.expiry_date}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="ts">{d.file_size_formatted || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(d)} title="Download with JWT">
                          <Download size={13} /> Download
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)' }} onClick={() => handleDeleteDoc(d.id)} title="Delete Document">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ── Upload Modal ──────────────────────────────────────────────── */}
          {showUploadModal && (
            <div className="drawer-backdrop" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="card" style={{ width: 520, maxWidth: '92vw', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)', margin: 0 }}>
                    Upload New Document
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => !isUploading && setShowUploadModal(false)}>
                    <X size={16} />
                  </button>
                </div>

                {uploadError && (
                  <div className="alert alert-danger" style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: '0.85rem' }}>{uploadError}</span>
                  </div>
                )}

                <form onSubmit={handleUploadSubmit}>
                  <div className="form-group">
                    <label className="form-label">Document Title *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Wound Care SOP v3.2 or Nursing License"
                      value={uploadForm.title}
                      onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select
                        className="form-select"
                        value={uploadForm.category}
                        onChange={e => setUploadForm({ ...uploadForm, category: e.target.value })}
                      >
                        <option value="clinical">Clinical Protocol</option>
                        <option value="hr">HR & Staff Credential</option>
                        <option value="legal">Legal & Consent</option>
                        <option value="safety">Safety / Emergency</option>
                        <option value="training">Training Material</option>
                        <option value="compliance">Compliance</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Expiry Date (Optional)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={uploadForm.expiry_date}
                        onChange={e => setUploadForm({ ...uploadForm, expiry_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Link to Owner</label>
                      <select
                        className="form-select"
                        value={uploadForm.owner_type}
                        onChange={e => setUploadForm({ ...uploadForm, owner_type: e.target.value })}
                      >
                        <option value="none">General / Unassigned</option>
                        <option value="staff">Staff Member</option>
                        <option value="patient">Patient Chart</option>
                      </select>
                    </div>

                    {uploadForm.owner_type === 'staff' && (
                      <div className="form-group">
                        <label className="form-label">Select Staff</label>
                        <select
                          className="form-select"
                          value={uploadForm.staff}
                          onChange={e => setUploadForm({ ...uploadForm, staff: e.target.value })}
                          required
                        >
                          <option value="">Select staff...</option>
                          {staffList.map(s => (
                            <option key={s.id} value={s.id}>{s.full_name || s.name} ({s.role})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {uploadForm.owner_type === 'patient' && (
                      <div className="form-group">
                        <label className="form-label">Select Patient</label>
                        <select
                          className="form-select"
                          value={uploadForm.patient}
                          onChange={e => setUploadForm({ ...uploadForm, patient: e.target.value })}
                          required
                        >
                          <option value="">Select patient...</option>
                          {patientsList.map(p => (
                            <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ marginTop: 6 }}>
                    <label className="form-label">Select File (PDF, JPG, PNG, DOCX, MP4) *</label>
                    <input
                      type="file"
                      className="form-input"
                      accept=".pdf,.jpg,.jpeg,.png,.docx,.mp4"
                      onChange={handleFileChange}
                      required
                    />
                    <div className="ts" style={{ marginTop: 4 }}>
                      Max limits: PDF/DOCX: 50MB · Images: 20MB · MP4: 200MB
                    </div>
                  </div>

                  {isUploading && (
                    <div style={{ margin: '16px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar" style={{ width: `${uploadProgress}%`, background: 'var(--teal-600)', transition: 'width 0.2s ease' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button type="button" className="btn btn-ghost" disabled={isUploading} onClick={() => setShowUploadModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isUploading}>
                      <Upload size={14} /> {isUploading ? `Uploading (${uploadProgress}%)` : 'Upload File'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Training ───────────────────────────────────────────────────────── */}
      {tab === 'training' && (
        <div>
          {TRAINING.map((t, i) => {
            const pct = Math.round((t.completed/t.assigned)*100);
            return (
              <div key={i} className="card" style={{ padding: 18, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>{t.name}</h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 3 }}>Due: <span className="ts">{t.due}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {t.mandatory && <span className="badge badge-red" style={{ fontSize: '0.68rem' }}>Mandatory</span>}
                    <span className={`badge ${pct===100?'badge-green':'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                      {pct===100?<CheckCircle size={10}/>:<Clock size={10}/>} {t.completed}/{t.assigned} completed
                    </span>
                  </div>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${pct}%`, background: pct===100?'var(--status-green)':'var(--amber-500)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Salaries ───────────────────────────────────────────────────────── */}
      {tab === 'salaries' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Salaries & Payroll — August 2026</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--teal-600)', marginTop: 2 }}>
                ✓ Overtime hours & attendance deductions auto-derived from Staff Attendance System
              </div>
            </div>
            <span className="badge badge-amber">{SALARY_DATA.filter(s=>s.status==='pending').length} pending approval</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Base Salary</th><th>OT Pay</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {SALARY_DATA.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.staff_name}</td>
                  <td className="ts">PKR {s.base_salary.toLocaleString()}</td>
                  <td className="ts">{s.overtime_pay>0?`PKR ${s.overtime_pay.toLocaleString()}`:'—'}</td>
                  <td className="ts" style={{ color: 'var(--status-red)' }}>-PKR {s.deductions.toLocaleString()}</td>
                  <td className="ts" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>PKR {s.net_salary.toLocaleString()}</td>
                  <td><span className={`badge ${s.status==='paid'?'badge-green':'badge-amber'}`} style={{fontSize:'0.68rem'}}>{s.status}</span></td>
                  <td>{s.status==='pending'&&<button className="btn btn-primary btn-sm">Approve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CMS Public Content ─────────────────────────────────────────────── */}
      {tab === 'content' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: 0 }}>Public Website Health Guides CMS</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--status-grey)', margin: '2px 0 0' }}>Publish educational health tips & clinical SOP articles to the public site</p>
            </div>
            <button className="btn btn-primary" onClick={() => alert('New Article CMS Editor Modal opened. Type title, SOP content, author.')}>
              <Plus size={14} /> Publish New Article
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Article Title</th>
                <th>Category</th>
                <th>Author</th>
                <th>Published Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {blogPosts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{p.title}</td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>{p.category}</span></td>
                  <td>{p.author}</td>
                  <td className="ts">{p.date}</td>
                  <td><span className="badge badge-green">Live on Web</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
