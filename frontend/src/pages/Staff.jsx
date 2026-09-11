import React, { useState, useEffect } from 'react';
import {
  Search, Star, Phone, Mail, Calendar, Clock, X, Award, TrendingUp,
  UserCheck, AlertCircle, CheckCircle, Sliders, Download, Check, FileText, Plus
} from 'lucide-react';
import useStore from '../store/useStore';
import StaffIdCard from '../components/StaffIdCard';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

const STATUS_BADGE = {
  available: 'badge-green',
  on_visit:  'badge-amber',
  off_duty:  'badge-grey',
  on_leave:  'badge-grey',
};

const ROLE_COLORS = {
  nurse:        '#611F8C',
  doctor:       '#441365',
  physio:       '#7529a7',
  speech:       '#8b36c4',
  psychologist: '#a855f7',
  dietician:    '#DE9A3C',
  care_manager: '#b87320',
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

function AddStaffModal({ onClose, onSuccess }) {
  const createStaffMember = useStore((s) => s.createStaffMember);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    password_confirm: '',
    role: 'nurse',
    specialization: '',
    phone: '',
    email: '',
    platform_allowed: 'mobile',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setF = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim()) {
      setError('Username is required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.password_confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await createStaffMember({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      username: form.username.trim(),
      password: form.password,
      password_confirm: form.password_confirm,
      role: form.role,
      specialization: form.specialization.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      platform_allowed: form.platform_allowed,
    });
    setLoading(false);

    if (res.success) {
      onSuccess(res.data);
    } else {
      setError(res.error || 'Failed to create staff member.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', margin: 0, color: 'var(--teal-800)' }}>
            Add New Staff Member
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #ef4444', color: '#b91c1c', borderRadius: 6, fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={form.first_name}
                  onChange={e => setF('first_name', e.target.value)}
                  placeholder="e.g. Ayesha"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={form.last_name}
                  onChange={e => setF('last_name', e.target.value)}
                  placeholder="e.g. Khan"
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select className="form-select" value={form.role} onChange={e => {
                  const r = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    role: r,
                    platform_allowed: r === 'care_manager' ? 'both' : 'mobile'
                  }));
                }}>
                  <option value="nurse">Nurse</option>
                  <option value="doctor">Doctor</option>
                  <option value="physio">Physiotherapist</option>
                  <option value="speech">Speech & Language Therapist</option>
                  <option value="psychologist">Psychologist</option>
                  <option value="dietician">Dietician</option>
                  <option value="care_manager">Client Care Manager</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Platform Access</label>
                <select className="form-select" value={form.platform_allowed} onChange={e => setF('platform_allowed', e.target.value)}>
                  <option value="mobile">Mobile App Only</option>
                  <option value="web">Web Dashboard Only</option>
                  <option value="both">Both Mobile & Web</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Specialization / Skills</label>
              <input
                type="text"
                className="form-input"
                value={form.specialization}
                onChange={e => setF('specialization', e.target.value)}
                placeholder="e.g. Wound Care, ICU, Pediatrics"
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.phone}
                  onChange={e => setF('phone', e.target.value)}
                  placeholder="e.g. 0301-2345678"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={e => setF('email', e.target.value)}
                  placeholder="staff@ehealth.com"
                />
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--sage-50)', borderRadius: 8, border: '1px solid var(--sage-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)', marginBottom: 10 }}>
                🔐 Login Credentials (Set by Admin)
              </div>

              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  autoCapitalize="none"
                  value={form.username}
                  onChange={e => setF('username', e.target.value)}
                  placeholder="e.g. nurse_ayesha"
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>Staff member will use this to sign into the mobile app. Must be unique.</span>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    required
                    value={form.password}
                    onChange={e => setF('password', e.target.value)}
                    placeholder="Min 8 characters"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    required
                    value={form.password_confirm}
                    onChange={e => setF('password_confirm', e.target.value)}
                    placeholder="Re-enter password"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--sage-200)', paddingTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Staff() {
  const staff               = useStore((s) => s.staff);
  const fetchStaff          = useStore((s) => s.fetchStaff);
  const bookings            = useStore((s) => s.bookings);
  const dailyReports        = useStore((s) => s.dailyReports);
  const leaveRequests       = useStore((s) => s.leaveRequests);
  const updateLeaveStatus   = useStore((s) => s.updateLeaveStatus);
  const attendanceThresholds= useStore((s) => s.attendanceThresholds);
  const updateThresholds    = useStore((s) => s.updateAttendanceThresholds);
  const currentRole         = useStore((s) => s.currentRole);

  const isAdminOrCareMgr = ['super_admin', 'admin', 'branch_manager', 'care_manager'].includes(currentRole);

  const [activeSubTab, setActiveSubTab] = useState('directory'); // 'directory' | 'daily-log' | 'calendar' | 'leave' | 'payroll'
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [search, setSearch]               = useState('');
  const [selectedRole, setSelectedRole]   = useState('');
  const [selectedNurseForCal, setSelectedNurseForCal] = useState(staff.find(s=>s.role==='nurse')?.id || 1);

  const [selectedDayDetails, setSelectedDayDetails] = useState(null);
  const [showConfigModal, setShowConfigModal]       = useState(false);
  const [configForm, setConfigForm]                 = useState(attendanceThresholds);
  const [showAddModal, setShowAddModal]             = useState(false);
  const [createdStaffConfirmation, setCreatedStaffConfirmation] = useState(null);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Filter staff for directory
  const filteredStaff = staff.filter(s => {
    if (selectedRole && s.role !== selectedRole) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.specialization.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q);
  });

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
        assignedVisits,
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

      {/* ── 1. STAFF DIRECTORY TAB ────────────────────────────────────────── */}
      {activeSubTab === 'directory' && (
        <div>
          <div className="filter-bar">
            <div className="search-input-wrap" style={{ flex: '0 1 240px' }}>
              <Search size={14} />
              <input
                className="form-input search-input"
                placeholder="Search staff name, skill…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ flex: '0 1 160px' }} value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
              <option value="">All Roles</option>
              <option value="nurse">Nurse</option>
              <option value="doctor">Doctor</option>
              <option value="physio">Physiotherapist</option>
              <option value="speech">Speech Therapist</option>
              <option value="psychologist">Psychologist</option>
              <option value="dietician">Dietician</option>
              <option value="care_manager">Care Manager</option>
            </select>
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
                {search || selectedRole
                  ? 'No staff members match your current search or filter criteria.'
                  : 'No staff members have been registered yet. Click "Add Staff Member" above to create an account.'}
              </p>
              {isAdminOrCareMgr && !search && !selectedRole && (
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ margin: '0 auto' }}>
                  <Plus size={15} /> Add First Staff Member
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {filteredStaff.map(s => (
                <div key={s.id} className="card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => setSelectedStaff(s)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                    <div className="avatar avatar-lg" style={{ background: ROLE_COLORS[s.role] + '22', color: ROLE_COLORS[s.role] }}>
                      {(s.full_name || s.username || 'Staff').split(' ').map(n=>n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)' }}>{s.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>{s.role_display}</div>
                      <Stars rating={s.rating || 5.0} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600 }}>Spec:</span> {s.specialization || 'General Care'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--sage-100)', paddingTop: 10 }}>
                    <span className={`badge ${STATUS_BADGE[s.status] || 'badge-green'}`}>{s.status_display || 'Available'}</span>
                    <span className="ts" style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>ID: {s.employee_id}</span>
                  </div>
                </div>
              ))}
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
      {/* Selected Staff Member Digital ID Card Modal */}
      {selectedStaff && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelectedStaff(null)}>
          <div className="modal" style={{ width: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                Digital Staff ID Card & Real-Time QR
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedStaff(null)}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ padding: 24 }}>
              <StaffIdCard staffMember={selectedStaff} />
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
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}>
                Account created for <strong>{createdStaffConfirmation.full_name}</strong> ({createdStaffConfirmation.role_display}).
              </p>
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
    </div>
  );
}
