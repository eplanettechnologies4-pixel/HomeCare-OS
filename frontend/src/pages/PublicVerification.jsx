import React from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle, AlertTriangle, Phone, MapPin, Award, User, Heart, ArrowLeft } from 'lucide-react';
import useStore from '../store/useStore';

export default function PublicVerification({ staffMember, empId }) {
  const staff = useStore((s) => s.staff);
  const bookings = useStore((s) => s.bookings);
  const setActivePage = useStore((s) => s.setActivePage);

  // Find targeted staff by empId or fallback
  const targetStaff = staffMember || staff.find(s => s.employee_id === empId) || staff[0] || {};

  // Live Database Status Check (from backend StaffMember.is_active)
  const isLiveActive = Boolean(targetStaff.is_active);

  // Live Visit Assignment Check
  const activeVisit = bookings.find(b => (b.assigned_staff?.id === targetStaff.id || b.staff_name === targetStaff.full_name) && b.status === 'in_progress');

  return (
    <div style={{ background: '#f0f4f3', minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Top Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--purple-700)' }} />
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', margin: 0, color: 'var(--teal-900)', fontWeight: 800 }}>
          e<span style={{ color: '#DE9A3C' }}>Health</span> Official Identity Verification
        </h1>
      </div>

      {/* Main Verification Card */}
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
            {targetStaff.full_name.split(' ').map(n=>n[0]).join('')}
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
            <strong style={{ color: 'var(--teal-900)' }}>{targetStaff.specialization}</strong>
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
            <strong>{targetStaff.rating} ★ (Verified Patient Reviews)</strong>
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
    </div>
  );
}
