import React, { useState, useRef } from 'react';
import {
  X, AlertCircle, Camera, CreditCard, UploadCloud, Trash2, ZoomIn, Check, User, Sparkles
} from 'lucide-react';
import useStore from '../store/useStore';
import RealtimeCameraModal from './RealtimeCameraModal';
import FullHdImageViewerModal from './FullHdImageViewerModal';

const ROLES = [
  { value: 'nurse', label: 'Nurse' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'physio', label: 'Physiotherapist' },
  { value: 'speech', label: 'Speech Therapist' },
  { value: 'psychologist', label: 'Psychologist' },
  { value: 'dietician', label: 'Dietician' },
  { value: 'care_manager', label: 'Care Manager' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'admin', label: 'Admin / Operations' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'crm_executive', label: 'CRM Executive' },
];

const STATUSES = [
  { value: 'available', label: 'Available (On Standby)' },
  { value: 'on_visit', label: 'On Visit (In Field)' },
  { value: 'off_duty', label: 'Off Duty' },
  { value: 'on_leave', label: 'On Leave' },
];

export default function EditStaffModal({ staff, onClose, onUpdated }) {
  const updateStaffMember = useStore((s) => s.updateStaffMember);

  const [form, setForm] = useState({
    full_name: staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || '',
    role: staff.role || 'nurse',
    specialization: staff.specialization || '',
    phone: staff.phone || '',
    email: staff.email || '',
    status: staff.status || 'available',
  });

  // Media files & previews
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(staff.photo || null);

  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState(staff.id_card_front || null);

  const [idBackFile, setIdBackFile] = useState(null);
  const [idBackPreview, setIdBackPreview] = useState(staff.id_card_back || null);

  const [hdViewer, setHdViewer] = useState({ open: false, url: '', title: '', badge: '' });

  // Camera modal state
  const [cameraModal, setCameraModal] = useState({
    isOpen: false,
    mode: 'square',
    title: '',
    targetSide: null,
    targetField: null,
  });

  const photoInputRef = useRef(null);
  const idFrontInputRef = useRef(null);
  const idBackInputRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = (e, setFile, setPreview) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = (setFile, setPreview, inputRef) => {
    setFile(null);
    setPreview(null);
    if (inputRef?.current) inputRef.current.value = '';
  };

  const handleOpenLiveCamera = (mode, targetField, title, side = null) => {
    setCameraModal({
      isOpen: true,
      mode,
      title,
      targetSide: side,
      targetField,
    });
  };

  const handleCameraCapture = ({ file, dataUrl }) => {
    if (cameraModal.targetField === 'photo') {
      setPhotoFile(file);
      setPhotoPreview(dataUrl);
    } else if (cameraModal.targetField === 'id_front') {
      setIdFrontFile(file);
      setIdFrontPreview(dataUrl);
    } else if (cameraModal.targetField === 'id_back') {
      setIdBackFile(file);
      setIdBackPreview(dataUrl);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const nameParts = (form.full_name || '').trim().split(/\s+/);
    const first_name = nameParts[0] || 'Staff';
    const last_name = nameParts.slice(1).join(' ') || '';

    const formData = new FormData();
    formData.append('first_name', first_name);
    formData.append('last_name', last_name);
    formData.append('role', form.role);
    formData.append('specialization', form.specialization);
    formData.append('phone', form.phone);
    formData.append('email', form.email);
    formData.append('status', form.status);

    if (photoFile) {
      formData.append('photo', photoFile);
    }
    if (idFrontFile) {
      formData.append('id_card_front', idFrontFile);
    }
    if (idBackFile) {
      formData.append('id_card_back', idBackFile);
    }

    try {
      await updateStaffMember(staff.id, formData);
      setSaving(false);
      if (onUpdated) {
        onUpdated({
          ...staff,
          first_name,
          last_name,
          full_name: form.full_name,
          role: form.role,
          role_display: ROLES.find(r => r.value === form.role)?.label || form.role,
          specialization: form.specialization,
          phone: form.phone,
          email: form.email,
          status: form.status,
          status_display: STATUSES.find(s => s.value === form.status)?.label || form.status,
          photo: photoPreview,
          id_card_front: idFrontPreview,
          id_card_back: idBackPreview,
        });
      }
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Failed to update staff member.');
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ width: 640, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="modal-header" style={{ background: '#611F8C', color: 'white' }}>
            <div>
              <h3 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-heading)' }}>
                Edit Staff Member
              </h3>
              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                Employee ID: {staff.employee_id || `EMP00${staff.id}`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: 10, borderRadius: 6, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* ── PROFILE PICTURE (SQUARE FULL HD) ── */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(97,31,140,0.04) 0%, rgba(15,118,110,0.05) 100%)',
                  padding: 14,
                  borderRadius: 10,
                  border: '1.5px dashed var(--teal-600)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ fontWeight: 700, margin: 0, color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={15} color="var(--amber-600)" /> Profile Picture (DP) — Square Full HD
                  </label>
                  <span className="badge badge-teal" style={{ fontSize: '0.65rem' }}>1:1 Ratio · Real-Time HD</span>
                </div>

                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      border: '2px solid var(--amber-500)',
                      boxShadow: '0 3px 8px rgba(0,0,0,0.12)',
                      background: '#0f172a',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {photoPreview ? (
                      <>
                        <img
                          src={photoPreview}
                          alt="Profile Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          onClick={() => setHdViewer({ open: true, url: photoPreview, title: `${form.full_name}'s Profile DP`, badge: 'Square Full HD' })}
                          title="View Full HD"
                          style={{
                            position: 'absolute',
                            bottom: 3,
                            right: 3,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#FDE047',
                            border: 'none',
                            borderRadius: 4,
                            padding: 2,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <ZoomIn size={12} />
                        </button>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94a3b8', padding: 4 }}>
                        <User size={30} style={{ opacity: 0.4, margin: '0 auto 2px', color: '#fff' }} />
                        <div style={{ fontSize: '0.58rem' }}>No Photo</div>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      ref={photoInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e, setPhotoFile, setPhotoPreview)}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)', color: '#000', fontWeight: 700, fontSize: '0.76rem', border: 'none' }}
                        onClick={() => handleOpenLiveCamera('square', 'photo', `Live Capture — ${form.full_name} DP`)}
                      >
                        <Camera size={13} /> Real-Time Live Photo
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ background: '#fff', borderColor: 'var(--teal-600)', color: 'var(--teal-800)', fontSize: '0.76rem' }}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <UploadCloud size={13} /> Browse File
                      </button>

                      {photoPreview && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '0.74rem' }}
                          onClick={() => handleClearFile(setPhotoFile, setPhotoPreview, photoInputRef)}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ID CARD FRONT & BACK ── */}
              <div
                style={{
                  background: 'var(--sage-50)',
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid var(--sage-200)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="form-label" style={{ fontWeight: 700, margin: 0, color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={15} color="var(--amber-600)" /> Staff National ID Card (CNIC / ID Card)
                  </label>
                  <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>Front &amp; Back</span>
                </div>

                <div className="grid-2" style={{ gap: 12 }}>
                  {/* Front Side */}
                  <div style={{ background: '#fff', border: idFrontPreview ? '1.5px solid var(--status-green)' : '1px dashed var(--sage-300)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.74rem', fontWeight: 700 }}>
                      <span>Front Side</span>
                      {idFrontPreview && <span style={{ color: 'var(--status-green)', fontSize: '0.65rem' }}>✓ Attached</span>}
                    </div>
                    <div
                      style={{ width: '100%', height: 85, borderRadius: 6, background: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer' }}
                      onClick={() => (idFrontPreview ? setHdViewer({ open: true, url: idFrontPreview, title: 'ID Card — Front Side', badge: 'Full HD 1080p' }) : handleOpenLiveCamera('id_card', 'id_front', 'Live Scan ID Card (Front Side)', 'front'))}
                    >
                      {idFrontPreview ? (
                        <>
                          <img src={idFrontPreview} alt="ID Front" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: '0.6rem' }}>
                            Inspect HD
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Click to scan Front</span>
                      )}
                    </div>
                    <input type="file" ref={idFrontInputRef} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileSelect(e, setIdFrontFile, setIdFrontPreview)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => handleOpenLiveCamera('id_card', 'id_front', 'Scan Front Side', 'front')}>
                        <Camera size={11} /> Live Scan
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => idFrontInputRef.current?.click()}>
                        File
                      </button>
                      {idFrontPreview && (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#dc2626', fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => handleClearFile(setIdFrontFile, setIdFrontPreview, idFrontInputRef)}>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Back Side */}
                  <div style={{ background: '#fff', border: idBackPreview ? '1.5px solid var(--status-green)' : '1px dashed var(--sage-300)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.74rem', fontWeight: 700 }}>
                      <span>Back Side</span>
                      {idBackPreview && <span style={{ color: 'var(--status-green)', fontSize: '0.65rem' }}>✓ Attached</span>}
                    </div>
                    <div
                      style={{ width: '100%', height: 85, borderRadius: 6, background: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer' }}
                      onClick={() => (idBackPreview ? setHdViewer({ open: true, url: idBackPreview, title: 'ID Card — Back Side', badge: 'Full HD 1080p' }) : handleOpenLiveCamera('id_card', 'id_back', 'Live Scan ID Card (Back Side)', 'back'))}
                    >
                      {idBackPreview ? (
                        <>
                          <img src={idBackPreview} alt="ID Back" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: '0.6rem' }}>
                            Inspect HD
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Click to scan Back</span>
                      )}
                    </div>
                    <input type="file" ref={idBackInputRef} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileSelect(e, setIdBackFile, setIdBackPreview)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => handleOpenLiveCamera('id_card', 'id_back', 'Scan Back Side', 'back')}>
                        <Camera size={11} /> Live Scan
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => idBackInputRef.current?.click()}>
                        File
                      </button>
                      {idBackPreview && (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#dc2626', fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => handleClearFile(setIdBackFile, setIdBackPreview, idBackInputRef)}>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Role / Designation</label>
                  <select
                    className="form-select"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Duty Status</label>
                  <select
                    className="form-select"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Clinical Specialization</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Critical Care, Wound Care, Cardiology"
                  value={form.specialization}
                  onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                />
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--sage-200)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ background: '#611F8C' }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── REAL-TIME FULL HD CAMERA MODAL ── */}
      <RealtimeCameraModal
        isOpen={cameraModal.isOpen}
        onClose={() => setCameraModal({ ...cameraModal, isOpen: false })}
        onCapture={handleCameraCapture}
        mode={cameraModal.mode}
        title={cameraModal.title}
        targetSide={cameraModal.targetSide}
      />

      {/* ── FULL HD DOCUMENT / DP INSPECTOR MODAL ── */}
      <FullHdImageViewerModal
        isOpen={hdViewer.open}
        onClose={() => setHdViewer({ ...hdViewer, open: false })}
        imageUrl={hdViewer.url}
        title={hdViewer.title}
        badgeText={hdViewer.badge}
      />
    </>
  );
}
