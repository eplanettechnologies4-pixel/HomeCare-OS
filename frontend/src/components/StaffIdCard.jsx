import React, { useState } from 'react';
import {
  Heart, Printer, ShieldCheck, Phone, Award, CheckCircle, FileText,
  CreditCard, ZoomIn, X, Camera, Image, ExternalLink
} from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from './UniversalPrintButton';
import FullHdImageViewerModal from './FullHdImageViewerModal';

export default function StaffIdCard({ staffMember }) {
  const staff = useStore((s) => s.staff);
  const targetStaff = staffMember || staff[0];

  const [cardMode, setCardMode] = useState('badge'); // 'badge' | 'cnic'
  const [side, setSide] = useState('front'); // 'front' | 'back'
  const [hdViewer, setHdViewer] = useState({ open: false, url: '', title: '', badge: '' });

  if (!targetStaff) {
    return (
      <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.85rem' }}>
        No staff member profile found.
      </div>
    );
  }

  const hasCnic = !!(targetStaff.id_card_front || targetStaff.id_card_back);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

      {/* Top Controls Bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', background: 'var(--sage-100)', padding: 3, borderRadius: 8, gap: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${cardMode === 'badge' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCardMode('badge')}
            style={{ fontSize: '0.78rem', padding: '4px 12px' }}
          >
            Digital Staff ID Card
          </button>
          <button
            type="button"
            className={`btn btn-sm ${cardMode === 'cnic' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCardMode('cnic')}
            style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <CreditCard size={13} /> National ID (CNIC) {hasCnic && '✓'}
          </button>
        </div>

        {cardMode === 'badge' && (
          <div style={{ display: 'inline-flex', background: 'var(--sage-100)', padding: 3, borderRadius: 8, gap: 4 }}>
            <button
              type="button"
              className={`btn btn-sm ${side === 'front' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSide('front')}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
            >
              Front Side
            </button>
            <button
              type="button"
              className={`btn btn-sm ${side === 'back' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSide('back')}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
            >
              Back Side
            </button>
          </div>
        )}

        <UniversalPrintButton type="id_card" data={targetStaff} label="Print ID Card" variant="ghost" size="sm" />
      </div>

      {/* ── MODE 1: DIGITAL STAFF ID BADGE (CR-80 CREDIT CARD STANDARD) ── */}
      {cardMode === 'badge' && (
        <div
          style={{
            width: 380,
            maxWidth: '100%',
            height: 236,
            borderRadius: 14,
            background: side === 'front' ? 'linear-gradient(135deg, #611F8C 0%, #3b0c57 100%)' : '#260838',
            color: 'white',
            boxShadow: '0 14px 32px rgba(0,0,0,0.28)',
            border: '2px solid var(--amber-500)',
            padding: 18,
            boxSizing: 'border-box',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'all 0.3s ease',
          }}
        >
          {/* ── FRONT SIDE DESIGN ── */}
          {side === 'front' ? (
            <>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(253,224,71,0.35)',
                  paddingBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      letterSpacing: '0.3px',
                      color: '#ffffff',
                    }}
                  >
                    e<span style={{ color: '#FDE047' }}>Health</span> Hospital at Home
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-amber" style={{ fontSize: '0.62rem', padding: '2px 7px', fontWeight: 700 }}>
                    STAFF ID
                  </span>
                </div>
              </div>

              {/* Main Body with SQUARE FULL HD PROFILE PICTURE */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
                {/* Square Profile Picture (Full HD) */}
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '2px solid #FDE047',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    background: '#1e1b4b',
                    position: 'relative',
                    flexShrink: 0,
                    cursor: targetStaff.photo ? 'pointer' : 'default',
                  }}
                  onClick={() => targetStaff.photo && setHdViewer({ open: true, url: targetStaff.photo, title: `${targetStaff.full_name} — Square DP`, badge: '1:1 Square Full HD' })}
                  title={targetStaff.photo ? 'Click to view Full HD DP' : 'Staff Profile DP'}
                >
                  {targetStaff.photo ? (
                    <>
                      <img
                        src={targetStaff.photo}
                        alt={targetStaff.full_name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          imageRendering: 'crisp-edges',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 2,
                          right: 2,
                          background: 'rgba(0,0,0,0.6)',
                          color: '#FDE047',
                          borderRadius: 3,
                          padding: '1px 3px',
                          fontSize: '0.55rem',
                          fontWeight: 700,
                        }}
                      >
                        HD
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--teal-700)',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.4rem',
                      }}
                    >
                      {(targetStaff.full_name || 'Staff').split(' ').map((n) => n[0]).join('')}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.05rem',
                      margin: 0,
                      color: 'white',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {targetStaff.full_name}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#FDE047', fontWeight: 600, marginTop: 2 }}>
                    {targetStaff.role_display}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {targetStaff.specialization || 'Clinical Care Specialist'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    Contact: {targetStaff.phone || 'Staff Dispatch'}
                  </div>
                </div>
              </div>

              {/* Footer Details */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  fontSize: '0.68rem',
                  color: 'rgba(255,255,255,0.7)',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                  paddingTop: 6,
                }}
              >
                <div>
                  <div>
                    ID: <strong style={{ color: 'white', fontFamily: 'var(--font-mono)' }}>{targetStaff.employee_id}</strong>
                  </div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.8 }}>Main Office · Islamabad</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>
                    Valid Till: <strong style={{ color: '#FDE047' }}>2027-12-31</strong>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--status-green)', fontWeight: 600 }}>
                    PMDC / Hospital Verified ✓
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── BACK SIDE DESIGN ── */
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', fontSize: '0.72rem', lineHeight: 1.45 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#FDE047', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} /> Official Medical Staff Credential
                </div>
                <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.85)', marginBottom: 8, lineHeight: 1.35 }}>
                  This card certifies that the cardholder is an authorized clinical staff member of eHealth Hospital at Home. If found, please return to Islamabad Operations Center.
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Emergency Helpline:</span>
                  <strong style={{ color: 'white' }}>+92-21-111-CARE-OS</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Department:</span>
                  <strong style={{ color: 'white' }}>Clinical Field Care</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Employee ID:</span>
                  <strong style={{ color: '#FDE047', fontFamily: 'var(--font-mono)' }}>{targetStaff.employee_id}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6, marginTop: 4 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.6)' }}>
                  *{targetStaff.employee_id}*
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
                  Authorized Signatory
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODE 2: NATIONAL ID CARD (CNIC FRONT & BACK SIDE IN FULL HD) ── */}
      {cardMode === 'cnic' && (
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--sage-200)',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h4 style={{ margin: 0, color: 'var(--teal-900)', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={16} color="var(--amber-600)" /> Official National ID Card (CNIC)
                </h4>
                <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)', marginTop: 2 }}>
                  High-definition scanned records for {targetStaff.full_name}
                </div>
              </div>
              <span className={`badge ${hasCnic ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
                {hasCnic ? 'Verified on File' : 'Pending Upload'}
              </span>
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              {/* Front Side */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--teal-800)', marginBottom: 6 }}>
                  Front Side
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 140,
                    borderRadius: 8,
                    background: '#e2e8f0',
                    border: '1.5px solid var(--sage-300)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: targetStaff.id_card_front ? 'pointer' : 'default',
                  }}
                  onClick={() => targetStaff.id_card_front && setHdViewer({ open: true, url: targetStaff.id_card_front, title: `${targetStaff.full_name} — ID Card Front`, badge: 'Full HD 1080p' })}
                >
                  {targetStaff.id_card_front ? (
                    <>
                      <img
                        src={targetStaff.id_card_front}
                        alt="ID Card Front"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 6,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: '0.65rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ZoomIn size={12} /> Full HD
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--status-grey)', padding: 10 }}>
                      <CreditCard size={32} style={{ opacity: 0.35, margin: '0 auto 6px' }} />
                      <div style={{ fontSize: '0.74rem' }}>No Front Side Uploaded</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Back Side */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--teal-800)', marginBottom: 6 }}>
                  Back Side
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 140,
                    borderRadius: 8,
                    background: '#e2e8f0',
                    border: '1.5px solid var(--sage-300)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: targetStaff.id_card_back ? 'pointer' : 'default',
                  }}
                  onClick={() => targetStaff.id_card_back && setHdViewer({ open: true, url: targetStaff.id_card_back, title: `${targetStaff.full_name} — ID Card Back`, badge: 'Full HD 1080p' })}
                >
                  {targetStaff.id_card_back ? (
                    <>
                      <img
                        src={targetStaff.id_card_back}
                        alt="ID Card Back"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 6,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: '0.65rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ZoomIn size={12} /> Full HD
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--status-grey)', padding: 10 }}>
                      <CreditCard size={32} style={{ opacity: 0.35, margin: '0 auto 6px' }} />
                      <div style={{ fontSize: '0.74rem' }}>No Back Side Uploaded</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!hasCnic && (
              <div style={{ marginTop: 12, fontSize: '0.74rem', color: 'var(--status-grey)', textAlign: 'center' }}>
                To upload or update this staff member's ID card images, click <strong>"Edit Profile"</strong> at the top right.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FULL HD DOCUMENT / DP INSPECTOR MODAL ── */}
      <FullHdImageViewerModal
        isOpen={hdViewer.open}
        onClose={() => setHdViewer({ ...hdViewer, open: false })}
        imageUrl={hdViewer.url}
        title={hdViewer.title}
        badgeText={hdViewer.badge}
      />

    </div>
  );
}
