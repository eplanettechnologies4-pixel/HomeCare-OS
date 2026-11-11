import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock, User, Phone, MapPin, AlertTriangle,
  Calendar, FileText, ChevronRight, Activity, Bell, CheckCircle2,
  PlusCircle, AlertCircle, RefreshCw, WifiOff,
  Stethoscope, Pill, ClipboardCheck, UserCheck, MessageSquare,
  ArrowUpRight, HeartHandshake, Syringe, Car
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import StaffIdCard from '../components/StaffIdCard';
import { Modal, Input, Textarea, Button, Badge } from '../components/ui';

export default function NurseHome() {
  const setActivePage = useStore((s) => s.setActivePage);
  const currentUser = useStore((s) => s.currentUser);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [employeeCard, setEmployeeCard] = useState(null);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const dataRef = useRef(null);

  const inFlightRef = useRef(false);
  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);
  const backoffDelayRef = useRef(30000);
  const prevVersionRef = useRef(null);

  // Live timer state
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Inline Roster Tab state
  const [rosterTab, setRosterTab] = useState('daily'); // 'daily' | 'weekly' | 'monthly'

  // Modals
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterView, setRosterView] = useState('weekly');
  const [rosterShifts, setRosterShifts] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimDate, setClaimDate] = useState(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return y.toISOString().split('T')[0];
  });
  const [claimHours, setClaimHours] = useState('1.5');
  const [claimReason, setClaimReason] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState(null);

  const [showClaimHistoryModal, setShowClaimHistoryModal] = useState(false);
  const [claimHistory, setClaimHistory] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  // Quick Action Request Modal
  const [activeRequestModal, setActiveRequestModal] = useState(null); // 'supervisor_visit' | 'pharmacy_order' | 'consultation_booking'
  const [reqUrgency, setReqUrgency] = useState('routine');
  const [reqNotes, setReqNotes] = useState('');
  const [reqDetails, setReqDetails] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);
  const [modalFeedback, setModalFeedback] = useState(null);

  // View All Alerts Modal
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Fetch home dashboard payload with version hash comparison
  const fetchDashboardData = useCallback(async (isBackground = false) => {
    // Prevent overlapping requests
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (!isBackground) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await apiFetch('/staff-portal/home/', { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      setIsOffline(false);
      setLastUpdatedTime(new Date());

      // Reset exponential backoff on success
      backoffDelayRef.current = 30000;

      // Version compare to avoid unnecessary re-renders
      const newVersion = json.version || json.updated_at || (json.server_time ? `${json.duty?.state}-${json.patient?.id}-${(json.alerts || []).length}-${json.claims_summary?.pending}` : null);

      if (dataRef.current && newVersion && newVersion === prevVersionRef.current) {
        return;
      }

      prevVersionRef.current = newVersion;
      dataRef.current = json;
      setData(json);
      if (json.duty?.time_left_seconds !== undefined) {
        setRemainingSeconds(json.duty.time_left_seconds);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;

      // Exponential backoff on errors: increase interval up to 60s
      backoffDelayRef.current = Math.min(60000, Math.max(5000, Math.floor(backoffDelayRef.current * 1.5)));

      if (isBackground) {
        setIsOffline(true);
      } else {
        setError(err.message || 'Could not load nurse dashboard');
      }
    } finally {
      inFlightRef.current = false;
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchEmployeeCard = useCallback(async () => {
    try {
      const res = await apiFetch('/staff-portal/employee-card/');
      if (res.ok) {
        const json = await res.json();
        setEmployeeCard(json);
      }
    } catch (err) {
      console.error('Failed to fetch employee card:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchDashboardData(false);
    fetchEmployeeCard();

    const scheduleNext = () => {
      if (!isMounted) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      if (document.visibilityState === 'visible') {
        timerRef.current = setTimeout(async () => {
          if (!isMounted) return;
          if (document.visibilityState === 'visible') {
            await Promise.all([
              fetchDashboardData(true),
              fetchEmployeeCard(),
            ]);
          }
          scheduleNext();
        }, backoffDelayRef.current);
      }
    };

    scheduleNext();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
        fetchEmployeeCard();
        scheduleNext();
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
        fetchEmployeeCard();
        scheduleNext();
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      backoffDelayRef.current = 30000;
      fetchDashboardData(true);
      fetchEmployeeCard();
      scheduleNext();
    };

    const handleOffline = () => setIsOffline(true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchDashboardData, fetchEmployeeCard]);

  // Server-time synchronized live ticking
  useEffect(() => {
    if (!data?.server_time) return;

    const serverMs = new Date(data.server_time).getTime();
    const localStart = Date.now();
    const offset = serverMs - localStart;

    const interval = setInterval(() => {
      const now = new Date(Date.now() + offset);
      setCurrentTimeStr(
        now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [data?.server_time]);

  // Format seconds into HH:MM:SS
  const formatCountdown = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Safe pickup time format parser (prevents "Invalid Date")
  const formatPickupTime = (timeStr) => {
    if (!timeStr || !String(timeStr).trim()) return 'Pickup not set';
    const s = String(timeStr).trim();
    if (/^\d{1,2}:\d{2}\s*(AM|PM|am|pm)$/i.test(s)) {
      return s;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return s;
  };

  // Safe time-ago formatter
  const formatTimeAgo = (isoStr) => {
    if (!isoStr) return '';
    try {
      const diffMs = Date.now() - new Date(isoStr).getTime();
      const mins = Math.max(1, Math.floor(diffMs / 60000));
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return '';
    }
  };

  // Fetch Roster modal data
  const openRoster = async (view) => {
    setRosterView(view);
    setShowRosterModal(true);
    setLoadingRoster(true);
    try {
      const res = await apiFetch(`/staff-portal/roster/?view=${view}`);
      if (res.ok) {
        const json = await res.json();
        setRosterShifts(json.shifts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRoster(false);
    }
  };

  // Fetch Overtime Claim History
  const openClaimHistory = async () => {
    setShowClaimHistoryModal(true);
    setLoadingClaims(true);
    try {
      const res = await apiFetch('/staff-portal/overtime-claims/');
      if (res.ok) {
        const json = await res.json();
        setClaimHistory(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingClaims(false);
    }
  };

  // Submit Overtime Claim
  const handleSubmitClaim = async (e) => {
    if (e) e.preventDefault();
    setSubmittingClaim(true);
    setClaimFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/overtime-claims/', {
        method: 'POST',
        body: JSON.stringify({
          date: claimDate,
          hours: claimHours,
          reason: claimReason,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setClaimFeedback({ type: 'error', text: resData.detail || 'Failed to submit claim.' });
      } else {
        setClaimFeedback({ type: 'success', text: 'Overtime claim submitted successfully for supervisor review.' });
        fetchDashboardData(true);
        setTimeout(() => {
          setShowClaimModal(false);
          setClaimFeedback(null);
          setClaimReason('');
        }, 1500);
      }
    } catch (err) {
      setClaimFeedback({ type: 'error', text: 'Network error submitting claim.' });
    } finally {
      setSubmittingClaim(false);
    }
  };

  // Submit Coordinator Request (Supervisor Visit, Pharmacy Order, Consultation)
  const handleSubmitRequest = async (e) => {
    if (e) e.preventDefault();
    if (!activeRequestModal || !data?.patient?.id) return;
    setSubmittingReq(true);
    setModalFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/requests/', {
        method: 'POST',
        body: JSON.stringify({
          patient: data.patient.id,
          request_type: activeRequestModal,
          urgency: reqUrgency,
          notes: reqNotes,
          details: { detail_text: reqDetails },
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setModalFeedback({ type: 'error', text: resData.detail || 'Could not submit request.' });
      } else {
        setModalFeedback({ type: 'success', text: 'Request transmitted successfully to supervisor / coordinator.' });
        fetchDashboardData(true);
        setTimeout(() => {
          setActiveRequestModal(null);
          setModalFeedback(null);
          setReqNotes('');
          setReqDetails('');
        }, 1400);
      }
    } catch (err) {
      setModalFeedback({ type: 'error', text: 'Network error submitting request.' });
    } finally {
      setSubmittingReq(false);
    }
  };

  // Dynamic greeting based on server or local hour
  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const staff = data?.staff || {};
  const duty = data?.duty || {};
  const patient = data?.patient;
  const supervisor = data?.supervisor;
  const transport = data?.transport;
  const buddy = data?.buddy;
  const officeHours = data?.office_hours || {};
  const alerts = data?.alerts || [];
  const allAlerts = data?.all_alerts || alerts;
  const claimsSummary = data?.claims_summary || { pending: 0, approved_this_month: 0 };
  const quickStats = data?.quick_stats || {
    patients_today: patient ? 1 : 0,
    pending_notes: 0,
    active_alerts: alerts.length,
    claims_pending: claimsSummary.pending,
  };

  const dutyState = duty.state || 'off_duty';
  const isShiftEnded = duty.is_ended || (dutyState === 'on_duty' && remainingSeconds <= 0);

  const shiftStart = duty?.shift?.start;
  const shiftEnd = duty?.shift?.end;

  // Circular progress ring computation
  const totalShiftSeconds = useMemo(() => {
    if (!shiftStart || !shiftEnd) return 43200; // default 12h
    const diff = (new Date(shiftEnd) - new Date(shiftStart)) / 1000;
    return diff > 0 ? diff : 43200;
  }, [shiftStart, shiftEnd]);

  const progressPercent = useMemo(() => {
    if (dutyState === 'upcoming') return 0;
    if (isShiftEnded) return 100;
    const elapsed = Math.max(0, totalShiftSeconds - remainingSeconds);
    return Math.min(100, Math.max(0, Math.round((elapsed / totalShiftSeconds) * 100)));
  }, [dutyState, isShiftEnded, totalShiftSeconds, remainingSeconds]);

  // SVG Ring values (radius 42, circumference ~263.89)
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  // Duty status styling
  const dutyPill = {
    on_duty: { label: isShiftEnded ? 'Shift ended' : 'On duty', color: isShiftEnded ? '#4B5563' : '#059669', bg: isShiftEnded ? '#F3F4F6' : '#ECFDF5', dot: isShiftEnded ? '#9CA3AF' : '#10B981' },
    upcoming: { label: 'Upcoming shift', color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
    off_duty: { label: 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF' },
  }[dutyState] || { label: 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF' };

  // Today's formatted date
  const todayDateStr = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Format shift end time string
  const shiftEndCaption = useMemo(() => {
    if (isShiftEnded) return 'Shift ended';
    if (dutyState === 'upcoming') return `Starts ${shiftStart ? new Date(shiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon'}`;
    if (shiftEnd) {
      return `Shift ends ${new Date(shiftEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Shift in progress';
  }, [isShiftEnded, dutyState, shiftEnd, shiftStart]);

  // Loading skeleton state
  if (loading && !data) {
    return (
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Hero Band Skeleton */}
        <div style={{ height: 110, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
        {/* Full-width My Roster Skeleton */}
        <div style={{ height: 260, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
        {/* 2-Column Row Skeleton */}
        <div className="nurse-overview-columns">
          <div style={{ height: 480, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ height: 180, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: 140, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: 140, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <div className="card" style={{ padding: 28, borderLeft: '4px solid #EF4444', maxWidth: 600, margin: '20px auto', borderRadius: 20 }}>
          <h3 style={{ color: '#EF4444', margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Dashboard Connection Error</h3>
          <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: 1.5 }}>{error}</p>
          <Button variant="primary" isPill onClick={() => fetchDashboardData(false)} style={{ marginTop: 16 }}>
            Retry Loading Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '16px 24px 24px',
        backgroundColor: '#FAFAFA',
        minHeight: 'calc(100vh - 72px)',
        boxSizing: 'border-box',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ── Offline Network Banner ── */}
      {isOffline && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 14,
            color: '#B91C1C',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <WifiOff size={18} />
          <span>Offline mode active: Displaying locally cached clinical shift data. Automatically reconnecting...</span>
        </div>
      )}

      {/* ── SECTION A: Hero Band Across Top ── */}
      <section
        className="card hero-band"
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 60%, #F5F3FF 100%)',
          borderRadius: 20,
          border: '1px solid #E9D5FF',
          borderTop: '4px solid #7C3AED',
          boxShadow: '0 4px 20px rgba(109,40,217,0.06), 0 1px 3px rgba(0,0,0,0.03)',
          padding: '20px 24px',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          {/* Left: Greeting, Role, Date, Duty status & Clock */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: '#1E1B4B',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                {greeting}, {staff.name?.split(' ')[0] || currentUser?.first_name || 'Mariam'}
              </h1>

              {/* Duty Status Pill */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 12px',
                  borderRadius: 9999,
                  background: dutyPill.bg,
                  color: dutyPill.color,
                  fontSize: '13px',
                  fontWeight: 700,
                  border: `1.5px solid ${dutyPill.color}40`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dutyPill.dot,
                    boxShadow: dutyState === 'on_duty' && !isShiftEnded ? `0 0 0 3px ${dutyPill.dot}30` : 'none',
                  }}
                />
                {dutyPill.label}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '14px', color: '#6B7280' }}>
              <span style={{ fontWeight: 600, color: '#6D28D9', background: '#EDE9FE', padding: '2px 10px', borderRadius: 6 }}>
                {staff.role_label || 'Registered Nurse (RN)'}
              </span>
              <span>•</span>
              <span style={{ fontWeight: 500, color: '#374151' }}>{todayDateStr}</span>
              <span>•</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFFFFF', padding: '2px 10px', borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <Clock size={15} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 700, color: '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                  {currentTimeStr || '09:00:00 AM'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Circular Progress Ring & Tabular Countdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 100%)',
              border: '1.5px solid #DDD6FE',
              borderRadius: 18,
              padding: '10px 18px',
              boxShadow: '0 4px 14px rgba(109,40,217,0.06)',
            }}
          >
            <div style={{ position: 'relative', width: 94, height: 94, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="94" height="94" viewBox="0 0 94 94" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background Ring */}
                <circle
                  cx="47"
                  cy="47"
                  r={ringRadius}
                  stroke="#EDE9FE"
                  strokeWidth="7"
                  fill="none"
                />
                {/* Foreground Active Ring */}
                <circle
                  cx="47"
                  cy="47"
                  r={ringRadius}
                  stroke={isShiftEnded ? '#9CA3AF' : '#7C3AED'}
                  strokeWidth="7"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  fill="none"
                  style={{ transition: 'stroke-dashoffset 600ms ease' }}
                />
              </svg>
              {/* Inner ring progress percentage */}
              <div
                style={{
                  position: 'absolute',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: isShiftEnded ? '#6B7280' : '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>
                  {progressPercent}%
                </span>
                <span style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Shift
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                {isShiftEnded ? 'Duty Completed' : dutyState === 'upcoming' ? 'Shift Starts In' : 'Time Left for Duty'}
              </div>
              <div
                aria-live="off"
                style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: isShiftEnded ? '#6B7280' : dutyState === 'upcoming' ? '#D97706' : '#6D28D9',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
              >
                {isShiftEnded ? 'Shift ended' : formatCountdown(remainingSeconds)}
              </div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: 3, fontWeight: 500 }}>
                {shiftEndCaption}
              </div>
            </div>
          </div>
        </div>

        {/* Thin bottom strip: Office Hours & Call Help SOS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #EEF0F4',
            paddingTop: 12,
            fontSize: '13px',
            color: '#6B7280',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Official Office Hours: <strong>09:00 – 17:00</strong> ({officeHours.timezone || 'Asia/Karachi'})</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 9px',
                borderRadius: 9999,
                fontSize: '12px',
                fontWeight: 600,
                background: officeHours.is_open_now ? '#ECFDF5' : '#F3F4F6',
                color: officeHours.is_open_now ? '#059669' : '#6B7280',
                border: `1px solid ${officeHours.is_open_now ? '#A7F3D0' : '#E5E7EB'}`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: officeHours.is_open_now ? '#10B981' : '#9CA3AF',
                }}
              />
              {officeHours.is_open_now ? 'Open now' : 'Closed, opens 9:00 AM'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {lastUpdatedTime && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#9CA3AF' }}>
                <span>Updated {lastUpdatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    fetchDashboardData(true);
                    fetchEmployeeCard();
                  }}
                  title="Refresh Dashboard"
                  aria-label="Refresh Dashboard"
                  style={{ padding: '2px 5px', height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
                >
                  <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
            )}

            <button
              className="btn btn-sm"
              style={{
                borderRadius: 9999,
                border: '1.5px solid #FCA5A5',
                background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                color: '#DC2626',
                fontWeight: 700,
                padding: '5px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(239,68,68,0.15)',
                cursor: 'pointer',
              }}
              onClick={() => setActivePage('call-help')}
              title="Supervisor Emergency Call Help"
              aria-label="Call Help"
            >
              <Phone size={13} style={{ color: '#DC2626' }} />
              <span>Call Help</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── 2-COLUMN LAYOUT: Main Content Left, Narrow Sticky Right Column (StaffIdCard) ── */}
      <div className="nurse-layout-grid">
        <div className="nurse-main-column">
          {/* ── SECTION B: Full-Width "My Roster" Card ── */}
          <section
            className="card nurse-roster-fullwidth"
        style={{
          background: '#FFFFFF',
          borderRadius: 20,
          border: '1px solid #EEF0F4',
          borderTop: '4px solid #8B5CF6',
          boxShadow: '0 4px 20px rgba(139,92,246,0.06), 0 1px 3px rgba(0,0,0,0.03)',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header with Segmented Control */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(109,40,217,0.25)' }}>
              <Calendar size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                My Roster
              </h2>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                Assigned clinical shifts & support contacts
              </div>
            </div>
          </div>

          {/* Working Segmented Control: Daily / Weekly / Monthly */}
          <div
            style={{
              display: 'inline-flex',
              background: '#F3F4F6',
              borderRadius: 10,
              padding: 3,
              border: '1px solid #E5E7EB',
            }}
          >
            {['daily', 'weekly', 'monthly'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setRosterTab(v);
                  openRoster(v);
                }}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '5px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: rosterTab === v ? 'linear-gradient(135deg, #7C3AED, #6D28D9)' : 'transparent',
                  color: rosterTab === v ? '#FFFFFF' : '#4B5563',
                  boxShadow: rosterTab === v ? '0 2px 6px rgba(109,40,217,0.25)' : 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 150ms ease',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Roster View Content */}
        {duty.shift ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Active Shift Timing Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F3FF 100%)',
                border: '1.5px solid #DDD6FE',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {duty.shift.type || 'Clinical Shift'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E1B4B', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(duty.shift.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {new Date(duty.shift.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280', marginTop: 2 }}>
                  Break marker: <strong>{duty.shift.break_minutes || 30} mins</strong>
                </div>
              </div>

              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 9999,
                  background: isShiftEnded ? '#F3F4F6' : '#ECFDF5',
                  color: isShiftEnded ? '#4B5563' : '#047857',
                  border: `1.5px solid ${isShiftEnded ? '#E5E7EB' : '#A7F3D0'}`,
                }}
              >
                {isShiftEnded ? 'Shift ended' : '• Active Duty'}
              </span>
            </div>

            {/* Daily Horizontal Timeline */}
            {rosterTab === 'daily' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9CA3AF' }}>
                  <span>08:00 AM</span>
                  <span>12:00 PM (Break)</span>
                  <span>04:00 PM</span>
                  <span>08:33 PM</span>
                </div>
                {/* Horizontal Bar with Break and Now marker */}
                <div
                  style={{
                    position: 'relative',
                    height: 20,
                    background: '#EDE9FE',
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {/* Shift Bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '0%',
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #7C3AED, #9333EA)',
                      transition: 'width 600ms ease',
                    }}
                  />
                  {/* Break marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '45%',
                      width: '10%',
                      height: '100%',
                      background: 'repeating-linear-gradient(45deg, #FDE68A, #FDE68A 4px, #F59E0B 4px, #F59E0B 8px)',
                      opacity: 0.9,
                    }}
                    title="30-min Clinical Break"
                  />
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Start: 08:33 AM</span>
                  <span style={{ color: '#7C3AED', fontWeight: 700 }}>{progressPercent}% Elapsed</span>
                  <span>End: 08:33 PM</span>
                </div>
              </div>
            )}

            {/* Weekly / Monthly chips fallback */}
            {rosterTab !== 'daily' && (
              <div style={{ padding: '10px 14px', background: '#F9FAFB', borderRadius: 10, fontSize: '13px', color: '#4B5563', border: '1px solid #E5E7EB' }}>
                Showing {rosterTab} schedule for registered staff nurse. Click below to inspect calendar shifts.
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '28px 16px',
              background: 'linear-gradient(135deg, #F8FAFC 0%, #FAF5FF 100%)',
              borderRadius: 16,
              border: '1.5px dashed #C4B5FD',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={24} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#1E1B4B' }}>
                No Active Shift Scheduled Today
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', maxWidth: 440 }}>
                You are currently in standby / off-duty mode. Emergency coordination lines and shift handover logs remain active.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => openRoster('weekly')}
              style={{
                marginTop: 4,
                background: '#EDE9FE',
                color: '#6D28D9',
                border: '1px solid #DDD6FE',
                borderRadius: 8,
                fontWeight: 600,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Open Full Roster Calendar →
            </button>
          </div>
        )}

        {/* Contact Cards Row: Supervisor, Driver + Pickup, Buddy Staff */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {/* 1. Supervisor */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(145deg, #FFFFFF 0%, #FAF5FF 100%)',
              borderRadius: 16,
              border: '1.5px solid #DDD6FE',
              borderTop: '3px solid #7C3AED',
              boxShadow: '0 2px 10px rgba(109,40,217,0.06)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(109,40,217,0.2)' }}>
                {supervisor?.name?.slice(0, 2).toUpperCase() || 'SP'}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {supervisor?.name || 'Dr. Sara Ahmed'}
                </div>
                <div style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600 }}>Clinical Supervisor</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`tel:${supervisor?.phone || '+92-300-3333333'}`}
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#6D28D9', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="Call Supervisor"
                aria-label="Call Supervisor"
              >
                <Phone size={13} /> Call
              </a>
              <a
                href={`https://wa.me/${(supervisor?.phone || '923003333333').replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#047857', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="WhatsApp Supervisor"
                aria-label="WhatsApp Supervisor"
              >
                <MessageSquare size={13} /> Chat
              </a>
            </div>
          </div>

          {/* 2. Transport Driver */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(145deg, #FFFFFF 0%, #EFF6FF 100%)',
              borderRadius: 16,
              border: '1.5px solid #BFDBFE',
              borderTop: '3px solid #2563EB',
              boxShadow: '0 2px 10px rgba(37,99,235,0.06)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', boxShadow: '0 2px 8px rgba(37,99,235,0.2)' }}>
                <Car size={18} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {transport?.driver_name || 'Nadeem Khan'}
                </div>
                <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 600 }}>
                  {formatPickupTime(transport?.pickup_time)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`tel:${transport?.driver_phone || '+92-300-4445555'}`}
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="Call Transport Driver"
                aria-label="Call Driver"
              >
                <Phone size={13} /> Call
              </a>
              <a
                href={`https://wa.me/${(transport?.driver_phone || '923004445555').replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#047857', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="WhatsApp Transport Driver"
                aria-label="WhatsApp Driver"
              >
                <MessageSquare size={13} /> Chat
              </a>
            </div>
          </div>

          {/* 3. Buddy Staff */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(145deg, #FFFFFF 0%, #ECFDF5 100%)',
              borderRadius: 16,
              border: '1.5px solid #A7F3D0',
              borderTop: '3px solid #059669',
              boxShadow: '0 2px 10px rgba(5,150,105,0.06)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #10B981, #047857)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(5,150,105,0.2)' }}>
                {buddy?.name?.slice(0, 2).toUpperCase() || 'BD'}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {buddy?.name || 'Bob Ahmed'}
                </div>
                <div style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>Buddy Staff Nurse</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`tel:${buddy?.phone || '+92-300-2222222'}`}
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#0F766E', background: '#CCFBF1', border: '1px solid #99F6E4', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="Call Buddy Nurse"
                aria-label="Call Buddy"
              >
                <Phone size={13} /> Call
              </a>
              <a
                href={`https://wa.me/${(buddy?.phone || '923002222222').replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ flex: 1, padding: '5px 8px', fontSize: '12px', fontWeight: 600, color: '#047857', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                title="WhatsApp Buddy Nurse"
                aria-label="WhatsApp Buddy"
              >
                <MessageSquare size={13} /> Chat
              </a>
            </div>
          </div>
        </div>

        {/* Shift Handover Notes Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
            borderRadius: 16,
            border: '1.5px solid #FCD34D',
            borderLeft: '5px solid #F59E0B',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 2px 8px rgba(245,158,11,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#B45309', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={13} />
            </div>
            <span>Shift Handover Notes</span>
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#78350F',
              lineHeight: 1.5,
              maxHeight: 70,
              overflowY: 'auto',
            }}
          >
            {data?.handover_notes || 'Standard clinical bedside care. Maintain strict vital signs monitoring and timely medication administration according to MAR.'}
          </div>
        </div>
      </section>

      {/* ── SECTION C: 2-Column Row (My Patient on left, Alerts/Actions/Claims/ID on right) ── */}
      <div className="nurse-overview-columns">
        {/* ══════════════════════════════════════════════════════════════════
            COLUMN LEFT (C): My Patient Card & Chart Shortcut Grid
            ══════════════════════════════════════════════════════════════════ */}
        <div className="nurse-col-left" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* "My Patient" Card */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #0284C7',
              boxShadow: '0 4px 20px rgba(2,132,199,0.06), 0 1px 3px rgba(0,0,0,0.03)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Patient Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #0284C7, #0369A1)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(2,132,199,0.25)' }}>
                  <User size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                    My Patient
                  </h2>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    Primary assigned patient & bedside indicators
                  </div>
                </div>
              </div>
              {patient?.patient_code && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    background: '#E0F2FE',
                    color: '#0369A1',
                    padding: '3px 10px',
                    borderRadius: 9999,
                    border: '1px solid #BAE6FD',
                  }}
                >
                  {patient.patient_code}
                </span>
              )}
            </div>

            {patient ? (
              <>
                {/* Profile Header: Avatar, Name, Age, MR */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      background: 'linear-gradient(135deg, #0284C7, #6D28D9)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '18px',
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(2,132,199,0.25)',
                    }}
                  >
                    {patient.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'PT'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#1F2937', lineHeight: 1.25 }}>
                      {patient.name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6B7280', marginTop: 2 }}>
                      MR: <strong>{patient.mr_number || '-'}</strong> • Age: <strong>{patient.age || '-'} yrs</strong>
                    </div>
                  </div>
                  {/* Allergies badge */}
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: patient.allergies && patient.allergies !== 'NKDA' ? '#FEE2E2' : '#ECFDF5',
                      color: patient.allergies && patient.allergies !== 'NKDA' ? '#B91C1C' : '#047857',
                      border: `1px solid ${patient.allergies && patient.allergies !== 'NKDA' ? '#FECACA' : '#A7F3D0'}`,
                    }}
                    title={`Documented Allergies: ${patient.allergies || 'NKDA'}`}
                  >
                    {patient.allergies ? (patient.allergies === 'NKDA' ? '✓ NKDA' : `⚠ Allergy: ${patient.allergies.slice(0, 10)}`) : '✓ NKDA'}
                  </div>
                </div>

                {/* Diagnosis Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      background: '#F0F9FF',
                      color: '#0369A1',
                      padding: '4px 12px',
                      borderRadius: 8,
                      border: '1px solid #BAE6FD',
                      fontWeight: 600,
                    }}
                  >
                    🩺 {patient.diagnosis || 'Clinical Bedside Observation'}
                  </div>
                </div>

                {/* Address & Open in Maps */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: '#F9FAFB',
                    borderRadius: 10,
                    border: '1px solid #EEF0F4',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, color: '#4B5563' }}>
                    <MapPin size={15} style={{ color: '#0284C7', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {patient.location || 'Home Address documented in chart'}
                    </span>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(patient.location || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm"
                    style={{
                      padding: '3px 10px',
                      fontSize: '12px',
                      color: '#0284C7',
                      background: '#E0F2FE',
                      border: '1px solid #BAE6FD',
                      borderRadius: 6,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                    }}
                    title="Open Patient Address in Google Maps"
                    aria-label="Open in Maps"
                  >
                    <span>Maps</span>
                    <ArrowUpRight size={12} />
                  </a>
                </div>

                {/* Latest Vitals Chips with abnormal color coding */}
                {patient.latest_vitals ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        Latest Vitals
                      </span>
                      <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {formatTimeAgo(patient.latest_vitals.recorded_at)}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {/* BP */}
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: 10,
                          background: patient.latest_vitals.bp_abnormal ? '#FEF2F2' : '#F0F9FF',
                          border: `1.5px solid ${patient.latest_vitals.bp_abnormal ? '#FECACA' : '#BAE6FD'}`,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: patient.latest_vitals.bp_abnormal ? '#DC2626' : '#0369A1', fontWeight: 700 }}>BP</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: patient.latest_vitals.bp_abnormal ? '#DC2626' : '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                          {patient.latest_vitals.bp}
                        </div>
                      </div>

                      {/* HR */}
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: 10,
                          background: patient.latest_vitals.hr_abnormal ? '#FEF2F2' : '#FFF1F2',
                          border: `1.5px solid ${patient.latest_vitals.hr_abnormal ? '#FECACA' : '#FECDD3'}`,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: patient.latest_vitals.hr_abnormal ? '#DC2626' : '#BE123C', fontWeight: 700 }}>HR</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: patient.latest_vitals.hr_abnormal ? '#DC2626' : '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                          {patient.latest_vitals.hr}
                        </div>
                      </div>

                      {/* SpO2 */}
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: 10,
                          background: patient.latest_vitals.spo2_abnormal ? '#FEF2F2' : '#ECFDF5',
                          border: `1.5px solid ${patient.latest_vitals.spo2_abnormal ? '#FECACA' : '#A7F3D0'}`,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: patient.latest_vitals.spo2_abnormal ? '#DC2626' : '#047857', fontWeight: 700 }}>SpO2</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: patient.latest_vitals.spo2_abnormal ? '#DC2626' : '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                          {patient.latest_vitals.spo2}
                        </div>
                      </div>

                      {/* Temp */}
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: 10,
                          background: patient.latest_vitals.temp_abnormal ? '#FEF2F2' : '#FFFBEB',
                          border: `1.5px solid ${patient.latest_vitals.temp_abnormal ? '#FECACA' : '#FDE68A'}`,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: patient.latest_vitals.temp_abnormal ? '#DC2626' : '#B45309', fontWeight: 700 }}>Temp</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: patient.latest_vitals.temp_abnormal ? '#DC2626' : '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                          {patient.latest_vitals.temp}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, fontSize: '13px', color: '#6B7280', textAlign: 'center' }}>
                    No vitals logged yet today.
                  </div>
                )}

                {/* Primary Button: Open Full Chart */}
                <Button
                  variant="primary"
                  isPill
                  onClick={() => setActivePage('nurse-patient-detail')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: '14px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284C7, #0369A1)',
                    boxShadow: '0 4px 14px rgba(2,132,199,0.25)',
                    border: 'none',
                  }}
                >
                  <Activity size={16} />
                  <span>Open Full Patient Chart</span>
                  <ChevronRight size={16} />
                </Button>
              </>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '28px 18px',
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%)',
                  borderRadius: 16,
                  border: '1.5px solid #BBF7D0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DCFCE7', color: '#15803D', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: 9999, marginBottom: 6 }}>
                    <span>•</span> Ward Care Scoping Active
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#14532D', margin: '0 0 4px 0' }}>
                    No Individual Patient Assigned Today
                  </h3>
                  <p style={{ fontSize: '13px', color: '#166534', margin: 0, maxWidth: 360, lineHeight: 1.4 }}>
                    You can record walk-in vitals, administer prescriptions, or access patient documentation below.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setActivePage('my-patients')}
                    style={{
                      background: '#0284C7',
                      color: '#FFFFFF',
                      borderRadius: 8,
                      fontWeight: 600,
                      padding: '6px 14px',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(2,132,199,0.25)',
                      cursor: 'pointer',
                    }}
                  >
                    View Patient List →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chart Shortcut Grid */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #6366F1',
              boxShadow: '0 4px 20px rgba(99,102,241,0.06), 0 1px 3px rgba(0,0,0,0.03)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B' }}>
                Clinical Chart Shortcuts
              </div>
              {patient?.chart_counts?.family_concerns > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#FEE2E2',
                    color: '#DC2626',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertCircle size={11} />
                  {patient.chart_counts.family_concerns} Family Concern
                </span>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 8,
              }}
            >
              {[
                { label: 'Medication (MAR)', icon: Pill, count: patient?.chart_counts?.medication || 0, tab: 'mar', bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', iconColor: '#059669', badgeBg: '#D1FAE5' },
                { label: 'Nursing Notes', icon: FileText, count: patient?.chart_counts?.nursing_notes || 0, tab: 'notes', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', iconColor: '#D97706', badgeBg: '#FEF3C7' },
                { label: 'Vitals & Fluid', icon: Activity, count: patient?.chart_counts?.vitals || 0, tab: 'vitals', bg: '#FFF1F2', border: '#FECDD3', text: '#BE123C', iconColor: '#E11D48', badgeBg: '#FFE4E6' },
                { label: "Doctor's Notes", icon: Stethoscope, count: patient?.chart_counts?.doctor_notes || 0, tab: 'doctor_notes', bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', iconColor: '#2563EB', badgeBg: '#DBEAFE' },
                { label: 'Physiotherapy', icon: HeartHandshake, count: patient?.chart_counts?.physiotherapy || 0, tab: 'physio_notes', bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E', iconColor: '#0D9488', badgeBg: '#CCFBF1' },
                { label: 'Procedure Change', icon: Syringe, count: patient?.chart_counts?.procedure_requests || 0, tab: 'requests', bg: '#FAF5FF', border: '#DDD6FE', text: '#6D28D9', iconColor: '#7C3AED', badgeBg: '#EDE9FE' },
                { label: 'Manager Checklist', icon: ClipboardCheck, count: patient?.chart_counts?.manager_checklist || 1, tab: 'manager_checklist', bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA', iconColor: '#4F46E5', badgeBg: '#E0E7FF' },
              ].map(({ label, icon: IconCmp, count, bg, border, text, iconColor, badgeBg }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActivePage('nurse-patient-detail')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    background: bg,
                    border: `1.5px solid ${border}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 150ms ease',
                  }}
                  title={`Open ${label}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <IconCmp size={16} style={{ color: iconColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      background: badgeBg,
                      color: text,
                      padding: '2px 7px',
                      borderRadius: 9999,
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            COLUMN RIGHT (E): Alerts + Quick Actions + Claims + Digital ID Card
            ══════════════════════════════════════════════════════════════════ */}
        <div className="nurse-col-right" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Alerts & Reminders Card */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #EF4444',
              boxShadow: '0 4px 20px rgba(239,68,68,0.06), 0 1px 3px rgba(0,0,0,0.03)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={17} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                  Alerts & Reminders
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    background: alerts.length > 0 ? '#FEE2E2' : '#ECFDF5',
                    color: alerts.length > 0 ? '#DC2626' : '#047857',
                    padding: '3px 10px',
                    borderRadius: 9999,
                    border: `1px solid ${alerts.length > 0 ? '#FECACA' : '#A7F3D0'}`,
                  }}
                >
                  {allAlerts.length} Active
                </span>
                {allAlerts.length > 5 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAlertsModal(true)}
                    style={{ fontSize: '12px', color: '#6D28D9', padding: '2px 6px' }}
                  >
                    View all
                  </button>
                )}
              </div>
            </div>

            {/* Top 5 Alerts list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length > 0 ? (
                alerts.slice(0, 5).map((a) => {
                  const borderCol = a.severity === 'high' ? '#EF4444' : a.severity === 'medium' ? '#F59E0B' : '#8B5CF6';
                  const bgCol = a.severity === 'high' ? '#FEF2F2' : a.severity === 'medium' ? '#FFFBEB' : '#FAF5FF';
                  const textCol = a.severity === 'high' ? '#B91C1C' : a.severity === 'medium' ? '#B45309' : '#6D28D9';
                  const IconCmp = a.severity === 'high' ? AlertTriangle : a.type === 'poor_intake' ? Activity : AlertCircle;

                  return (
                    <div
                      key={a.id}
                      onClick={() => setActivePage('nurse-patient-detail')}
                      style={{
                        padding: '10px 14px',
                        background: bgCol,
                        borderRadius: 12,
                        borderLeft: `4px solid ${borderCol}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        transition: 'transform 120ms ease',
                      }}
                      title="Click to view in patient chart"
                    >
                      <IconCmp size={16} style={{ color: textCol, flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: textCol, lineHeight: 1.3 }}>
                          {a.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: 2 }}>
                          {formatTimeAgo(a.created_at)} • Click to review
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: textCol, opacity: 0.6, flexShrink: 0 }} />
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '20px 14px',
                    background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                    borderRadius: 14,
                    border: '1.5px solid #BBF7D0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#14532D' }}>
                    All Clear — No Active Alerts
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534' }}>
                    All patient vital signs and schedules are within normal clinical thresholds.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Card */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #10B981',
              boxShadow: '0 4px 20px rgba(16,185,129,0.06), 0 1px 3px rgba(0,0,0,0.03)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B' }}>
              Quick Clinical Actions
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Action 1: Request Supervisor Visit */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setActiveRequestModal('supervisor_visit');
                  setReqUrgency('routine');
                  setReqNotes('');
                  setReqDetails('');
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  borderColor: '#DDD6FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #FAF5FF)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EDE9FE', color: '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCheck size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Request Supervisor Visit</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Transmits formal coordinator visit request</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#6D28D9' }} />
              </button>

              {/* Action 2: Order Pharmacy / Equipment */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setActiveRequestModal('pharmacy_order');
                  setReqUrgency('urgent');
                  setReqNotes('');
                  setReqDetails('');
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  borderColor: '#BFDBFE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #EFF6FF)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pill size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Order Pharmacy / Equipment</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Dressing, flushes, or medical consumables</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#2563EB' }} />
              </button>

              {/* Action 3: Book Appointment / Consultation */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setActiveRequestModal('consultation_booking');
                  setReqUrgency('routine');
                  setReqNotes('');
                  setReqDetails('');
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  borderColor: '#A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #ECFDF5)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#D1FAE5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Book Consultation</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Physiotherapist or clinical coordinator</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#059669' }} />
              </button>
            </div>
          </div>

          {/* Claims & Overtime Card */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #F59E0B',
              boxShadow: '0 4px 20px rgba(245,158,11,0.06), 0 1px 3px rgba(0,0,0,0.03)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                Claims & Overtime
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={openClaimHistory}
                style={{ fontSize: '12px', color: '#6D28D9', padding: '2px 6px', fontWeight: 600 }}
              >
                Claim History ({claimsSummary.pending})
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1.5px solid #FCD34D', padding: '10px 12px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 700 }}>Pending Review</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#B45309', fontVariantNumeric: 'tabular-nums' }}>
                  {claimsSummary.pending}
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', border: '1.5px solid #A7F3D0', padding: '10px 12px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#047857', fontWeight: 700 }}>Approved (Month)</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
                  {claimsSummary.approved_this_month}
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              isPill
              onClick={() => setShowClaimModal(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                boxShadow: '0 4px 14px rgba(109,40,217,0.25)',
                border: 'none',
              }}
            >
              <PlusCircle size={15} />
              <span>Submit Overtime Claim</span>
            </Button>
          </div>

          {/* Digital Employee ID Card was moved to narrow sticky right column */}
        </div>
      </div>
      </div>

      {/* ── RIGHT COLUMN: Narrow Sticky Column (Desktop) / Header Stacking (Mobile) ── */}
      <aside className="nurse-side-column">
        <div className="nurse-id-card-wrapper">
          <StaffIdCard staffMember={employeeCard || staff} />
        </div>
      </aside>
    </div>

    {/* Responsive Stacking & Sticky Right Column Styles for Nurses Portal */}
    <style>{`
      .nurse-layout-grid {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .nurse-side-column {
        display: contents;
      }
      .nurse-id-card-wrapper {
        order: 1;
        display: flex;
        justify-content: center;
      }
      .nurse-main-column {
        order: 2;
        display: flex;
        flex-direction: column;
        gap: 20px;
        min-width: 0;
      }
      @media (min-width: 1024px) {
        .nurse-layout-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 380px;
          gap: 24px;
          align-items: start;
        }
        .nurse-side-column {
          display: block;
          position: sticky;
          top: 24px;
          align-self: start;
        }
        .nurse-id-card-wrapper {
          order: unset;
        }
        .nurse-main-column {
          order: unset;
        }
      }
    `}</style>

      {/* ── Modal 1: Duty Roster Calendar ── */}
      <Modal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        title={`Staff Duty Roster (${rosterView.toUpperCase()})`}
        subtitle="Assigned clinical shifts and patient schedules"
        size="lg"
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['daily', 'weekly', 'monthly'].map((v) => (
            <button
              key={v}
              className={`btn btn-sm ${rosterView === v ? 'btn-primary' : 'btn-outline'}`}
              style={{ textTransform: 'capitalize' }}
              onClick={() => openRoster(v)}
            >
              {v}
            </button>
          ))}
        </div>

        {loadingRoster ? (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div className="spinner" />
          </div>
        ) : rosterShifts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
            {rosterShifts.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '12px 14px',
                  background: '#F9FAFB',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1F2937' }}>{s.patient?.name}</div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: 2 }}>
                    {new Date(s.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} •{' '}
                    {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6D28D9', marginTop: 2, fontWeight: 500 }}>
                    {s.type}
                  </div>
                </div>
                <Badge variant={s.status === 'in_progress' ? 'purple' : 'grey'}>
                  {s.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: '#6B7280', padding: '24px 0', fontSize: '14px' }}>
            No rostered shifts found for this time window.
          </p>
        )}
      </Modal>

      {/* ── Modal 2: Submit Overtime Claim ── */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="Submit Overtime Claim"
        subtitle="Verified against electronic attendance logs (max 2-day claim window)"
        size="md"
        isDirty={Boolean(claimReason)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowClaimModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!claimReason.trim() || submittingClaim}
              isLoading={submittingClaim}
              onClick={handleSubmitClaim}
            >
              Submit Claim
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitClaim} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="alert-callout alert-callout-info" style={{ padding: '10px 14px', fontSize: '13px' }}>
            <Clock size={16} style={{ color: '#6D28D9', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Attendance-Verified Claim:</strong> Overtime is cross-referenced with electronic attendance logs. Maximum claim window is 2 days post-shift.
            </div>
          </div>

          <Input
            type="date"
            label="Shift Date"
            required
            value={claimDate}
            onChange={(e) => setClaimDate(e.target.value)}
          />

          <Input
            type="number"
            step="0.5"
            min="0.5"
            max="8.0"
            label="Overtime Hours"
            required
            value={claimHours}
            onChange={(e) => setClaimHours(e.target.value)}
          />

          <Textarea
            label="Reason for Overtime"
            required
            showCount
            maxLength={400}
            rows={3}
            placeholder="e.g. Delayed patient transport, acute emergency dressing change, extended post-shift handover..."
            value={claimReason}
            onChange={(e) => setClaimReason(e.target.value)}
          />

          {claimFeedback && (
            <div className={`alert-callout alert-callout-${claimFeedback.type === 'error' ? 'danger' : 'success'}`} style={{ fontSize: '13px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{claimFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Modal 3: Claim History ── */}
      <Modal
        isOpen={showClaimHistoryModal}
        onClose={() => setShowClaimHistoryModal(false)}
        title="Overtime Claim History"
        subtitle="Prior overtime claims and coordinator review statuses"
        size="lg"
      >
        {loadingClaims ? (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div className="spinner" />
          </div>
        ) : claimHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
            {claimHistory.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '12px 14px',
                  background: '#F9FAFB',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1F2937' }}>
                    {c.date} • <strong>{c.hours} hrs</strong> (Max allowed: {c.derived_max_hours}h)
                  </div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: 2 }}>
                    {c.reason}
                  </div>
                  {c.reviewer_note && (
                    <div style={{ fontSize: '12px', color: '#6D28D9', marginTop: 2 }}>
                      Reviewer Note: {c.reviewer_note}
                    </div>
                  )}
                </div>
                <Badge
                  variant={
                    c.status === 'approved'
                      ? 'green'
                      : c.status === 'rejected'
                      ? 'red'
                      : c.status === 'paid'
                      ? 'blue'
                      : 'amber'
                  }
                >
                  {c.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: '#6B7280', padding: '24px 0', fontSize: '14px' }}>
            No prior overtime claims on record.
          </p>
        )}
      </Modal>

      {/* ── Modal 4: Clinical Quick Request Modal (Supervisor Visit / Pharmacy / Consultation) ── */}
      <Modal
        isOpen={Boolean(activeRequestModal)}
        onClose={() => setActiveRequestModal(null)}
        title={
          activeRequestModal === 'supervisor_visit'
            ? 'Request Supervisor Visit'
            : activeRequestModal === 'pharmacy_order'
            ? 'Order from Pharmacy / Equipment'
            : 'Book / Request Consultation'
        }
        subtitle="Formal coordinator escalation and clinical supply request"
        size="md"
        isDirty={Boolean(reqNotes || reqDetails)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActiveRequestModal(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!reqNotes.trim() || submittingReq}
              isLoading={submittingReq}
              onClick={handleSubmitRequest}
            >
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Patient identification strip */}
          {patient && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#EDE9FE', borderRadius: 10, border: '1px solid #DDD6FE' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase' }}>Patient:</span>
                <strong style={{ fontSize: '14px', color: '#1F2937' }}>{patient.name}</strong>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>({patient.patient_code})</span>
              </div>
              <Badge variant="purple">MR: {patient.mr_number}</Badge>
            </div>
          )}

          <div className="alert-callout alert-callout-info" style={{ padding: '8px 12px', fontSize: '13px' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#6D28D9' }} />
            <div>
              <strong>Advisory:</strong> Submitting this sends a direct request to your care coordinator and supervisor. It documents clinical requests in the staff log.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Urgency Level</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'routine', label: 'Routine' },
                { value: 'urgent', label: 'Urgent (2-4 hrs)' },
                { value: 'immediate', label: 'Immediate SOS' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReqUrgency(value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: '13px',
                    fontWeight: 600,
                    border: reqUrgency === value ? '2px solid #6D28D9' : '1px solid #E5E7EB',
                    background: reqUrgency === value ? '#EDE9FE' : '#F9FAFB',
                    color: reqUrgency === value ? '#6D28D9' : '#4B5563',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Clinical Reason / Items Needed"
            required
            showCount
            maxLength={400}
            rows={3}
            placeholder={
              activeRequestModal === 'supervisor_visit'
                ? 'Reason for supervisor visit request (e.g. acute clinical escalation, catheter insertion difficulty...)'
                : activeRequestModal === 'pharmacy_order'
                ? 'Supplies needed (e.g. 5x sterile dressing packs, 100ml normal saline flushes, 20G IV cannulas...)'
                : 'Consultation specialty needed and brief patient history...'
            }
            value={reqNotes}
            onChange={(e) => setReqNotes(e.target.value)}
          />

          <Input
            label="Additional Details / Instructions (Optional)"
            placeholder="e.g. Family present, morning visit preferred..."
            value={reqDetails}
            onChange={(e) => setReqDetails(e.target.value)}
          />

          {modalFeedback && (
            <div className={`alert-callout alert-callout-${modalFeedback.type === 'error' ? 'danger' : 'success'}`} style={{ fontSize: '13px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{modalFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Modal 5: View All Active Alerts ── */}
      <Modal
        isOpen={showAlertsModal}
        onClose={() => setShowAlertsModal(false)}
        title={`All Active Alerts & Reminders (${allAlerts.length})`}
        subtitle="Real-time clinical warnings, vital sign excursions, and pending shift tasks"
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
          {allAlerts.length > 0 ? (
            allAlerts.map((a) => {
              const borderCol = a.severity === 'high' ? '#EF4444' : a.severity === 'medium' ? '#F59E0B' : '#8B5CF6';
              const bgCol = a.severity === 'high' ? '#FEF2F2' : a.severity === 'medium' ? '#FFFBEB' : '#FAF5FF';
              const textCol = a.severity === 'high' ? '#B91C1C' : a.severity === 'medium' ? '#B45309' : '#6D28D9';
              const IconCmp = a.severity === 'high' ? AlertTriangle : a.type === 'poor_intake' ? Activity : AlertCircle;

              return (
                <div
                  key={a.id}
                  onClick={() => {
                    setShowAlertsModal(false);
                    setActivePage('nurse-patient-detail');
                  }}
                  style={{
                    padding: '12px 16px',
                    background: bgCol,
                    borderRadius: 12,
                    borderLeft: `5px solid ${borderCol}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <IconCmp size={18} style={{ color: textCol, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: textCol }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: 2 }}>
                        Logged {new Date(a.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" isSm style={{ color: textCol }}>
                    Open Chart
                  </Button>
                </div>
              );
            })
          ) : (
            <p style={{ textAlign: 'center', color: '#6B7280', padding: '24px 0', fontSize: '14px' }}>
              No active alerts.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
