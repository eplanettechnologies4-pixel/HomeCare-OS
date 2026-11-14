import React, { useState } from 'react';
import { X, Phone, Shield, Stethoscope, Clock, AlertTriangle } from 'lucide-react';
import apiFetch from '../services/api';

export default function PatientDetailsModal({ isOpen, onClose, patientData, guardianData, treatingConsultant, careManager, staffOnDuty, patientId }) {
  const [revealedPhone, setRevealedPhone] = useState(guardianData?.phone || null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState(null);

  const formatVal = (v) => {
    if (v === null || v === undefined || v === '' || v === 'None' || v === 'N/A') return '-';
    return v;
  };

  const handleRevealEmergency = async () => {
    if (!patientId && !patientData?.id) return;
    const pid = patientId || patientData?.id;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const res = await apiFetch(`/patients/${pid}/reveal-emergency-contact/`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPhone(data.phone || '-');
      } else {
        const err = await res.json().catch(() => ({}));
        setRevealError(err.detail || 'Failed to reveal emergency contact.');
      }
    } catch (_err) {
      setRevealError('Network error while revealing emergency contact.');
    } finally {
      setIsRevealing(false);
    }
  };

  const guardianPhoneDisplay = revealedPhone || guardianData?.phone;
  const canReveal = guardianData?.can_reveal_emergency && !guardianPhoneDisplay;

  // Initials fallback
  const pName = patientData?.full_name || `${patientData?.first_name || ''} ${patientData?.last_name || ''}`.trim() || 'Patient';
  const initials = pName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'PT';

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(109, 40, 217, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lilac Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
            borderBottom: '1px solid #DDD6FE',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {patientData?.photo ? (
              <img
                src={patientData.photo}
                alt={pName}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #6D28D9',
                }}
              />
            ) : (
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: '#6D28D9',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 6px -1px rgba(109, 40, 217, 0.3)',
                }}
              >
                {initials}
              </div>
            )}
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1E1B4B' }}>
                {pName}
              </h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#6D28D9', background: '#DDD6FE', padding: '2px 8px', borderRadius: '10px' }}>
                  MR: {formatVal(patientData?.mr_number)}
                </span>
                <span style={{ fontSize: '12px', color: '#4B5563' }}>
                  Code: {formatVal(patientData?.patient_code)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#FFFFFF',
              border: '1px solid #DDD6FE',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#4B5563',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Section 1: Demographics & Clinical Summary */}
          <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '16px', border: '1px solid #E2E8F0' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Identification & Core Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Age / Sex</span>
                <strong style={{ color: '#0F172A' }}>{formatVal(patientData?.age)} yrs / {formatVal(patientData?.gender_display || patientData?.gender)}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Blood Group</span>
                <strong style={{ color: '#0F172A' }}>{formatVal(patientData?.blood_type)}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Patient Phone</span>
                <strong style={{ color: '#0F172A' }}>{formatVal(patientData?.phone)}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Location / City</span>
                <strong style={{ color: '#0F172A' }}>{formatVal(patientData?.location)}</strong>
              </div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '13px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Written Address</span>
              <span style={{ color: '#0F172A' }}>{formatVal(patientData?.written_address || patientData?.address)}</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '13px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Primary Diagnosis</span>
              <span style={{ color: '#0F172A', fontWeight: 600 }}>{formatVal(patientData?.primary_diagnosis)}</span>
            </div>
          </div>

          {/* Section 2: Clinical Team (Consultant & Care Manager) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '14px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Stethoscope size={16} color="#6D28D9" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9' }}>Treating Consultant</span>
              </div>
              {treatingConsultant ? (
                <div style={{ fontSize: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{treatingConsultant.name}</div>
                  <div style={{ color: '#6B7280' }}>{treatingConsultant.specialization} ({treatingConsultant.employee_id || '-'})</div>
                  <div style={{ marginTop: '4px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> {formatVal(treatingConsultant.phone)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>No treating consultant assigned</div>
              )}
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Shield size={16} color="#15803D" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D' }}>Supervisor / Care Manager</span>
              </div>
              {careManager ? (
                <div style={{ fontSize: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#14532D' }}>{careManager.name}</div>
                  <div style={{ color: '#4B5563' }}>{careManager.role_display} ({careManager.employee_id || '-'})</div>
                  <div style={{ marginTop: '4px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> {formatVal(careManager.phone)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>No care manager assigned</div>
              )}
            </div>
          </div>

          {/* Section 3: Legal Guardian & Emergency Contact (A4 Rule) */}
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '14px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} color="#D97706" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#B45309' }}>Legal Guardian & Emergency Contact</span>
              </div>
              {guardianPhoneDisplay && (
                <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                  Contact Verified
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12px' }}>
              <div>
                <span style={{ color: '#92400E', display: 'block', fontSize: '11px' }}>Guardian Name</span>
                <strong style={{ color: '#451A03' }}>{formatVal(guardianData?.name)}</strong>
              </div>
              <div>
                <span style={{ color: '#92400E', display: 'block', fontSize: '11px' }}>Relationship</span>
                <strong style={{ color: '#451A03' }}>{formatVal(guardianData?.relation)}</strong>
              </div>
              <div>
                <span style={{ color: '#92400E', display: 'block', fontSize: '11px' }}>Emergency Phone</span>
                {guardianPhoneDisplay ? (
                  <strong style={{ color: '#B45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> {guardianPhoneDisplay}
                  </strong>
                ) : canReveal ? (
                  <div>
                    <button
                      onClick={handleRevealEmergency}
                      disabled={isRevealing}
                      style={{
                        background: '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '2px',
                      }}
                    >
                      <Phone size={11} /> {isRevealing ? 'Revealing...' : 'Emergency Contact'}
                    </button>
                    {revealError && <span style={{ color: '#DC2626', fontSize: '10px', display: 'block', marginTop: '2px' }}>{revealError}</span>}
                  </div>
                ) : (
                  <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Protected (Restricted Role)</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Staff on Duty Today (Asia/Karachi PKT) */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Clock size={16} color="#6D28D9" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Staff on Duty Today (Asia/Karachi PKT)
              </span>
            </div>

            {staffOnDuty && staffOnDuty.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {staffOnDuty.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#1E293B' }}>{s.name}</strong>
                      <span style={{ color: '#64748B', marginLeft: '6px' }}>({s.role_display || s.role})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ background: '#EDE9FE', color: '#6D28D9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, fontSize: '11px' }}>
                        {s.shift_hours}
                      </span>
                      <span style={{ color: '#475569', fontSize: '11px' }}>
                        📞 {formatVal(s.phone)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', padding: '12px' }}>
                No clinical staff currently rostered on duty for this patient today.
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div
          style={{
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#6D28D9',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
