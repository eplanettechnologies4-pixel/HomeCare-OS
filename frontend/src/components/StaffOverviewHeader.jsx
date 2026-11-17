import React, { useState, useEffect } from 'react';
import { Clock, Phone, RefreshCw } from 'lucide-react';
import StaffIdCard from './StaffIdCard';
import { getPKTGreeting, formatPKTTime, formatPKTDate } from '../utils/timeFormatters';

export default function StaffOverviewHeader({
  staff,
  employeeCard,
  roleTitle = 'Staff Portal',
  badgeColor = '#7C3AED',
  dutyStatus = 'Off duty',
  workingHours = {},
  lastUpdated,
  onRefresh,
  onHelpClick,
  helpButtonLabel = 'Call Help',
  rosterCard = null,
}) {
  const [clockStr, setClockStr] = useState(() => formatPKTTime(new Date()));
  const [dateStr, setDateStr] = useState(() => formatPKTDate(new Date()));
  const [greeting, setGreeting] = useState(() => getPKTGreeting(new Date()));

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

  const dutyStatusKey = String(dutyStatus || '').toLowerCase().replace(/\s+/g, '_');
  const dutyBadgeConfig = {
    on_duty: { label: 'On duty', color: '#059669', bg: '#ECFDF5', dot: '#10B981' },
    upcoming: { label: 'Upcoming shift', color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
    upcoming_shift: { label: 'Upcoming shift', color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
    on_leave: { label: 'On leave', color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444' },
    off_duty: { label: 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF' },
  }[dutyStatusKey] || { label: dutyStatus || 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF' };

  const isOpen = workingHours.is_open_now;
  const startHour = workingHours.start || '09:00';
  const endHour = workingHours.end || '17:00';
  const tz = workingHours.timezone || 'Asia/Karachi';

  const staffDisplayName = staff?.name?.split(' ')[0] || staff?.first_name || 'Staff Member';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 1. Slim Greeting Strip ── */}
      <section
        className="card staff-hero-band"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 60%, #F5F3FF 100%)',
          borderRadius: 18,
          border: '1px solid #E9D5FF',
          borderTop: `4px solid ${badgeColor}`,
          boxShadow: '0 4px 18px rgba(109,40,217,0.05)',
          padding: '16px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '24px',
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
                padding: '3px 10px',
                borderRadius: 9999,
                background: dutyBadgeConfig.bg,
                color: dutyBadgeConfig.color,
                fontSize: '12px',
                fontWeight: 700,
                border: `1.5px solid ${dutyBadgeConfig.color}40`,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: dutyBadgeConfig.dot,
                }}
              />
              {dutyBadgeConfig.label}
            </div>

            {/* Role Title Pill */}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 9px',
                borderRadius: 999,
                background: '#EDE9FE',
                color: badgeColor,
                letterSpacing: '0.04em',
              }}
            >
              {roleTitle}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '13px', color: '#6B7280' }}>
            <span style={{ fontWeight: 500, color: '#374151' }}>{dateStr}</span>
            <span>•</span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#FFFFFF',
                padding: '2px 9px',
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
        </div>

        {/* Right Actions: Refresh & Emergency / Help */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastUpdated && (
            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
              Updated {lastUpdated}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="btn btn-ghost btn-sm"
              style={{ color: badgeColor, borderColor: '#DDD6FE', gap: 6, fontSize: '12px' }}
              title="Refresh dashboard data"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          )}
          {onHelpClick && (
            <button
              type="button"
              onClick={onHelpClick}
              className="btn btn-sm"
              style={{
                background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                fontWeight: 700,
                fontSize: '12px',
                gap: 6,
              }}
            >
              <Phone size={13} /> {helpButtonLabel}
            </button>
          )}
        </div>
      </section>

      {/* ── 2. Top Grid: Staff ID Card (Left ~5/12) & Roster Card (Right ~7/12) ── */}
      <section className="staff-overview-top-grid">
        <div
          className="staff-top-id-col"
          style={{
            background: '#FFFFFF',
            border: '1px solid #EDE9FE',
            borderRadius: 18,
            padding: '16px 18px',
            boxShadow: '0 2px 10px rgba(109,40,217,0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <StaffIdCard staffMember={employeeCard || staff} />
        </div>

        {rosterCard && (
          <div className="staff-top-roster-col">
            {rosterCard}
          </div>
        )}
      </section>

      <style>{`
        .staff-overview-top-grid {
          display: grid;
          grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1024px) {
          .staff-overview-top-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

