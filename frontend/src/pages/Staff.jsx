import React, { useState, useEffect } from 'react';
import {
  Search, Star, Phone, Mail, Calendar, Clock, X, Award, TrendingUp,
  UserCheck, AlertCircle, CheckCircle, Sliders, Download, Check, FileText, Plus,
  GraduationCap, BookOpen, Play, ChevronRight, Video, FileCheck, Edit3, Trash2,
  MoreVertical, ArrowUpDown, ChevronLeft, ShieldAlert, KeyRound, UserMinus, HeartPulse, Lock, Shield, User
} from 'lucide-react';
import useStore from '../store/useStore';
import StaffIdCard from '../components/StaffIdCard';
import VideoPlayerModal from '../components/VideoPlayerModal';
import CertificateHistoryTable from '../components/CertificateHistoryTable';
import EditStaffModal from '../components/EditStaffModal';
import VisitFeedbackTab from '../components/VisitFeedbackTab';
import ManagerChecklistTab from '../components/ManagerChecklistTab';
import FullHdImageViewerModal from '../components/FullHdImageViewerModal';
import StaffRosterTab from '../components/StaffRosterTab';
import StaffOnboardingDrawer from '../components/StaffOnboardingDrawer';
import StaffProfileView from '../components/StaffProfileView';
import AssignPatientModal from '../components/AssignPatientModal';
import DeactivateStaffModal from '../components/DeactivateStaffModal';
import ScheduleDutyModal from '../components/ScheduleDutyModal';
import { apiFetch } from '../services/api';
import {
  getLiveStatusBadge,
  canAssignPatient,
  canScheduleDuty,
  filterAndSortStaff,
  paginateStaff,
} from '../utils/staffDirectoryHelpers';
import { getStageBadge } from '../utils/staffLifecycleHelpers';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

const STATUS_BADGE = {
  available: 'badge-green',
  on_visit:  'badge-amber',
  off_duty:  'badge-grey',
  on_leave:  'badge-grey',
};

const ROLE_COLORS = {
  nurse:        '#6D28D9',
  doctor:       '#5B21B6',
  physio:       '#7C3AED',
  speech:       '#8B5CF6',
  psychologist: '#A78BFA',
  dietician:    '#DE9A3C',
  care_manager: '#2E8B57',
};

function Stars({ rating }) {
  return (
    <span className="stars">
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#6b7280', marginLeft: 4 }}>
        {Number(rating).toFixed(1)}
      </span>
    </span>
  );
}

import AddStaffUserModal from '../components/AddStaffUserModal';
const AddStaffModal = AddStaffUserModal;

export default function Staff() {
  const staff               = useStore((s) => s.staff);
  const fetchStaff          = useStore((s) => s.fetchStaff);
  const deleteStaffMember   = useStore((s) => s.deleteStaffMember);
  const bookings            = useStore((s) => s.bookings);
  const dailyReports        = useStore((s) => s.dailyReports);
  const leaveRequests       = useStore((s) => s.leaveRequests);
  const updateLeaveStatus   = useStore((s) => s.updateLeaveStatus);
  const attendanceThresholds= useStore((s) => s.attendanceThresholds);
  const updateThresholds    = useStore((s) => s.updateAttendanceThresholds);
  const currentRole         = useStore((s) => s.currentRole);

  const lmsCourses          = useStore((s) => s.lmsCourses);
  const fetchCourses        = useStore((s) => s.fetchCourses);
  const assignCourse        = useStore((s) => s.assignCourse);
  const fetchStaffTraining  = useStore((s) => s.fetchStaffTraining);
  const staffTrainingData   = useStore((s) => s.staffTrainingData);
  const downloadCertificate = useStore((s) => s.downloadCertificate);
  const staffCertificatesData = useStore((s) => s.staffCertificatesData);
  const fetchStaffCertificates = useStore((s) => s.fetchStaffCertificates);
  const downloadCertificateById = useStore((s) => s.downloadCertificateById);

  const isAdminOrCareMgr = ['super_admin', 'admin', 'branch_manager', 'care_manager'].includes(currentRole);
  const isSuperOrAdmin   = ['super_admin', 'admin'].includes(currentRole);

  const [activeSubTab, setActiveSubTab] = useState('directory'); // 'directory' | 'daily-log' | 'calendar' | 'leave' | 'payroll'
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [profileModalTab, setProfileModalTab] = useState('card'); // 'card' | 'training'
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [activeLectureToWatch, setActiveLectureToWatch] = useState(null);

  const [assignModalStaff, setAssignModalStaff] = useState(null);
  const [assignCourseId, setAssignCourseId]     = useState('');
  const [assignDueDate, setAssignDueDate]       = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignToast, setAssignToast]           = useState('');

  const [search, setSearch]                         = useState('');
  const [selectedRole, setSelectedRole]             = useState('');
  const [selectedStage, setSelectedStage]           = useState('');
  const [selectedLiveStatus, setSelectedLiveStatus] = useState('');
  const [sortField, setSortField]                   = useState('full_name');
  const [sortOrder, setSortOrder]                   = useState('asc');
  const [currentPage, setCurrentPage]               = useState(1);
  const [pageSize, setPageSize]                     = useState(15);

  const [viewingStaffId, setViewingStaffId]         = useState(null);
  const [patientAssignStaff, setPatientAssignStaff] = useState(null);
  const [dutyScheduleStaff, setDutyScheduleStaff]   = useState(null);
  const [deactivateTargetStaff, setDeactivateTargetStaff] = useState(null);
  const [openKebabId, setOpenKebabId]               = useState(null);
  const [toastNotice, setToastNotice]               = useState('');
  const [regenCodeModal, setRegenCodeModal]         = useState(null);

  const [onboardingStaff, setOnboardingStaff] = useState(null);
  const [dirViewMode, setDirViewMode]     = useState('table'); // 'table' | 'cards'
  const [selectedNurseForCal, setSelectedNurseForCal] = useState(staff.find(s=>s.role==='nurse')?.id || 1);

  const [selectedDayDetails, setSelectedDayDetails] = useState(null);
  const [showConfigModal, setShowConfigModal]       = useState(false);
  const [configForm, setConfigForm]                 = useState(attendanceThresholds);
  const [showAddModal, setShowAddModal]             = useState(false);
  const [editingStaff, setEditingStaff]             = useState(null);
  const [createdStaffConfirmation, setCreatedStaffConfirmation] = useState(null);
  const [hdViewer, setHdViewer]                     = useState({ open: false, url: '', title: '', badge: '' });

  // URL Hash & History management for /staff/:id
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash || '';
      const match = hash.match(/#\/staff\/(\d+)/);
      if (match) {
        setViewingStaffId(Number(match[1]));
      } else {
        setViewingStaffId(null);
      }
    };
    handleHash();
    window.addEventListener('popstate', handleHash);
    return () => window.removeEventListener('popstate', handleHash);
  }, []);

  const openStaffProfile = (staffMember) => {
    setViewingStaffId(staffMember.id);
    window.history.pushState({ staffId: staffMember.id }, '', `#/staff/${staffMember.id}`);
  };

  const closeStaffProfile = () => {
    setViewingStaffId(null);
    if (window.location.hash.includes('#/staff/')) {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const handleDeactivateClick = (s, e) => {
    if (e) e.stopPropagation();
    setOpenKebabId(null);
    setDeactivateTargetStaff(s);
  };

  const handleReactivateClick = async (s, e) => {
    if (e) e.stopPropagation();
    setOpenKebabId(null);
    if (window.confirm(`Are you sure you want to reactivate ${s.full_name || s.username}?`)) {
      const res = await useStore.getState().reactivateStaffMember(s.id);
      if (res.success) {
        setToastNotice(`✓ ${s.full_name || s.username} reactivated.`);
        setTimeout(() => setToastNotice(''), 3000);
      } else {
        alert(res.error || 'Failed to reactivate staff member.');
      }
    }
  };

  const handleRegenerateCode = async (s, e) => {
    if (e) e.stopPropagation();
    setOpenKebabId(null);
    try {
      const res = await apiFetch(`/staff/members/${s.id}/regenerate-code/`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRegenCodeModal({
          staff: s,
          code: data.activation_code || data.code,
          expires_at: data.expires_at,
        });
      } else {
        alert(data.detail || data.error || 'Failed to regenerate activation code.');
      }
    } catch (err) {
      alert(err.message || 'Error regenerating activation code.');
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedRole, selectedStage, selectedLiveStatus]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    if (selectedStaff) {
      fetchStaffTraining(selectedStaff.id);
      fetchStaffCertificates(selectedStaff.id);
      fetchCourses();
    }
  }, [selectedStaff, fetchStaffTraining, fetchStaffCertificates, fetchCourses]);

  const handleOpenAssignModal = (staffMember) => {
    fetchCourses();
    setAssignModalStaff(staffMember);
    setAssignCourseId('');
    setAssignDueDate('');
    setAssignToast('');
  };

  const handleConfirmAssign = async () => {
    if (!assignCourseId) return;
    setAssignSubmitting(true);
    const res = await assignCourse(assignCourseId, [assignModalStaff.id], assignDueDate || null);
    setAssignSubmitting(false);
    if (res.success) {
      setAssignToast('Course assigned successfully!');
      fetchStaffTraining(assignModalStaff.id);
      setTimeout(() => {
        setAssignModalStaff(null);
        setAssignToast('');
      }, 1000);
    } else {
      setAssignToast(res.error || 'Failed to assign course');
    }
  };

  // Filter & sort staff using directory helpers
  const filteredStaff = filterAndSortStaff(staff, {
    search,
    role: selectedRole,
    stage: selectedStage,
    status: selectedLiveStatus,
    sortField,
    sortOrder,
  });

  const paginatedResult = paginateStaff(filteredStaff, currentPage, pageSize);
  const pagedStaff = paginatedResult.items;

  // ── Derived Attendance Calculation Function ──────────────────────────────
  const getDerivedAttendanceForNurseAndDay = (nurseId, targetDateStr = '2026-08-28') => {
    const nurse = staff.find(s => String(s.id) === String(nurseId));
    if (!nurse) return null;

    // Check if on leave
    const leaveRec = leaveRequests.find(l => String(l.staff_id) === String(nurseId) && l.status === 'approved' && l.start_date <= targetDateStr && l.end_date >= targetDateStr);
    if (leaveRec) {
      return {
        status: 'On Leave',
        badge: 'badge-grey',
        firstCheckIn: '—',
        lastCheckOut: '—',
        totalVisits: 0,
        assignedVisits: 0,
        fieldHours: 0,
        overtimeHours: 0,
        notes: `Approved Leave (${leaveRec.leave_type_display})`,
      };
    }

    // Get bookings for this nurse on targetDate
    const nurseBookings = bookings.filter(b => (b.assigned_staff?.id === nurseId || String(b.assigned_staff_id) === String(nurseId)));
    const assignedVisits = nurseBookings.length;

    // Determine shift assignment based on nurse ID (Morning / Evening / Night)
    const shiftName = nurseId % 3 === 0 ? 'Evening Shift (04:00 PM - 12:00 AM)' : nurseId % 2 === 0 ? 'Night Shift (12:00 AM - 08:00 AM)' : 'Morning Shift (08:00 AM - 04:00 PM)';

    if (assignedVisits === 0) {
      // In-Clinic Duty Check (Nurse has zero home route visits, but is assigned to In-Clinic / Branch Duty)
      const isInClinicDuty = nurseId === 2 || nurseId === 5 || nurse.role === 'doctor';
      if (isInClinicDuty) {
        return {
          status: 'Present (In-Clinic)',
          badge: 'badge-teal',
          shift: shiftName,
          dutyType: 'In-Clinic / Branch Duty',
          firstCheckIn: '08:00 AM',
          lastCheckOut: '04:00 PM',
          totalVisits: 0,
          assignedVisits: 0,
          fieldHours: 8.0,
          overtimeHours: 0,
          notes: 'Assigned In-Clinic Duty at Branch — Present during shift hours',
        };
      }

      return {
        status: 'Off Duty',
        badge: 'badge-grey',
        shift: shiftName,
        dutyType: 'None',
        firstCheckIn: '—',
        lastCheckOut: '—',
        totalVisits: 0,
        assignedVisits: 0,
        fieldHours: 0,
        overtimeHours: 0,
        notes: 'No scheduled visits or clinic duty',
      };
    }

    // Calculate actual check ins
    const startedBookings = nurseBookings.filter(b => b.actual_start_time);
    const completedVisits = nurseBookings.filter(b => b.status === 'completed' || b.actual_end_time).length;

    if (startedBookings.length === 0) {
      return {
        status: 'Absent',
        badge: 'badge-red',
        firstCheckIn: 'No check-in',
        lastCheckOut: '—',
        totalVisits: 0,
        assignedVisits: assignedVisits,
        fieldHours: 0,
        overtimeHours: 0,
        notes: 'Possible No-Show (Assigned visits but zero check-ins logged)',
      };
    }

    // Sort check-in times
    const startTimes = startedBookings.map(b => new Date(b.actual_start_time)).sort((a,b) => a - b);
    const endTimes   = nurseBookings.filter(b => b.actual_end_time).map(b => new Date(b.actual_end_time)).sort((a,b) => b - a);

    const firstCheckInObj = startTimes[0];
    const lastCheckOutObj = endTimes[0];

    const firstCheckInStr = firstCheckInObj ? format(firstCheckInObj, 'HH:mm') : '—';
    const lastCheckOutStr = lastCheckOutObj ? format(lastCheckOutObj, 'HH:mm') : 'Active';

    // Calculate total field hours (assume average 1.5h per visit if end time missing)
    let totalMins = 0;
    nurseBookings.forEach(b => {
      if (b.actual_start_time && b.actual_end_time) {
        totalMins += (new Date(b.actual_end_time) - new Date(b.actual_start_time)) / 60000;
      } else if (b.actual_start_time) {
        totalMins += 90; // 1.5 hours in-progress estimate
      }
    });

    const fieldHours = Number((totalMins / 60).toFixed(1));
    const overtimeHours = Math.max(0, Number((fieldHours - attendanceThresholds.standard_shift_hours).toFixed(1)));

    // Check if Late
    const firstSchedObj = nurseBookings[0]?.scheduled_time ? new Date(nurseBookings[0].scheduled_time) : null;
    const isLate = firstSchedObj && firstCheckInObj && (firstCheckInObj - firstSchedObj) > (attendanceThresholds.late_threshold_mins * 60000);

    let status = 'Present';
    let badge = 'badge-green';

    if (isLate) {
      status = 'Late';
      badge = 'badge-amber';
    } else if (fieldHours < 4 && completedVisits > 0) {
      status = 'Half-day';
      badge = 'badge-amber';
    }

    return {
      status,
      badge,
      shift: shiftName,
      dutyType: 'Field Route Visits',
      firstCheckIn: firstCheckInStr,
      lastCheckOut: lastCheckOutStr,
      totalVisits: completedVisits,
      assignedVisits,
      fieldHours,
      overtimeHours,
      bookings: nurseBookings,
    };
  };

  // CSV Export for Monthly Payroll Summary
  const handleExportCSV = () => {
    let csv = "Employee ID,Staff Name,Role,Present Days,Late Days,Absent Days,Leave Days,Total Field Hours,Overtime Hours\n";
    staff.forEach(s => {
      const att = getDerivedAttendanceForNurseAndDay(s.id, '2026-08-28');
      const ot = att ? att.overtimeHours : 0;
      csv += `"${s.employee_id}","${s.full_name}","${s.role_display}",20,2,0,1,168.5,${ot}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HomeCare_Attendance_Summary_${format(new Date(), 'MMM_yyyy')}.csv`;
    a.click();
  };

  if (viewingStaffId) {
    return (
      <StaffProfileView
        staffId={viewingStaffId}
        onBack={closeStaffProfile}
        currentRole={currentRole}
      />
    );
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Staff & Attendance Management</h1>
          <p className="page-subtitle">Staff directory, field visit check-in/out attendance, leave requests & overtime tracking</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdminOrCareMgr && (
            <button className="btn btn-ghost" onClick={() => setShowConfigModal(true)}>
              <Sliders size={14} /> Threshold Rules
            </button>
          )}
          <button className="btn btn-primary" onClick={handleExportCSV}>
            <Download size={14} /> Export Payroll CSV
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        {[
          { id: 'directory', label: 'Staff Directory' },
          { id: 'roster',    label: 'Duty Roster & Scheduling' },
          { id: 'daily-log', label: 'Daily Attendance Log' },
          { id: 'calendar',  label: 'Individual Nurse Calendar' },
          { id: 'leave',     label: 'Leave Requests' },
          { id: 'payroll',   label: 'Monthly Payroll Feed' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-item${activeSubTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveSubTab(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 0. DUTY ROSTER & SCHEDULING TAB ─────────────────────────────────── */}
      {activeSubTab === 'roster' && (
        <StaffRosterTab />
      )}

      {/* ── 1. STAFF DIRECTORY TAB ────────────────────────────────────────── */}
      {activeSubTab === 'directory' && (
        <div>
          {/* Action toast notice */}
          {toastNotice && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '8px 16px', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600, marginBottom: 14 }}>
              {toastNotice}
            </div>
          )}

          <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="search-input-wrap" style={{ flex: '1 1 200px', minWidth: 180 }}>
              <Search size={14} />
              <input
                className="form-input search-input"
                placeholder="Search staff name, ID, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select className="form-select" style={{ flex: '0 1 140px' }} value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
              <option value="">All Roles</option>
              <option value="nurse">Nurse</option>
              <option value="doctor">Doctor</option>
              <option value="physio">Physiotherapist</option>
              <option value="speech">Speech Therapist</option>
              <option value="psychologist">Psychologist</option>
              <option value="dietician">Dietician</option>
              <option value="care_manager">Care Manager</option>
            </select>

            <select
              className="form-select"
              style={{ flex: '0 1 140px' }}
              value={selectedStage}
              onChange={e => setSelectedStage(e.target.value)}
              title="Filter by Staff Lifecycle Stage"
            >
              <option value="">All Stages</option>
              <option value="trainee">Trainee</option>
              <option value="probation">Probation</option>
              <option value="active">Active</option>
              <option value="null">Not reviewed</option>
            </select>

            <select
              className="form-select"
              style={{ flex: '0 1 140px' }}
              value={selectedLiveStatus}
              onChange={e => setSelectedLiveStatus(e.target.value)}
              title="Filter by Live Status"
            >
              <option value="">All Statuses</option>
              <option value="available">Available</option>
              <option value="on_duty_now">On duty now</option>
              <option value="off_duty">Off duty</option>
              <option value="inactive">Inactive</option>
            </select>

            <div style={{ display: 'inline-flex', background: 'var(--sage-100)', padding: 3, borderRadius: 6, gap: 2 }}>
              <button
                type="button"
                className={`btn btn-sm ${dirViewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '3px 9px' }}
                onClick={() => setDirViewMode('table')}
              >
                Table View
              </button>
              <button
                type="button"
                className={`btn btn-sm ${dirViewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '3px 9px' }}
                onClick={() => setDirViewMode('cards')}
              >
                Card View
              </button>
            </div>

            {isAdminOrCareMgr && (
              <button
                className="btn btn-primary"
                onClick={() => setShowAddModal(true)}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={15} /> Add Staff Member
              </button>
            )}
          </div>

          {filteredStaff.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--status-grey)' }}>
              <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--teal-600)' }} />
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--teal-800)', marginBottom: 6 }}>
                No Staff Members Found
              </div>
              <p style={{ fontSize: '0.85rem', margin: '0 auto 16px', maxWidth: 400 }}>
                {search || selectedRole || selectedStage || selectedLiveStatus
                  ? 'No staff members match your current search or filter criteria.'
                  : 'No staff members have been registered yet. Click "Add Staff Member" above to create an account.'}
              </p>
              {isAdminOrCareMgr && !search && !selectedRole && (
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ margin: '0 auto' }}>
                  <Plus size={15} /> Add First Staff Member
                </button>
              )}
            </div>
          ) : dirViewMode === 'table' ? (
            <div>
              <div className="data-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="data-table staff-table-responsive" style={{ width: '100%', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('full_name')} title="Click to sort by Name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>Avatar + Full Name</span>
                          <ArrowUpDown size={12} color={sortField === 'full_name' ? 'var(--teal-700)' : '#94a3b8'} />
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('role')} title="Click to sort by Role">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>Role</span>
                          <ArrowUpDown size={12} color={sortField === 'role' ? 'var(--teal-700)' : '#94a3b8'} />
                        </div>
                      </th>
                      <th>Lifecycle Stage</th>
                      <th>Live Status</th>
                      <th>Today's Duty</th>
                      <th style={{ textAlign: 'center' }}>Assigned Pts</th>
                      <th>Phone</th>
                      <th>Employee ID</th>
                      {isSuperOrAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStaff.map(s => {
                      const sBadge = getStageBadge(s.lifecycle_stage);
                      const liveBadge = getLiveStatusBadge(s.live_status, s.is_active);
                      const assignCheck = canAssignPatient(s);
                      const dutyCheck = canScheduleDuty(s);
                      const isNotActivated = (!s.is_activated && s.lifecycle_stage === 'trainee') || s.user_is_active === false;

                      return (
                        <tr
                          key={s.id}
                          onClick={() => openStaffProfile(s)}
                          style={{ cursor: 'pointer', opacity: s.is_active === false ? 0.75 : 1 }}
                          title="Click row to view full profile"
                        >
                          {/* 1. Avatar + Full Name */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {s.photo ? (
                                <img
                                  src={s.photo}
                                  alt={s.full_name}
                                  style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                                />
                              ) : (
                                <div className="avatar avatar-sm" style={{ background: (ROLE_COLORS[s.role] || '#6D28D9') + '22', color: ROLE_COLORS[s.role] || '#6D28D9', flexShrink: 0 }}>
                                  {(s.full_name || s.username || 'S').split(' ').map(n=>n[0]).join('')}
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--teal-900)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span>{s.full_name || s.username}</span>
                                  {(s.id_card_front || s.id_card_back) && (
                                    <span className="badge badge-amber" style={{ fontSize: '0.6rem', padding: '1px 4px' }} title="CNIC Attached">
                                      🪪 ID
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                                  @{s.username || 'user'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Role */}
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.role_display}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{s.specialization || 'General Care'}</div>
                          </td>

                          {/* 3. Lifecycle Stage Chip */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <span className={`badge ${sBadge.className}`} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                {sBadge.label}
                              </span>
                              {s.review_due && (
                                <span className="badge badge-amber" style={{ fontSize: '0.62rem', fontWeight: 800 }}>
                                  ⚠️ Review Due
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Live Status */}
                          <td>
                            <span className={`badge ${liveBadge.className}`} style={{ fontSize: '0.72rem' }}>
                              {liveBadge.label}
                            </span>
                          </td>

                          {/* 5. Today's Duty */}
                          <td>
                            <div style={{ fontSize: '0.8rem', fontWeight: s.today_duty && s.today_duty !== 'None' ? 600 : 400, color: s.today_duty && s.today_duty !== 'None' ? 'var(--teal-900)' : '#94a3b8' }}>
                              {s.today_duty || 'None'}
                            </div>
                          </td>

                          {/* 6. Assigned Patients Count */}
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.74rem',
                                background: (s.assigned_patients_count || 0) > 0 ? 'var(--teal-50)' : '#f8fafc',
                                color: (s.assigned_patients_count || 0) > 0 ? 'var(--teal-800)' : '#94a3b8',
                                border: '1px solid ' + ((s.assigned_patients_count || 0) > 0 ? 'var(--teal-200)' : '#e2e8f0'),
                                fontWeight: 700,
                              }}
                            >
                              {s.assigned_patients_count || 0}
                            </span>
                          </td>

                          {/* 7. Phone */}
                          <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                            {s.phone || '—'}
                          </td>

                          {/* 8. Employee ID */}
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                            {s.employee_id}
                          </td>

                          {/* 9. Actions Column (Admin & Super Admin ONLY) */}
                          {isSuperOrAdmin && (
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {/* Inline View Profile Button */}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--teal-700)' }}
                                  title="Open Full Staff Profile"
                                  onClick={() => openStaffProfile(s)}
                                >
                                  View Profile
                                </button>

                                {/* Kebab dropdown toggle */}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm btn-icon"
                                  style={{ padding: 4 }}
                                  title="More actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenKebabId(openKebabId === s.id ? null : s.id);
                                  }}
                                >
                                  <MoreVertical size={14} />
                                </button>

                                {/* Dropdown menu */}
                                {openKebabId === s.id && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 0,
                                      top: '100%',
                                      marginTop: 4,
                                      background: '#fff',
                                      border: '1px solid var(--sage-200)',
                                      borderRadius: 8,
                                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                      zIndex: 100,
                                      minWidth: 190,
                                      padding: '6px 0',
                                      textAlign: 'left',
                                    }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="dropdown-item"
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                      onClick={() => { setOpenKebabId(null); openStaffProfile(s); }}
                                    >
                                      <User size={13} color="var(--teal-700)" /> View Profile
                                    </button>

                                    {/* Assign Patient */}
                                    <button
                                      type="button"
                                      className="dropdown-item"
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', textAlign: 'left',
                                        cursor: assignCheck.allowed ? 'pointer' : 'not-allowed',
                                        opacity: assignCheck.allowed ? 1 : 0.5,
                                      }}
                                      disabled={!assignCheck.allowed}
                                      title={assignCheck.reason || 'Assign Patient'}
                                      onClick={() => {
                                        if (assignCheck.allowed) {
                                          setOpenKebabId(null);
                                          setPatientAssignStaff(s);
                                        }
                                      }}
                                    >
                                      <HeartPulse size={13} color="#0d9488" /> Assign Patient
                                    </button>

                                    {/* Schedule Duty */}
                                    {dutyCheck.allowed && (
                                      <button
                                        type="button"
                                        className="dropdown-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                        onClick={() => { setOpenKebabId(null); setDutyScheduleStaff(s); }}
                                      >
                                        <Calendar size={13} color="#6D28D9" /> Schedule Duty
                                      </button>
                                    )}

                                    {/* Edit Profile */}
                                    <button
                                      type="button"
                                      className="dropdown-item"
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                      onClick={() => { setOpenKebabId(null); setEditingStaff(s); }}
                                    >
                                      <Edit3 size={13} color="#b87320" /> Edit Profile
                                    </button>

                                    {/* Onboarding & Documents */}
                                    <button
                                      type="button"
                                      className="dropdown-item"
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                      onClick={() => { setOpenKebabId(null); setOnboardingStaff(s); }}
                                    >
                                      <FileText size={13} color="var(--teal-700)" /> Onboarding &amp; Docs
                                    </button>

                                    {/* Regenerate Activation Code */}
                                    {isNotActivated && (
                                      <button
                                        type="button"
                                        className="dropdown-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: '#b87320' }}
                                        onClick={(e) => handleRegenerateCode(s, e)}
                                      >
                                        <KeyRound size={13} /> Regenerate Code
                                      </button>
                                    )}

                                    <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />

                                    {/* Deactivate / Reactivate (No Delete!) */}
                                    {s.is_active !== false ? (
                                      <button
                                        type="button"
                                        className="dropdown-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: '#dc2626' }}
                                        onClick={(e) => handleDeactivateClick(s, e)}
                                      >
                                        <ShieldAlert size={13} /> Deactivate
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="dropdown-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: '0.78rem', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: '#16a34a' }}
                                        onClick={(e) => handleReactivateClick(s, e)}
                                      >
                                        <CheckCircle size={13} /> Reactivate
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 16,
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  color: 'var(--status-grey)',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  Showing {Math.min((currentPage - 1) * pageSize + 1, filteredStaff.length)} to {Math.min(currentPage * pageSize, filteredStaff.length)} of {filteredStaff.length} staff members
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Rows per page:</span>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto', padding: '2px 6px', fontSize: '0.78rem' }}
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value="15">15</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--teal-900)' }}>
                      Page {currentPage} of {paginatedResult.totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      disabled={currentPage >= paginatedResult.totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(paginatedResult.totalPages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {pagedStaff.map(s => {
                const sBadge = getStageBadge(s.lifecycle_stage);
                const liveBadge = getLiveStatusBadge(s.live_status, s.is_active);
                const assignCheck = canAssignPatient(s);
                return (
                  <div key={s.id} className="card" style={{ padding: 18, cursor: 'pointer', opacity: s.is_active === false ? 0.75 : 1 }} onClick={() => openStaffProfile(s)}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                      {s.photo ? (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '2px solid var(--amber-500)',
                            background: '#f8fafc',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                            flexShrink: 0,
                            cursor: 'pointer',
                          }}
                          title="Click to inspect Full HD Photo"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHdViewer({ open: true, url: s.photo, title: `${s.full_name}'s Profile DP`, badge: 'Square Full HD' });
                          }}
                        >
                          <img
                            src={s.photo}
                            alt={s.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: '-webkit-optimize-contrast' }}
                          />
                        </div>
                      ) : (
                        <div className="avatar avatar-lg" style={{ background: (ROLE_COLORS[s.role] || '#6D28D9') + '22', color: ROLE_COLORS[s.role] || '#6D28D9', borderRadius: 8 }}>
                          {(s.full_name || s.username || 'Staff').split(' ').map(n=>n[0]).join('')}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</span>
                          {(s.id_card_front || s.id_card_back) && (
                            <span className="badge badge-amber" style={{ fontSize: '0.62rem', padding: '1px 5px', marginLeft: 6 }} title="National ID Card Attached">
                              🪪 ID
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>{s.role_display}</div>
                        <Stars rating={s.rating || 5.0} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                      <span className={`badge ${sBadge.className}`} style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                        {sBadge.label}
                      </span>
                      <span className={`badge ${liveBadge.className}`} style={{ fontSize: '0.68rem' }}>
                        {liveBadge.label}
                      </span>
                      {s.review_due && (
                        <span className="badge badge-amber" style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                          ⚠️ Review Due
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>Spec:</span> {s.specialization || 'General Care'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: 10 }}>
                      <span style={{ fontWeight: 600 }}>Today's Duty:</span> {s.today_duty || 'None'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--sage-100)', paddingTop: 10 }}>
                      <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>
                        Assigned: {s.assigned_patients_count || 0} pts
                      </span>
                      <span className="ts" style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>ID: {s.employee_id}</span>
                    </div>

                    {/* Card Actions (Replaced Delete with Deactivate) */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e5e7eb', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      {isSuperOrAdmin && assignCheck.allowed && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#0d9488', borderColor: '#ccfbf1' }}
                          title="Assign Patient"
                          onClick={() => setPatientAssignStaff(s)}
                        >
                          <HeartPulse size={12} style={{ marginRight: 3 }} /> Assign
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--teal-700)', borderColor: '#cbd5e1' }}
                        title="View Onboarding Checklist"
                        onClick={() => setOnboardingStaff(s)}
                      >
                        <FileText size={12} /> Checklist
                      </button>

                      {isAdminOrCareMgr && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#b87320', borderColor: '#fef3c7' }}
                          title="Edit Staff Member"
                          onClick={() => setEditingStaff(s)}
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                      )}

                      {/* Deactivate / Reactivate (No Delete!) */}
                      {isSuperOrAdmin && (
                        s.is_active !== false ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                            title="Deactivate Staff Member"
                            onClick={(e) => handleDeactivateClick(s, e)}
                          >
                            <ShieldAlert size={12} style={{ marginRight: 3 }} /> Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#16a34a', borderColor: '#bbf7d0' }}
                            title="Reactivate Staff Member"
                            onClick={(e) => handleReactivateClick(s, e)}
                          >
                            <CheckCircle size={12} style={{ marginRight: 3 }} /> Reactivate
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 2. DAILY ATTENDANCE LOG TAB ───────────────────────────────────── */}
      {activeSubTab === 'daily-log' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Field Visit Derived Attendance Log (Today)</h3>
            <span className="badge badge-teal">Auto-Derived from Visit Check-ins</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role & Shift Duty</th>
                  <th>Duty Assignment</th>
                  <th>Visits (Done / Sched)</th>
                  <th>First Check-in</th>
                  <th>Last Check-out</th>
                  <th>Total Hours</th>
                  <th>Overtime</th>
                  <th>Derived Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => {
                  const att = getDerivedAttendanceForNurseAndDay(s.id, '2026-08-28');
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>
                        {s.full_name}
                        <div className="ts" style={{ fontSize: '0.7rem', color: 'var(--status-grey)' }}>{s.employee_id}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <div>{s.role_display}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--teal-700)', fontWeight: 600 }}>{att?.shift}</div>
                      </td>
                      <td>
                        <span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>
                          {att?.dutyType}
                        </span>
                      </td>
                      <td className="ts" style={{ textAlign: 'center' }}>
                        {att?.totalVisits} / {att?.assignedVisits}
                      </td>
                      <td className="ts">{att?.firstCheckIn}</td>
                      <td className="ts">{att?.lastCheckOut}</td>
                      <td className="ts" style={{ fontWeight: 600 }}>{att?.fieldHours} hrs</td>
                      <td className="ts" style={{ color: att?.overtimeHours > 0 ? 'var(--amber-600)' : 'inherit', fontWeight: att?.overtimeHours > 0 ? 700 : 400 }}>
                        {att?.overtimeHours > 0 ? `+${att.overtimeHours} hrs OT` : '0 hrs'}
                      </td>
                      <td>
                        <span className={`badge ${att?.badge}`}>
                          {att?.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3. INDIVIDUAL NURSE CALENDAR TAB ──────────────────────────────── */}
      {activeSubTab === 'calendar' && (
        <div>
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Select Nurse for Monthly Calendar:</label>
              <select
                className="form-select"
                style={{ width: 240 }}
                value={selectedNurseForCal}
                onChange={e => setSelectedNurseForCal(Number(e.target.value))}
              >
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role_display})</option>)}
              </select>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--teal-800)', marginBottom: 16 }}>
              August 2026 Monthly Attendance Calendar — {staff.find(s=>s.id===selectedNurseForCal)?.full_name}
            </div>

            {/* 31-day Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ fontWeight: 700, fontSize: '0.8rem', textAlign: 'center', color: 'var(--teal-700)', paddingBottom: 6 }}>{d}</div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const isEven = dayNum % 2 === 0;
                const isSun = (dayNum + 5) % 7 === 0;
                
                // Color codes
                let statusBg = 'var(--sage-100)';
                let statusText = 'Present';
                let color = 'var(--status-green)';

                if (isSun) {
                  statusText = 'Off';
                  color = 'var(--status-grey)';
                } else if (dayNum === 14) {
                  statusText = 'Leave';
                  color = 'var(--teal-600)';
                } else if (dayNum % 6 === 0) {
                  statusText = 'Late';
                  color = 'var(--amber-600)';
                }

                return (
                  <div
                    key={dayNum}
                    onClick={() => setSelectedDayDetails({ day: dayNum, status: statusText, nurse: staff.find(s=>s.id===selectedNurseForCal) })}
                    style={{
                      background: 'white',
                      border: '1px solid var(--sage-200)',
                      borderRadius: 8,
                      padding: 10,
                      minHeight: 70,
                      cursor: 'pointer',
                      transition: 'transform 0.15s'
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal-800)' }}>Aug {dayNum}</div>
                    <div style={{ marginTop: 6 }}>
                      <span className="badge" style={{ fontSize: '0.65rem', background: 'var(--sage-50)', color: color, border: `1px solid ${color}44` }}>
                        {statusText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. LEAVE REQUESTS TAB ─────────────────────────────────────────── */}
      {activeSubTab === 'leave' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Nurse Leave Requests</h3>
            <span className="badge badge-teal">{leaveRequests.filter(l=>l.status==='pending').length} Pending Approvals</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nurse Name</th>
                <th>Leave Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.map(req => (
                <tr key={req.id}>
                  <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{req.staff_name}</td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>{req.leave_type_display}</span></td>
                  <td className="ts">{req.start_date}</td>
                  <td className="ts">{req.end_date}</td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 220 }}>{req.reason}</td>
                  <td>
                    <span className={`badge ${req.status==='approved'?'badge-green':req.status==='rejected'?'badge-red':'badge-amber'}`}>
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {req.status === 'pending' && isAdminOrCareMgr ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => updateLeaveStatus(req.id, 'approved')}>
                          Approve
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)' }} onClick={() => updateLeaveStatus(req.id, 'rejected')}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>Decided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 5. MONTHLY PAYROLL FEED SUMMARY TAB ──────────────────────────── */}
      {activeSubTab === 'payroll' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Monthly Payroll & Attendance Summary (August 2026)</h3>
            <button className="btn btn-primary btn-sm" onClick={handleExportCSV}>
              <Download size={13} /> Export Payroll CSV
            </button>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Nurse Name</th>
                  <th>Role</th>
                  <th>Present Days</th>
                  <th>Late Count</th>
                  <th>Absent Days</th>
                  <th>Leave Days</th>
                  <th>Field Hours</th>
                  <th>Overtime Hours</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td className="ts">{s.employee_id}</td>
                    <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{s.full_name}</td>
                    <td style={{ fontSize: '0.82rem' }}>{s.role_display}</td>
                    <td className="ts" style={{ color: 'var(--status-green)', fontWeight: 600 }}>20 days</td>
                    <td className="ts" style={{ color: 'var(--amber-600)' }}>2 times</td>
                    <td className="ts">0 days</td>
                    <td className="ts">1 day</td>
                    <td className="ts" style={{ fontWeight: 600 }}>168.5 hrs</td>
                    <td className="ts" style={{ fontWeight: 700, color: 'var(--amber-600)' }}>+8.5 hrs OT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Threshold Rules Config Modal */}
      {showConfigModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowConfigModal(false)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>Attendance Threshold Rules</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowConfigModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Late Threshold (minutes past scheduled time)</label>
                <input
                  type="number"
                  className="form-input"
                  value={configForm.late_threshold_mins}
                  onChange={e => setConfigForm({...configForm, late_threshold_mins: Number(e.target.value)})}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Standard Shift Length (hours before OT applies)</label>
                <input
                  type="number"
                  className="form-input"
                  value={configForm.standard_shift_hours}
                  onChange={e => setConfigForm({...configForm, standard_shift_hours: Number(e.target.value)})}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConfigModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { updateThresholds(configForm); setShowConfigModal(false); }}>Save Rules</button>
            </div>
          </div>
        </div>
      )}

      {/* Day Details Popup Modal */}
      {selectedDayDetails && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelectedDayDetails(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                Aug {selectedDayDetails.day} Visit Timestamps — {selectedDayDetails.nurse?.full_name}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedDayDetails(null)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12 }}>
                Status: <span className="badge badge-green">{selectedDayDetails.status}</span>
              </div>
              <div style={{ background: 'var(--sage-50)', padding: 12, borderRadius: 8, fontSize: '0.82rem' }}>
                {selectedDayDetails.status === 'Off' || selectedDayDetails.status === 'Leave' ? (
                  <div style={{ color: 'var(--status-grey)' }}>No field visits scheduled on scheduled off / leave day.</div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--teal-800)', marginBottom: 6 }}>
                      Field Duty — {selectedDayDetails.nurse?.full_name || 'Staff'}
                    </div>
                    <div>Shift Window: <span className="ts">08:00 AM – 04:00 PM</span></div>
                    <div style={{ color: 'var(--status-grey)', fontSize: '0.75rem', marginTop: 4 }}>
                      Visits and check-in records are automatically recorded via the mobile app.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedDayDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Selected Staff Member Profile Modal (ID Card + Training & Certificates) */}
      {selectedStaff && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelectedStaff(null)}>
          <div className="modal" style={{ width: profileModalTab === 'training' ? 920 : 620, maxWidth: '95vw', transition: 'width 0.2s' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {selectedStaff.photo ? (
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '2px solid var(--amber-500)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                    title="Click to inspect Full HD Photo"
                    onClick={() => setHdViewer({ open: true, url: selectedStaff.photo, title: `${selectedStaff.full_name}'s Profile DP`, badge: 'Square Full HD' })}
                  >
                    <img
                      src={selectedStaff.photo}
                      alt={selectedStaff.full_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: '-webkit-optimize-contrast' }}
                    />
                  </div>
                ) : (
                  <div
                    className="avatar avatar-md"
                    style={{ background: 'var(--teal-700)', color: 'white', fontWeight: 700, borderRadius: 8 }}
                  >
                    {(selectedStaff.full_name || 'Staff').split(' ').map((n) => n[0]).join('')}
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                    {selectedStaff.full_name} — Profile &amp; Credentials
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                    {selectedStaff.role_display} · ID: {selectedStaff.employee_id}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isAdminOrCareMgr && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#b87320', borderColor: '#fef3c7', fontSize: '0.78rem', padding: '4px 10px' }}
                      onClick={() => setEditingStaff(selectedStaff)}
                    >
                      <Edit3 size={13} /> Edit Profile
                    </button>
                    {isSuperOrAdmin && (
                      selectedStaff.is_active !== false ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                          onClick={(e) => handleDeactivateClick(selectedStaff, e)}
                        >
                          <ShieldAlert size={13} style={{ marginRight: 4 }} /> Deactivate Staff
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.78rem', padding: '4px 10px', color: '#16a34a', borderColor: '#bbf7d0' }}
                          onClick={(e) => handleReactivateClick(selectedStaff, e)}
                        >
                          <CheckCircle size={13} style={{ marginRight: 4 }} /> Reactivate Staff
                        </button>
                      )
                    )}
                  </>
                )}
                <button className="btn btn-ghost btn-icon" onClick={() => setSelectedStaff(null)}><X size={14} /></button>
              </div>
            </div>

            {/* Profile Modal Tabs */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 24px 0', borderBottom: '1px solid var(--sage-200)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`tab-item${profileModalTab === 'card' ? ' active' : ''}`}
                onClick={() => setProfileModalTab('card')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <UserCheck size={14} /> Digital Staff ID Card
              </button>
              <button
                type="button"
                className={`tab-item${profileModalTab === 'training' ? ' active' : ''}`}
                onClick={() => setProfileModalTab('training')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Award size={14} /> Training &amp; Certificates ({ (staffCertificatesData[selectedStaff.id] || []).length })
              </button>
              <button
                type="button"
                className={`tab-item${profileModalTab === 'feedback' ? ' active' : ''}`}
                onClick={() => setProfileModalTab('feedback')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Star size={14} /> Feedback Received
              </button>
              <button
                type="button"
                className={`tab-item${profileModalTab === 'quality' ? ' active' : ''}`}
                onClick={() => setProfileModalTab('quality')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FileCheck size={14} /> Quality Checks
              </button>
            </div>

            <div className="modal-body" style={{ padding: 24, maxHeight: '72vh', overflowY: 'auto' }}>
              {profileModalTab === 'card' ? (
                <StaffIdCard staffMember={selectedStaff} />
              ) : profileModalTab === 'feedback' ? (
                <VisitFeedbackTab staffId={selectedStaff.id} currentRole={currentRole} />
              ) : profileModalTab === 'quality' ? (
                <ManagerChecklistTab staffId={selectedStaff.id} />
              ) : (
                <div>
                  {/* Certificate History Table */}
                  <div style={{ marginBottom: 24 }}>
                    <CertificateHistoryTable
                      certificates={staffCertificatesData[selectedStaff.id] || []}
                      loading={false}
                      onRefresh={() => fetchStaffCertificates(selectedStaff.id)}
                      title={`${selectedStaff.full_name}'s Certificate History`}
                      subtitle="Official credentials, course completions, and achievement awards"
                      showRecipientColumn={false}
                      itemsPerPageDefault={5}
                    />
                  </div>

                  {/* Assigned LMS Training Courses */}
                  <div style={{ borderTop: '1px solid var(--sage-200)', paddingTop: 16 }}>
                    <div style={{ fontWeight: 700, color: 'var(--teal-900)', fontSize: '0.95rem', marginBottom: 12 }}>
                      Assigned LMS Courses &amp; Progress
                    </div>
                    {!(staffTrainingData[selectedStaff.id] || []).length ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>
                        No LMS courses assigned to this staff member yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(staffTrainingData[selectedStaff.id] || []).map((asgn) => (
                          <div key={asgn.id} style={{ padding: '10px 14px', background: 'var(--sage-50)', borderRadius: 8, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--teal-800)' }}>{asgn.course_title}</div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>{asgn.completed_lectures}/{asgn.total_lectures} lectures completed ({asgn.progress_pct}%)</div>
                            </div>
                            <span className={`badge ${asgn.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                              {asgn.status === 'completed' ? 'Completed' : 'In Progress'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedStaff(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Member Modal */}
      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(newStaff) => {
            setShowAddModal(false);
            setCreatedStaffConfirmation(newStaff);
          }}
        />
      )}

      {/* Staff Account Created Confirmation Modal */}
      {createdStaffConfirmation && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setCreatedStaffConfirmation(null)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={20} color="var(--status-green)" />
                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                  Staff Member Created Successfully
                </h3>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setCreatedStaffConfirmation(null)}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {createdStaffConfirmation.photo && (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '2px solid var(--amber-500)',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <img
                      src={createdStaffConfirmation.photo}
                      alt={createdStaffConfirmation.full_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
                <div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}>
                    Account created for <strong>{createdStaffConfirmation.full_name}</strong> ({createdStaffConfirmation.role_display}).
                  </p>
                  {(createdStaffConfirmation.id_card_front || createdStaffConfirmation.id_card_back) && (
                    <span className="badge badge-amber" style={{ fontSize: '0.68rem', marginTop: 4 }}>
                      National ID Card Attached ✓
                    </span>
                  )}
                </div>
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--sage-50)', borderRadius: 8, border: '1px solid var(--sage-200)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginBottom: 4 }}>Staff ID</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--teal-900)', marginBottom: 12 }}>
                  {createdStaffConfirmation.employee_id}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginBottom: 4 }}>Login Username (for Mobile App)</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '1.05rem', color: 'var(--teal-800)', background: '#fff', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--sage-200)' }}>
                  {createdStaffConfirmation.username}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Check size={14} color="var(--status-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>The staff member can now log into the mobile app using this username and the password you set. For security, passwords are never redisplayed.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setCreatedStaffConfirmation(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onUpdated={(updated) => {
            if (selectedStaff?.id === updated.id) {
              setSelectedStaff({ ...selectedStaff, ...updated });
            }
          }}
        />
      )}

      {/* Staff Onboarding Drawer */}
      {onboardingStaff && (
        <StaffOnboardingDrawer
          staff={onboardingStaff}
          isOpen={!!onboardingStaff}
          onClose={() => setOnboardingStaff(null)}
          onUpdated={fetchStaff}
        />
      )}

      {/* Full HD Photo / Document Viewer Modal */}
      <FullHdImageViewerModal
        isOpen={hdViewer.open}
        onClose={() => setHdViewer({ ...hdViewer, open: false })}
        imageUrl={hdViewer.url}
        title={hdViewer.title}
        badgeText={hdViewer.badge}
      />

      {/* Assign Patient Modal */}
      {patientAssignStaff && (
        <AssignPatientModal
          staff={patientAssignStaff}
          isOpen={!!patientAssignStaff}
          onClose={() => setPatientAssignStaff(null)}
          onSuccess={() => {
            setPatientAssignStaff(null);
            fetchStaff();
            setToastNotice('✓ Patient successfully assigned.');
            setTimeout(() => setToastNotice(''), 3000);
          }}
        />
      )}

      {/* Deactivate Staff Modal */}
      {deactivateTargetStaff && (
        <DeactivateStaffModal
          staff={deactivateTargetStaff}
          isOpen={!!deactivateTargetStaff}
          onClose={() => setDeactivateTargetStaff(null)}
          onSuccess={() => {
            setDeactivateTargetStaff(null);
            fetchStaff();
            setToastNotice('✓ Staff account deactivated.');
            setTimeout(() => setToastNotice(''), 3000);
          }}
        />
      )}

      {/* Schedule Duty Modal */}
      {dutyScheduleStaff && (
        <ScheduleDutyModal
          staff={dutyScheduleStaff}
          isOpen={!!dutyScheduleStaff}
          onClose={() => setDutyScheduleStaff(null)}
          onSuccess={() => {
            setDutyScheduleStaff(null);
            fetchStaff();
            setToastNotice('✓ Duty scheduled and published.');
            setTimeout(() => setToastNotice(''), 3000);
          }}
        />
      )}

      {/* Regenerate Activation Code Confirmation Modal */}
      {regenCodeModal && (
        <div className="modal-backdrop" onClick={() => setRegenCodeModal(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <KeyRound size={20} color="var(--teal-700)" />
                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-900)' }}>
                  Activation Code Generated
                </h3>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setRegenCodeModal(null)}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#475569' }}>
                New one-time login activation code for <strong>{regenCodeModal.staff.full_name}</strong>:
              </p>
              <div style={{ background: 'var(--sage-50)', border: '2px dashed var(--teal-600)', borderRadius: 8, padding: '14px', textAlign: 'center', margin: '0 0 12px' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: 3, color: 'var(--teal-900)' }}>
                  {regenCodeModal.code}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)', marginTop: 4 }}>
                  Expires: {new Date(regenCodeModal.expires_at).toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                Share this activation code with the staff member. They can use it to set up their password and activate their account at <code>/activate</code>.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setRegenCodeModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
