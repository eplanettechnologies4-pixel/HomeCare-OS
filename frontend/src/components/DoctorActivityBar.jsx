import React from 'react';
import {
  Stethoscope, Video, FileText, AlertTriangle, ChevronRight, CheckCircle2,
  Clock, ShieldAlert, Sparkles, Pill, AlertCircle
} from 'lucide-react';
import { getTierChipConfig, TIER_ORDER } from '../utils/rosterHelpers';

export default function DoctorActivityBar({
  consultationCounts = {},
  pendingRequests = {},
  highAlertPatients = {},
  onOpenDrawer,
}) {
  const physical = consultationCounts.physical || {};
  const video = consultationCounts.video || {};

  const totalPending = pendingRequests.total_pending || 0;
  const referralsCount = pendingRequests.referrals ? pendingRequests.referrals.length : 0;
  const consultationsReqCount = pendingRequests.consultations ? pendingRequests.consultations.length : 0;
  const proceduresCount = pendingRequests.procedures ? pendingRequests.procedures.length : 0;
  const rxVerifyCount = pendingRequests.prescriptions_to_verify_count || (pendingRequests.prescriptions_to_verify ? pendingRequests.prescriptions_to_verify.length : 0);

  return (
    <section
      className="card doctor-activity-bar"
      style={{
        background: '#FFFFFF',
        borderRadius: 18,
        border: '1px solid #E9D5FF',
        boxShadow: '0 4px 20px rgba(109,40,217,0.05)',
        padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 16,
      }}
    >
      {/* ── SEGMENT 1: Physical Consultations ── */}
      <div
        className="activity-segment"
        style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onClick={() => onOpenDrawer && onOpenDrawer('consultations', 'today', 'Physical Consultations')}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(109,40,217,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#FAF5FF',
                color: '#6D28D9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stethoscope size={16} />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E1B4B' }}>
                Physical Consults
              </span>
              <div style={{ fontSize: '10px', color: '#6B7280' }}>In-person assigned visits</div>
            </div>
          </div>
          <ChevronRight size={15} style={{ color: '#9CA3AF' }} />
        </div>

        {/* Counts Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
          <div
            style={{ background: '#FFFFFF', padding: '6px 4px', borderRadius: 8, border: '1px solid #E5E7EB' }}
            onClick={(e) => { e.stopPropagation(); onOpenDrawer && onOpenDrawer('consultations', 'today', 'Today’s Consultations'); }}
          >
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>{physical.today || 0}</div>
            <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 600 }}>Today</div>
          </div>
          <div
            style={{ background: '#FFFFFF', padding: '6px 4px', borderRadius: 8, border: '1px solid #E5E7EB' }}
            onClick={(e) => { e.stopPropagation(); onOpenDrawer && onOpenDrawer('consultations', 'this_week', 'This Week’s Consultations'); }}
          >
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>{physical.this_week || 0}</div>
            <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 600 }}>Week</div>
          </div>
          <div
            style={{ background: '#FFFFFF', padding: '6px 4px', borderRadius: 8, border: '1px solid #E5E7EB' }}
            onClick={(e) => { e.stopPropagation(); onOpenDrawer && onOpenDrawer('consultations', 'this_month', 'This Month’s Consultations'); }}
          >
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>{physical.this_month || 0}</div>
            <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 600 }}>Month</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4B5563', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
          <span>Scheduled: <strong>{physical.scheduled || 0}</strong></span>
          <span>Completed: <strong style={{ color: '#059669' }}>{physical.completed || 0}</strong></span>
        </div>
      </div>

      {/* ── SEGMENT 2: Video Consultations (Muted Coming Soon) ── */}
      <div
        className="activity-segment"
        style={{
          background: '#F9FAFB',
          border: '1px dashed #D1D5DB',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10,
          opacity: 0.78,
          cursor: 'not-allowed',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#F3F4F6',
                color: '#9CA3AF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Video size={16} />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#6B7280' }}>
                Video Consults
              </span>
              <div style={{ fontSize: '10px', color: '#9CA3AF' }}>Telemedicine clinic</div>
            </div>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#F3F4F6',
              color: '#6B7280',
              border: '1px solid #E5E7EB',
            }}
          >
            Coming soon
          </span>
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0', color: '#9CA3AF', fontSize: '12px' }}>
          Integrated secure video visits launching in Phase 2
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9CA3AF', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
          <span>Scheduled: 0</span>
          <span>Available: No</span>
        </div>
      </div>

      {/* ── SEGMENT 3: Pending Clinical Requests ── */}
      <div
        className="activity-segment"
        style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={16} />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E1B4B' }}>
                Pending Requests
              </span>
              <div style={{ fontSize: '10px', color: '#6B7280' }}>Awaiting doctor action</div>
            </div>
          </div>

          <span
            style={{
              fontSize: '12px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 999,
              background: totalPending > 0 ? '#FEF2F2' : '#ECFDF5',
              color: totalPending > 0 ? '#DC2626' : '#059669',
              border: `1px solid ${totalPending > 0 ? '#FCA5A5' : '#A7F3D0'}`,
            }}
          >
            {totalPending}
          </span>
        </div>

        {/* Chips Row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onOpenDrawer && onOpenDrawer('pending_requests', 'referrals', 'Pending Referrals')}
            style={{
              padding: '3px 8px',
              borderRadius: 8,
              fontSize: '11px',
              fontWeight: 600,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Referrals ({referralsCount})
          </button>

          <button
            type="button"
            onClick={() => onOpenDrawer && onOpenDrawer('pending_requests', 'consultations', 'Consultation Requests')}
            style={{
              padding: '3px 8px',
              borderRadius: 8,
              fontSize: '11px',
              fontWeight: 600,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Consults ({consultationsReqCount})
          </button>

          <button
            type="button"
            onClick={() => onOpenDrawer && onOpenDrawer('pending_requests', 'procedures', 'Procedure Requests')}
            style={{
              padding: '3px 8px',
              borderRadius: 8,
              fontSize: '11px',
              fontWeight: 600,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Procedures ({proceduresCount})
          </button>

          <button
            type="button"
            onClick={() => onOpenDrawer && onOpenDrawer('pending_requests', 'prescriptions_to_verify', 'Prescriptions Needing Verification')}
            style={{
              padding: '3px 8px',
              borderRadius: 8,
              fontSize: '11px',
              fontWeight: 700,
              background: rxVerifyCount > 0 ? '#FEFCE8' : '#FFFFFF',
              border: `1px solid ${rxVerifyCount > 0 ? '#FDE047' : '#E5E7EB'}`,
              color: rxVerifyCount > 0 ? '#B45309' : '#374151',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Pill size={11} />
            Verify Rx ({rxVerifyCount})
          </button>
        </div>

        <div style={{ fontSize: '10px', color: '#9CA3AF', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
          Click Verify Rx chip to review & sign prescriptions
        </div>
      </div>

      {/* ── SEGMENT 4: Alerts & Real Acute Tiers ── */}
      <div
        className="activity-segment"
        style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={16} />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E1B4B' }}>
                Alerts & Vitals Tiering
              </span>
              <div style={{ fontSize: '10px', color: '#9CA3AF' }}>PROVISIONAL - clinical sign-off needed</div>
            </div>
          </div>
        </div>

        {/* Tier Chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {TIER_ORDER.map((tierKey) => {
            const conf = getTierChipConfig(tierKey);
            const count = highAlertPatients[tierKey] ? highAlertPatients[tierKey].length : 0;
            return (
              <button
                key={tierKey}
                type="button"
                onClick={() => onOpenDrawer && onOpenDrawer('patients_by_tier', tierKey, `${conf.label} Patients (${conf.badge})`)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: '11px',
                  fontWeight: 700,
                  background: conf.bg,
                  color: conf.color,
                  border: `1px solid ${conf.border}`,
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease',
                }}
                title={`${conf.label}: ${count} patients`}
              >
                <span>{conf.label}</span>
                <span style={{ background: '#FFFFFF', padding: '1px 5px', borderRadius: 999, fontSize: '10px', border: `1px solid ${conf.border}` }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: '10px', color: '#9CA3AF', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
          Unclassified vitals tagged "Needs review" (never marked stable)
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .doctor-activity-bar {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .doctor-activity-bar {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}

