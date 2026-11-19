import React, { useState } from 'react';
import { Calendar, CalendarDays, Clock, MapPin, Shield } from 'lucide-react';
import { formatRosterHours, getDutyStatusConfig, calculateWeeklyBarPercent } from '../utils/rosterHelpers';

export default function SmartRosterSection({ rosterSummary }) {
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
  } = rosterSummary;

  const dutyBadge = getDutyStatusConfig(dutyStatus.status);
  const maxWeeklyHours = summaryTiles.max_weekly_hours || 60;
  const weeklyBar = calculateWeeklyBarPercent(summaryTiles.hours_week || weekTotalHours, maxWeeklyHours);

  return (
    <section
      className="card smart-roster-section"
      style={{
        background: '#FFFFFF',
        borderRadius: 18,
        border: '1px solid #E9D5FF',
        boxShadow: '0 4px 20px rgba(109,40,217,0.05)',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* ── Section Title & Tab Switcher (Daily / Weekly / Monthly) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
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
              {activeTab === 'daily' && "Today's Duty & Schedule"}
              {activeTab === 'weekly' && "Weekly Roster Schedule"}
              {activeTab === 'monthly' && "Monthly Roster Schedule"}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#6B7280', marginTop: 2 }}>
              <Shield size={12} style={{ color: '#059669' }} />
              <span>Published Roster Data Only</span>
              <span>•</span>
              <span style={{ color: '#9CA3AF' }}>Live Schedule</span>
            </div>
          </div>
        </div>

        {/* ── One-box Segmented View Switcher: Daily (first) | Weekly | Monthly ── */}
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
      </div>

      {/* ── 1. DAILY VIEW (Default on first load) ── */}
      {activeTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Duty Status Block */}
          <div
            style={{
              background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F3FF 100%)',
              borderRadius: 14,
              border: '1px solid #E9D5FF',
              padding: '18px 22px',
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 1.2fr) minmax(240px, 2fr) minmax(200px, 1.4fr)',
              gap: 18,
              alignItems: 'center',
            }}
            className="smart-roster-duty-block"
          >
            {/* Col A: Duty Badge & Shift Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                    borderRadius: 9999,
                    fontSize: '12px',
                    fontWeight: 700,
                    background: dutyBadge.bg,
                    color: dutyBadge.color,
                    border: `1px solid ${dutyBadge.border}`,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dutyBadge.dot }} />
                  {dutyBadge.label}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E1B4B' }}>
                  {dutyStatus.shift_name || 'No Shift Scheduled'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#4B5563' }}>
                <Clock size={13} style={{ color: '#6D28D9' }} />
                <span>{dutyStatus.window || 'Off Duty'}</span>
                {dutyStatus.location && (
                  <>
                    <span>•</span>
                    <MapPin size={13} style={{ color: '#6D28D9' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {dutyStatus.location}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Col B: Shift Progress Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#6B7280' }}>
                <span>Shift Progress</span>
                <span style={{ color: '#6D28D9', fontWeight: 700 }}>
                  {dutyStatus.status === 'On duty' ? `${dutyStatus.progress_percent || 0}%` : 'Shift Inactive'}
                </span>
              </div>
              <div style={{ height: 8, background: '#E9D5FF', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${dutyStatus.status === 'On duty' ? Math.min(100, Math.max(5, dutyStatus.progress_percent || 0)) : 0}%`,
                    background: 'linear-gradient(90deg, #7C3AED 0%, #4F46E5 100%)',
                    borderRadius: 999,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>

            {/* Col C: Next Duty */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderLeft: '1px solid #E9D5FF', paddingLeft: 16 }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Next Duty
              </span>
              {dutyStatus.next_duty ? (
                <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
                  <span style={{ fontWeight: 700, color: '#1E1B4B' }}>
                    {dutyStatus.next_duty.shift_name} ({dutyStatus.next_duty.date})
                  </span>
                  <span style={{ color: '#4B5563', fontSize: '11px' }}>
                    {dutyStatus.next_duty.window}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic' }}>
                  No upcoming shift in published roster
                </span>
              )}
            </div>
          </div>

          {/* Daily Quick Summary Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                  Today's Scheduled Hours
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E1B4B', marginTop: 2 }}>
                  {formatRosterHours(summaryTiles.hours_today)}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600, background: '#FAF5FF', padding: '4px 10px', borderRadius: 8 }}>
                {dutyStatus.status || 'Off'}
              </span>
            </div>

            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                  Current Week & Month
                </span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginTop: 2 }}>
                  Week: <strong style={{ color: '#6D28D9' }}>{formatRosterHours(summaryTiles.hours_week)}</strong> • Month: <strong>{formatRosterHours(summaryTiles.hours_month)}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('weekly')}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#6D28D9',
                  background: 'none',
                  border: '1px solid #DDD6FE',
                  padding: '4px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                View Week →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. WEEKLY VIEW (7-Day Strip + Weekly Capacity Bar) ── */}
      {activeTab === 'weekly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Weekly Shift Strip */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      boxShadow: isToday ? '0 2px 8px rgba(109,40,217,0.1)' : 'none',
                    }}
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
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Summary Tiles & Max Hours Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {/* Tile 1: Scheduled Hours */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Week Scheduled Hours
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#1E1B4B' }}>
                  {formatRosterHours(summaryTiles.hours_week)}
                </span>
                <span style={{ fontSize: '11px', color: '#4B5563' }}>
                  Week Total
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6B7280', marginTop: 4, borderTop: '1px dashed #E5E7EB', paddingTop: 4 }}>
                <span>Today: <strong>{formatRosterHours(summaryTiles.hours_today)}</strong></span>
                <span>Month: <strong>{formatRosterHours(summaryTiles.hours_month)}</strong></span>
              </div>
            </div>

            {/* Tile 2: Weekly Days Breakdown */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Days This Week
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_on_week || 0} On
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_off_week || 0} Off
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_standby_week || 0} Standby
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: 6 }}>
                Published assignments in Mon-Sun envelope
              </div>
            </div>

            {/* Tile 3: Weekly Bar vs ROSTER_MAX_WEEKLY_HOURS (60h max) */}
            <div
              style={{
                background: '#F9FAFB',
                border: `1px solid ${weeklyBar.isOvertime ? '#FCA5A5' : '#E5E7EB'}`,
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                    Weekly Limit: {maxWeeklyHours}h
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: weeklyBar.isOvertime ? '#DC2626' : '#6D28D9' }}>
                    {weeklyBar.percent}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${weeklyBar.percent}%`,
                      background: weeklyBar.isOvertime ? '#DC2626' : '#7C3AED',
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '10px' }}>
                <span style={{ color: '#6B7280' }}>
                  {weeklyBar.isOvertime ? 'Limit exceeded' : `${weeklyBar.remaining}h remaining`}
                </span>
                <span style={{ color: '#9CA3AF', fontWeight: 500 }}>
                  PROVISIONAL - HR sign-off needed
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. MONTHLY VIEW (Full Month Calendar + Month Summary) ── */}
      {activeTab === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Monthly Summary Tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {/* Tile 1: Total Month Scheduled */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Month Scheduled Hours
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#1E1B4B' }}>
                  {formatRosterHours(summaryTiles.hours_month)}
                </span>
                <span style={{ fontSize: '11px', color: '#4B5563' }}>
                  Total Month
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: 6 }}>
                Cumulative published shift hours in current month
              </div>
            </div>

            {/* Tile 2: Monthly Days Breakdown */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Days This Month
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_on_month || 0} On
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_off_month || 0} Off
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '2px 7px', borderRadius: 6 }}>
                  {summaryTiles.days_standby_month || 0} Standby
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: 6 }}>
                Cumulative published days in current month
              </div>
            </div>
          </div>

          {/* Full Monthly Calendar Grid */}
          {monthDays && monthDays.length > 0 ? (
            <div
              style={{
                background: '#FAF5FF',
                border: '1px solid #E9D5FF',
                borderRadius: 14,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 700, color: '#1E1B4B' }}>
                <span>Monthly Roster Calendar</span>
                <span style={{ fontSize: '11px', color: '#6D28D9' }}>
                  Total Month: <strong>{formatRosterHours(summaryTiles.hours_month)}</strong>
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                  gap: 6,
                }}
              >
                {monthDays.map((d) => {
                  const isOn = d.status === 'on';
                  const isToday = d.is_today;
                  return (
                    <div
                      key={d.date}
                      style={{
                        background: isToday ? '#7C3AED' : (isOn ? '#FFFFFF' : '#F3F4F6'),
                        color: isToday ? '#FFFFFF' : (isOn ? '#1E1B4B' : '#9CA3AF'),
                        border: isToday ? '1.5px solid #6D28D9' : '1px solid #E5E7EB',
                        borderRadius: 8,
                        padding: '6px 4px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                      title={`${d.date}: ${d.shift_name} (${d.hours}h)`}
                    >
                      <div>{d.day_number}</div>
                      <div style={{ fontSize: '9px', fontWeight: 500, opacity: 0.85 }}>
                        {isOn ? `${d.hours}h` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
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
          .smart-roster-duty-block {
            grid-template-columns: 1fr !important;
          }
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
