import React, { useState } from 'react';
import {
  Calendar, CalendarDays, Clock, MapPin, Shield,
  Phone, User, ExternalLink
} from 'lucide-react';
import { formatRosterHours, getDutyStatusConfig, calculateWeeklyBarPercent } from '../utils/rosterHelpers';

export default function SmartRosterSection({
  rosterSummary,
  title = "My Roster",
  onOpenClaimModal,
  onOpenClaimHistory,
  pendingClaimsCount = 0,
}) {
  // Tabs: 'daily' (default on first load), 'weekly', 'monthly'
  const [activeTab, setActiveTab] = useState('daily');

  if (!rosterSummary) {
    return null;
  }

  const {
    duty_status: dutyStatus = {},
    summary_tiles: summaryTiles = {},
    weekly_strip: weeklyStrip = [],
    week_total_hours: weekTotalHours = 0,
    month_days: monthDays = [],
    today_duty: todayDuty = null,
  } = rosterSummary;

  const dutyBadge = getDutyStatusConfig(dutyStatus.status);
  const maxWeeklyHours = summaryTiles.max_weekly_hours || 60;
  const weeklyBar = calculateWeeklyBarPercent(summaryTiles.hours_week || weekTotalHours, maxWeeklyHours);

  // Time left for duty resolution
  const countdown = todayDuty?.countdown || null;
  let countdownText = 'Off duty';
  let countdownBadgeBg = '#F3F4F6';
  let countdownBadgeBorder = '#E5E7EB';
  let countdownTextColor = '#4B5563';

  if (countdown) {
    if (countdown.status === 'before_shift') {
      countdownText = countdown.formatted_text || countdown.text || `Starts in ${countdown.hours_remaining} hrs ${countdown.minutes_remaining} mins`;
      countdownBadgeBg = '#FEF3C7';
      countdownBadgeBorder = '#FDE68A';
      countdownTextColor = '#92400E';
    } else if (countdown.status === 'on_duty') {
      countdownText = countdown.formatted_text || countdown.text || `On duty, ends in ${countdown.hours_remaining} hrs ${countdown.minutes_remaining} mins`;
      countdownBadgeBg = '#DCFCE7';
      countdownBadgeBorder = '#86EFAC';
      countdownTextColor = '#166534';
    } else {
      countdownText = 'Off duty';
      countdownBadgeBg = '#F3F4F6';
      countdownBadgeBorder = '#E5E7EB';
      countdownTextColor = '#4B5563';
    }
  } else if (dutyStatus.status === 'On duty') {
    countdownText = 'On duty';
    countdownBadgeBg = '#DCFCE7';
    countdownBadgeBorder = '#86EFAC';
    countdownTextColor = '#166534';
  }

  // Next shift resolution
  const nextShiftInfo = todayDuty?.next_shift || dutyStatus.next_duty || null;

  // Shift line resolution
  const shiftLineText = todayDuty?.shift_line || (todayDuty ? `${todayDuty.shift_name} ${todayDuty.duty_time}` : (dutyStatus.shift_name || 'No Shift Scheduled'));
  const isOvernight = Boolean(todayDuty?.is_overnight);
  const isIndependent = Boolean(todayDuty ? todayDuty.is_independent : (!todayDuty?.supervisor && !todayDuty?.transport && !todayDuty?.buddy));

  return (
    <section
      className="card smart-roster-section"
      style={{
        background: '#FFFFFF',
        borderRadius: 18,
        border: '1px solid #E9D5FF',
        boxShadow: '0 4px 20px rgba(109,40,217,0.05)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* ── Section Title, Tabs & Compact Overtime Button (Item 4) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* Left: Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#FAF5FF',
              color: '#6D28D9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #DDD6FE',
            }}
          >
            {activeTab === 'daily' && <Clock size={18} />}
            {activeTab === 'weekly' && <CalendarDays size={18} />}
            {activeTab === 'monthly' && <Calendar size={18} />}
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1E1B4B', margin: 0 }}>
              {title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#6B7280', marginTop: 2 }}>
              <Shield size={12} style={{ color: '#059669' }} />
              <span>Published Roster Data Only</span>
              <span>•</span>
              <span style={{ color: '#9CA3AF' }}>Live Schedule</span>
            </div>
          </div>
        </div>

        {/* Right: Tabs + Compact Overtime Control */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* One-box Segmented View Switcher: Daily (first) | Weekly | Monthly */}
          <div
            role="tablist"
            aria-label="Roster view switch"
            style={{
              display: 'inline-flex',
              background: '#F3F4F6',
              padding: '4px',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              gap: '4px',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'daily'}
              onClick={() => setActiveTab('daily')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: activeTab === 'daily' ? 700 : 500,
                color: activeTab === 'daily' ? '#6D28D9' : '#4B5563',
                background: activeTab === 'daily' ? '#FFFFFF' : 'transparent',
                boxShadow: activeTab === 'daily' ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(109,40,217,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Clock size={14} style={{ color: activeTab === 'daily' ? '#7C3AED' : '#9CA3AF' }} />
              <span>Daily</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'weekly'}
              onClick={() => setActiveTab('weekly')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: activeTab === 'weekly' ? 700 : 500,
                color: activeTab === 'weekly' ? '#6D28D9' : '#4B5563',
                background: activeTab === 'weekly' ? '#FFFFFF' : 'transparent',
                boxShadow: activeTab === 'weekly' ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(109,40,217,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <CalendarDays size={14} style={{ color: activeTab === 'weekly' ? '#7C3AED' : '#9CA3AF' }} />
              <span>Weekly</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'monthly'}
              onClick={() => setActiveTab('monthly')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: activeTab === 'monthly' ? 700 : 500,
                color: activeTab === 'monthly' ? '#6D28D9' : '#4B5563',
                background: activeTab === 'monthly' ? '#FFFFFF' : 'transparent',
                boxShadow: activeTab === 'monthly' ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(109,40,217,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Calendar size={14} style={{ color: activeTab === 'monthly' ? '#7C3AED' : '#9CA3AF' }} />
              <span>Monthly</span>
            </button>
          </div>

          {/* Compact Overtime Control (Item 4) */}
          {onOpenClaimModal && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onOpenClaimModal}
                className="btn btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #7C3AED',
                  color: '#7C3AED',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Submit an overtime claim"
              >
                <Clock size={13} />
                <span>Overtime</span>
                {pendingClaimsCount > 0 && (
                  <span
                    style={{
                      background: '#EF4444',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 800,
                      borderRadius: 999,
                      padding: '1px 6px',
                      lineHeight: 1.2,
                    }}
                  >
                    {pendingClaimsCount}
                  </span>
                )}
              </button>

              {onOpenClaimHistory && (
                <button
                  type="button"
                  onClick={onOpenClaimHistory}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6D28D9',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '4px 4px',
                  }}
                >
                  Claim history
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 1. DAILY VIEW (Default on first load, exact handwritten sketch order a-g) ── */}
      {activeTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1.5px solid #DDD6FE',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 2px 12px rgba(109,40,217,0.06)',
            }}
          >
            {/* a. Shift line: shift name and times (e.g. "Morning Shift 8:00 AM - 8:00 PM") */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                borderBottom: '1px solid #F3F4F6',
                paddingBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: '#FAF5FF',
                    color: '#6D28D9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #DDD6FE',
                  }}
                >
                  <Clock size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>
                    {shiftLineText}
                    {isOvernight && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#7C3AED',
                          background: '#F5F3FF',
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid #DDD6FE',
                        }}
                      >
                        Overnight
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 1 }}>
                    Status: <strong style={{ color: dutyBadge.color }}>{dutyBadge.label}</strong>
                  </div>
                </div>
              </div>

              {/* If supervisor, driver, and buddy are all unset -> "Independent duty" badge */}
              {isIndependent && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#4B5563',
                    background: '#F3F4F6',
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid #E5E7EB',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Shield size={12} style={{ color: '#6B7280' }} />
                  Independent duty
                </span>
              )}
            </div>

            {/* b. Patient Detail (one block per assigned patient, stacked) */}
            {todayDuty?.patients && todayDuty.patients.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6B7280' }}>
                  Assigned Patient{todayDuty.patients.length > 1 ? 's' : ''} ({todayDuty.patients.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {todayDuty.patients.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: '#F9FAFB',
                        border: '1.5px solid #E5E7EB',
                        borderRadius: 12,
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E1B4B' }}>{p.name}</span>
                        {p.mr_number && (
                          <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>MRN: {p.mr_number}</span>
                        )}
                      </div>

                      {/* Location with BOTH the written address and "Current location" Maps link */}
                      {p.location ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: '12px', color: '#374151' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <MapPin size={13} style={{ color: '#7C3AED', flexShrink: 0 }} />
                            <span style={{ wordBreak: 'break-word' }}>{p.location}</span>
                          </div>
                          {p.maps_link && (
                            <a
                              href={p.maps_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#6D28D9',
                                background: '#FAF5FF',
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid #DDD6FE',
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>Current location</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Location not available</div>
                      )}

                      {/* Contact number: tap to call (rendered only when provided per privacy rule) */}
                      {p.contact_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
                          <span style={{ fontSize: '12px', color: '#4B5563', fontWeight: 600 }}>
                            Contact: <strong style={{ color: '#1E1B4B' }}>{p.contact_number}</strong>
                          </span>
                          <a
                            href={`tel:${p.contact_number}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#059669',
                              background: '#ECFDF5',
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid #A7F3D0',
                              textDecoration: 'none',
                            }}
                          >
                            <Phone size={11} />
                            <span>Call</span>
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Sections c, d, e: Supervisor, Transportation, Buddy Staff (only if set, or "Independent duty") */}
            {!isIndependent ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6B7280' }}>
                  Shift Contacts & Support
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {/* c. Supervisor: Name and Contact (tap to call), only if set */}
                  {todayDuty?.supervisor && (
                    <div style={{ background: '#FAF5FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase' }}>Supervisor</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E1B4B' }}>{todayDuty.supervisor.name}</div>
                      </div>
                      {todayDuty.supervisor.phone ? (
                        <a
                          href={`tel:${todayDuty.supervisor.phone}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}
                        >
                          <Phone size={11} />
                          <span>Call</span>
                        </a>
                      ) : null}
                    </div>
                  )}

                  {/* d. Transportation: Driver name and Contact (tap to call), plus pickup time if set */}
                  {todayDuty?.transport && (
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#1D4ED8', fontWeight: 700, textTransform: 'uppercase' }}>
                          Transportation {todayDuty.transport.pickup_time ? `• Pickup ${todayDuty.transport.pickup_time}` : ''}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E1B4B' }}>{todayDuty.transport.driver_name}</div>
                      </div>
                      {todayDuty.transport.driver_phone ? (
                        <a
                          href={`tel:${todayDuty.transport.driver_phone}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700, color: '#1D4ED8', background: '#DBEAFE', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}
                        >
                          <Phone size={11} />
                          <span>Call</span>
                        </a>
                      ) : null}
                    </div>
                  )}

                  {/* e. Buddy Staff: Name and Contact (tap to call), only if set */}
                  {todayDuty?.buddy && (
                    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Buddy Staff</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E1B4B' }}>{todayDuty.buddy.name}</div>
                      </div>
                      {todayDuty.buddy.phone ? (
                        <a
                          href={`tel:${todayDuty.buddy.phone}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700, color: '#047857', background: '#CCFBF1', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}
                        >
                          <Phone size={11} />
                          <span>Call</span>
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* f. "Time left for duty" in "H hrs M mins" */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                background: countdownBadgeBg,
                border: `1px solid ${countdownBadgeBorder}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={15} style={{ color: countdownTextColor }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Time left for duty
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: countdownTextColor }}>
                {countdownText}
              </span>
            </div>

            {/* g. "Next Shift": date, shift name and times of nurse's next published duty */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                background: '#FAF5FF',
                border: '1px solid #E9D5FF',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarDays size={15} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase' }}>
                  Next Shift
                </span>
              </div>
              {nextShiftInfo ? (
                <span style={{ fontWeight: 700, color: '#1E1B4B' }}>
                  {nextShiftInfo.date_formatted || nextShiftInfo.date}, {nextShiftInfo.shift_name} ({nextShiftInfo.window})
                </span>
              ) : (
                <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>
                  No upcoming shift in published roster
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. WEEKLY VIEW (Compact 7-Day list opening Daily detail on tap) ── */}
      {activeTab === 'weekly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ fontWeight: 700, color: '#374151' }}>Weekly Shift Strip (Mon – Sun)</span>
            <span style={{ fontWeight: 700, color: '#6D28D9' }}>
              Week Total: <strong>{formatRosterHours(weekTotalHours)}</strong>
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 8,
            }}
            className="smart-roster-7day-grid"
          >
            {weeklyStrip.map((day, idx) => {
              const isToday = day.is_today;
              const isOn = day.status === 'on';
              const isStandby = day.status === 'standby';

              let dayBg = '#F9FAFB';
              let dayBorder = '#E5E7EB';
              let tagColor = '#6B7280';
              let tagBg = '#F3F4F6';

              if (isToday) {
                dayBorder = '#7C3AED';
                dayBg = '#FAF5FF';
              }
              if (isOn) {
                tagColor = '#059669';
                tagBg = '#ECFDF5';
              } else if (isStandby) {
                tagColor = '#D97706';
                tagBg = '#FFFBEB';
              }

              return (
                <div
                  key={day.date || idx}
                  onClick={() => setActiveTab('daily')}
                  style={{
                    background: dayBg,
                    border: `1.5px solid ${dayBorder}`,
                    borderRadius: 12,
                    padding: '10px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    textAlign: 'center',
                    cursor: 'pointer',
                    boxShadow: isToday ? '0 2px 8px rgba(109,40,217,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to view daily duty details"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: isToday ? '#6D28D9' : '#6B7280', fontWeight: 700 }}>
                    <span>{day.day_name}</span>
                    <span style={{ fontSize: '10px', color: '#9CA3AF' }}>{day.day_number}</span>
                  </div>

                  <span style={{ fontSize: '13px', fontWeight: 800, color: isOn ? '#1E1B4B' : '#6B7280' }}>
                    {isOn ? formatRosterHours(day.hours) : (isStandby ? 'Standby' : 'Off')}
                  </span>

                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: tagBg,
                      color: tagColor,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                    title={day.shift_name}
                  >
                    {day.shift_name || 'Off'}
                  </span>

                  {day.patients && day.patients.length > 0 && (
                    <div style={{ fontSize: '9px', color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {day.patients.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Weekly Capacity Bar */}
          <div
            style={{
              background: '#F9FAFB',
              border: `1px solid ${weeklyBar.isOvertime ? '#FCA5A5' : '#E5E7EB'}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Weekly Limit: {maxWeeklyHours}h ({summaryTiles.days_on_week || 0} On • {summaryTiles.days_off_week || 0} Off)
              </span>
              <span style={{ fontSize: '11px', fontWeight: 800, color: weeklyBar.isOvertime ? '#DC2626' : '#6D28D9' }}>
                {weeklyBar.percent}%
              </span>
            </div>
            <div style={{ height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${weeklyBar.percent}%`,
                  background: weeklyBar.isOvertime ? '#DC2626' : '#7C3AED',
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
              <span style={{ color: '#6B7280' }}>
                {weeklyBar.isOvertime ? 'Limit exceeded' : `${weeklyBar.remaining}h remaining`}
              </span>
              <span style={{ color: '#9CA3AF' }}>PROVISIONAL - HR sign-off needed</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. MONTHLY VIEW (Compact calendar grid opening Daily detail on tap) ── */}
      {activeTab === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ fontWeight: 700, color: '#374151' }}>Monthly Roster Calendar</span>
            <span style={{ fontWeight: 700, color: '#6D28D9' }}>
              Total Month: <strong>{formatRosterHours(summaryTiles.hours_month)}</strong> ({summaryTiles.days_on_month || 0} On • {summaryTiles.days_off_month || 0} Off)
            </span>
          </div>

          {monthDays && monthDays.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))',
                gap: 6,
              }}
            >
              {monthDays.map((d) => {
                const isOn = d.status === 'on';
                const isToday = d.is_today;
                return (
                  <div
                    key={d.date}
                    onClick={() => setActiveTab('daily')}
                    style={{
                      background: isToday ? '#7C3AED' : (isOn ? '#FFFFFF' : '#F3F4F6'),
                      color: isToday ? '#FFFFFF' : (isOn ? '#1E1B4B' : '#9CA3AF'),
                      border: isToday ? '1.5px solid #6D28D9' : '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '6px 4px',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={`${d.date}: ${d.shift_name} (${d.hours}h) - Click to view daily`}
                  >
                    <div>{d.day_number}</div>
                    <div style={{ fontSize: '9px', fontWeight: 500, opacity: 0.85 }}>
                      {isOn ? `${d.hours}h` : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: '13px', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
              No monthly schedule data available in published roster.
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .smart-roster-7day-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (max-width: 500px) {
          .smart-roster-7day-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
