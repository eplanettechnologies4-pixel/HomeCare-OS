import React, { useState } from 'react';
import { Heart, Printer, ShieldCheck, Phone, Award, CheckCircle, FileText } from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from './UniversalPrintButton';

export default function StaffIdCard({ staffMember }) {
  const staff = useStore((s) => s.staff);
  const targetStaff = staffMember || staff[0];

  const [side, setSide] = useState('front'); // 'front' | 'back'

  if (!targetStaff) {
    return (
      <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.85rem' }}>
        No staff member profile found.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      
      {/* Controls Header */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className={`btn ${side === 'front' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSide('front')}
          style={{ fontSize: '0.8rem' }}
        >
          Front Side
        </button>
        <button
          className={`btn ${side === 'back' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSide('back')}
          style={{ fontSize: '0.8rem' }}
        >
          Back Side
        </button>
        <UniversalPrintButton type="id_card" data={targetStaff} label="Print ID Card" variant="ghost" size="sm" />
      </div>

      {/* ── DIGITAL ID CARD CONTAINER (CR-80 Standard Credit Card Aspect Ratio) ── */}
      <div style={{
        width: 380,
        height: 230,
        borderRadius: 14,
        background: side === 'front' ? 'linear-gradient(135deg, #611F8C 0%, #441365 100%)' : '#2d0b43',
        color: 'white',
        boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
        border: '2px solid var(--amber-500)',
        padding: 20,
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s'
      }}>
        
        {/* ── FRONT SIDE DESIGN ────────────────────────────────────────── */}
        {side === 'front' ? (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(253,224,71,0.4)', paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: '1px solid white' }} />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800 }}>
                  e<span style={{ color: '#FDE047' }}>Health</span>
                </span>
              </div>
              <span className="badge badge-amber" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>STAFF ID</span>
            </div>

            {/* Main Body */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10 }}>
              <div className="avatar avatar-lg" style={{ width: 64, height: 64, fontSize: '1.4rem', background: 'var(--teal-700)', color: 'white', border: '2px solid var(--amber-500)' }}>
                {targetStaff.full_name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: 0, color: 'white' }}>
                  {targetStaff.full_name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--amber-400)', fontWeight: 600 }}>
                  {targetStaff.role_display}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  Spec: {targetStaff.specialization}
                </div>
              </div>
            </div>

            {/* Footer Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
              <div>
                <div>ID: <strong style={{ color: 'white', fontFamily: 'var(--font-mono)' }}>{targetStaff.employee_id}</strong></div>
                <div>Office: Main Office (PWD / Soan Garden, Islamabad)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>Valid Till: <strong style={{ color: 'var(--amber-400)' }}>2027-12-31</strong></div>
                <div style={{ fontSize: '0.62rem', color: 'var(--status-green)' }}>PMDC Verified ✓</div>
              </div>
            </div>
          </>
        ) : (
          /* ── BACK SIDE DESIGN ─────────────────────────────────────────── */
          <>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', fontSize: '0.72rem', lineHeight: 1.45 }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--amber-400)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} /> Official Medical Staff Credential
                </div>
                <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.85)', marginBottom: 8, lineHeight: 1.35 }}>
                  This card certifies that the cardholder is an authorized clinical staff member of eHealth Hospital at Home. If found, please return to Islamabad Operations Center.
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
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
                  <strong style={{ color: 'var(--amber-400)', fontFamily: 'var(--font-mono)' }}>{targetStaff.employee_id}</strong>
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
          </>
        )}
      </div>
    </div>
  );
}
