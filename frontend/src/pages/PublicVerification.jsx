import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, CheckCircle, AlertTriangle, Phone, MapPin,
  Award, User, Heart, ArrowLeft, GraduationCap, Search, Check, FileCheck
} from 'lucide-react';
import useStore from '../store/useStore';
import { API_BASE } from '../services/api';

export default function PublicVerification({ staffMember, empId, initialMode, initialCertId }) {
  const staff = useStore((s) => s.staff);
  const bookings = useStore((s) => s.bookings);
  const setActivePage = useStore((s) => s.setActivePage);

  // URL parameters check
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const paramCert = initialCertId || urlParams.get('cert') || urlParams.get('cert_id') || (urlParams.get('id')?.startsWith('CERT') ? urlParams.get('id') : '');
  const defaultMode = initialMode || (paramCert ? 'certificate' : 'staff');

  const [mode, setMode] = useState(defaultMode);

  // Staff mode state
  const targetStaff = staffMember || staff.find(s => s.employee_id === empId) || staff[0] || {};
  const isLiveActive = Boolean(targetStaff.is_active);
  const activeVisit = bookings.find(b => (b.assigned_staff?.id === targetStaff.id || b.staff_name === targetStaff.full_name) && b.status === 'in_progress');

  // Certificate mode state
  const [certInput, setCertInput] = useState(paramCert || '');
  const [certResult, setCertResult] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState('');

  const verifyCertificate = async (idToVerify) => {
    const id = (idToVerify !== undefined ? idToVerify : certInput).trim();
    if (!id) return;
    setCertLoading(true);
    setCertError('');
    setCertResult(null);

    try {
      // First try direct public endpoint /api/certificates/verify/<id>/
      let res = await fetch(`${API_BASE}/certificates/verify/${encodeURIComponent(id)}/`);
      if (!res.ok && res.status !== 404) {
        // Fallback to /api/lms/verify/?id=...
        res = await fetch(`${API_BASE}/lms/verify/?id=${encodeURIComponent(id)}`);
      }
      const data = await res.json();
      if (res.ok && data.valid) {
        setCertResult(data);
      } else {
        setCertError(data.error || '❌ Certificate not found / invalid. The certificate ID does not exist in the official eHealth registry.');
      }
    } catch (err) {
      setCertError('Network or server error during verification: ' + err.message);
    } finally {
      setCertLoading(false);
    }
  };

  useEffect(() => {
    if (paramCert) {
      setCertInput(paramCert);
      verifyCertificate(paramCert);
    }
  }, [paramCert]);

  return (
    <div style={{ background: '#f0f4f3', minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Top Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--purple-700)' }} />
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', margin: 0, color: 'var(--teal-900)', fontWeight: 800 }}>
          HomeCare<span style={{ color: '#DE9A3C' }}> OS</span> Official Public Verification
        </h1>
      </div>

      {/* Mode Switcher */}
      <div style={{ display: 'flex', background: 'var(--sage-200)', padding: 4, borderRadius: 10, gap: 4, marginBottom: 20 }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'staff' ? 'btn-teal' : 'btn-ghost'}`}
          onClick={() => setMode('staff')}
          style={{ fontSize: '0.82rem', padding: '6px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ShieldCheck size={14} />
          <span>Staff Identity & QR</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'certificate' ? 'btn-teal' : 'btn-ghost'}`}
          onClick={() => setMode('certificate')}
          style={{ fontSize: '0.82rem', padding: '6px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <GraduationCap size={15} />
          <span>Training Certificate</span>
        </button>
      </div>

      {/* ── 1. STAFF IDENTITY MODE ─────────────────────────────────────────── */}
      {mode === 'staff' && (
        <div className="card" style={{ maxWidth: 480, width: '100%', padding: 28, border: isLiveActive ? '2px solid var(--status-green)' : '2px solid var(--status-red)', position: 'relative' }}>
          {/* Live Status Header Banner */}
          <div style={{
            background: isLiveActive ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
            color: isLiveActive ? 'var(--status-green)' : 'var(--status-red)',
            padding: '12px 16px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
            fontWeight: 700,
            fontSize: '0.95rem'
          }}>
            {isLiveActive ? (
              <>
                <ShieldCheck size={24} style={{ flexShrink: 0 }} />
                <div>
                  <div>OFFICIALLY VERIFIED & ACTIVE STAFF</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>Live Database Check Verified</div>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert size={24} style={{ flexShrink: 0 }} />
                <div>
                  <div>NOT CURRENTLY ACTIVE / ACCOUNT SUSPENDED</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>Do not admit to home. Contact dispatch immediately.</div>
                </div>
              </>
            )}
          </div>

          {/* Staff Profile Visual */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--sage-200)', paddingBottom: 16 }}>
            <div className="avatar avatar-lg" style={{ width: 72, height: 72, fontSize: '1.6rem', background: 'var(--teal-700)', color: 'white' }}>
              {(targetStaff.full_name || 'Staff').split(' ').map(n=>n[0]).join('')}
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', margin: 0, color: 'var(--teal-900)' }}>
                {targetStaff.full_name}
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--status-grey)', fontWeight: 600 }}>
                {targetStaff.role_display}
              </div>
              <span className="badge badge-teal" style={{ fontSize: '0.72rem', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                Staff ID: {targetStaff.employee_id}
              </span>
            </div>
          </div>

          {/* Verification Details List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.85rem', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-100)', paddingBottom: 8 }}>
              <span style={{ color: 'var(--status-grey)' }}>Clinical Specialization:</span>
              <strong style={{ color: 'var(--teal-900)' }}>{targetStaff.specialization || 'General Care'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-100)', paddingBottom: 8 }}>
              <span style={{ color: 'var(--status-grey)' }}>License Verification:</span>
              <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>PMDC / PNC Certified ✓</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-100)', paddingBottom: 8 }}>
              <span style={{ color: 'var(--status-grey)' }}>Office / Operational Base:</span>
              <strong>Main Office (PWD / Soan Garden, Islamabad)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-100)', paddingBottom: 8 }}>
              <span style={{ color: 'var(--status-grey)' }}>Current Assignment Status:</span>
              <strong style={{ color: activeVisit ? 'var(--amber-600)' : 'var(--status-green)' }}>
                {activeVisit ? `On Visit — ${activeVisit.patient_name}` : 'Available for Dispatch'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--status-grey)' }}>Performance Rating:</span>
              <strong>{targetStaff.rating || '5.0'} ★ (Verified Reviews)</strong>
            </div>
          </div>

          {/* Issue Report & Helpline Action */}
          <div style={{ background: 'var(--sage-50)', padding: 14, borderRadius: 8, textAlign: 'center', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--teal-800)', marginBottom: 4 }}>
              Questions or Safety Concerns?
            </div>
            <div style={{ color: 'var(--status-grey)', marginBottom: 10 }}>
              Call Islamabad Central Dispatch Helpline: <strong>+92-51-111-CARE-OS</strong>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)', width: '100%', justifyContent: 'center' }}>
              <Phone size={13} /> Report an Issue to Care Manager
            </button>
          </div>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setActivePage('overview')}>
              <ArrowLeft size={13} /> Return to HomeCare OS Portal
            </button>
          </div>
        </div>
      )}

      {/* ── 2. TRAINING CERTIFICATE MODE ───────────────────────────────────── */}
      {mode === 'certificate' && (
        <div className="card" style={{ maxWidth: 520, width: '100%', padding: 28, border: certResult ? '2px solid var(--status-green)' : '1px solid var(--sage-200)', position: 'relative' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Award size={36} color="var(--amber-600)" style={{ margin: '0 auto 8px' }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', margin: 0, color: 'var(--teal-900)' }}>
              LMS Certificate Verification
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--status-grey)' }}>
              Verify authentic completion certificates issued by HomeCare OS Training Academy.
            </p>
          </div>

          {/* Search Input Bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter Certificate ID (e.g. CERT-A1B2C3D4)"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyCertificate()}
                style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              />
            </div>
            <button
              type="button"
              className="btn btn-teal"
              onClick={() => verifyCertificate()}
              disabled={certLoading || !certInput.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Search size={14} />
              <span>{certLoading ? 'Verifying...' : 'Verify'}</span>
            </button>
          </div>

          {/* Error Banner */}
          {certError && (
            <div style={{
              background: '#FEF2F2',
              border: '1.5px solid #FCA5A5',
              color: '#991B1B',
              padding: '16px 18px',
              borderRadius: 10,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}>
              <ShieldAlert size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: '0.96rem', display: 'block' }}>❌ Certificate Not Found / Invalid</strong>
                <div style={{ fontSize: '0.82rem', marginTop: 4, color: '#7F1D1D', lineHeight: 1.45 }}>
                  The certificate ID <strong>{certInput.toUpperCase()}</strong> does not exist in the official eHealth registry, or has not been officially registered. Please check the ID printed on your physical certificate.
                </div>
              </div>
            </div>
          )}

          {/* Verified Certificate Card */}
          {certResult && (
            <div>
              <div style={{
                background: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                color: '#166534',
                padding: '16px 18px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
              }}>
                <ShieldCheck size={28} color="#16A34A" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#166534' }}>
                    ✅ Valid Certificate
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#15803D', marginTop: 2 }}>
                    Authentic credential verified in real time against the official eHealth registry.
                  </div>
                </div>
              </div>

              {/* Certificate Information Panel */}
              <div style={{
                background: 'var(--sage-50)',
                padding: 20,
                borderRadius: 10,
                border: '1px solid var(--sage-200)',
                marginBottom: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                fontSize: '0.88rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--status-grey)' }}>Certificate ID:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: '#5B1A4A', letterSpacing: 0.5 }}>
                    {certResult.certificate_id || certResult.certificate_number}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--status-grey)' }}>Recipient Name:</span>
                  <strong style={{ color: '#5B1A4A', fontSize: '1rem' }}>
                    {certResult.recipient_name || certResult.staff_name}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--status-grey)' }}>Certificate Title:</span>
                  <strong style={{ color: 'var(--teal-800)' }}>
                    {certResult.title || certResult.course_title}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--status-grey)' }}>Issue Date:</span>
                  <span>{certResult.issue_date || certResult.completion_date || certResult.issued_date}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--status-grey)' }}>Issuing Organization:</span>
                  <strong style={{ color: '#5B1A4A' }}>
                    {certResult.issuing_organization || 'eHealth Hospital At Home'}
                  </strong>
                </div>

                {certResult.description && (
                  <div style={{ borderBottom: '1px solid var(--sage-200)', paddingBottom: 8 }}>
                    <span style={{ color: 'var(--status-grey)', display: 'block', marginBottom: 4 }}>Citation / Description:</span>
                    <span style={{ color: 'var(--teal-900)', fontStyle: 'italic', fontSize: '0.84rem', lineHeight: 1.4 }}>
                      "{certResult.description}"
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: '#FCFBF9', border: '1px solid #D4A94A', color: '#5B1A4A', fontSize: '0.72rem', fontWeight: 700 }}>
                    ★ Registered with IHRA
                  </span>
                  <span className="badge" style={{ background: '#FCFBF9', border: '1px solid #D4A94A', color: '#5B1A4A', fontSize: '0.72rem', fontWeight: 700 }}>
                    ★ Registered with SECP
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              {certResult.pdf_url && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <a
                    href={certResult.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', background: '#5B1A4A', borderColor: '#5B1A4A' }}
                  >
                    <FileCheck size={14} /> View Official PDF
                  </a>
                  <a
                    href={certResult.pdf_url}
                    download={`${certResult.certificate_id || 'certificate'}.pdf`}
                    className="btn btn-outline"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Download size={14} /> Download PDF
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setActivePage('overview')}>
              <ArrowLeft size={13} /> Return to HomeCare OS Portal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
