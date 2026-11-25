import React, { useState, useRef } from 'react';
import {
  X, Eye, EyeOff, Shield, User, Lock, AlertCircle, CheckCircle,
  Camera, UploadCloud, Image, Trash2, ZoomIn, CreditCard, Check, Sparkles, Printer
} from 'lucide-react';
import useStore from '../store/useStore';
import RealtimeCameraModal from './RealtimeCameraModal';
import FullHdImageViewerModal from './FullHdImageViewerModal';

const ROLE_OPTIONS = [
  { value: 'nurse', label: 'Nurse', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'doctor', label: 'Doctor', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'physio', label: 'Physiotherapist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'speech', label: 'Speech & Language Therapist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'psychologist', label: 'Psychologist', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'dietician', label: 'Dietician', category: 'Clinical Staff', defaultPlatform: 'mobile' },
  { value: 'care_manager', label: 'Client Care Manager', category: 'Operations & Management', defaultPlatform: 'both' },
  { value: 'branch_manager', label: 'Branch Manager', category: 'Operations & Management', defaultPlatform: 'web' },
  { value: 'admin', label: 'System Admin', category: 'Administration', defaultPlatform: 'web' },
  { value: 'accountant', label: 'Accountant', category: 'Finance', defaultPlatform: 'web' },
  { value: 'crm_executive', label: 'CRM Executive', category: 'Client Relations', defaultPlatform: 'web' },
];

export default function AddStaffUserModal({ onClose, onSuccess }) {
  const createStaffMember = useStore((s) => s.createStaffMember);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    password_confirm: '',
    role: 'nurse',
    specialization: '',
    phone: '',
    email: '',
    platform_allowed: 'mobile',
  });

  // Media files & previews
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState(null);

  const [idBackFile, setIdBackFile] = useState(null);
  const [idBackPreview, setIdBackPreview] = useState(null);

  // Full HD Viewer Modal
  const [hdViewer, setHdViewer] = useState({ open: false, url: '', title: '', badge: '' });

  // Real-Time Full HD Camera Modal state
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

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setF = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleRoleChange = (newRole) => {
    const matched = ROLE_OPTIONS.find((r) => r.value === newRole);
    setForm((prev) => ({
      ...prev,
      role: newRole,
      platform_allowed: matched ? matched.defaultPlatform : prev.platform_allowed,
    }));
  };

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

  const [createdData, setCreatedData] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedFirstName = form.first_name.trim();
    const trimmedLastName = form.last_name.trim();
    if (!trimmedFirstName || !trimmedLastName) {
      setError('Complete name is required (both First Name and Last Name).');
      return;
    }

    const trimmedUsername = form.username.trim();
    if (trimmedUsername && trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters long if specified.');
      return;
    }

    if (form.password) {
      if (form.password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (form.password !== form.password_confirm) {
        setError('Passwords do not match. Please verify both fields.');
        return;
      }
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('first_name', trimmedFirstName);
    formData.append('last_name', trimmedLastName);
    if (trimmedUsername) formData.append('username', trimmedUsername);
    if (form.password) {
      formData.append('password', form.password);
      formData.append('password_confirm', form.password_confirm);
    }
    formData.append('role', form.role);
    formData.append('specialization', form.specialization.trim());
    formData.append('phone', form.phone.trim());
    formData.append('email', form.email.trim());
    formData.append('platform_allowed', form.platform_allowed);

    if (photoFile) {
      formData.append('photo', photoFile);
    }
    if (idFrontFile) {
      formData.append('id_card_front', idFrontFile);
    }
    if (idBackFile) {
      formData.append('id_card_back', idBackFile);
    }

    const res = await createStaffMember(formData);
    setLoading(false);

    if (res.success) {
      if (res.data?.activation_code) {
        setCreatedData(res.data);
      } else {
        if (onSuccess) onSuccess(res.data);
        onClose();
      }
    } else {
      setError(res.error || 'Failed to create user account. Please check your inputs.');
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
        <div className="modal" style={{ width: 660, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="modal-header">
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', margin: 0, color: 'var(--teal-800)' }}>
                Add New Staff Member
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                Real-time Full HD photo capture, National ID Card verification, and role setup.
              </p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={loading} aria-label="Close modal">
              <X size={16} />
            </button>
          </div>

          {createdData ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <Check size={32} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--teal-900)', margin: '0 0 4px' }}>
                Staff Member Created (Trainee Stage)
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--status-grey)', margin: '0 0 16px' }}>
                Account created with an unusable password. Staff member must activate using the one-time code below.
              </p>

              {/* Warning Banner */}
              <div
                style={{
                  background: '#fef3c7',
                  border: '1.5px solid #fde68a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 16,
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>WARNING: ONE-TIME ACTIVATION CODE</strong>
                  <div style={{ marginTop: 2 }}>
                    This activation code is displayed only once and cannot be retrieved later. Write it down, print the slip, or share it securely with the staff member.
                  </div>
                </div>
              </div>

              {/* Printable Credentials Slip Box */}
              <div
                id="staff-credentials-slip"
                style={{
                  background: '#f8fafc',
                  border: '2px dashed var(--teal-600)',
                  borderRadius: 10,
                  padding: 20,
                  textAlign: 'left',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--teal-900)' }}>
                      eHealth Hospital at Home
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Staff Login Credentials Slip</div>
                  </div>
                  <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                    Stage: Trainee
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.82rem', marginBottom: 16 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Staff Name:</span>{' '}
                    <strong style={{ color: 'var(--teal-900)' }}>{createdData.full_name || `${form.first_name} ${form.last_name}`}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Employee ID:</span>{' '}
                    <strong style={{ color: 'var(--teal-900)' }}>{createdData.employee_id}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Assigned Role:</span>{' '}
                    <strong>{createdData.role_display || form.role}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Username:</span>{' '}
                    <strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>{createdData.username}</strong>
                  </div>
                </div>

                {/* Activation Code Highlight Box */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '14px',
                    textAlign: 'center',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    One-Time Activation / Login Code
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.9rem',
                      fontWeight: 900,
                      letterSpacing: '5px',
                      color: 'var(--teal-800)',
                      margin: '6px 0',
                    }}
                  >
                    {createdData.activation_code}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Expires on: {new Date(createdData.activation_expires_at).toLocaleDateString()} (7 days)
                  </div>
                </div>

                {/* Activation Instructions */}
                <div style={{ background: '#f1f5f9', padding: '10px 12px', borderRadius: 6, fontSize: '0.75rem', color: '#334155' }}>
                  <strong>How to Activate:</strong>
                  <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    <li>Go to the activation portal at <code>/activate</code></li>
                    <li>Enter your username (<code>{createdData.username}</code>) and the activation code above.</li>
                    <li>Choose and confirm your personal secret password.</li>
                  </ol>
                </div>
              </div>

              {/* Slip Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={15} /> Print Credentials Slip
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (onSuccess) onSuccess(createdData);
                    onClose();
                  }}
                  style={{ minWidth: 120 }}
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#fee2e2',
                    border: '1px solid #ef4444',
                    color: '#b91c1c',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* ── 1. STAFF PROFILE PICTURE (SQUARE FULL HD) ── */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(97,31,140,0.05) 0%, rgba(15,118,110,0.06) 100%)',
                  padding: 16,
                  borderRadius: 10,
                  border: '1.5px dashed var(--teal-600)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="form-label" style={{ fontWeight: 700, margin: 0, color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={16} color="var(--amber-600)" /> Staff Profile Picture (DP) — Square Full HD
                  </label>
                  <span className="badge badge-teal" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>
                    1:1 Square · Real-Time Full HD
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Square DP Container */}
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 10,
                      border: '2px solid var(--amber-500)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.14)',
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
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            imageRendering: '-webkit-optimize-contrast',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setHdViewer({ open: true, url: photoPreview, title: 'Staff Profile DP', badge: '1:1 Square Full HD' })}
                          title="Inspect Full HD"
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            right: 4,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#FDE047',
                            border: 'none',
                            borderRadius: 4,
                            padding: 3,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <ZoomIn size={13} />
                        </button>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94a3b8', padding: 6 }}>
                        <User size={34} style={{ opacity: 0.4, margin: '0 auto 2px', color: '#fff' }} />
                        <div style={{ fontSize: '0.62rem', fontWeight: 600 }}>1:1 Square DP</div>
                      </div>
                    )}
                  </div>

                  {/* Upload Controls & Real-Time Camera */}
                  <div style={{ flex: 1, minWidth: 220 }}>
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
                        style={{ background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)', color: '#000', fontWeight: 700, fontSize: '0.78rem', border: 'none' }}
                        onClick={() => handleOpenLiveCamera('square', 'photo', 'Real-Time Full HD Staff Profile DP')}
                      >
                        <Camera size={14} /> Take Real-Time HD Photo
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ background: '#fff', borderColor: 'var(--teal-600)', color: 'var(--teal-800)', fontSize: '0.78rem' }}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <UploadCloud size={13} /> Browse File
                      </button>

                      {photoPreview && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '0.76rem' }}
                          onClick={() => handleClearFile(setPhotoFile, setPhotoPreview, photoInputRef)}
                        >
                          <Trash2 size={12} /> Clear
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 6, lineHeight: 1.4 }}>
                      Real-time live 1080p webcam capture or high-res file upload. Automatically framed in 1:1 square ratio for staff badges and roster.
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 2. STAFF ID CARD (FRONT & BACK SIDE) ── */}
              <div
                style={{
                  background: 'var(--sage-50)',
                  padding: 16,
                  borderRadius: 10,
                  border: '1px solid var(--sage-200)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label className="form-label" style={{ fontWeight: 700, margin: 0, color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={16} color="var(--amber-600)" /> Staff National ID Card (CNIC / Identity Card)
                  </label>
                  <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                    Front &amp; Back · Real-Time Full HD
                  </span>
                </div>

                <div className="grid-2" style={{ gap: 14 }}>
                  {/* FRONT SIDE */}
                  <div
                    style={{
                      background: '#fff',
                      border: idFrontPreview ? '1.5px solid var(--status-green)' : '1px dashed var(--sage-300)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 165,
                    }}
                  >
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--teal-800)' }}>
                        Front Side
                      </span>
                      {idFrontPreview && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--status-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Check size={12} /> Full HD Attached
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: 95,
                        borderRadius: 6,
                        background: '#0f172a',
                        overflow: 'hidden',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => (idFrontPreview ? setHdViewer({ open: true, url: idFrontPreview, title: 'ID Card — Front Side', badge: 'Full HD 1080p' }) : handleOpenLiveCamera('id_card', 'id_front', 'Scan ID Card (Front Side)', 'front'))}
                    >
                      {idFrontPreview ? (
                        <>
                          <img
                            src={idFrontPreview}
                            alt="ID Card Front"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 4,
                              right: 4,
                              background: 'rgba(0,0,0,0.7)',
                              color: '#fff',
                              borderRadius: 4,
                              padding: '2px 5px',
                              fontSize: '0.62rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <ZoomIn size={11} /> Inspect HD
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 8 }}>
                          <CreditCard size={26} style={{ opacity: 0.5, margin: '0 auto 4px', color: '#fff' }} />
                          <div style={{ fontSize: '0.7rem' }}>Capture or Upload Front</div>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={idFrontInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e, setIdFrontFile, setIdFrontPreview)}
                    />

                    <div style={{ display: 'flex', gap: 6, marginTop: 8, width: '100%', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px', flex: 1, minWidth: 90 }}
                        onClick={() => handleOpenLiveCamera('id_card', 'id_front', 'Scan ID Card (Front Side)', 'front')}
                      >
                        <Camera size={12} /> Live Scan
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={() => idFrontInputRef.current?.click()}
                      >
                        <UploadCloud size={12} /> File
                      </button>
                      {idFrontPreview && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#dc2626', fontSize: '0.72rem', padding: '3px 6px' }}
                          onClick={() => handleClearFile(setIdFrontFile, setIdFrontPreview, idFrontInputRef)}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* BACK SIDE */}
                  <div
                    style={{
                      background: '#fff',
                      border: idBackPreview ? '1.5px solid var(--status-green)' : '1px dashed var(--sage-300)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 165,
                    }}
                  >
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--teal-800)' }}>
                        Back Side
                      </span>
                      {idBackPreview && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--status-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Check size={12} /> Full HD Attached
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: 95,
                        borderRadius: 6,
                        background: '#0f172a',
                        overflow: 'hidden',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => (idBackPreview ? setHdViewer({ open: true, url: idBackPreview, title: 'ID Card — Back Side', badge: 'Full HD 1080p' }) : handleOpenLiveCamera('id_card', 'id_back', 'Scan ID Card (Back Side)', 'back'))}
                    >
                      {idBackPreview ? (
                        <>
                          <img
                            src={idBackPreview}
                            alt="ID Card Back"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 4,
                              right: 4,
                              background: 'rgba(0,0,0,0.7)',
                              color: '#fff',
                              borderRadius: 4,
                              padding: '2px 5px',
                              fontSize: '0.62rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <ZoomIn size={11} /> Inspect HD
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 8 }}>
                          <CreditCard size={26} style={{ opacity: 0.5, margin: '0 auto 4px', color: '#fff' }} />
                          <div style={{ fontSize: '0.7rem' }}>Capture or Upload Back</div>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={idBackInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e, setIdBackFile, setIdBackPreview)}
                    />

                    <div style={{ display: 'flex', gap: 6, marginTop: 8, width: '100%', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px', flex: 1, minWidth: 90 }}
                        onClick={() => handleOpenLiveCamera('id_card', 'id_back', 'Scan ID Card (Back Side)', 'back')}
                      >
                        <Camera size={12} /> Live Scan
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={() => idBackInputRef.current?.click()}
                      >
                        <UploadCloud size={12} /> File
                      </button>
                      {idBackPreview && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#dc2626', fontSize: '0.72rem', padding: '3px 6px' }}
                          onClick={() => handleClearFile(setIdBackFile, setIdBackPreview, idBackInputRef)}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Names */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={form.first_name}
                    onChange={(e) => setF('first_name', e.target.value)}
                    placeholder="e.g. Abdullah"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={form.last_name}
                    onChange={(e) => setF('last_name', e.target.value)}
                    placeholder="e.g. Fouzan"
                  />
                </div>
              </div>

              {/* Role & Platform */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">System Role *</label>
                  <select
                    className="form-select"
                    value={form.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Platform Allowed *</label>
                  <select
                    className="form-select"
                    value={form.platform_allowed}
                    onChange={(e) => setF('platform_allowed', e.target.value)}
                  >
                    <option value="mobile">Mobile App Only</option>
                    <option value="web">Web Dashboard Only</option>
                    <option value="both">Both Mobile &amp; Web</option>
                  </select>
                </div>
              </div>

              {/* Specialization */}
              <div className="form-group">
                <label className="form-label">Specialization / Designation / Department</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.specialization}
                  onChange={(e) => setF('specialization', e.target.value)}
                  placeholder="e.g. ICU Nurse, General Physician, PWD Islamabad"
                />
              </div>

              {/* Contact Info */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => setF('phone', e.target.value)}
                    placeholder="+92-300-1234567"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={(e) => setF('email', e.target.value)}
                    placeholder="user@ehealth.com"
                  />
                </div>
              </div>

              {/* Credentials Block */}
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--sage-50)',
                  borderRadius: 8,
                  border: '1px solid var(--sage-200)',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: 'var(--teal-800)',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Lock size={15} /> Login & Account Activation Setup
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Username (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={form.username}
                    onChange={(e) => setF('username', e.target.value)}
                    placeholder="Auto-generated from first & last name if blank"
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                    Leave blank to auto-generate (e.g. firstname.lastname).
                  </span>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Initial Password (Optional)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingRight: 36 }}
                        value={form.password}
                        onChange={(e) => setF('password', e.target.value)}
                        placeholder="Leave blank to use activation code"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--status-grey)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confirm Password (Optional)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingRight: 36 }}
                        value={form.password_confirm}
                        onChange={(e) => setF('password_confirm', e.target.value)}
                        placeholder="Re-type password if setting"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--status-grey)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--teal-800)', marginTop: 8, background: 'var(--sage-50)', padding: '6px 10px', borderRadius: 4 }}>
                  ℹ️ New staff are created in <strong>Trainee</strong> stage with an unusable password. A one-time activation code will be provided on the credentials slip.
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{ borderTop: '1px solid var(--sage-200)', paddingTop: 14 }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {loading ? 'Creating Backend Record...' : 'Create Account & Save'}
              </button>
            </div>
          </form>
          )}
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
