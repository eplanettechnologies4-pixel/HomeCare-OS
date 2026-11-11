import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock, Shield, User, MapPin, Calendar, Users, Phone, ArrowUpRight,
  AlertTriangle, CheckCircle2, ChevronRight, Activity, Pill, Truck,
  Folder, Video, Sparkles, AlertOctagon, Heart, Stethoscope, RefreshCw,
  AlertCircle, ChevronDown, Check, ShieldCheck
} from 'lucide-react';
import apiFetch from '../services/api';
import StaffIdCard from '../components/StaffIdCard';

/**
 * DoctorOverview: Specialized Clinician Overview Layout for role 'doctor'
 * =====================================================================
 * Design System: Inter, primary #6D28D9, 8px grid, cards matching Nurse Portal.
 * Responsive: Desktop 2-column (Main ~2/3 left, sticky Side ~1/3 right), stacks on tablet/mobile.
 */

// Helper to sanitize table cells: replace "None", "N/A", null, or empty with "-"
function sanitize(val) {
  if (val === null || val === undefined) return '-';
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') {
    return '-';
  }
  return s;
}

// Format consultation count (shows "-" if field is missing or undefined)
function formatCount(val) {
  if (val === null || val === undefined) return '-';
  return String(val);
}

// Format time in Asia/Karachi timezone
function formatKarachiTime(dateInput) {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateInput);
  }
}

// Format date & time in Asia/Karachi timezone
function formatKarachiDateTime(dateInput) {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateInput);
  }
}

export default function DoctorOverview({
  data,
  fetchClinicianData,
  lastUpdated,
  currentUser,
  setActivePage,
  setSelectedPatient,
  handleOpenPatientChart,
}) {
  // Roster & Employee Card state
  const [rosterData, setRosterData] = useState(null);
  const [employeeCard, setEmployeeCard] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);

  // Pending Clinical Requests active category filter for inline inspection
  const [activeRequestTab, setActiveRequestTab] = useState(null); // 'referrals' | 'consultations' | 'procedures' | null

  // Collapsible Tiers in Side Column
  // Critical, Less critical, Mild, Needs review (open by default); Stable (collapsed by default)
  const [tierExpanded, setTierExpanded] = useState({
    critical: true,
    less_critical: true,
    mild: true,
    unclassified: true,
    stable: false,
  });

  // Show all toggle for tiers with > 5 patients
  const [tierShowAll, setTierShowAll] = useState({
    critical: false,
    less_critical: false,
    mild: false,
    unclassified: false,
    stable: false,
  });

  // Fetch /api/staff-portal/roster/?view=weekly and /api/staff-portal/employee-card/
  const loadDoctorSpecificData = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const [rosterRes, cardRes] = await Promise.all([
        apiFetch('/staff-portal/roster/?view=weekly'),
        apiFetch('/staff-portal/employee-card/'),
      ]);

      if (rosterRes.ok) {
        const rJson = await rosterRes.json();
        setRosterData(rJson);
      }
      if (cardRes.ok) {
        const cJson = await cardRes.json();
        setEmployeeCard(cJson);
      }
    } catch (err) {
      console.error('Error loading doctor roster or card data:', err);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    loadDoctorSpecificData();
  }, [loadDoctorSpecificData]);

  // Combined refresh handler
  const handleRefreshAll = () => {
    fetchClinicianData(false);
    loadDoctorSpecificData();
  };

  // Staff and dashboard essentials
  const staff = data?.staff || {
    name: currentUser?.full_name || currentUser?.username || 'Dr. Bilal Ahmed',
    employee_id: currentUser?.employee_id || 'EMP010',
    designation: 'Consultant Physician & Cardiologist',
    specialities: 'Internal Medicine / Clinical Cardiology',
    contact: currentUser?.email || 'bilal.a@homecareos.com',
    employment_type: 'Full-time Clinical Specialist',
    duty_status: 'available',
  };

  const workingHours = data?.working_hours || {
    start: '09:00',
    end: '17:00',
    timezone: 'Asia/Karachi',
    is_open_now: true,
    status_label: 'Official Hospital Shift Hours',
  };

  const todayVisits = data?.today_visits || [];
  const pendingRequests = data?.pending_requests || {
    total_pending: 0,
    referrals: [],
    consultations: [],
    procedures: [],
  };

  // Consultation counts (role doctor only)
  const consultCounts = data?.consultation_counts;
  const physicalCounts = consultCounts?.physical;
  const videoCounts = consultCounts?.video;

  // High alert categories (NOTE: no_recent_vitals is intentionally NOT rendered in doctor UI)
  const highAlert = {
    critical: data?.high_alert_patients?.critical || [],
    less_critical: data?.high_alert_patients?.less_critical || [],
    mild: data?.high_alert_patients?.mild || [],
    unclassified: data?.high_alert_patients?.unclassified || [],
    stable: data?.high_alert_patients?.stable || [],
  };

  // Sort patients in each tier: most recent first
  const sortedTiers = useMemo(() => {
    const sortFn = (a, b) => new Date(b.recorded_at || 0) - new Date(a.recorded_at || 0);
    return {
      critical: [...highAlert.critical].sort(sortFn),
      less_critical: [...highAlert.less_critical].sort(sortFn),
      mild: [...highAlert.mild].sort(sortFn),
      unclassified: [...highAlert.unclassified].sort(sortFn),
      stable: [...highAlert.stable].sort(sortFn),
    };
  }, [highAlert.critical, highAlert.less_critical, highAlert.mild, highAlert.unclassified, highAlert.stable]);

  // 7-day strip calculation for current week
  const weekDays = useMemo(() => {
    const days = [];
    // Current date in Asia/Karachi as YYYY-MM-DD
    const nowKarachi = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const shifts = rosterData?.shifts || [];

    // Parse start date from roster or default to Monday of current week
    let baseDate = new Date();
    if (rosterData?.start_date) {
      const parts = rosterData.start_date.split('-');
      if (parts.length === 3) {
        baseDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    } else {
      const dayOfWeek = baseDate.getDay();
      const diffToMon = baseDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      baseDate.setDate(diffToMon);
    }
    baseDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const current = new Date(baseDate);
      current.setDate(baseDate.getDate() + i);
      const isoDate = current.toLocaleDateString('en-CA');
      const isToday = isoDate === nowKarachi;
      const dayShifts = shifts.filter((s) => s.start && s.start.startsWith(isoDate));

      days.push({
        date: current,
        isoDate,
        dayName: current.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: current.getDate(),
        isToday,
        shifts: dayShifts,
      });
    }
    return days;
  }, [rosterData]);

  // Derive Today's Shift & Duty info
  const nowKarachiStr = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  }, []);

  const todayShift = useMemo(() => {
    return (rosterData?.shifts || []).find((s) => s.start && s.start.startsWith(nowKarachiStr));
  }, [rosterData, nowKarachiStr]);

  // Next upcoming duty
  const nextDuty = useMemo(() => {
    const now = new Date();
    const futureShifts = (rosterData?.shifts || [])
      .filter((s) => new Date(s.end || s.start) > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    return futureShifts[0] || null;
  }, [rosterData]);

  // Duty status resolution
  const isWorkingHoursOpen = workingHours?.is_open_now;
  const dutyStatus = useMemo(() => {
    const sStatus = (employeeCard?.duty_status || staff.duty_status || staff.status || '').toLowerCase();
    if (sStatus === 'on_leave') return 'On leave';
    if (todayShift || isWorkingHoursOpen) return 'On duty';
    return 'Off duty';
  }, [employeeCard, staff, todayShift, isWorkingHoursOpen]);

  const toggleTier = (tierKey) => {
    setTierExpanded((prev) => ({ ...prev, [tierKey]: !prev[tierKey] }));
  };

  const toggleShowAll = (tierKey) => {
    setTierShowAll((prev) => ({ ...prev, [tierKey]: !prev[tierKey] }));
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* ── 1. Hero Band: Greeting, Working Hours, Live Refresh, Emergency Helpline ── */}
      <div
        className="card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 60%, #F5F3FF 100%)',
          borderTop: '4px solid #6D28D9',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(109, 40, 217, 0.06)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: 999,
                background: '#EDE9FE',
                color: '#6D28D9',
                letterSpacing: '0.04em',
              }}
            >
              Doctors Portal
            </span>
            <span style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} />
              Official Hours: {workingHours.start} – {workingHours.end} ({workingHours.timezone || 'Asia/Karachi'})
            </span>
            {lastUpdated && (
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                • Updated {lastUpdated}
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#1F2937', letterSpacing: '-0.02em' }}>
            Good day, {staff.name}
          </h1>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.92rem', color: '#4B5563' }}>
            <strong>{staff.designation}</strong> • Speciality: <em>{staff.specialities || 'Internal Medicine / Clinical Cardiology'}</em>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="btn btn-ghost btn-sm"
            style={{ color: '#6D28D9', borderColor: '#DDD6FE', gap: 6 }}
            title="Refresh doctor dashboard"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setActivePage('call-help')}
            className="btn btn-sm"
            style={{
              background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
              color: '#DC2626',
              border: '1px solid #FCA5A5',
              fontWeight: 700,
              gap: 6,
            }}
          >
            <Phone size={14} /> Emergency Helpline
          </button>
        </div>
      </div>

      {/* ── 2. TWO-COLUMN RESPONSIVE LAYOUT (Desktop: Main ~2/3 left, Sticky Side ~1/3 right; Mobile/Tablet: Stacked) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 24,
          alignItems: 'start',
        }}
        className="doctor-overview-grid"
      >

        {/* ════════════════════════════════════════════════════════════════
            MAIN COLUMN (~2/3 on desktop)
            ════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="doctor-main-column">

          {/* ── CARD 0: "My consultations" Stat Row (Physical & Video) ── */}
          <section className="doctor-consultations-section">
            {!data ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                  gap: 16,
                }}
              >
                <div className="skeleton" style={{ height: 168, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 168, borderRadius: 16 }} />
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                  gap: 16,
                }}
              >
                {/* Card 1: Physical consultations */}
                <div
                  className="card doctor-consult-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (setActivePage) setActivePage('patient-chart');
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && setActivePage) {
                      e.preventDefault();
                      setActivePage('patient-chart');
                    }
                  }}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 16,
                    border: '1px solid #EDE9FE',
                    borderTop: '4px solid #6D28D9',
                    boxShadow: '0 2px 12px rgba(109, 40, 217, 0.05)',
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(109, 40, 217, 0.12)';
                    e.currentTarget.style.borderColor = '#C4B5FD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(109, 40, 217, 0.05)';
                    e.currentTarget.style.borderColor = '#EDE9FE';
                  }}
                  title="Click to view patient chart & consultations"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(109, 40, 217, 0.25)',
                          flexShrink: 0,
                        }}
                      >
                        <Stethoscope size={19} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#1E1B4B' }}>
                          Physical Consultations
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                          In-person & home clinical visits
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#6D28D9',
                        background: '#EDE9FE',
                        padding: '3px 8px',
                        borderRadius: 999,
                      }}
                    >
                      <span>Chart</span>
                      <ArrowUpRight size={12} />
                    </div>
                  </div>

                  {/* Big number: this_month */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1F2937', lineHeight: 1 }}>
                      {formatCount(physicalCounts?.this_month)}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6B7280' }}>
                      this month
                    </span>
                  </div>

                  {/* Small lines: today, this_week, completed, scheduled */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      paddingTop: 12,
                      borderTop: '1px solid #F3F4F6',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Today
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937', marginTop: 2 }}>
                        {formatCount(physicalCounts?.today)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        This Week
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937', marginTop: 2 }}>
                        {formatCount(physicalCounts?.this_week)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Completed
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669', marginTop: 2 }}>
                        {formatCount(physicalCounts?.completed)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Scheduled
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#D97706', marginTop: 2 }}>
                        {formatCount(physicalCounts?.scheduled)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Video consultations */}
                <div
                  className="card"
                  style={{
                    background: '#FAFAFA',
                    borderRadius: 16,
                    border: '1px dashed #D8B4FE',
                    boxShadow: 'none',
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    cursor: 'default',
                    opacity: 0.9,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: '#F3E8FF',
                          color: '#7C3AED',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #E9D5FF',
                          flexShrink: 0,
                        }}
                      >
                        <Video size={19} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#4B5563' }}>
                          Video Consultations
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                          Telehealth & remote appointments
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: '#EDE9FE',
                        color: '#6D28D9',
                        padding: '3px 8px',
                        borderRadius: 999,
                        letterSpacing: '0.02em',
                      }}
                    >
                      Coming soon
                    </span>
                  </div>

                  {/* Big number: this_month */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#6B7280', lineHeight: 1 }}>
                      {formatCount(videoCounts?.this_month ?? 0)}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9CA3AF' }}>
                      this month
                    </span>
                  </div>

                  {/* Small lines: today, this_week, completed, scheduled */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      paddingTop: 12,
                      borderTop: '1px solid #E5E7EB',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Today
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#6B7280', marginTop: 2 }}>
                        {formatCount(videoCounts?.today ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        This Week
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#6B7280', marginTop: 2 }}>
                        {formatCount(videoCounts?.this_week ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Completed
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#6B7280', marginTop: 2 }}>
                        {formatCount(videoCounts?.completed ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Scheduled
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#6B7280', marginTop: 2 }}>
                        {formatCount(videoCounts?.scheduled ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── CARD A: "Today's roster and duty" ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #6D28D9',
              boxShadow: '0 4px 20px rgba(109, 40, 217, 0.06)',
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(109,40,217,0.25)',
                  }}
                >
                  <Calendar size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E1B4B', margin: 0 }}>
                    Today's Roster & Duty Schedule
                  </h2>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                    Shift duty window, clinical presence, and weekly schedule coverage (Asia/Karachi)
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 9999,
                    background:
                      dutyStatus === 'On duty' ? '#ECFDF5' : (dutyStatus === 'On leave' ? '#FEF3C7' : '#F3F4F6'),
                    color:
                      dutyStatus === 'On duty' ? '#047857' : (dutyStatus === 'On leave' ? '#B45309' : '#4B5563'),
                    border: `1.5px solid ${dutyStatus === 'On duty' ? '#A7F3D0' : (dutyStatus === 'On leave' ? '#FDE68A' : '#E5E7EB')}`,
                  }}
                >
                  {dutyStatus === 'On duty' ? '• On duty' : dutyStatus}
                </span>
              </div>
            </div>

            {/* Duty Window Details & Next Duty */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F3FF 100%)',
                border: '1.5px solid #DDD6FE',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#7C3AED', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {todayShift ? (todayShift.type || 'Assigned Clinical Shift') : 'Official Duty Window'}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E1B4B', marginTop: 2 }}>
                    {todayShift
                      ? `${formatKarachiTime(todayShift.start)} – ${formatKarachiTime(todayShift.end)} (Asia/Karachi)`
                      : `${workingHours.start} – ${workingHours.end} (${workingHours.timezone || 'Asia/Karachi'})`}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#4B5563', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={13} style={{ color: '#7C3AED' }} />
                    {todayShift?.patient?.location || 'Islamabad Clinical Operations Center · Attending Physician Rounds'}
                  </div>
                </div>

                {/* Next Duty */}
                <div style={{ textAlign: 'right', minWidth: 200 }}>
                  <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Next Scheduled Duty
                  </div>
                  {nextDuty ? (
                    <div style={{ marginTop: 2 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937' }}>
                        {formatKarachiDateTime(nextDuty.start)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#6D28D9', fontWeight: 600 }}>
                        {nextDuty.patient?.name ? `Patient: ${nextDuty.patient.name}` : (nextDuty.type || 'Clinical Shift')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#9CA3AF', fontStyle: 'italic', marginTop: 2 }}>
                      No further scheduled duties this week
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Compact 7-Day Strip of This Week's Roster */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4B5563', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                7-Day Weekly Roster Strip (Mon – Sun)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 8,
                }}
              >
                {weekDays.map((day) => {
                  const hasShift = day.shifts.length > 0;
                  return (
                    <div
                      key={day.isoDate}
                      style={{
                        padding: '10px 6px',
                        borderRadius: 10,
                        textAlign: 'center',
                        background: day.isToday ? '#EDE9FE' : (hasShift ? '#FAF5FF' : '#F9FAFB'),
                        border: day.isToday
                          ? '2px solid #7C3AED'
                          : `1px solid ${hasShift ? '#DDD6FE' : '#E5E7EB'}`,
                        boxShadow: day.isToday ? '0 2px 8px rgba(109,40,217,0.15)' : 'none',
                        transition: 'all 150ms ease',
                      }}
                      title={hasShift ? `${day.shifts.length} duty shift(s) scheduled on ${day.isoDate}` : `No duties scheduled on ${day.isoDate}`}
                    >
                      <div style={{ fontSize: '0.72rem', color: day.isToday ? '#6D28D9' : '#6B7280', fontWeight: 700 }}>
                        {day.dayName}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: day.isToday ? '#6D28D9' : '#1F2937', margin: '2px 0' }}>
                        {day.dayNum}
                      </div>
                      <div>
                        {hasShift ? (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              background: '#6D28D9',
                              color: '#FFFFFF',
                              padding: '2px 6px',
                              borderRadius: 999,
                              display: 'inline-block',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {day.shifts.length > 1 ? `${day.shifts.length} Shifts` : 'Duty'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                            {day.isToday ? 'Standby' : 'Off'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── TABLE B: "Today's scheduled visits" ── */}
          <section
            className="card"
            style={{
              padding: '24px',
              borderTop: '4px solid #6D28D9',
              background: '#FFFFFF',
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(109, 40, 217, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                  Today's Scheduled Visits
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#6B7280' }}>
                  Patients assigned for clinical rounds, consultations, and therapy sessions today
                </p>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '4px 10px', borderRadius: 8 }}>
                {todayVisits.length} Scheduled
              </span>
            </div>

            {todayVisits.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
                <Calendar size={32} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No visits scheduled for today</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#9CA3AF' }}>You have no clinical appointments or rounds on the calendar today.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#6B7280', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '10px 14px' }}>Patient</th>
                      <th style={{ padding: '10px 14px' }}>Visit Time</th>
                      <th style={{ padding: '10px 14px' }}>Location</th>
                      <th style={{ padding: '10px 14px' }}>Visit Type</th>
                      <th style={{ padding: '10px 14px' }}>Buddy Staff</th>
                      <th style={{ padding: '10px 14px' }}>Care Manager</th>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayVisits.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => handleOpenPatientChart(v)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open chart for ${v.patient_name}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenPatientChart(v);
                          }
                        }}
                        style={{
                          borderBottom: '1px solid #F3F4F6',
                          cursor: 'pointer',
                          transition: 'background-color 150ms ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '14px' }}>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{v.patient_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {sanitize(v.patient_code)} • MRN: {sanitize(v.mr_number)}
                          </div>
                        </td>
                        <td style={{ padding: '14px', fontWeight: 600, color: '#374151' }}>
                          {sanitize(v.visit_time)}
                        </td>
                        <td style={{ padding: '14px', color: '#4B5563', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} style={{ color: '#9CA3AF' }} /> {sanitize(v.location)}
                          </span>
                        </td>
                        <td style={{ padding: '14px', fontWeight: 600, color: '#6D28D9' }}>
                          {sanitize(v.visit_type)}
                        </td>
                        <td style={{ padding: '14px', color: '#4B5563' }}>
                          {sanitize(v.buddy_staff)}
                        </td>
                        <td style={{ padding: '14px', color: '#4B5563' }}>
                          {sanitize(v.care_manager)}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 999,
                              background: v.status === 'in_progress' ? '#EFF6FF' : (v.status === 'completed' ? '#ECFDF5' : '#FAF5FF'),
                              color: v.status === 'in_progress' ? '#1D4ED8' : (v.status === 'completed' ? '#047857' : '#6D28D9'),
                            }}
                          >
                            {sanitize(v.status_display || v.status)}
                          </span>
                        </td>
                        <td style={{ padding: '14px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPatientChart(v);
                            }}
                            className="btn btn-primary btn-sm"
                            style={{ background: '#6D28D9', borderColor: '#6D28D9', gap: 4, padding: '4px 12px', fontSize: '0.78rem' }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>

        {/* ════════════════════════════════════════════════════════════════
            SIDE COLUMN (~1/3 on desktop, sticky)
            ════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="doctor-side-column">

          {/* ── CARD C: Digital ID Card (Reusing StaffIdCard with live data) ── */}
          <section
            className="card doctor-id-card-section"
            style={{
              padding: '20px',
              borderTop: '4px solid #6D28D9',
              background: '#FFFFFF',
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(109, 40, 217, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={16} style={{ color: '#6D28D9' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: '#6D28D9', letterSpacing: '0.05em' }}>
                  Digital Clinician Credential
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: dutyStatus === 'On duty' ? '#059669' : '#4B5563',
                  background: dutyStatus === 'On duty' ? '#ECFDF5' : '#F3F4F6',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {dutyStatus}
              </span>
            </div>

            {/* Existing StaffIdCard component with live doctor data */}
            <StaffIdCard staffMember={employeeCard || staff} />
          </section>

          {/* Remaining Side Column Cards (Requests + Tiers) */}
          <div className="doctor-side-rest" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── CARD D: Pending Clinical Requests ── */}
          <section
            className="card"
            style={{
              padding: '20px 22px',
              borderTop: '4px solid #F59E0B',
              background: '#FFFFFF',
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: '#B45309', letterSpacing: '0.05em' }}>
                Pending Clinical Requests
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: 999 }}>
                {pendingRequests.total_pending} Pending
              </span>
            </div>

            {/* 3 Clickable Count Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveRequestTab(activeRequestTab === 'referrals' ? null : 'referrals')}
                aria-pressed={activeRequestTab === 'referrals'}
                style={{
                  padding: '12px 6px',
                  background: activeRequestTab === 'referrals' ? '#FDE68A' : '#FFFBEB',
                  borderRadius: 10,
                  border: `1.5px solid ${activeRequestTab === 'referrals' ? '#D97706' : '#FDE68A'}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#B45309' }}>
                  {pendingRequests.referrals?.length || 0}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 600, marginTop: 2 }}>
                  Referrals
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRequestTab(activeRequestTab === 'consultations' ? null : 'consultations')}
                aria-pressed={activeRequestTab === 'consultations'}
                style={{
                  padding: '12px 6px',
                  background: activeRequestTab === 'consultations' ? '#BFDBFE' : '#EFF6FF',
                  borderRadius: 10,
                  border: `1.5px solid ${activeRequestTab === 'consultations' ? '#2563EB' : '#BFDBFE'}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1D4ED8' }}>
                  {pendingRequests.consultations?.length || 0}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: 600, marginTop: 2 }}>
                  Consultations
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRequestTab(activeRequestTab === 'procedures' ? null : 'procedures')}
                aria-pressed={activeRequestTab === 'procedures'}
                style={{
                  padding: '12px 6px',
                  background: activeRequestTab === 'procedures' ? '#BBF7D0' : '#F0FDF4',
                  borderRadius: 10,
                  border: `1.5px solid ${activeRequestTab === 'procedures' ? '#059669' : '#BBF7D0'}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#047857' }}>
                  {pendingRequests.procedures?.length || 0}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#065F46', fontWeight: 600, marginTop: 2 }}>
                  Procedures
                </div>
              </button>
            </div>

            {/* Expanded List when a Category is Clicked */}
            {activeRequestTab && (
              <div style={{ marginTop: 14, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4B5563', textTransform: 'capitalize', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Pending {activeRequestTab}</span>
                  <button
                    type="button"
                    onClick={() => setActiveRequestTab(null)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                  >
                    Close
                  </button>
                </div>
                {(!pendingRequests[activeRequestTab] || pendingRequests[activeRequestTab].length === 0) ? (
                  <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '8px 0' }}>
                    No pending {activeRequestTab} requests at this time.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {pendingRequests[activeRequestTab].map((r) => (
                      <div
                        key={r.id}
                        style={{
                          padding: '8px 10px',
                          background: '#F9FAFB',
                          borderRadius: 8,
                          border: '1px solid #E5E7EB',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#111827' }}>{r.patient_name}</span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: r.urgency === 'stat' ? '#FEE2E2' : (r.urgency === 'urgent' ? '#FEF3C7' : '#F3F4F6'),
                              color: r.urgency === 'stat' ? '#DC2626' : (r.urgency === 'urgent' ? '#D97706' : '#4B5563'),
                              textTransform: 'uppercase',
                            }}
                          >
                            {r.urgency || 'routine'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#4B5563', marginTop: 4 }}>
                          {r.notes || 'No clinical notes provided.'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: 4 }}>
                          Logged: {formatKarachiDateTime(r.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── CARD E: Patient Vitals & Clinical Alerts Tiering ── */}
          <section
            className="card"
            style={{
              padding: '20px 22px',
              borderTop: '4px solid #EF4444',
              background: '#FFFFFF',
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                  Patient Vitals & Clinical Alerts Tiering
                </h3>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#92400E',
                    background: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    padding: '2px 7px',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Clinical alert threshold ranges are provisional and pending senior clinical directorate sign-off."
                >
                  <Shield size={11} /> {data?.provisional_note || 'Provisional thresholds - needs clinical sign-off'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#6B7280' }}>
                Assigned patients grouped by physiological stability (ordered most recent first)
              </p>
            </div>

            {/* Stacked Collapsible Sections: Critical, Less critical, Mild, Needs review, Stable */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>

              {/* 1. Critical Tier */}
              <div style={{ border: '1px solid #FECACA', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleTier('critical')}
                  aria-expanded={tierExpanded.critical}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#FEF2F2',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertOctagon size={16} style={{ color: '#DC2626' }} />
                    <span style={{ fontWeight: 800, color: '#991B1B', fontSize: '0.88rem' }}>Critical</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 999 }}>
                      {sortedTiers.critical.length}
                    </span>
                    {tierExpanded.critical ? <ChevronDown size={15} style={{ color: '#991B1B' }} /> : <ChevronRight size={15} style={{ color: '#991B1B' }} />}
                  </div>
                </button>

                {tierExpanded.critical && (
                  <div style={{ padding: '10px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedTiers.critical.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '4px' }}>No patients in critical range</div>
                    ) : (
                      <>
                        {(tierShowAll.critical ? sortedTiers.critical : sortedTiers.critical.slice(0, 5)).map((p) => (
                          <div
                            key={p.patient_id}
                            onClick={() => handleOpenPatientChart(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenPatientChart(p);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: '#FFF5F5',
                              borderRadius: 8,
                              border: '1px solid #FCA5A5',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
                                {p.patient_name} <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>({p.patient_code || `PT-${p.patient_id}`})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 700 }}>Chart →</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600, marginTop: 3 }}>
                              {p.spo2 ? `SpO2 ${p.spo2}%` : ''} {p.bp && p.bp !== '-' ? `• BP ${p.bp}` : ''} {p.hr ? `• HR ${p.hr} bpm` : ''}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2 }}>
                              Last recorded: {formatKarachiTime(p.recorded_at)} (Asia/Karachi)
                            </div>
                          </div>
                        ))}
                        {sortedTiers.critical.length > 5 && (
                          <button
                            type="button"
                            onClick={() => toggleShowAll('critical')}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', color: '#DC2626', padding: '4px' }}
                          >
                            {tierShowAll.critical ? 'Show less' : `Show all (${sortedTiers.critical.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Less Critical Tier */}
              <div style={{ border: '1px solid #FDE68A', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleTier('less_critical')}
                  aria-expanded={tierExpanded.less_critical}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#FFFBEB',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} style={{ color: '#D97706' }} />
                    <span style={{ fontWeight: 800, color: '#92400E', fontSize: '0.88rem' }}>Less Critical</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 999 }}>
                      {sortedTiers.less_critical.length}
                    </span>
                    {tierExpanded.less_critical ? <ChevronDown size={15} style={{ color: '#92400E' }} /> : <ChevronRight size={15} style={{ color: '#92400E' }} />}
                  </div>
                </button>

                {tierExpanded.less_critical && (
                  <div style={{ padding: '10px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedTiers.less_critical.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '4px' }}>No patients in less critical tier</div>
                    ) : (
                      <>
                        {(tierShowAll.less_critical ? sortedTiers.less_critical : sortedTiers.less_critical.slice(0, 5)).map((p) => (
                          <div
                            key={p.patient_id}
                            onClick={() => handleOpenPatientChart(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenPatientChart(p);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: '#FFFDF5',
                              borderRadius: 8,
                              border: '1px solid #FCD34D',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
                                {p.patient_name} <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>({p.patient_code || `PT-${p.patient_id}`})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#D97706', fontWeight: 700 }}>Chart →</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600, marginTop: 3 }}>
                              {p.spo2 ? `SpO2 ${p.spo2}%` : ''} {p.bp && p.bp !== '-' ? `• BP ${p.bp}` : ''} {p.hr ? `• HR ${p.hr} bpm` : ''}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2 }}>
                              Last recorded: {formatKarachiTime(p.recorded_at)} (Asia/Karachi)
                            </div>
                          </div>
                        ))}
                        {sortedTiers.less_critical.length > 5 && (
                          <button
                            type="button"
                            onClick={() => toggleShowAll('less_critical')}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', color: '#D97706', padding: '4px' }}
                          >
                            {tierShowAll.less_critical ? 'Show less' : `Show all (${sortedTiers.less_critical.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Mild Tier */}
              <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleTier('mild')}
                  aria-expanded={tierExpanded.mild}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#EFF6FF',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={16} style={{ color: '#2563EB' }} />
                    <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: '0.88rem' }}>Mild</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#DBEAFE', color: '#2563EB', padding: '2px 8px', borderRadius: 999 }}>
                      {sortedTiers.mild.length}
                    </span>
                    {tierExpanded.mild ? <ChevronDown size={15} style={{ color: '#1E40AF' }} /> : <ChevronRight size={15} style={{ color: '#1E40AF' }} />}
                  </div>
                </button>

                {tierExpanded.mild && (
                  <div style={{ padding: '10px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedTiers.mild.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '4px' }}>No borderline deviations</div>
                    ) : (
                      <>
                        {(tierShowAll.mild ? sortedTiers.mild : sortedTiers.mild.slice(0, 5)).map((p) => (
                          <div
                            key={p.patient_id}
                            onClick={() => handleOpenPatientChart(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenPatientChart(p);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: '#F0F7FF',
                              borderRadius: 8,
                              border: '1px solid #93C5FD',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
                                {p.patient_name} <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>({p.patient_code || `PT-${p.patient_id}`})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 700 }}>Chart →</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 600, marginTop: 3 }}>
                              {p.temp ? `Temp ${p.temp}°C • ` : ''}BP {p.bp || '-'} {p.hr ? `• HR ${p.hr} bpm` : ''}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2 }}>
                              Last recorded: {formatKarachiTime(p.recorded_at)} (Asia/Karachi)
                            </div>
                          </div>
                        ))}
                        {sortedTiers.mild.length > 5 && (
                          <button
                            type="button"
                            onClick={() => toggleShowAll('mild')}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', color: '#2563EB', padding: '4px' }}
                          >
                            {tierShowAll.mild ? 'Show less' : `Show all (${sortedTiers.mild.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Needs Review (Unclassified Anomalies) */}
              <div style={{ border: '1px solid #DDD6FE', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleTier('unclassified')}
                  aria-expanded={tierExpanded.unclassified}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#F5F3FF',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} style={{ color: '#7C3AED' }} />
                    <span style={{ fontWeight: 800, color: '#6D28D9', fontSize: '0.88rem' }}>Needs review</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#EDE9FE', color: '#7C3AED', padding: '2px 8px', borderRadius: 999 }}>
                      {sortedTiers.unclassified.length}
                    </span>
                    {tierExpanded.unclassified ? <ChevronDown size={15} style={{ color: '#6D28D9' }} /> : <ChevronRight size={15} style={{ color: '#6D28D9' }} />}
                  </div>
                </button>

                {tierExpanded.unclassified && (
                  <div style={{ padding: '10px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedTiers.unclassified.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '4px' }}>No unclassified anomalies</div>
                    ) : (
                      <>
                        {(tierShowAll.unclassified ? sortedTiers.unclassified : sortedTiers.unclassified.slice(0, 5)).map((p) => (
                          <div
                            key={p.patient_id}
                            onClick={() => handleOpenPatientChart(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenPatientChart(p);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: '#FAF5FF',
                              borderRadius: 8,
                              border: '1px solid #C4B5FD',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
                                {p.patient_name} <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>({p.patient_code || `PT-${p.patient_id}`})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#7C3AED', fontWeight: 700 }}>Chart →</span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#6D28D9', fontWeight: 600, marginTop: 3 }}>
                              {p.unclassified_reasons && p.unclassified_reasons.length > 0
                                ? p.unclassified_reasons.join(' • ')
                                : `BP ${p.bp} • HR ${p.hr} • Glu ${p.blood_glucose ?? '-'}`}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2 }}>
                              Last recorded: {formatKarachiTime(p.recorded_at)} (Asia/Karachi)
                            </div>
                          </div>
                        ))}
                        {sortedTiers.unclassified.length > 5 && (
                          <button
                            type="button"
                            onClick={() => toggleShowAll('unclassified')}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', color: '#7C3AED', padding: '4px' }}
                          >
                            {tierShowAll.unclassified ? 'Show less' : `Show all (${sortedTiers.unclassified.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Stable Tier (COLLAPSED by default, count only) */}
              <div style={{ border: '1px solid #BBF7D0', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleTier('stable')}
                  aria-expanded={tierExpanded.stable}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#F0FDF4',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} style={{ color: '#16A34A' }} />
                    <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.88rem' }}>Stable</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 999 }}>
                      {sortedTiers.stable.length}
                    </span>
                    {tierExpanded.stable ? <ChevronDown size={15} style={{ color: '#166534' }} /> : <ChevronRight size={15} style={{ color: '#166534' }} />}
                  </div>
                </button>

                {tierExpanded.stable && (
                  <div style={{ padding: '10px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedTiers.stable.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '4px' }}>No stable records logged yet</div>
                    ) : (
                      <>
                        {(tierShowAll.stable ? sortedTiers.stable : sortedTiers.stable.slice(0, 5)).map((p) => (
                          <div
                            key={p.patient_id}
                            onClick={() => handleOpenPatientChart(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenPatientChart(p);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: '#F7FDF9',
                              borderRadius: 8,
                              border: '1px solid #86EFAC',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
                                {p.patient_name} <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>({p.patient_code || `PT-${p.patient_id}`})</span>
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 700 }}>Chart →</span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#15803D', fontWeight: 600, marginTop: 3 }}>
                              Vitals within normal limits
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2 }}>
                              Last recorded: {formatKarachiTime(p.recorded_at)} (Asia/Karachi)
                            </div>
                          </div>
                        ))}
                        {sortedTiers.stable.length > 5 && (
                          <button
                            type="button"
                            onClick={() => toggleShowAll('stable')}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', color: '#16A34A', padding: '4px' }}
                          >
                            {tierShowAll.stable ? 'Show less' : `Show all (${sortedTiers.stable.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

            </div>
          </section>

          </div>{/* /doctor-side-rest */}

        </div>

      </div>

      {/* Responsive Stacking & Sticky Side Column Styles */}
      <style>{`
        @media (max-width: 1023px) {
          .doctor-overview-grid {
            display: flex !important;
            flex-direction: column !important;
          }
          .doctor-side-column {
            display: contents !important;
          }
          .doctor-id-card-section {
            order: 1 !important;
          }
          .doctor-main-column {
            order: 2 !important;
          }
          .doctor-side-rest {
            order: 3 !important;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
        }
        @media (min-width: 1024px) {
          .doctor-overview-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 2fr) minmax(340px, 1fr) !important;
          }
          .doctor-side-column {
            display: flex;
            flex-direction: column;
            gap: 24px;
            position: sticky;
            top: 24px;
            align-self: start;
          }
        }
      `}</style>

    </div>
  );
}

