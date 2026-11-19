import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import StaffIdCard from './StaffIdCard';
import { getPKTGreeting, formatPKTTime, formatPKTDate } from '../utils/timeFormatters';
import { getDutyStatusConfig } from '../utils/rosterHelpers';

export default function StaffOverviewHeader({
  staff,
  employeeCard,
  roleTitle = 'Staff Portal',
  badgeColor = '#7C3AED',
  dutyStatus = 'Off duty',
  workingHours = {},
  employmentStatus = null,
  lastUpdated,
  lastFetchedAt = null,
  isError = false,
  onRefresh,
  rosterCard = null,
}) {
  const [clockStr, setClockStr] = useState(() => formatPKTTime(new Date()));
  const [dateStr, setDateStr] = useState(() => formatPKTDate(new Date()));
  const [greeting, setGreeting] = useState(() => getPKTGreeting(new Date()));
  const [isStale, setIsStale] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState(0);

  // 1. Live PKT Clock update every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClockStr(formatPKTTime(now));
      setDateStr(formatPKTDate(now));
      setGreeting(getPKTGreeting(now));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Background polling: every 60s and on window focus
  useEffect(() => {
    if (!onRefresh) return;

    const interval = setInterval(() => {
      onRefresh();
    }, 60000);

    const handleFocus = () => {
      onRefresh();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onRefresh]);

  // 3. Stale data detection (> 5 minutes or fetch error)
  useEffect(() => {
    const checkStaleness = () => {
      if (isError) {
        setIsStale(true);
        return;
      }
      if (lastFetchedAt) {
        const fetchTime = new Date(lastFetchedAt).getTime();
        const diffMinutes = Math.floor((Date.now() - fetchTime) / 60000);
        if (diffMinutes >= 5) {
          setIsStale(true);
          setStaleMinutes(diffMinutes);
        } else {
          setIsStale(false);
        }
      }
    };
    checkStaleness();
    const interval = setInterval(checkStaleness, 20000);
    return () => clearInterval(interval);
  }, [lastFetchedAt, isError]);

  const dutyBadge = getDutyStatusConfig(dutyStatus);

  const isOpen = workingHours.is_open_now;
  const startHour = workingHours.start || '09:00';
  const endHour = workingHours.end || '17:00';
  const tz = workingHours.timezone || 'Asia/Karachi';

  const staffDisplayName = staff?.name?.split(' ')[0] || staff?.first_name || 'Staff Member';

  // Employment Status configuration
  const empStatus = employmentStatus?.status || staff?.employment_status || '';
  const empDisplay = employmentStatus?.status_display || staff?.employment_status_display || '';
  const probationEnd = employmentStatus?.probation_end_date || staff?.probation_end_date;

  let empChipText = 'Employment Status: Not set';
  let empChipBg = '#F3F4F6';
  let empChipColor = '#4B5563';
  let empChipBorder = '#E5E7EB';

  if (empStatus === 'probationary') {
    const endStr = probationEnd
      ? new Date(probationEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'date not set';
    empChipText = `Probationary period – ends ${endStr}`;
    empChipBg = '#EFF6FF';
    empChipColor = '#1D4ED8';
    empChipBorder = '#BFDBFE';
  } else if (empStatus === 'confirmed') {
    empChipText = 'Confirmed Staff';
    empChipBg = '#ECFDF5';
    empChipColor = '#059669';
    empChipBorder = '#A7F3D0';
  } else if (empStatus === 'trained') {
    empChipText = 'Trained Clinician';
    empChipBg = '#FAF5FF';
    empChipColor = '#7C3AED';
    empChipBorder = '#DDD6FE';
  } else if (empStatus === 'professional') {
    empChipText = 'Professional Staff';
    empChipBg = '#F0FDF4';
    empChipColor = '#15803D';
    empChipBorder = '#BBF7D0';
  } else if (empDisplay) {
    empChipText = empDisplay;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 1. Integrated Top Bar (Taller min-height, Left info + Right StaffIdCard) ── */}
      <section
        className="card staff-hero-band"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 60%, #F5F3FF 100%)',
          borderRadius: 18,
          border: '1px solid #E9D5FF',
          borderTop: `4px solid ${badgeColor}`,
          boxShadow: '0 4px 20px rgba(109,40,217,0.06)',
          padding: '24px 26px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 24,
          minHeight: 210,
        }}
      >
        {/* Left Side: Greeting, Role, Live Time, Official Hours, Employment Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 360px', minWidth: 280 }}>
          
          {/* Top Pill / Badge Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 800,
                color: '#1E1B4B',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {greeting}, {staffDisplayName}
            </h1>

            {/* Duty Status Badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 9999,
                background: dutyBadge.bg,
                color: dutyBadge.color,
                fontSize: '12px',
                fontWeight: 700,
                border: `1.5px solid ${dutyBadge.border}`,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: dutyBadge.dot,
                }}
              />
              {dutyBadge.label}
            </div>

            {/* Role Title Pill */}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: 999,
                background: '#EDE9FE',
                color: badgeColor,
                letterSpacing: '0.04em',
              }}
            >
              {roleTitle}
            </span>

            {/* Inline Stale Data Warning Pill */}
            {isStale && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 9999,
                  background: '#FEF3C7',
                  color: '#92400E',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid #FCD34D',
                }}
              >
                <AlertCircle size={13} style={{ color: '#D97706' }} />
                <span>
                  {isError
                    ? 'Sync error – reconnecting...'
                    : `Stale data – last synced ${staleMinutes}m ago (auto-syncing)`}
                </span>
              </div>
            )}
          </div>

          {/* Date, Live Clock, Official Hours Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '13px', color: '#6B7280' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>{dateStr}</span>
            <span>•</span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#FFFFFF',
                padding: '3px 10px',
                borderRadius: 7,
                border: '1px solid #E5E7EB',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                color: '#1E1B4B',
              }}
            >
              <Clock size={14} style={{ color: badgeColor }} />
              <span>{clockStr}</span>
            </div>
            <span>•</span>
            {/* Official Hours Chip */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '12px',
                color: '#4B5563',
              }}
            >
              <span>Official: <strong>{startHour} – {endHour}</strong> ({tz})</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontSize: '11px',
                  fontWeight: 600,
                  background: isOpen ? '#ECFDF5' : '#F3F4F6',
                  color: isOpen ? '#059669' : '#6B7280',
                  border: `1px solid ${isOpen ? '#A7F3D0' : '#E5E7EB'}`,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: isOpen ? '#10B981' : '#9CA3AF',
                  }}
                />
                {isOpen ? 'Open now' : 'Closed, opens 9:00 AM'}
              </span>
            </div>
          </div>

          {/* Employment Status Chip Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: '12px',
                fontWeight: 600,
                background: empChipBg,
                color: empChipColor,
                border: `1px solid ${empChipBorder}`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: empChipColor,
                }}
              />
              {empChipText}
            </span>

            <span
              style={{
                fontSize: '10px',
                color: '#9CA3AF',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              PROVISIONAL - HR terms need sign-off
            </span>
          </div>
        </div>

        {/* Right Side: Integrated Staff ID Card */}
        <div
          className="staff-header-id-card-wrapper"
          style={{
            flex: '0 0 auto',
            maxWidth: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <StaffIdCard staffMember={employeeCard || staff} />
        </div>
      </section>

      {/* Backward-compatibility fallback: render legacy rosterCard if provided by non-doctor roles */}
      {rosterCard && (
        <section className="staff-overview-legacy-roster">
          {rosterCard}
        </section>
      )}

      <style>{`
        @media (max-width: 900px) {
          .staff-hero-band {
            flex-direction: column;
            align-items: stretch !important;
          }
          .staff-header-id-card-wrapper {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
