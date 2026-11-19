import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock, User, Phone, MapPin, AlertTriangle,
  Calendar, FileText, ChevronRight, Activity, Bell, CheckCircle2,
  PlusCircle, AlertCircle, RefreshCw, WifiOff,
  Stethoscope, Pill, ClipboardCheck, UserCheck, MessageSquare,
  ArrowUpRight, HeartHandshake, Syringe, Car, Search, Edit3, Trash2
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import StaffOverviewHeader from '../components/StaffOverviewHeader';
import SmartRosterSection from '../components/SmartRosterSection';
import NurseDrawer from '../components/NurseDrawer';
import { Modal, Input, Textarea, Button, Badge } from '../components/ui';
import { getTierChipConfig } from '../utils/rosterHelpers';
import { getAllergyInfo } from '../utils/allergyHelpers';

export default function NurseHome() {
  const setActivePage = useStore((s) => s.setActivePage);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);
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

  // Search filter for patients when count > 6
  const [patientSearch, setPatientSearch] = useState('');

  // Drawer state for Today's Work bar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState('patients_today');
  const [drawerTitle, setDrawerTitle] = useState("Today's Work");

  // Overtime claim modals
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

  // Quick Action Request Modal (Supervisor Visit / Pharmacy / Consultation)
  const [activeRequestModal, setActiveRequestModal] = useState(null);
  const [selectedRequestPatientId, setSelectedRequestPatientId] = useState('');
  const [reqUrgency, setReqUrgency] = useState('routine');
  const [reqNotes, setReqNotes] = useState('');
  const [reqDetails, setReqDetails] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);
  const [modalFeedback, setModalFeedback] = useState(null);

  // View All Alerts Modal
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Shift Handover Modal State
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [editingHandoverId, setEditingHandoverId] = useState(null);
  const [handoverPatientId, setHandoverPatientId] = useState('');
  const [handoverShiftLabel, setHandoverShiftLabel] = useState('Day Shift');
  const [handoverShiftDate, setHandoverShiftDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [handoverText, setHandoverText] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [handoverFeedback, setHandoverFeedback] = useState(null);

  // Mark Handover Entered-in-Error Modal
  const [showHandoverErrorModal, setShowHandoverErrorModal] = useState(false);
  const [errorTargetHandover, setErrorTargetHandover] = useState(null);
  const [errorReason, setErrorReason] = useState('');
  const [submittingError, setSubmittingError] = useState(false);
  const [errorModalFeedback, setErrorModalFeedback] = useState(null);

  // Patient Picker Modal for Quick Actions
  const [patientPickerAction, setPatientPickerAction] = useState(null); // 'vitals' | 'mar' | 'notes' | 'io'

  // Fetch home dashboard payload
  const fetchDashboardData = useCallback(async (isBackground = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
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

      backoffDelayRef.current = 30000;
      prevVersionRef.current = json.version || json.updated_at || null;
      dataRef.current = json;
      setData(json);
    } catch (err) {
      if (err.name === 'AbortError') return;
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
            await Promise.all([fetchDashboardData(true), fetchEmployeeCard()]);
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

  // Safe pickup time format parser
  const formatPickupTime = (timeStr) => {
    if (!timeStr || !String(timeStr).trim()) return 'Pickup not set';
    const s = String(timeStr).trim();
    if (/^\d{1,2}:\d{2}\s*(AM|PM|am|pm)$/i.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return s;
  };

  // Open Drawer helper
  const openDrawer = (type, title) => {
    setDrawerType(type);
    setDrawerTitle(title);
    setDrawerOpen(true);
  };

  // Patient navigation helper
  const handleOpenPatient = (p, subview = null) => {
    if (!p) return;
    const ptObj = {
      id: p.id || p.patient_id,
      name: p.name || p.full_name,
      patient_code: p.patient_code,
      mr_number: p.mr_number,
      age: p.age,
      gender: p.gender,
      gender_display: p.gender_display,
      primary_diagnosis: p.primary_diagnosis,
      allergy_status: p.allergy_status,
      allergies: p.allergies,
    };
    setSelectedPatient(ptObj);
    if (subview) {
      try {
        localStorage.setItem('preferred_patient_file_tile', subview);
      } catch (e) { }
    }
    setActivePage('patient-file');
  };

  // Open Handover Create Modal
  const openCreateHandover = (patientId = null) => {
    setEditingHandoverId(null);
    setHandoverPatientId(patientId || (data?.nurse_patients?.[0]?.id ? String(data.nurse_patients[0].id) : ''));
    setHandoverShiftLabel('Day Shift');
    setHandoverShiftDate(new Date().toISOString().split('T')[0]);
    setHandoverText('');
    setHandoverFeedback(null);
    setShowHandoverModal(true);
  };

  // Open Handover Edit Modal
  const openEditHandover = (h) => {
    setEditingHandoverId(h.id);
    setHandoverPatientId(String(h.patient || h.patient_id));
    setHandoverShiftLabel(h.shift_label || 'Day Shift');
    setHandoverShiftDate(h.shift_date || new Date().toISOString().split('T')[0]);
    setHandoverText(h.text || '');
    setHandoverFeedback(null);
    setShowHandoverModal(true);
  };

  // Submit Handover (Create or Edit)
  const handleSubmitHandover = async (e) => {
    if (e) e.preventDefault();
    if (!handoverText.trim()) {
      setHandoverFeedback({ type: 'error', text: 'Handover text cannot be empty.' });
      return;
    }
    setSubmittingHandover(true);
    setHandoverFeedback(null);

    try {
      const isEdit = Boolean(editingHandoverId);
      const url = isEdit ? `/staff-portal/handovers/${editingHandoverId}/` : '/staff-portal/handovers/';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? { text: handoverText.trim(), shift_label: handoverShiftLabel }
        : {
            patient_id: handoverPatientId,
            text: handoverText.trim(),
            shift_label: handoverShiftLabel,
            shift_date: handoverShiftDate,
          };

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      });
      const resData = await res.json();
      if (!res.ok) {
        setHandoverFeedback({ type: 'error', text: resData.detail || 'Failed to save handover note.' });
      } else {
        setHandoverFeedback({ type: 'success', text: isEdit ? 'Handover note updated.' : 'Handover note created successfully.' });
        fetchDashboardData(true);
        setTimeout(() => {
          setShowHandoverModal(false);
          setHandoverFeedback(null);
          setHandoverText('');
          setEditingHandoverId(null);
        }, 1200);
      }
    } catch (err) {
      setHandoverFeedback({ type: 'error', text: 'Network error saving handover note.' });
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Open Mark Handover Error Modal
  const openMarkHandoverError = (h) => {
    setErrorTargetHandover(h);
    setErrorReason('');
    setErrorModalFeedback(null);
    setShowHandoverErrorModal(true);
  };

  // Submit Mark Handover Error
  const handleSubmitHandoverError = async (e) => {
    if (e) e.preventDefault();
    if (!errorReason.trim()) {
      setErrorModalFeedback({ type: 'error', text: 'A reason is required to mark a clinical record entered in error.' });
      return;
    }
    setSubmittingError(true);
    setErrorModalFeedback(null);

    try {
      const res = await apiFetch(`/staff-portal/handovers/${errorTargetHandover.id}/mark-entered-in-error/`, {
        method: 'POST',
        body: JSON.stringify({ reason: errorReason.trim() }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setErrorModalFeedback({ type: 'error', text: resData.detail || 'Failed to mark record in error.' });
      } else {
        setErrorModalFeedback({ type: 'success', text: 'Record marked as entered in error.' });
        fetchDashboardData(true);
        setTimeout(() => {
          setShowHandoverErrorModal(false);
          setErrorModalFeedback(null);
          setErrorTargetHandover(null);
          setErrorReason('');
        }, 1200);
      }
    } catch (err) {
      setErrorModalFeedback({ type: 'error', text: 'Network error updating record.' });
    } finally {
      setSubmittingError(false);
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

  // Open Quick Request Modal
  const openQuickRequest = (reqType) => {
    setActiveRequestModal(reqType);
    setSelectedRequestPatientId(data?.nurse_patients?.[0]?.id ? String(data.nurse_patients[0].id) : (data?.patient?.id ? String(data.patient.id) : ''));
    setReqUrgency('routine');
    setReqNotes('');
    setReqDetails('');
    setModalFeedback(null);
  };

  // Submit Quick Request (Supervisor Visit / Pharmacy / Consultation)
  const handleSubmitRequest = async (e) => {
    if (e) e.preventDefault();
    const pid = selectedRequestPatientId || data?.patient?.id;
    if (!activeRequestModal || !pid) {
      setModalFeedback({ type: 'error', text: 'Please select a patient.' });
      return;
    }
    setSubmittingReq(true);
    setModalFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/requests/', {
        method: 'POST',
        body: JSON.stringify({
          patient: pid,
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

  // Quick Action triggered with patient picker
  const handleQuickActionClick = (actionKey) => {
    const pts = data?.nurse_patients || [];
    if (pts.length === 0) {
      setActivePage('patient-file');
      return;
    }
    if (pts.length === 1) {
      handleOpenPatient(pts[0], actionKey === 'vitals' ? 'monitoring' : actionKey === 'mar' ? 'medications' : actionKey === 'notes' ? 'nursing_notes' : 'monitoring');
      return;
    }
    setPatientPickerAction(actionKey);
  };

  // Data mappings
  const staff = data?.staff || {};
  const supervisor = data?.supervisor;
  const transport = data?.transport;
  const buddy = data?.buddy;
  const officeHours = data?.office_hours || {};
  const alerts = data?.alerts || [];
  const allAlerts = data?.all_alerts || alerts;
  const claimsSummary = data?.claims_summary || { pending: 0, approved_this_month: 0 };
  const nursePatients = data?.nurse_patients || (data?.patient ? [data.patient] : []);
  const handovers = data?.handovers || [];
  const todayWork = data?.today_work || {
    patients_today: nursePatients.length,
    vitals_overdue: 0,
    active_medications: 0,
    pending_verification: 0,
    pending_notes: 0,
    alerts_count: alerts.length,
  };

  // Filtered patients for search
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return nursePatients;
    const q = patientSearch.toLowerCase().trim();
    return nursePatients.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.mr_number || '').toLowerCase().includes(q) ||
        (p.patient_code || '').toLowerCase().includes(q)
    );
  }, [nursePatients, patientSearch]);

  if (loading && !data) {
    return (
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 110, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: 260, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: 480, background: '#F3F4F6', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: '16px 24px 32px',
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

      {/* ── 1. Shared Staff Overview Top Bar & Smart Roster (ID card & Roster Grid) ── */}
      <StaffOverviewHeader
        staff={staff}
        employeeCard={employeeCard}
        roleTitle="Nurses Portal"
        badgeColor="#7C3AED"
        dutyStatus={data?.roster_summary?.duty_status?.status || (data?.duty?.state === 'on_duty' ? 'On duty' : 'Off duty')}
        workingHours={officeHours}
        employmentStatus={data?.employment_status}
        lastUpdated={lastUpdatedTime ? lastUpdatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null}
        onRefresh={() => {
          fetchDashboardData(true);
          fetchEmployeeCard();
        }}
        onHelpClick={() => setActivePage('call-help')}
        helpButtonLabel="Call Help"
        rosterCard={<SmartRosterSection rosterSummary={data?.roster_summary} />}
      />

      {/* ── 2. Slim "Today's Work" Bar (6 Clickable Stats Opening Slide-over Drawer) ── */}
      <section
        className="card nurse-today-work-bar"
        style={{
          background: '#FFFFFF',
          borderRadius: 18,
          border: '1px solid #EEF0F4',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          padding: '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FAF5FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                Today&apos;s Work
              </h2>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                Assigned patient queue and clinical action triggers
              </div>
            </div>
          </div>
          <span style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600 }}>
            Click any metric to view patient list
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {/* Stat 1: My Patients Today */}
          <button
            type="button"
            onClick={() => openDrawer('patients_today', 'My Patients Today')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1.5px solid #DDD6FE',
              background: 'linear-gradient(135deg, #FFFFFF, #FAF5FF)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              My Patients Today
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E1B4B', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.patients_today}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>Assigned visits today</div>
          </button>

          {/* Stat 2: Vitals Overdue */}
          <button
            type="button"
            onClick={() => openDrawer('vitals_overdue', 'Vitals Overdue')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${todayWork.vitals_overdue > 0 ? '#FECACA' : '#E5E7EB'}`,
              background: todayWork.vitals_overdue > 0 ? 'linear-gradient(135deg, #FFFFFF, #FEF2F2)' : '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: todayWork.vitals_overdue > 0 ? '#DC2626' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Vitals Overdue
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: todayWork.vitals_overdue > 0 ? '#DC2626' : '#1E1B4B', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.vitals_overdue}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>&gt; 4 hours without log</div>
          </button>

          {/* Stat 3: Active Medications */}
          <button
            type="button"
            onClick={() => openDrawer('active_medications', 'Active Medications')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1.5px solid #BAE6FD',
              background: 'linear-gradient(135deg, #FFFFFF, #F0F9FF)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: '#0369A1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Medications
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0369A1', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.active_medications}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>Verified MAR prescriptions</div>
          </button>

          {/* Stat 4: Awaiting Verification */}
          <button
            type="button"
            onClick={() => openDrawer('pending_verification', 'Prescriptions Awaiting Verification')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${todayWork.pending_verification > 0 ? '#FDE68A' : '#E5E7EB'}`,
              background: todayWork.pending_verification > 0 ? 'linear-gradient(135deg, #FFFFFF, #FFFBEB)' : '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: todayWork.pending_verification > 0 ? '#B45309' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Awaiting Verification
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: todayWork.pending_verification > 0 ? '#B45309' : '#1E1B4B', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.pending_verification}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>Transcribed Rx orders</div>
          </button>

          {/* Stat 5: Shift Notes Pending (> 2h) */}
          <button
            type="button"
            onClick={() => openDrawer('pending_notes', 'Shift Notes Pending (> 2h)')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${todayWork.pending_notes > 0 ? '#FED7AA' : '#E5E7EB'}`,
              background: todayWork.pending_notes > 0 ? 'linear-gradient(135deg, #FFFFFF, #FFF7ED)' : '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: todayWork.pending_notes > 0 ? '#C2410C' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Notes Pending (&gt; 2h)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: todayWork.pending_notes > 0 ? '#C2410C' : '#1E1B4B', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.pending_notes}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>Active shift note overdue</div>
          </button>

          {/* Stat 6: Active Alerts */}
          <button
            type="button"
            onClick={() => openDrawer('alerts', 'Active Clinical Alerts')}
            className="today-stat-btn"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${todayWork.alerts_count > 0 ? '#FECACA' : '#A7F3D0'}`,
              background: todayWork.alerts_count > 0 ? 'linear-gradient(135deg, #FFFFFF, #FEF2F2)' : 'linear-gradient(135deg, #FFFFFF, #ECFDF5)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <div style={{ fontSize: '12px', color: todayWork.alerts_count > 0 ? '#DC2626' : '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Alerts
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: todayWork.alerts_count > 0 ? '#DC2626' : '#047857', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {todayWork.alerts_count}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>Vital & intake triggers</div>
          </button>
        </div>
      </section>

      {/* ── 3. Lower Section: 2 Equal Columns on Desktop (>= 1024px), 1 Column on Mobile (< 1024px) ── */}
      <div className="nurse-lower-layout">
        {/* ══════════════════════════════════════════════════════════════════════
            LEFT COLUMN: My Patients (Cards) + Shift Handover Section
            ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── "My Patients" Section ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #0284C7',
              boxShadow: '0 4px 20px rgba(2,132,199,0.06)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0284C7, #0369A1)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                    My Patients ({filteredPatients.length})
                  </h2>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    Assigned clinical cases • In-progress shifts prioritized
                  </div>
                </div>
              </div>

              {/* Search box when more than 6 assigned patients */}
              {nursePatients.length > 6 && (
                <div style={{ position: 'relative', width: 220 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF' }} />
                  <input
                    type="text"
                    placeholder="Search patients..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 30px',
                      borderRadius: 8,
                      border: '1px solid #E5E7EB',
                      fontSize: '12px',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Patients List */}
            {filteredPatients.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredPatients.map((p) => {
                  const allergy = getAllergyInfo(p.allergy_status, p.allergies);
                  const tierConfig = getTierChipConfig(p.latest_tier);
                  const isProgress = Boolean(p.is_in_progress);

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: 16,
                        border: isProgress ? '2px solid #0284C7' : '1px solid #E5E7EB',
                        padding: 16,
                        boxShadow: isProgress ? '0 4px 16px rgba(2,132,199,0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Patient Top Row: Avatar, Name, MR, Age, In-Progress badge */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 12,
                              background: isProgress ? 'linear-gradient(135deg, #0284C7, #0369A1)' : 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '15px',
                              flexShrink: 0,
                            }}
                          >
                            {p.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'PT'}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937' }}>
                                {p.name}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0369A1', background: '#E0F2FE', padding: '1px 6px', borderRadius: 4, border: '1px solid #BAE6FD' }}>
                                MR: {p.mr_number || '-'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: 2 }}>
                              Age: <strong>{p.age || '-'}y</strong> • Sex: <strong>{p.gender_display || p.gender || '-'}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Badges strip: In-progress + Tier */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {isProgress && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 9px',
                                borderRadius: 999,
                                background: '#ECFDF5',
                                color: '#047857',
                                border: '1px solid #A7F3D0',
                              }}
                            >
                              ● Shift In-Progress
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 9px',
                              borderRadius: 999,
                              background: tierConfig.bg,
                              color: tierConfig.color,
                              border: `1px solid ${tierConfig.border}`,
                            }}
                          >
                            {tierConfig.label}
                          </span>
                        </div>
                      </div>

                      {/* Clinical Row 1: Diagnosis & Allergy Badge */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0369A1', background: '#F0F9FF', padding: '3px 10px', borderRadius: 8, border: '1px solid #BAE6FD' }}>
                          🩺 {p.primary_diagnosis || 'Bedside Observation'}
                        </span>
                        {/* Allergy Badge adhering strictly to Safety Fix 1 */}
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 8,
                            background: allergy.status === 'has_allergies' ? '#FEE2E2' : (allergy.status === 'nkda' ? '#ECFDF5' : '#FEF3C7'),
                            color: allergy.status === 'has_allergies' ? '#991B1B' : (allergy.status === 'nkda' ? '#047857' : '#92400E'),
                            border: `1px solid ${allergy.status === 'has_allergies' ? '#FECACA' : (allergy.status === 'nkda' ? '#A7F3D0' : '#FDE68A')}`,
                          }}
                          title={allergy.fullLabel}
                        >
                          {allergy.status === 'has_allergies' && allergy.allergens.length
                            ? `⚠ Allergies: ${allergy.allergens.join(', ')}`
                            : allergy.label}
                        </span>
                      </div>

                      {/* Active Complaint */}
                      {p.active_complaint && (
                        <div style={{ fontSize: '12px', color: '#4B5563', background: '#F9FAFB', padding: '6px 10px', borderRadius: 8, border: '1px solid #EEF0F4' }}>
                          <strong>Active Complaint:</strong> {p.active_complaint}
                        </div>
                      )}

                      {/* Address & Google Maps link */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: '#F9FAFB',
                          borderRadius: 8,
                          border: '1px solid #EEF0F4',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: '#4B5563' }}>
                          <MapPin size={14} style={{ color: '#0284C7', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.address || 'Address documented in patient chart'}
                          </span>
                        </div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            color: '#0284C7',
                            background: '#E0F2FE',
                            border: '1px solid #BAE6FD',
                            borderRadius: 6,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            flexShrink: 0,
                            textDecoration: 'none',
                          }}
                        >
                          <span>Maps</span>
                          <ArrowUpRight size={11} />
                        </a>
                      </div>

                      {/* Latest Vitals Snippet */}
                      {p.latest_vitals ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6B7280' }}>
                            <span>LATEST VITALS</span>
                            <span>{formatTimeAgo(p.last_vitals_at || p.latest_vitals.recorded_at)}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            <div style={{ padding: '4px', textAlign: 'center', background: '#F0F9FF', borderRadius: 6, fontSize: '11px' }}>
                              <div style={{ color: '#0369A1', fontWeight: 600 }}>BP</div>
                              <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{p.latest_vitals.bp || '-'}</div>
                            </div>
                            <div style={{ padding: '4px', textAlign: 'center', background: '#FFF1F2', borderRadius: 6, fontSize: '11px' }}>
                              <div style={{ color: '#BE123C', fontWeight: 600 }}>HR</div>
                              <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{p.latest_vitals.hr || '-'}</div>
                            </div>
                            <div style={{ padding: '4px', textAlign: 'center', background: '#ECFDF5', borderRadius: 6, fontSize: '11px' }}>
                              <div style={{ color: '#047857', fontWeight: 600 }}>SpO2</div>
                              <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{p.latest_vitals.spo2 || '-'}</div>
                            </div>
                            <div style={{ padding: '4px', textAlign: 'center', background: '#FFFBEB', borderRadius: 6, fontSize: '11px' }}>
                              <div style={{ color: '#B45309', fontWeight: 600 }}>Temp</div>
                              <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{p.latest_vitals.temp || '-'}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#6B7280', background: '#F9FAFB', padding: '6px 10px', borderRadius: 8, textAlign: 'center' }}>
                          No vitals recorded today
                        </div>
                      )}

                      {/* Latest Handover Snippet (if any from last 24h) */}
                      {p.latest_handover && (
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', fontSize: '12px' }}>
                          <div style={{ color: '#B45309', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                            Latest Handover ({p.latest_handover.shift_label || 'Shift'})
                          </div>
                          <div style={{ color: '#78350F', marginTop: 2, fontStyle: 'italic' }}>
                            &ldquo;{p.latest_handover.text}&rdquo;
                          </div>
                          <div style={{ color: '#92400E', fontSize: '11px', marginTop: 2 }}>
                            — {p.latest_handover.author_name} ({formatTimeAgo(p.latest_handover.created_at)})
                          </div>
                        </div>
                      )}

                      {/* Patient Action Buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #F1F5F9' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenPatient(p, 'monitoring')}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: 6, color: '#DC2626', borderColor: '#FECACA' }}
                        >
                          <Activity size={12} style={{ marginRight: 4 }} /> Record Vitals
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPatient(p, 'medications')}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: 6, color: '#0284C7', borderColor: '#BAE6FD' }}
                        >
                          <Pill size={12} style={{ marginRight: 4 }} /> Give Meds (MAR)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPatient(p, 'nursing_notes')}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: 6, color: '#EA580C', borderColor: '#FED7AA' }}
                        >
                          <FileText size={12} style={{ marginRight: 4 }} /> Nurse Note
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPatient(p, 'monitoring')}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '12px', padding: '4px 8px', borderRadius: 6, color: '#059669', borderColor: '#A7F3D0' }}
                        >
                          Intake/Output
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPatient(p)}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 6, background: '#7C3AED', border: 'none', marginLeft: 'auto' }}
                        >
                          Open File →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#6B7280' }}>
                <CheckCircle2 size={32} style={{ color: '#10B981', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: '#374151' }}>No Assigned Patients Found Today</div>
                <div style={{ fontSize: '12px', marginTop: 4 }}>You will see clinical cards here as shifts are published.</div>
              </div>
            )}
          </section>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            RIGHT COLUMN: Alerts & Reminders, Quick Actions, Compact My Team, Claims
            ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Alerts & Reminders Card (Real Sources Only) ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #EF4444',
              boxShadow: '0 4px 20px rgba(239,68,68,0.06)',
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
                      onClick={() => {
                        const targetPt = nursePatients.find((p) => p.id === a.patient_id) || nursePatients[0];
                        if (targetPt) handleOpenPatient(targetPt);
                        else setActivePage('patient-file');
                      }}
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
                      title="Click to review in patient chart"
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
          </section>

          {/* ── Quick Clinical Actions Card (Nurse-Authorable Actions) ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #10B981',
              boxShadow: '0 4px 20px rgba(16,185,129,0.06)',
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
              {/* Action 1: Record Vitals */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleQuickActionClick('vitals')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 12,
                  borderColor: '#FECACA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #FEF2F2)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Record Vitals & Fluid Intake</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>BP, Pulse, SpO2, Temp, Intake/Output</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#DC2626' }} />
              </button>

              {/* Action 2: Administer Medication (MAR) */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleQuickActionClick('mar')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 12,
                  borderColor: '#BAE6FD',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #F0F9FF)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E0F2FE', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pill size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Give Medication (MAR)</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>Administer verified active medication</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#0284C7' }} />
              </button>

              {/* Action 3: Transcribe Prescription */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleQuickActionClick('mar')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 12,
                  borderColor: '#FDE68A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #FFFFFF, #FFFBEB)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Stethoscope size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Transcribe Prescription</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>Enters order awaiting doctor verification</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#D97706' }} />
              </button>

              {/* Action 4: Request Supervisor Visit */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => openQuickRequest('supervisor_visit')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
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
                    <UserCheck size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1B4B' }}>Request Supervisor Visit</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>Clinical escalation or difficulty on duty</div>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#6D28D9' }} />
              </button>
            </div>
          </section>

          {/* ── Compact "My Team" Row (Supervisor, Buddy Nurse, Transport Driver - Safety Fix 3) ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                My Support Team
              </h3>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>Duty Contacts</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Member 1: Supervisor */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#FAF5FF',
                  borderRadius: 12,
                  border: '1px solid #E9D5FF',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#7C3AED', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                    {supervisor?.name?.slice(0, 2).toUpperCase() || 'SP'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {supervisor?.name || 'Dr. Sara Ahmed'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6D28D9', fontWeight: 600 }}>Clinical Supervisor</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {supervisor?.phone ? (
                    <a
                      href={`tel:${supervisor.phone}`}
                      className="btn btn-sm"
                      style={{ padding: '3px 8px', fontSize: '11px', color: '#6D28D9', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 6, textDecoration: 'none' }}
                      title="Call Supervisor"
                    >
                      <Phone size={11} style={{ marginRight: 3 }} /> Call
                    </a>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Not set</span>
                  )}
                  {/* Chat: disabled coming soon badge */}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '3px 7px',
                      borderRadius: 6,
                      background: '#F3F4F6',
                      color: '#6B7280',
                      border: '1px solid #E5E7EB',
                      cursor: 'not-allowed',
                    }}
                    title="In-app messaging coming soon"
                  >
                    Chat (Coming soon)
                  </span>
                </div>
              </div>

              {/* Member 2: Transport Driver */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#EFF6FF',
                  borderRadius: 12,
                  border: '1px solid #BFDBFE',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Car size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {transport?.driver_name || 'Nadeem Khan'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
                      Transport Driver ({formatPickupTime(transport?.pickup_time)})
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {transport?.driver_phone ? (
                    <a
                      href={`tel:${transport.driver_phone}`}
                      className="btn btn-sm"
                      style={{ padding: '3px 8px', fontSize: '11px', color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 6, textDecoration: 'none' }}
                      title="Call Driver"
                    >
                      <Phone size={11} style={{ marginRight: 3 }} /> Call
                    </a>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Not set</span>
                  )}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '3px 7px',
                      borderRadius: 6,
                      background: '#F3F4F6',
                      color: '#6B7280',
                      border: '1px solid #E5E7EB',
                      cursor: 'not-allowed',
                    }}
                    title="In-app messaging coming soon"
                  >
                    Chat (Coming soon)
                  </span>
                </div>
              </div>

              {/* Member 3: Buddy Staff Nurse */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#ECFDF5',
                  borderRadius: 12,
                  border: '1px solid #A7F3D0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#059669', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                    {buddy?.name?.slice(0, 2).toUpperCase() || 'BD'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {buddy?.name || 'Bob Ahmed'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>Buddy Staff Nurse</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {buddy?.phone ? (
                    <a
                      href={`tel:${buddy.phone}`}
                      className="btn btn-sm"
                      style={{ padding: '3px 8px', fontSize: '11px', color: '#0F766E', background: '#CCFBF1', border: '1px solid #99F6E4', borderRadius: 6, textDecoration: 'none' }}
                      title="Call Buddy"
                    >
                      <Phone size={11} style={{ marginRight: 3 }} /> Call
                    </a>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Not set</span>
                  )}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '3px 7px',
                      borderRadius: 6,
                      background: '#F3F4F6',
                      color: '#6B7280',
                      border: '1px solid #E5E7EB',
                      cursor: 'not-allowed',
                    }}
                    title="In-app messaging coming soon"
                  >
                    Chat (Coming soon)
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Claims & Overtime Card ── */}
          <section
            className="card"
            style={{
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #EEF0F4',
              borderTop: '4px solid #F59E0B',
              boxShadow: '0 4px 20px rgba(245,158,11,0.06)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1E1B4B', margin: 0 }}>
                Claims & Overtime
              </h3>
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
          </section>
        </div>
      </div>

      {/* ── Slide-over Drawer for Today's Work metrics ── */}
      <NurseDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        type={drawerType}
        title={drawerTitle}
        onPatientSelect={(pid, item) => {
          setDrawerOpen(false);
          const found = nursePatients.find((p) => p.id === pid);
          if (found) handleOpenPatient(found);
          else handleOpenPatient({ id: pid, name: item?.patient_name || item?.name });
        }}
      />

      {/* ── Modal: Write / Edit Handover Note ── */}
      <Modal
        isOpen={showHandoverModal}
        onClose={() => setShowHandoverModal(false)}
        title={editingHandoverId ? 'Edit Shift Handover Note' : 'Write Shift Handover Note'}
        subtitle="Formal bedside handover record (15-minute author edit window, immutable record integrity)"
        size="md"
        isDirty={Boolean(handoverText)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowHandoverModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!handoverText.trim() || submittingHandover}
              isLoading={submittingHandover}
              onClick={handleSubmitHandover}
            >
              {editingHandoverId ? 'Save Edits' : 'Save Handover Note'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitHandover} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!editingHandoverId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Assigned Patient *</label>
              <select
                value={handoverPatientId}
                onChange={(e) => setHandoverPatientId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: '13px' }}
                required
              >
                {nursePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MR: {p.mr_number || '-'})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Shift *</label>
              <select
                value={handoverShiftLabel}
                onChange={(e) => setHandoverShiftLabel(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: '13px' }}
              >
                <option value="Day Shift">Day Shift</option>
                <option value="Evening Shift">Evening Shift</option>
                <option value="Night Shift">Night Shift</option>
                <option value="Special Duty">Special Duty</option>
              </select>
            </div>

            <Input
              type="date"
              label="Shift Date"
              value={handoverShiftDate}
              onChange={(e) => setHandoverShiftDate(e.target.value)}
              disabled={Boolean(editingHandoverId)}
            />
          </div>

          <Textarea
            label="Handover Notes / Continuity Summary *"
            required
            showCount
            maxLength={1000}
            rows={4}
            placeholder="Document patient condition, IV cannula status, medication timing, fluid balance, specific warnings for incoming nurse..."
            value={handoverText}
            onChange={(e) => setHandoverText(e.target.value)}
          />

          <div className="alert-callout alert-callout-info" style={{ fontSize: '12px', padding: '8px 12px' }}>
            <AlertCircle size={14} style={{ color: '#6D28D9', flexShrink: 0, marginTop: 1 }} />
            <span>
              Clinical Integrity: Once saved, this handover note cannot be deleted. Authors may edit within 15 minutes. Erroneous entries must be marked &ldquo;Entered in Error&rdquo; with reason.
            </span>
          </div>

          {handoverFeedback && (
            <div className={`alert-callout alert-callout-${handoverFeedback.type === 'error' ? 'danger' : 'success'}`} style={{ fontSize: '13px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{handoverFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Modal: Mark Handover Entered in Error ── */}
      <Modal
        isOpen={showHandoverErrorModal}
        onClose={() => setShowHandoverErrorModal(false)}
        title="Mark Handover as Entered in Error"
        subtitle="Clinical record integrity requires an audit reason. The note will remain visible struck through."
        size="md"
        isDirty={Boolean(errorReason)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowHandoverErrorModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isPill
              disabled={!errorReason.trim() || submittingError}
              isLoading={submittingError}
              onClick={handleSubmitHandoverError}
            >
              Confirm Entered in Error
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitHandoverError} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errorTargetHandover && (
            <div style={{ background: '#F9FAFB', padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: '#1F2937' }}>
                Note text: &ldquo;{errorTargetHandover.text}&rdquo;
              </div>
              <div style={{ color: '#6B7280', fontSize: '12px', marginTop: 4 }}>
                Author: {errorTargetHandover.author_name} • Shift: {errorTargetHandover.shift_label}
              </div>
            </div>
          )}

          <Textarea
            label="Reason for Error *"
            required
            showCount
            maxLength={300}
            rows={3}
            placeholder="e.g. Documented on wrong patient chart, incorrect shift time entered..."
            value={errorReason}
            onChange={(e) => setErrorReason(e.target.value)}
          />

          {errorModalFeedback && (
            <div className={`alert-callout alert-callout-${errorModalFeedback.type === 'error' ? 'danger' : 'success'}`} style={{ fontSize: '13px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorModalFeedback.text}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Modal: Submit Overtime Claim ── */}
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

      {/* ── Modal: Claim History ── */}
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

      {/* ── Modal: Quick Action Request (Supervisor Visit / Pharmacy / Consultation) ── */}
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
          {/* Patient dropdown if multiple */}
          {nursePatients.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Patient *</label>
              <select
                value={selectedRequestPatientId}
                onChange={(e) => setSelectedRequestPatientId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: '13px' }}
              >
                {nursePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MR: {p.mr_number || '-'})
                  </option>
                ))}
              </select>
            </div>
          ) : nursePatients[0] ? (
            <div style={{ padding: '8px 12px', background: '#FAF5FF', borderRadius: 8, border: '1px solid #DDD6FE', fontSize: '13px' }}>
              Patient: <strong>{nursePatients[0].name}</strong> (MR: {nursePatients[0].mr_number || '-'})
            </div>
          ) : null}

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
            label="Clinical Reason / Items Needed *"
            required
            showCount
            maxLength={400}
            rows={3}
            placeholder={
              activeRequestModal === 'supervisor_visit'
                ? 'Reason for supervisor visit request (e.g. acute clinical escalation, catheter difficulty...)'
                : activeRequestModal === 'pharmacy_order'
                ? 'Supplies needed (e.g. 5x sterile dressing packs, 100ml normal saline flushes...)'
                : 'Consultation specialty needed and brief patient history...'
            }
            value={reqNotes}
            onChange={(e) => setReqNotes(e.target.value)}
          />

          <Input
            label="Additional Details / Instructions (Optional)"
            placeholder="e.g. Morning visit preferred..."
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

      {/* ── Modal: View All Active Alerts ── */}
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
                    const targetPt = nursePatients.find((p) => p.id === a.patient_id) || nursePatients[0];
                    if (targetPt) handleOpenPatient(targetPt);
                    else setActivePage('patient-file');
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

      {/* ── Modal: Patient Picker for Quick Clinical Actions (when multiple patients) ── */}
      <Modal
        isOpen={Boolean(patientPickerAction)}
        onClose={() => setPatientPickerAction(null)}
        title="Select Patient for Action"
        subtitle="Choose which patient to perform this clinical action for"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nursePatients.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const action = patientPickerAction;
                setPatientPickerAction(null);
                handleOpenPatient(
                  p,
                  action === 'vitals' ? 'monitoring' : action === 'mar' ? 'medications' : action === 'notes' ? 'nursing_notes' : 'monitoring'
                );
              }}
              className="btn btn-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F2937' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>MR: {p.mr_number || '-'}</div>
              </div>
              <ChevronRight size={15} style={{ color: '#6D28D9' }} />
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Responsive 2-Column Grid Layout Style ── */}
      <style>{`
        .nurse-lower-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 1024px) {
          .nurse-lower-layout {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 24px;
            align-items: start;
          }
        }
        .today-stat-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(109,40,217,0.08);
        }
      `}</style>
    </div>
  );
}
