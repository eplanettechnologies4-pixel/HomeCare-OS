import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Eye, Printer, Plus, Check, X, Calendar, Clock,
  AlertCircle, AlertTriangle, FileText, Activity, Droplet,
  Stethoscope, FileCheck, FlaskConical, ClipboardCheck,
  ShieldCheck, ClipboardList, HeartHandshake, Pill, User,
  ChevronRight, ExternalLink, Filter, RefreshCw, ArrowLeft,
  CheckCircle2, AlertOctagon, HelpCircle, Phone, Send, Users
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import PatientDetailsModal from '../components/PatientDetailsModal';
import PrintPatientFileModal from '../components/PrintPatientFileModal';
import ClinicianPatientChart from './ClinicianPatientChart';
import NursePatientDetail from './NursePatientDetail';
import VitalsRecordFormB from '../components/VitalsRecordFormB';
import NursesNotesFormA from '../components/NursesNotesFormA';
import MarSheetFormC from '../components/MarSheetFormC';
import PrescriptionsTab from '../components/PrescriptionsTab';
import { normalizeRole, isClinicianRole } from '../config/clinicianRoleConfig';

// 11 Clinical Records Tiles definition
const CLINICAL_TILES = [
  { id: 'medications', label: 'Medication chart', icon: Pill, color: '#0284C7', bg: '#E0F2FE' },
  { id: 'vitals', label: 'Vital signs chart', icon: Activity, color: '#DC2626', bg: '#FEE2E2' },
  { id: 'intake_output', label: 'Intake / Output chart', icon: Droplet, color: '#2563EB', bg: '#DBEAFE' },
  { id: 'doctor_notes', label: "Consultations / Doctor's notes", icon: Stethoscope, color: '#6D28D9', bg: '#EDE9FE' },
  { id: 'consents', label: 'Consent forms', icon: FileCheck, color: '#059669', bg: '#D1FAE5' },
  { id: 'history_sheets', label: 'History sheets', icon: FileText, color: '#D97706', bg: '#FEF3C7' },
  { id: 'lab_reports', label: 'Lab reports', icon: FlaskConical, color: '#7C3AED', bg: '#EDE9FE' },
  { id: 'manager_checklist', label: "Manager's visit checklist", icon: ClipboardCheck, color: '#4F46E5', bg: '#EEF2FF' },
  { id: 'safety_checklist', label: 'Safety checklist', icon: ShieldCheck, color: '#0D9488', bg: '#CCFBF1' },
  { id: 'nursing_notes', label: "Nurses' notes", icon: ClipboardList, color: '#EA580C', bg: '#FFEDD5' },
  { id: 'rehabilitation_notes', label: 'Rehabilitation notes', icon: HeartHandshake, color: '#16A34A', bg: '#DCFCE7' },
];

export default function PatientFile() {
  const currentRole = useStore((s) => s.currentRole);
  const currentUser = useStore((s) => s.currentUser);
  const selectedPatient = useStore((s) => s.selectedPatient);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);
  const setActivePage = useStore((s) => s.setActivePage);

  // Patient List State (A1)
  const [patientsList, setPatientsList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [listPage, setListPage] = useState(1);

  // Active Patient File Data (A2, A3, B, C)
  const [activePatientId, setActivePatientId] = useState(selectedPatient?.id || null);
  const [patientFileData, setPatientFileData] = useState(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState(null);

  // Modals state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [modalPatient, setModalPatient] = useState(null); // for list detail popup

  // Section B Edit Modals & State
  const [editingSection, setEditingSection] = useState(null); // 'brief_history' | 'care_plan'
  const [editText, setEditText] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(null); // 'brief_history' | 'care_plan'
  
  // Active Complaint Modals & State
  const [showNewComplaintModal, setShowNewComplaintModal] = useState(false);
  const [newComplaintText, setNewComplaintText] = useState('');
  const [showComplaintHistoryModal, setShowComplaintHistoryModal] = useState(false);

  // Scheduled Items Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newScheduleItem, setNewScheduleItem] = useState({ kind: 'procedure', title: '', due_at: '', notes: '' });

  // Section C Tiles & Timeline
  const [activeTile, setActiveTile] = useState('medications');
  const [dateFilter, setDateFilter] = useState('6months'); // '6months' | '1year' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineRecords, setTimelineRecords] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelinePagination, setTimelinePagination] = useState({ page: 1, total_pages: 1, count: 0 });

  // Side Drawer for Single Record
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Classic Chart View Mode
  const [showClassicChart, setShowClassicChart] = useState(false);

  // Clinical Write Modals & Forms
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showNurseNotesModal, setShowNurseNotesModal] = useState(false);
  const [showMarModal, setShowMarModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  const [showDoctorNoteModal, setShowDoctorNoteModal] = useState(false);
  const [doctorNoteData, setDoctorNoteData] = useState({ assessment: '', plan: '', is_signed: true });
  const [submittingNote, setSubmittingNote] = useState(false);

  const [showTherapyNoteModal, setShowTherapyNoteModal] = useState(false);
  const [therapyNoteData, setTherapyNoteData] = useState({ session_notes: '', rehabilitation_plan: '', goals: '', exercises_prescribed: '', is_signed: true });
  const [submittingTherapy, setSubmittingTherapy] = useState(false);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentData, setConsentData] = useState({ title: '', consent_type: 'treatment', description: '', patient_signature_obtained: true });
  const [submittingConsent, setSubmittingConsent] = useState(false);

  const [showLabOrderModal, setShowLabOrderModal] = useState(false);
  const [labOrderData, setLabOrderData] = useState({ test_name: '', notes: '', priority: 'routine' });
  const [submittingLab, setSubmittingLab] = useState(false);

  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralData, setReferralData] = useState({ specialty: '', urgency: 'routine', reason: '', target_facility: '' });
  const [submittingReferral, setSubmittingReferral] = useState(false);

  const [showCareManagerRequestModal, setShowCareManagerRequestModal] = useState(false);
  const [cmRequestData, setCmRequestData] = useState({ request_type: 'supervisor_visit', urgency: 'routine', notes: '', details: '' });
  const [submittingCmRequest, setSubmittingCmRequest] = useState(false);

  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [targetAddendumRecord, setTargetAddendumRecord] = useState(null);
  const [addendumText, setAddendumText] = useState('');
  const [addendumReason, setAddendumReason] = useState('');
  const [submittingAddendum, setSubmittingAddendum] = useState(false);

  // ── Fetch Patients List ───────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const isClinician = isClinicianRole(currentRole);
      const endpoint = isClinician ? '/staff-portal/patients/' : '/patients/';
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        setPatientsList(items);
      }
    } catch (e) {
      console.warn('[PatientFile] Failed to load patients list:', e);
    } finally {
      setListLoading(false);
    }
  }, [currentRole]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Keep activePatientId in sync with store
  useEffect(() => {
    if (selectedPatient?.id && selectedPatient.id !== activePatientId) {
      setActivePatientId(selectedPatient.id);
    }
  }, [selectedPatient]);

  // ── Fetch Patient File Hub Data ───────────────────────────────────────────
  const loadPatientFile = useCallback(async (pid) => {
    if (!pid) return;
    setHubLoading(true);
    setHubError(null);
    try {
      const res = await apiFetch(`/patients/${pid}/patient-file/`);
      if (res.ok) {
        const data = await res.json();
        setPatientFileData(data);
      } else if (res.status === 404) {
        setHubError('Patient record not found or not assigned to your clinical scope.');
      } else if (res.status === 403) {
        setHubError('You do not have permission to access internal patient files.');
      } else {
        setHubError('Failed to load patient file data.');
      }
    } catch (e) {
      setHubError('Network error while loading patient file.');
    } finally {
      setHubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePatientId) {
      loadPatientFile(activePatientId);
    } else {
      setPatientFileData(null);
    }
  }, [activePatientId, loadPatientFile]);

  // ── Fetch Timeline Records ────────────────────────────────────────────────
  const loadTimeline = useCallback(async () => {
    if (!activePatientId) return;
    setTimelineLoading(true);
    try {
      let queryParams = `?page=${timelinePagination.page}`;
      if (timelineSearch) {
        queryParams += `&q=${encodeURIComponent(timelineSearch)}`;
      }

      if (dateFilter === 'all') {
        queryParams += `&all_time=true`;
      } else if (dateFilter === '1year') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        queryParams += `&from=${oneYearAgo.toISOString().split('T')[0]}`;
      } else if (dateFilter === 'custom') {
        if (customFrom) queryParams += `&from=${customFrom}`;
        if (customTo) queryParams += `&to=${customTo}`;
      }
      // Note: '6months' defaults on backend (183 days)

      const res = await apiFetch(`/patients/${activePatientId}/records/${activeTile}/${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineRecords(data.results || []);
        setTimelinePagination({
          page: data.page || 1,
          total_pages: data.total_pages || 1,
          count: data.count || 0,
        });
      } else {
        setTimelineRecords([]);
      }
    } catch (e) {
      console.warn('[PatientFile] Failed to fetch timeline:', e);
      setTimelineRecords([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [activePatientId, activeTile, dateFilter, customFrom, customTo, timelineSearch, timelinePagination.page]);

  useEffect(() => {
    if (activePatientId) {
      loadTimeline();
    }
  }, [activePatientId, activeTile, dateFilter, customFrom, customTo, timelineSearch, loadTimeline]);

  // Refetch on window focus (Reactive without admin polling)
  useEffect(() => {
    const handleFocus = () => {
      if (activePatientId) {
        loadPatientFile(activePatientId);
        loadTimeline();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activePatientId, loadPatientFile, loadTimeline]);

  // ── Patient Selection Handlers ────────────────────────────────────────────
  const handleSelectPatient = (p) => {
    setActivePatientId(p.id);
    setSelectedPatient(p);
  };

  const handleOpenListDetail = (e, p) => {
    e.stopPropagation();
    setModalPatient(p);
    setShowDetailsModal(true);
  };

  // ── Section B Actions: History & Care Plan ────────────────────────────────
  const handleSaveHistoryCare = async () => {
    if (!editingSection || !activePatientId) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/history-care-plan/`, {
        method: 'POST',
        body: JSON.stringify({
          section: editingSection,
          text: editText,
        }),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
        setEditingSection(null);
        setEditText('');
      } else {
        alert('Failed to update record. Only assigned doctors, care managers, and admins are permitted.');
      }
    } catch (e) {
      alert('Error updating record.');
    }
  };

  // ── Section B Actions: Active Complaint ───────────────────────────────────
  const handleCreateComplaint = async () => {
    if (!newComplaintText.trim() || !activePatientId) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/active-complaint/`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          text: newComplaintText.trim(),
        }),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
        setShowNewComplaintModal(false);
        setNewComplaintText('');
      } else {
        alert('Failed to record active complaint.');
      }
    } catch (e) {
      alert('Error recording active complaint.');
    }
  };

  const handleResolveComplaint = async () => {
    if (!activePatientId) return;
    if (!window.confirm('Mark the active complaint as resolved?')) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/active-complaint/`, {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve' }),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
      }
    } catch (e) {
      alert('Error resolving complaint.');
    }
  };

  // ── Section B Actions: Scheduled Items ────────────────────────────────────
  const handleCreateScheduleItem = async () => {
    if (!newScheduleItem.title || !newScheduleItem.due_at || !activePatientId) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/scheduled-items/`, {
        method: 'POST',
        body: JSON.stringify(newScheduleItem),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
        setShowScheduleModal(false);
        setNewScheduleItem({ kind: 'procedure', title: '', due_at: '', notes: '' });
      } else {
        alert('Failed to schedule item.');
      }
    } catch (e) {
      alert('Error creating scheduled item.');
    }
  };

  const handleMarkItemDone = async (item) => {
    if (!activePatientId || !item?.id) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/scheduled-items/${item.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to mark item done.');
      }
    } catch (e) {
      alert('Network error marking item done.');
    }
  };

  const handleCancelItem = async (item) => {
    if (!activePatientId || !item?.id) return;
    if (!window.confirm(`Cancel scheduled item: "${item.title}"?`)) return;
    try {
      const res = await apiFetch(`/patients/${activePatientId}/scheduled-items/${item.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        await loadPatientFile(activePatientId);
      } else {
        alert('Failed to cancel item.');
      }
    } catch (e) {
      alert('Error cancelling item.');
    }
  };

  // ── Clinical Write Action Handlers ────────────────────────────────────────
  const handleCreateDoctorNote = async (e) => {
    e.preventDefault();
    if (!activePatientId || !doctorNoteData.assessment.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await apiFetch(`/patients/${activePatientId}/doctor-notes/`, {
        method: 'POST',
        body: JSON.stringify({
          assessment: doctorNoteData.assessment.trim(),
          plan: doctorNoteData.plan.trim(),
          is_signed: doctorNoteData.is_signed,
          status: doctorNoteData.is_signed ? 'signed' : 'draft',
        }),
      });
      if (res.ok) {
        setShowDoctorNoteModal(false);
        setDoctorNoteData({ assessment: '', plan: '', is_signed: true });
        loadTimeline();
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to save doctor note.');
      }
    } catch (err) {
      alert('Error saving doctor note.');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleCreateTherapyNote = async (e) => {
    e.preventDefault();
    if (!activePatientId || !therapyNoteData.session_notes.trim()) return;
    setSubmittingTherapy(true);
    try {
      const res = await apiFetch(`/patients/${activePatientId}/therapy-notes/`, {
        method: 'POST',
        body: JSON.stringify({
          session_notes: therapyNoteData.session_notes.trim(),
          rehabilitation_plan: therapyNoteData.rehabilitation_plan.trim(),
          goals: therapyNoteData.goals.trim(),
          exercises_prescribed: therapyNoteData.exercises_prescribed.trim(),
          is_signed: therapyNoteData.is_signed,
          status: therapyNoteData.is_signed ? 'signed' : 'draft',
        }),
      });
      if (res.ok) {
        setShowTherapyNoteModal(false);
        setTherapyNoteData({ session_notes: '', rehabilitation_plan: '', goals: '', exercises_prescribed: '', is_signed: true });
        loadTimeline();
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to save therapy note.');
      }
    } catch (err) {
      alert('Error saving therapy note.');
    } finally {
      setSubmittingTherapy(false);
    }
  };

  const handleCreateConsent = async (e) => {
    e.preventDefault();
    if (!activePatientId || !consentData.title.trim()) return;
    setSubmittingConsent(true);
    try {
      const res = await apiFetch(`/patients/${activePatientId}/consents/`, {
        method: 'POST',
        body: JSON.stringify({
          title: consentData.title.trim(),
          consent_type: consentData.consent_type,
          description: consentData.description.trim(),
          patient_signature_obtained: consentData.patient_signature_obtained,
        }),
      });
      if (res.ok) {
        setShowConsentModal(false);
        setConsentData({ title: '', consent_type: 'treatment', description: '', patient_signature_obtained: true });
        loadTimeline();
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to record consent.');
      }
    } catch (err) {
      alert('Error recording consent.');
    } finally {
      setSubmittingConsent(false);
    }
  };

  const handleCreateLabOrder = async (e) => {
    e.preventDefault();
    if (!activePatientId || !labOrderData.test_name.trim()) return;
    setSubmittingLab(true);
    try {
      const res = await apiFetch(`/patients/${activePatientId}/labs/`, {
        method: 'POST',
        body: JSON.stringify({
          patient: activePatientId,
          test_name: labOrderData.test_name.trim(),
          value: 'Pending Collection',
          unit: 'N/A',
          status: 'pending',
          reference_range: labOrderData.notes || 'Routine Order',
        }),
      });
      if (res.ok) {
        setShowLabOrderModal(false);
        setLabOrderData({ test_name: '', notes: '', priority: 'routine' });
        loadTimeline();
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to order lab test.');
      }
    } catch (err) {
      alert('Error ordering lab test.');
    } finally {
      setSubmittingLab(false);
    }
  };

  const handleCreateReferral = async (e) => {
    e.preventDefault();
    if (!activePatientId || !referralData.reason.trim()) return;
    setSubmittingReferral(true);
    try {
      const res = await apiFetch(`/patients/${activePatientId}/referrals/`, {
        method: 'POST',
        body: JSON.stringify({
          specialty: referralData.specialty.trim() || 'Specialist Consultation',
          urgency: referralData.urgency,
          notes: referralData.reason.trim(),
          details: referralData.target_facility.trim(),
        }),
      });
      if (res.ok) {
        setShowReferralModal(false);
        setReferralData({ specialty: '', urgency: 'routine', reason: '', target_facility: '' });
        alert('Referral request submitted successfully.');
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.detail || 'Failed to submit referral.');
      }
    } catch (err) {
      alert('Error submitting referral.');
    } finally {
      setSubmittingReferral(false);
    }
  };

  const handleCreateCareManagerRequest = async (e) => {
    e.preventDefault();
    if (!activePatientId || !cmRequestData.notes.trim()) return;
    setSubmittingCmRequest(true);
    try {
      const res = await apiFetch('/staff-portal/requests/', {
        method: 'POST',
        body: JSON.stringify({
          patient: activePatientId,
          request_type: cmRequestData.request_type,
          urgency: cmRequestData.urgency,
          notes: cmRequestData.notes.trim(),
          details: { detail_text: cmRequestData.details.trim() },
        }),
      });
      if (res.ok) {
        setShowCareManagerRequestModal(false);
        setCmRequestData({ request_type: 'supervisor_visit', urgency: 'routine', notes: '', details: '' });
        alert('Request submitted to Care Manager successfully.');
        loadPatientFile(activePatientId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to submit request.');
      }
    } catch (err) {
      alert('Error submitting request.');
    } finally {
      setSubmittingCmRequest(false);
    }
  };

  const handleSaveAddendum = async (e) => {
    e.preventDefault();
    if (!targetAddendumRecord || !addendumText.trim() || !addendumReason.trim() || !activePatientId) return;
    setSubmittingAddendum(true);
    try {
      const rType = targetAddendumRecord.type || activeTile;
      const res = await apiFetch(`/patients/${activePatientId}/records/${rType}/${targetAddendumRecord.id}/addendum/`, {
        method: 'POST',
        body: JSON.stringify({
          text: addendumText.trim(),
          reason: addendumReason.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setShowAddendumModal(false);
        setAddendumText('');
        setAddendumReason('');
        setTargetAddendumRecord(null);
        if (selectedRecord && selectedRecord.id === targetAddendumRecord.id) {
          setSelectedRecord(updated);
        }
        loadTimeline();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to append addendum.');
      }
    } catch (err) {
      alert('Error appending addendum.');
    } finally {
      setSubmittingAddendum(false);
    }
  };

  // Role permissions helpers
  const normRole = normalizeRole(currentRole);
  const isNurse = normRole === 'nurse';
  const isDoctor = normRole === 'doctor';
  const isTherapist = ['physiotherapist', 'speech_therapist', 'psychotherapist'].includes(normRole);
  const isAdminOrCM = ['super_admin', 'admin', 'care_manager', 'branch_manager'].includes(currentRole);

  // ── Filtered Patients List for Search ─────────────────────────────────────
  const filteredPatients = useMemo(() => {
    if (!listSearch) return patientsList;
    const q = listSearch.toLowerCase();
    return patientsList.filter(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const mr = (p.mr_number || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      return name.includes(q) || mr.includes(q) || phone.includes(q);
    });
  }, [patientsList, listSearch]);

  const pagedPatients = useMemo(() => {
    const start = (listPage - 1) * 10;
    return filteredPatients.slice(start, start + 10);
  }, [filteredPatients, listPage]);

  const totalListPages = Math.max(1, Math.ceil(filteredPatients.length / 10));

  const formatVal = (v) => (v === null || v === undefined || v === '' || v === 'None' || v === 'N/A' ? '-' : v);

  // ──────────────────────────────────────────────────────────────────────────
  // CLASSIC CHART MODE (Preserves ClinicianPatientChart & NursePatientDetail)
  // ──────────────────────────────────────────────────────────────────────────
  if (showClassicChart) {
    const isNurseRole = normalizeRole(currentRole) === 'nurse';
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main, #F8FAFC)' }}>
        <div style={{
          padding: '10px 24px',
          background: '#EDE9FE',
          borderBottom: '1px solid #DDD6FE',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6D28D9' }}>
              Classic Chart Mode
            </span>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>
              ({isNurseRole ? 'Nurse Patient Detail' : 'Clinician Patient Chart'})
            </span>
          </div>
          <button
            onClick={() => setShowClassicChart(false)}
            style={{
              background: '#6D28D9',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={14} /> Return to Patient File
          </button>
        </div>
        {isNurseRole ? <NursePatientDetail /> : <ClinicianPatientChart />}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW 1: PATIENT LIST TABLE (A1)
  // ──────────────────────────────────────────────────────────────────────────
  if (!activePatientId || !patientFileData) {
    return (
      <div className="patient-file-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1E1B4B', letterSpacing: '-0.5px' }}>
              Patient File Directory
            </h1>
            <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '13px' }}>
              Unified clinical files, EMR timeline, and active care plans
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isClinicianRole(currentRole) && (
              <button
                onClick={() => setShowClassicChart(true)}
                style={{
                  background: '#FFFFFF',
                  color: '#6D28D9',
                  border: '1px solid #DDD6FE',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <ExternalLink size={14} /> Open classic chart
              </button>
            )}
            {hubError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', padding: '10px 16px', borderRadius: '10px', color: '#B91C1C', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>{hubError}</span>
                <button onClick={() => setHubError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C' }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
          <div style={{ position: 'relative', maxWidth: '480px' }}>
            <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={listSearch}
              onChange={(e) => { setListSearch(e.target.value); setListPage(1); }}
              placeholder="Search by patient name, MR number, or phone..."
              style={{
                width: '100%',
                padding: '10px 14px 10px 42px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Patients Table */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 20px' }}>Patient Name</th>
                <th style={{ padding: '14px 20px' }}>MR No</th>
                <th style={{ padding: '14px 20px' }}>Age</th>
                <th style={{ padding: '14px 20px' }}>Sex</th>
                <th style={{ padding: '14px 20px' }}>Location</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                    <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px', color: '#6D28D9' }} />
                    <div>Loading assigned patient records...</div>
                  </td>
                </tr>
              ) : pagedPatients.length > 0 ? (
                pagedPatients.map((p) => {
                  const pName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed';
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleSelectPatient(p)}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3FF'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '14px 20px', fontWeight: 600, color: '#1E1B4B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#EDE9FE', color: '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                            {pName[0]}
                          </div>
                          <div>
                            <div>{pName}</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>{p.patient_code || `PT-${p.id}`}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#4B5563', fontWeight: 600 }}>
                        <span style={{ background: '#EDE9FE', color: '#6D28D9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                          {formatVal(p.mr_number)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#334155' }}>{formatVal(p.age)} yrs</td>
                      <td style={{ padding: '14px 20px', color: '#334155' }}>{formatVal(p.gender)}</td>
                      <td style={{ padding: '14px 20px', color: '#475569' }}>{formatVal(p.address || p.city || 'Islamabad')}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={(e) => handleOpenListDetail(e, p)}
                            style={{
                              background: '#F1F5F9',
                              border: '1px solid #CBD5E1',
                              color: '#334155',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Detail
                          </button>
                          <button
                            onClick={() => handleSelectPatient(p)}
                            style={{
                              background: '#6D28D9',
                              border: 'none',
                              color: '#FFFFFF',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>Open File</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    No patient records found matching your search or clinical assignments.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Table Pagination */}
          {totalListPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748B' }}>
              <span>Showing {pagedPatients.length} of {filteredPatients.length} patients</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  disabled={listPage <= 1}
                  onClick={() => setListPage(p => p - 1)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: listPage <= 1 ? '#F1F5F9' : '#FFFFFF', cursor: listPage <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  Prev
                </button>
                <span style={{ padding: '4px 8px', fontWeight: 700, color: '#6D28D9' }}>{listPage} / {totalListPages}</span>
                <button
                  disabled={listPage >= totalListPages}
                  onClick={() => setListPage(p => p + 1)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: listPage >= totalListPages ? '#F1F5F9' : '#FFFFFF', cursor: listPage >= totalListPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal for detail clicked from list */}
        {modalPatient && (
          <PatientDetailsModal
            isOpen={showDetailsModal}
            onClose={() => { setShowDetailsModal(false); setModalPatient(null); }}
            patientData={modalPatient}
            patientId={modalPatient.id}
          />
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW 2: PATIENT FILE HUB (A3, B1, B2, B3, C1, C2)
  // ──────────────────────────────────────────────────────────────────────────
  const p = patientFileData?.patient || {};
  const guardian = patientFileData?.guardian || {};
  const treatingDoc = patientFileData?.treating_consultant;
  const careMgr = patientFileData?.care_manager;
  const staffOnDuty = patientFileData?.staff_on_duty || [];
  const permissions = patientFileData?.permissions || {};
  const activeComplaint = patientFileData?.active_complaint;
  const upcomingItems = patientFileData?.upcoming_items || [];

  const pFullName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient';
  const pInitials = pFullName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'PT';

  return (
    <div className="patient-file-hub" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'var(--font-body, Inter, sans-serif)', color: '#0F172A' }}>
      
      {/* ── TOP NAV BAR / RETURN ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          onClick={() => { setActivePatientId(null); setPatientFileData(null); }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6D28D9',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Patients Directory</span>
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isClinicianRole(currentRole) && (
            <button
              onClick={() => setShowClassicChart(true)}
              style={{
                background: '#FFFFFF',
                color: '#6D28D9',
                border: '1px solid #DDD6FE',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={15} />
              <span>Open classic chart</span>
            </button>
          )}

          {(isNurse || isDoctor || isTherapist || normRole === 'dietician') && (
            <button
              onClick={() => setShowCareManagerRequestModal(true)}
              style={{
                background: '#EDE9FE',
                color: '#6D28D9',
                border: '1px solid #DDD6FE',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Send size={15} />
              <span>Care Manager Request</span>
            </button>
          )}

          {(isDoctor || isTherapist || normRole === 'dietician' || isAdminOrCM) && (
            <button
              onClick={() => setShowReferralModal(true)}
              style={{
                background: '#EDE9FE',
                color: '#6D28D9',
                border: '1px solid #DDD6FE',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Users size={15} />
              <span>New Referral</span>
            </button>
          )}

          <button
            onClick={() => setShowPrintModal(true)}
            style={{
              background: '#6D28D9',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Printer size={15} />
            <span>Print Patient File</span>
          </button>
        </div>
      </div>

      {/* ── A3. PATIENT HEADER ──────────────────────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '18px',
          padding: '20px 24px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          border: '1px solid #E2E8F0',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {p.photo ? (
              <img
                src={p.photo}
                alt={pFullName}
                style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #6D28D9' }}
              />
            ) : (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 8px rgba(109, 40, 217, 0.25)',
                }}
              >
                {pInitials}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1E1B4B' }}>{pFullName}</h2>
                <span style={{ background: '#EDE9FE', color: '#6D28D9', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                  MR: {formatVal(p.mr_number)}
                </span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Code: {formatVal(p.patient_code)}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px', color: '#475569', flexWrap: 'wrap' }}>
                <span><strong>Age:</strong> {formatVal(p.age)} yrs</span>
                <span><strong>Sex:</strong> {formatVal(p.gender_display || p.gender)}</span>
                <span><strong>Location:</strong> {formatVal(p.location)}</span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setShowDetailsModal(true)}
              style={{
                background: '#6D28D9',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(109, 40, 217, 0.2)',
              }}
            >
              <Eye size={15} />
              <span>View Details</span>
            </button>
          </div>
        </div>

        {/* Diagnosis & Allergy Chips */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>Clinical Flags:</span>
          <span style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
            Allergies: {formatVal(p.allergies)}
          </span>
          <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
            Diagnosis: {formatVal(p.primary_diagnosis)}
          </span>
          {treatingDoc && (
            <span style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 600 }}>
              Dr. {treatingDoc.name} ({treatingDoc.specialization})
            </span>
          )}
        </div>
      </div>

      {/* ── B1. BRIEF HISTORY & CURRENT CARE PLAN ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        
        {/* Brief History Card */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1E1B4B' }}>Brief History</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {patientFileData?.brief_history_edits?.length > 0 && (
                <button
                  onClick={() => setShowHistoryModal('brief_history')}
                  style={{ background: 'none', border: 'none', color: '#6D28D9', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Edit Trail ({patientFileData.brief_history_edits.length})
                </button>
              )}
              {permissions?.can_edit_history_care && (
                <button
                  onClick={() => { setEditingSection('brief_history'); setEditText(patientFileData?.brief_history || ''); }}
                  style={{ background: '#EDE9FE', border: 'none', color: '#6D28D9', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#4B5563', lineHeight: 1.5, minHeight: '44px' }}>
            {patientFileData?.brief_history || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No brief history recorded yet.</span>}
          </p>
        </div>

        {/* Current Care Plan Card */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1E1B4B' }}>Current Care Plan</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {patientFileData?.care_plan_edits?.length > 0 && (
                <button
                  onClick={() => setShowHistoryModal('care_plan')}
                  style={{ background: 'none', border: 'none', color: '#6D28D9', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Edit Trail ({patientFileData.care_plan_edits.length})
                </button>
              )}
              {permissions?.can_edit_history_care && (
                <button
                  onClick={() => { setEditingSection('care_plan'); setEditText(patientFileData?.care_plan || ''); }}
                  style={{ background: '#EDE9FE', border: 'none', color: '#6D28D9', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#4B5563', lineHeight: 1.5, minHeight: '44px' }}>
            {patientFileData?.care_plan || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No active care plan recorded yet.</span>}
          </p>
        </div>

      </div>

      {/* ── B2. ACTIVE COMPLAINT (IMPORTANT NOTE) BANNER ─────────────────────── */}
      <div
        style={{
          border: activeComplaint ? '2px solid #D97706' : '1px dashed #CBD5E1',
          background: activeComplaint ? '#FFFBEB' : '#F8FAFC',
          borderRadius: '14px',
          padding: '14px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: activeComplaint ? '#FEF3C7' : '#F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: activeComplaint ? '#D97706' : '#94A3B8',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: activeComplaint ? '#B45309' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Complaint (Important Note)
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: activeComplaint ? '#92400E' : '#64748B', marginTop: '2px' }}>
              {activeComplaint ? activeComplaint.text : 'No active complaint recorded.'}
            </div>
            {activeComplaint && (
              <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                Reported by {activeComplaint.created_by_name || 'Staff'} · {new Date(activeComplaint.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} (PKT)
              </div>
            )}
          </div>
        </div>

        {/* Complaint Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {patientFileData?.active_complaint_history?.length > 0 && (
            <button
              onClick={() => setShowComplaintHistoryModal(true)}
              style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#475569', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              History
            </button>
          )}
          {permissions?.can_manage_complaints && (
            <>
              {activeComplaint && (
                <button
                  onClick={handleResolveComplaint}
                  style={{ background: '#16A34A', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Check size={14} /> Resolve
                </button>
              )}
              <button
                onClick={() => setShowNewComplaintModal(true)}
                style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> New Complaint
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── B3. UPCOMING PROCEDURES, APPOINTMENTS & BLOOD TESTS ──────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '18px 22px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E1B4B' }}>
              Upcoming Procedures, Appointments and Blood Tests
            </h3>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Scheduled clinical events & lab orders</span>
          </div>
          {permissions?.can_create_scheduled && (
            <button
              onClick={() => setShowScheduleModal(true)}
              style={{
                background: '#6D28D9',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={14} /> Schedule Event
            </button>
          )}
        </div>

        {upcomingItems.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>
                  <th style={{ padding: '10px 14px' }}>Item Title</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px' }}>Due (Asia/Karachi)</th>
                  <th style={{ padding: '10px 14px' }}>Notes</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {upcomingItems.map((item, idx) => {
                  const isDone = item.status === 'done';
                  const isCancelled = item.status === 'cancelled';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E1B4B' }}>
                        {item.title}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: item.kind === 'blood_test' ? '#EDE9FE' : item.kind === 'procedure' ? '#E0F2FE' : '#FEF3C7',
                          color: item.kind === 'blood_test' ? '#6D28D9' : item.kind === 'procedure' ? '#0284C7' : '#B45309',
                          padding: '2px 8px', borderRadius: '6px', fontWeight: 700, textTransform: 'capitalize'
                        }}>
                          {item.kind ? item.kind.replace('_', ' ') : 'Event'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }} title={item.due_at}>
                        <span style={{
                          color: item.is_overdue ? '#DC2626' : '#1E1B4B',
                          fontWeight: item.is_overdue ? 800 : 600,
                        }}>
                          {item.due_relative}
                        </span>
                        {item.due_at && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {new Date(item.due_at).toLocaleDateString('en-GB')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#4B5563', maxWidth: '240px' }}>
                        {item.notes || '-'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: isDone ? '#DCFCE7' : isCancelled ? '#FEE2E2' : '#FEF9C3',
                          color: isDone ? '#166534' : isCancelled ? '#991B1B' : '#854D0E',
                          padding: '2px 8px', borderRadius: '6px', fontWeight: 700, textTransform: 'capitalize'
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {!isDone && !isCancelled && !item.is_readonly && (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {permissions?.can_mark_done && (
                              <button
                                onClick={() => handleMarkItemDone(item)}
                                title="Mark item as completed"
                                style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >
                                <Check size={12} /> Done
                              </button>
                            )}
                            {permissions?.can_create_scheduled && (
                              <button
                                onClick={() => handleCancelItem(item)}
                                title="Cancel item"
                                style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontSize: '13px' }}>
            No upcoming procedures, appointments or lab tests scheduled.
          </div>
        )}
      </div>

      {/* ── PART C: CLINICAL RECORDS TILES & TIMELINE VIEWER ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Column: 11 Clinical Records Tiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748B', paddingLeft: '4px', marginBottom: '4px' }}>
            Clinical Records Categories
          </div>
          {CLINICAL_TILES.map((t) => {
            const Icon = t.icon;
            const isSelected = activeTile === t.id;
            return (
              <div
                key={t.id}
                onClick={() => { setActiveTile(t.id); setTimelinePagination(p => ({ ...p, page: 1 })); }}
                style={{
                  background: isSelected ? '#F5F3FF' : '#FFFFFF',
                  border: isSelected ? '2px solid #6D28D9' : '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 4px 6px -1px rgba(109, 40, 217, 0.15)' : 'none',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: isSelected ? '#6D28D9' : t.bg,
                    color: isSelected ? '#FFFFFF' : t.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 800 : 600, color: isSelected ? '#6D28D9' : '#1E293B' }}>
                    {t.label}
                  </div>
                </div>
                <ChevronRight size={16} color={isSelected ? '#6D28D9' : '#94A3B8'} />
              </div>
            );
          })}
        </div>

        {/* Right Column: Timeline Viewer (C2) */}
        <div style={{ background: '#FFFFFF', borderRadius: '18px', padding: '20px 24px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          
          {/* Timeline Header & Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>
                {CLINICAL_TILES.find(t => t.id === activeTile)?.label}
              </h3>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>
                {timelinePagination.count} record(s) found
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Contextual Clinical Write Action Buttons */}
              {(activeTile === 'vitals' || activeTile === 'intake_output') && (isNurse || isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowVitalsModal(true)}
                  style={{
                    background: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Record Observation
                </button>
              )}

              {activeTile === 'nursing_notes' && (isNurse || isAdminOrCM) && (
                <button
                  onClick={() => setShowNurseNotesModal(true)}
                  style={{
                    background: '#EA580C',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Write Nursing Note
                </button>
              )}

              {activeTile === 'medications' && (isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowPrescriptionModal(true)}
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Prescribe Medication
                </button>
              )}

              {activeTile === 'medications' && (isNurse || isAdminOrCM) && (
                <button
                  onClick={() => setShowMarModal(true)}
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ClipboardCheck size={14} /> Open MAR Sheet
                </button>
              )}

              {activeTile === 'doctor_notes' && (isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowDoctorNoteModal(true)}
                  style={{
                    background: '#6D28D9',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> New Doctor Note
                </button>
              )}

              {activeTile === 'rehabilitation_notes' && (isTherapist || isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowTherapyNoteModal(true)}
                  style={{
                    background: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> New Therapy Note
                </button>
              )}

              {activeTile === 'consents' && (isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowConsentModal(true)}
                  style={{
                    background: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Record Consent
                </button>
              )}

              {activeTile === 'lab_reports' && (isDoctor || isAdminOrCM) && (
                <button
                  onClick={() => setShowLabOrderModal(true)}
                  style={{
                    background: '#7C3AED',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={14} /> Order Lab Test
                </button>
              )}

              {/* Date Filter Buttons */}
              <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                {[
                  { id: '6months', label: 'Last 6 mo' },
                  { id: '1year', label: 'Last 1 yr' },
                  { id: 'all', label: 'All time' },
                  { id: 'custom', label: 'Custom' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setDateFilter(f.id)}
                    style={{
                      background: dateFilter === f.id ? '#6D28D9' : 'transparent',
                      color: dateFilter === f.id ? '#FFFFFF' : '#475569',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Date Inputs */}
          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px' }}>
              <span>From:</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1' }} />
              <span>To:</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1' }} />
            </div>
          )}

          {/* Timeline Search Input */}
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Filter timeline records..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* Vertical Timeline List */}
          {timelineLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px', color: '#6D28D9' }} />
              <div style={{ fontSize: '13px' }}>Loading clinical timeline...</div>
            </div>
          ) : timelineRecords.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', paddingLeft: '8px' }}>
              {timelineRecords.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#6D28D9'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#6D28D9', fontWeight: 700 }}>
                        {new Date(rec.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} (PKT)
                      </span>
                      <h4 style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: 700, color: '#1E1B4B' }}>
                        {rec.title}
                      </h4>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {rec.is_signed && (
                        <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                          ✓ Signed
                        </span>
                      )}
                      <Eye size={16} color="#6D28D9" />
                    </div>
                  </div>

                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#4B5563', lineHeight: 1.4 }}>
                    {rec.summary}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748B', borderTop: '1px solid #EEF2F6', paddingTop: '6px' }}>
                    <span>Author: <strong>{rec.author_name}</strong> ({rec.author_role})</span>
                    {rec.has_addenda && (
                      <span style={{ color: '#D97706', fontWeight: 700 }}>Has Addenda</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94A3B8' }}>
              <HelpCircle size={32} style={{ margin: '0 auto 8px', color: '#CBD5E1' }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }}>No records yet</div>
              <p style={{ fontSize: '12px', margin: '4px 0 0' }}>
                There are no {CLINICAL_TILES.find(t => t.id === activeTile)?.label.toLowerCase()} entries in this window.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* ── MODALS & DRAWERS ─────────────────────────────────────────────────── */}

      {/* Patient Details Modal (A2) */}
      <PatientDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        patientData={p}
        guardianData={guardian}
        treatingConsultant={treatingDoc}
        careManager={careMgr}
        staffOnDuty={staffOnDuty}
        patientId={activePatientId}
      />

      {/* Print Patient File Modal */}
      <PrintPatientFileModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        patientData={p}
        guardianData={guardian}
        treatingConsultant={treatingDoc}
        careManager={careMgr}
        briefHistory={patientFileData?.brief_history}
        carePlan={patientFileData?.care_plan}
        activeComplaint={activeComplaint}
        upcomingItems={upcomingItems}
        recentRecords={timelineRecords}
      />

      {/* Single Record Detail Drawer / Modal (C2) */}
      {selectedRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setSelectedRecord(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: '#EDE9FE', padding: '16px 20px', borderBottom: '1px solid #DDD6FE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#6D28D9' }}>{selectedRecord.title}</h3>
                <span style={{ fontSize: '11px', color: '#4B5563' }}>
                  {new Date(selectedRecord.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} (PKT)
                </span>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#6B7280', fontSize: '11px', display: 'block' }}>Author</span>
                <strong>{selectedRecord.author_name} ({selectedRecord.author_role})</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', fontSize: '11px', display: 'block' }}>Clinical Summary</span>
                <p style={{ margin: '4px 0 0', color: '#1E293B', lineHeight: 1.5 }}>{selectedRecord.summary}</p>
              </div>
              {selectedRecord.details && (
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ color: '#6B7280', fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Detailed Values:</span>
                  <pre style={{ margin: 0, fontSize: '11px', color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {JSON.stringify(selectedRecord.details, null, 2)}
                  </pre>
                </div>
              )}
              {selectedRecord.addenda && selectedRecord.addenda.length > 0 && (
                <div>
                  <span style={{ color: '#D97706', fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Addenda Trail:</span>
                  {selectedRecord.addenda.map((ad, idx) => (
                    <div key={idx} style={{ background: '#FFFBEB', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FDE68A', marginBottom: '6px', fontSize: '11px' }}>
                      <div style={{ fontWeight: 600, color: '#92400E' }}>{ad.text}</div>
                      <div style={{ color: '#B45309', marginTop: '2px' }}>By {ad.added_by} on {ad.timestamp}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: '#F8FAFC', padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {(isDoctor || isTherapist || isNurse || isAdminOrCM) && (
                <button
                  onClick={() => {
                    setTargetAddendumRecord(selectedRecord);
                    setShowAddendumModal(true);
                  }}
                  style={{
                    background: '#EDE9FE',
                    color: '#6D28D9',
                    border: '1px solid #DDD6FE',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Append Addendum
                </button>
              )}
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Brief History / Care Plan Modal */}
      {editingSection && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setEditingSection(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>
              Update {editingSection === 'brief_history' ? 'Brief Medical History' : 'Current Care Plan'}
            </h3>
            <textarea
              rows={6}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button
                onClick={() => setEditingSection(null)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHistoryCare}
                style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Save & Append Trail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Active Complaint Modal */}
      {showNewComplaintModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowNewComplaintModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#B45309' }}>
              Record New Active Complaint
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6B7280' }}>
              Recording a new complaint marks any existing active complaint as superseded.
            </p>
            <textarea
              rows={4}
              value={newComplaintText}
              onChange={e => setNewComplaintText(e.target.value)}
              placeholder="e.g. Patient reporting severe breathlessness and chest tightness..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #FDE68A',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button
                onClick={() => setShowNewComplaintModal(false)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateComplaint}
                style={{ background: '#D97706', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Post Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Item Modal */}
      {showScheduleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#1E1B4B' }}>
              Schedule Clinical Event
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Item Kind</label>
                <select
                  value={newScheduleItem.kind}
                  onChange={e => setNewScheduleItem({ ...newScheduleItem, kind: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                >
                  <option value="procedure">Clinical Procedure (e.g. Foley change, wound dressing)</option>
                  <option value="appointment">Clinical Appointment / Consultation</option>
                  <option value="blood_test">Blood Test / Diagnostic Specimen</option>
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Title</label>
                <input
                  type="text"
                  value={newScheduleItem.title}
                  onChange={e => setNewScheduleItem({ ...newScheduleItem, title: e.target.value })}
                  placeholder="e.g. Foley Catheter Replacement"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Due Date & Time (Asia/Karachi)</label>
                <input
                  type="datetime-local"
                  value={newScheduleItem.due_at}
                  onChange={e => setNewScheduleItem({ ...newScheduleItem, due_at: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Notes</label>
                <textarea
                  rows={2}
                  value={newScheduleItem.notes}
                  onChange={e => setNewScheduleItem({ ...newScheduleItem, notes: e.target.value })}
                  placeholder="Special instructions or equipment needed..."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setShowScheduleModal(false)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateScheduleItem}
                style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Schedule Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trail Modal */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowHistoryModal(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: '#F8FAFC', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E1B4B' }}>
                Edit Audit Trail: {showHistoryModal === 'brief_history' ? 'Brief History' : 'Care Plan'}
              </h3>
              <button onClick={() => setShowHistoryModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              {(showHistoryModal === 'brief_history' ? patientFileData?.brief_history_edits : patientFileData?.care_plan_edits)?.map((ed, idx) => (
                <div key={idx} style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ color: '#1E1B4B', fontWeight: 600 }}>{ed.text}</div>
                  <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px' }}>
                    Edited by <strong>{ed.edited_by_name}</strong> ({ed.edited_by_role}) on {new Date(ed.edited_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Complaint History Modal */}
      {showComplaintHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowComplaintHistoryModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: '#FFFBEB', padding: '16px 20px', borderBottom: '1px solid #FDE68A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#B45309' }}>
                Active Complaint History
              </h3>
              <button onClick={() => setShowComplaintHistoryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              {patientFileData?.active_complaint_history?.map((c, idx) => (
                <div key={idx} style={{ background: c.resolved_at ? '#F8FAFC' : '#FFFBEB', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${c.resolved_at ? '#E2E8F0' : '#FDE68A'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: c.resolved_at ? '#475569' : '#B45309' }}>{c.text}</span>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, background: c.resolved_at ? '#E2E8F0' : '#FEF3C7', color: c.resolved_at ? '#475569' : '#92400E' }}>
                      {c.resolved_at ? 'Resolved' : 'Active'}
                    </span>
                  </div>
                  <div style={{ color: '#64748B', fontSize: '11px' }}>
                    Created by {c.created_by_name} on {new Date(c.created_at).toLocaleDateString('en-GB')}
                    {c.resolved_at && ` · Resolved by ${c.resolved_by_name || 'Clinician'}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CLINICAL WRITE MODALS ── */}

      {/* Vitals & Observations Modal (Form B) */}
      {showVitalsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowVitalsModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={20} color="#DC2626" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                  Vital Signs & Observations (Form B)
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowVitalsModal(false);
                  loadPatientFile(activePatientId);
                  loadTimeline();
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>
            <VitalsRecordFormB patient={{ id: activePatientId, ...p }} isReadOnly={false} />
          </div>
        </div>
      )}

      {/* Nursing Notes Modal (Form A) */}
      {showNurseNotesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowNurseNotesModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={20} color="#EA580C" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                  Nurses' Bedside Notes (Form A)
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowNurseNotesModal(false);
                  loadPatientFile(activePatientId);
                  loadTimeline();
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>
            <NursesNotesFormA patient={{ id: activePatientId, ...p }} isReadOnly={false} />
          </div>
        </div>
      )}

      {/* MAR Sheet Modal (Form C) */}
      {showMarModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowMarModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '960px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardCheck size={20} color="#0284C7" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                  Medication Administration Record (MAR Sheet - Form C)
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowMarModal(false);
                  loadPatientFile(activePatientId);
                  loadTimeline();
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>
            <MarSheetFormC patient={{ id: activePatientId, ...p }} isReadOnly={false} />
          </div>
        </div>
      )}

      {/* Prescriptions Tab Modal */}
      {showPrescriptionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowPrescriptionModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pill size={20} color="#0284C7" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                  Prescribe Medication & Orders
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowPrescriptionModal(false);
                  loadPatientFile(activePatientId);
                  loadTimeline();
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>
            <PrescriptionsTab patient={{ id: activePatientId, ...p }} />
          </div>
        </div>
      )}

      {/* Doctor Note Modal */}
      {showDoctorNoteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowDoctorNoteModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '580px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                New Doctor Consultation Note
              </h3>
              <button onClick={() => setShowDoctorNoteModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateDoctorNote} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Clinical Assessment & Examination Findings *
                </label>
                <textarea
                  rows={4}
                  value={doctorNoteData.assessment}
                  onChange={e => setDoctorNoteData({ ...doctorNoteData, assessment: e.target.value })}
                  placeholder="Document physician findings, exam results, clinical evaluation..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Management & Follow-up Plan
                </label>
                <textarea
                  rows={3}
                  value={doctorNoteData.plan}
                  onChange={e => setDoctorNoteData({ ...doctorNoteData, plan: e.target.value })}
                  placeholder="Prescribed treatment, diagnostic tests, therapy instructions..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#FAF5FF', borderRadius: '8px', border: '1px solid #DDD6FE' }}>
                <input
                  type="checkbox"
                  id="docSignCheckbox"
                  checked={doctorNoteData.is_signed}
                  onChange={e => setDoctorNoteData({ ...doctorNoteData, is_signed: e.target.checked })}
                />
                <label htmlFor="docSignCheckbox" style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9', cursor: 'pointer' }}>
                  Digitally sign and lock note immediately upon saving
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowDoctorNoteModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingNote} style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingNote ? 'Saving...' : 'Save Doctor Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapy Note Modal */}
      {showTherapyNoteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowTherapyNoteModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '580px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                New Rehabilitation & Therapy Note
              </h3>
              <button onClick={() => setShowTherapyNoteModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTherapyNote} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Session Progress Notes *
                </label>
                <textarea
                  rows={4}
                  value={therapyNoteData.session_notes}
                  onChange={e => setTherapyNoteData({ ...therapyNoteData, session_notes: e.target.value })}
                  placeholder="Document patient session, functional progress, mobility, exercises performed..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Rehabilitation Plan & Next Steps
                </label>
                <textarea
                  rows={2}
                  value={therapyNoteData.rehabilitation_plan}
                  onChange={e => setTherapyNoteData({ ...therapyNoteData, rehabilitation_plan: e.target.value })}
                  placeholder="Treatment objectives, frequency, progression milestones..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Goals
                  </label>
                  <input
                    type="text"
                    value={therapyNoteData.goals}
                    onChange={e => setTherapyNoteData({ ...therapyNoteData, goals: e.target.value })}
                    placeholder="e.g. Independent unassisted transfer"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Prescribed Exercises
                  </label>
                  <input
                    type="text"
                    value={therapyNoteData.exercises_prescribed}
                    onChange={e => setTherapyNoteData({ ...therapyNoteData, exercises_prescribed: e.target.value })}
                    placeholder="e.g. Quad sets, ankle pumps 3x daily"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                <input
                  type="checkbox"
                  id="therapySignCheckbox"
                  checked={therapyNoteData.is_signed}
                  onChange={e => setTherapyNoteData({ ...therapyNoteData, is_signed: e.target.checked })}
                />
                <label htmlFor="therapySignCheckbox" style={{ fontSize: '12px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
                  Digitally sign and lock therapy note immediately
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowTherapyNoteModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingTherapy} style={{ background: '#16A34A', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingTherapy ? 'Saving...' : 'Save Therapy Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consent Record Modal */}
      {showConsentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowConsentModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                Record Clinical Consent
              </h3>
              <button onClick={() => setShowConsentModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateConsent} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Consent Title *
                </label>
                <input
                  type="text"
                  value={consentData.title}
                  onChange={e => setConsentData({ ...consentData, title: e.target.value })}
                  placeholder="e.g. Consent for Home Palliative Care & IV Infusion"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Consent Classification
                </label>
                <select
                  value={consentData.consent_type}
                  onChange={e => setConsentData({ ...consentData, consent_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="treatment">General Clinical Treatment</option>
                  <option value="procedure">Invasive / Specialized Procedure</option>
                  <option value="data_sharing">Health Information & Data Sharing</option>
                  <option value="telehealth">Telehealth & Remote Monitoring</option>
                  <option value="photography">Clinical Photography / Wound Imaging</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Consent Terms & Notes
                </label>
                <textarea
                  rows={3}
                  value={consentData.description}
                  onChange={e => setConsentData({ ...consentData, description: e.target.value })}
                  placeholder="Specific details, risks explained, witnessed guardian..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#ECFDF5', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                <input
                  type="checkbox"
                  id="consentObtainedCheckbox"
                  checked={consentData.patient_signature_obtained}
                  onChange={e => setConsentData({ ...consentData, patient_signature_obtained: e.target.checked })}
                />
                <label htmlFor="consentObtainedCheckbox" style={{ fontSize: '12px', fontWeight: 700, color: '#047857', cursor: 'pointer' }}>
                  Patient or legal guardian verified signature obtained
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowConsentModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingConsent} style={{ background: '#059669', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingConsent ? 'Recording...' : 'Record Consent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lab Order Modal */}
      {showLabOrderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowLabOrderModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                Order Laboratory Diagnostic Test
              </h3>
              <button onClick={() => setShowLabOrderModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateLabOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Test Name / Panel *
                </label>
                <input
                  type="text"
                  value={labOrderData.test_name}
                  onChange={e => setLabOrderData({ ...labOrderData, test_name: e.target.value })}
                  placeholder="e.g. Complete Blood Count (CBC), Serum Creatinine"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Urgency / Priority
                </label>
                <select
                  value={labOrderData.priority}
                  onChange={e => setLabOrderData({ ...labOrderData, priority: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT (Emergency)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Clinical Indication / Reason
                </label>
                <textarea
                  rows={3}
                  value={labOrderData.notes}
                  onChange={e => setLabOrderData({ ...labOrderData, notes: e.target.value })}
                  placeholder="Reason for ordering test, relevant symptoms..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowLabOrderModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingLab} style={{ background: '#7C3AED', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingLab ? 'Submitting...' : 'Submit Lab Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Referral Modal */}
      {showReferralModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowReferralModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                Submit Clinical Referral
              </h3>
              <button onClick={() => setShowReferralModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateReferral} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Specialty / Service *
                </label>
                <input
                  type="text"
                  value={referralData.specialty}
                  onChange={e => setReferralData({ ...referralData, specialty: e.target.value })}
                  placeholder="e.g. Cardiology, Orthopedic Surgery, Nutritionist"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Urgency
                  </label>
                  <select
                    value={referralData.urgency}
                    onChange={e => setReferralData({ ...referralData, urgency: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Target Facility / Clinic
                  </label>
                  <input
                    type="text"
                    value={referralData.target_facility}
                    onChange={e => setReferralData({ ...referralData, target_facility: e.target.value })}
                    placeholder="e.g. Shifa International / PIMS"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Clinical Referral Reason & History *
                </label>
                <textarea
                  rows={4}
                  value={referralData.reason}
                  onChange={e => setReferralData({ ...referralData, reason: e.target.value })}
                  placeholder="Describe patient condition, reason for referral, key diagnostic findings..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowReferralModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingReferral} style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingReferral ? 'Submitting...' : 'Submit Referral'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Care Manager Request Modal */}
      {showCareManagerRequestModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowCareManagerRequestModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                Submit Request to Care Manager
              </h3>
              <button onClick={() => setShowCareManagerRequestModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateCareManagerRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Request Type *
                </label>
                <select
                  value={cmRequestData.request_type}
                  onChange={e => setCmRequestData({ ...cmRequestData, request_type: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="supervisor_visit">Request Supervisor On-Site Visit</option>
                  <option value="pharmacy_order">Request Pharmacy Medication Order</option>
                  <option value="appointment">Schedule Clinical Appointment</option>
                  <option value="procedure_change">Procedure / Equipment Change</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Urgency
                </label>
                <select
                  value={cmRequestData.urgency}
                  onChange={e => setCmRequestData({ ...cmRequestData, urgency: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT (Immediate Attention)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Request Clinical Notes *
                </label>
                <textarea
                  rows={4}
                  value={cmRequestData.notes}
                  onChange={e => setCmRequestData({ ...cmRequestData, notes: e.target.value })}
                  placeholder="Explain why this request is required, bedside observations..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Additional Details / Items Needed
                </label>
                <input
                  type="text"
                  value={cmRequestData.details}
                  onChange={e => setCmRequestData({ ...cmRequestData, details: e.target.value })}
                  placeholder="e.g. Specific dressing size, catheter French gauge"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowCareManagerRequestModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingCmRequest} style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingCmRequest ? 'Submitting...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Addendum Modal */}
      {showAddendumModal && targetAddendumRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '20px',
          }}
          onClick={() => setShowAddendumModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
                Append Clinical Addendum
              </h3>
              <button onClick={() => setShowAddendumModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 16px', lineHeight: 1.5 }}>
              Signed clinical records are permanent and immutable. Your addendum will be permanently appended to this entry with your role identity and a server timestamp.
            </p>
            <form onSubmit={handleSaveAddendum} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Addendum Text *
                </label>
                <textarea
                  rows={4}
                  value={addendumText}
                  onChange={e => setAddendumText(e.target.value)}
                  placeholder="Enter clarification, updated clinical finding, or revised plan..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Audit Reason *
                </label>
                <input
                  type="text"
                  value={addendumReason}
                  onChange={e => setAddendumReason(e.target.value)}
                  placeholder="e.g. Diagnostic report reconciliation, change in treatment"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowAddendumModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingAddendum} style={{ background: '#6D28D9', color: '#FFFFFF', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {submittingAddendum ? 'Appending...' : 'Save & Append Addendum'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
