import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, User, Phone, Mail, Calendar, Clock, Shield, AlertCircle,
  CheckCircle, FileText, Activity, Users, Plus, UserMinus, ShieldAlert,
  Award, Edit3, Lock, ExternalLink
} from 'lucide-react';
import { apiFetch } from '../services/api';
import useStore from '../store/useStore';
import StaffIdCard from './StaffIdCard';
import AssignPatientModal from './AssignPatientModal';
import DeactivateStaffModal from './DeactivateStaffModal';
import ScheduleDutyModal from './ScheduleDutyModal';
import StaffOnboardingDrawer from './StaffOnboardingDrawer';
import EditStaffModal from './EditStaffModal';
import { getStageBadge } from '../utils/staffLifecycleHelpers';
import { getLiveStatusBadge, canAssignPatient, canScheduleDuty } from '../utils/staffDirectoryHelpers';

export default function StaffProfileView({ staffId, onBack, currentRole }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showOnboardingDrawer, setShowOnboardingDrawer] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [unassigningPatientId, setUnassigningPatientId] = useState(null);
  const [actionNotice, setActionNotice] = useState('');

  const isAdminOrSuper = ['super_admin', 'admin'].includes(currentRole);
  const fetchStaff = useStore((s) => s.fetchStaff);

  const loadProfile = async () => {
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage('');
    try {
      const res = await apiFetch(`/staff/members/${staffId}/profile/`);
      if (res.status === 403) {
        setErrorStatus(403);
        setErrorMessage('You do not have permission to view this staff member profile.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErrorStatus(res.status);
        setErrorMessage('Failed to load staff profile.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      setErrorStatus(500);
      setErrorMessage(err.message || 'Network error loading profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (staffId) {
      loadProfile();
    }
  }, [staffId]);

  const handleUnassignPatient = async (p) => {
    if (!window.confirm(`Are you sure you want to unassign ${p.patient_name} from this staff member?`)) {
      return;
    }
    setUnassigningPatientId(p.patient_id);
    try {
      const payload = {
        patient_id: p.patient_id,
        booking_id: p.booking_id || null,
      };
      const res = await apiFetch(`/staff/members/${staffId}/unassign-patient/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Unassigned from ${p.patient_name}`);
        loadProfile();
        if (fetchStaff) fetchStaff();
        setTimeout(() => setActionNotice(''), 3000);
      } else {
        alert(data.detail || data.error || 'Failed to unassign patient.');
      }
    } catch (err) {
      alert(err.message || 'Error unassigning patient.');
    } finally {
      setUnassigningPatientId(null);
    }
  };

  const handleReactivate = async () => {
    if (!window.confirm(`Reactivate account for ${staff.full_name}? Access will be restored.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/staff/members/${staffId}/reactivate/`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setActionNotice('Staff account reactivated successfully.');
        loadProfile();
        if (fetchStaff) fetchStaff();
        setTimeout(() => setActionNotice(''), 3000);
      } else {
        alert(data.detail || data.error || 'Failed to reactivate account.');
      }
    } catch (err) {
      alert(err.message || 'Error reactivating account.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--status-grey)' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600 }}>Loading staff profile...</div>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div style={{ padding: 40, maxWidth: 560, margin: '40px auto', textAlign: 'center' }} className="card">
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Lock size={28} />
        </div>
        <h2 style={{ fontSize: '1.3rem', color: '#991b1b', marginBottom: 8 }}>Access Restricted (403)</h2>
        <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5, marginBottom: 20 }}>
          {errorMessage || 'You do not have administrative permission to view this staff member profile.'}
        </p>
        <button className="btn btn-primary" onClick={onBack} style={{ margin: '0 auto' }}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> Return to Staff Directory
        </button>
      </div>
    );
  }

  if (!profileData || !profileData.staff) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>Staff profile could not be found.</p>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Directory
        </button>
      </div>
    );
  }

  const staff = profileData.staff;
  const stageBadge = getStageBadge(staff.lifecycle_stage);
  const liveBadge = getLiveStatusBadge(staff.live_status, staff.is_active);
  const assignCheck = canAssignPatient(staff);
  const dutyCheck = canScheduleDuty(staff);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Bar with Back Button & Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--teal-800)', fontWeight: 600 }}
        >
          <ArrowLeft size={15} /> Back to Staff Directory
        </button>
        {actionNotice && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600 }}>
            ✓ {actionNotice}
          </div>
        )}
      </div>

      {/* Profile Header Card */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {staff.photo ? (
              <img
                src={staff.photo}
                alt={staff.full_name}
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: '2px solid var(--amber-500)', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
              />
            ) : (
              <div
                className="avatar"
                style={{ width: 72, height: 72, fontSize: '1.6rem', borderRadius: 12, background: 'var(--teal-700)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
              >
                {(staff.full_name || staff.username || 'S').split(' ').map((n) => n[0]).join('')}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--font-heading)', color: 'var(--teal-900)' }}>
                  {staff.full_name || staff.username}
                </h1>
                <span className={`badge ${stageBadge.className}`} style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                  {stageBadge.label}
                </span>
                <span className={`badge ${liveBadge.className}`} style={{ fontSize: '0.74rem' }}>
                  {liveBadge.label}
                </span>
                {!staff.is_active && (
                  <span className="badge badge-red" style={{ fontSize: '0.74rem', fontWeight: 800 }}>
                    Deactivated
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--status-grey)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span><strong>Role:</strong> {staff.role_display}</span>
                <span><strong>ID:</strong> {staff.employee_id}</span>
                {staff.phone && <span><strong>Phone:</strong> {staff.phone}</span>}
                {staff.email && <span><strong>Email:</strong> {staff.email}</span>}
                {staff.hire_date && <span><strong>Joined:</strong> {staff.hire_date}</span>}
              </div>
            </div>
          </div>

          {/* Header Action Buttons (Admin & Super Admin) */}
          {isAdminOrSuper && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAssignModal(true)}
                disabled={!assignCheck.allowed}
                title={assignCheck.reason || 'Assign Patient'}
              >
                <Plus size={13} style={{ marginRight: 4 }} /> Assign Patient
              </button>

              {dutyCheck.allowed && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowScheduleModal(true)}
                  style={{ color: 'var(--teal-800)', borderColor: '#cbd5e1' }}
                >
                  <Calendar size={13} style={{ marginRight: 4 }} /> Schedule Duty
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowEditModal(true)}
                style={{ color: '#b87320', borderColor: '#fef3c7' }}
              >
                <Edit3 size={13} style={{ marginRight: 4 }} /> Edit
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowOnboardingDrawer(true)}
                style={{ color: 'var(--teal-700)', borderColor: '#cbd5e1' }}
              >
                <FileText size={13} style={{ marginRight: 4 }} /> Onboarding
              </button>

              {staff.is_active ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setShowDeactivateModal(true)}
                  title="Deactivate staff account"
                >
                  <ShieldAlert size={13} style={{ marginRight: 4 }} /> Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#16a34a', borderColor: '#bbf7d0' }}
                  onClick={handleReactivate}
                >
                  <CheckCircle size={13} style={{ marginRight: 4 }} /> Reactivate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Navigation Tabs */}
      <div className="tabs-bar">
        {[
          { id: 'overview',     label: 'Overview',                icon: User },
          { id: 'patients',     label: `Patients & Assignments (${(profileData.assigned_patients || []).length})`, icon: Users },
          { id: 'duties',       label: `Duty & Roster (${(profileData.duties || []).length})`, icon: Calendar },
          { id: 'onboarding',   label: 'Onboarding & Documents',  icon: FileText },
          { id: 'attendance',   label: `Attendance & Leave (${(profileData.attendance || []).length})`, icon: Clock },
          { id: 'activity',     label: `Activity Log (${(profileData.activity_logs || []).length})`, icon: Activity },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`tab-item${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* Personal & Professional Identity Card */}
          <div className="card" style={{ padding: 20 }}>
            <h3 className="card-title" style={{ marginBottom: 14 }}>Professional & Personal Profile</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>Specialization:</span>
                <span style={{ fontWeight: 600 }}>{staff.specialization || 'General Care'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>License / Registration #:</span>
                <span style={{ fontWeight: 600 }}>{staff.license_number || staff.pnc_number || staff.pmdc_number || 'Informational / On File'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>National ID / CNIC:</span>
                <span style={{ fontWeight: 600 }}>{staff.national_id || staff.cnic || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>Gender / Blood Group:</span>
                <span style={{ fontWeight: 600 }}>{staff.gender || '—'} · {staff.blood_group || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>Emergency Contact:</span>
                <span style={{ fontWeight: 600 }}>{staff.emergency_contact_name || staff.emergency_contact || 'On file with HR'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: 'var(--status-grey)' }}>Assigned Branch:</span>
                <span style={{ fontWeight: 600 }}>{staff.branch_name || staff.branch || 'Main Regional Branch'}</span>
              </div>
            </div>
          </div>

          {/* Lifecycle & Progression History */}
          <div className="card" style={{ padding: 20 }}>
            <h3 className="card-title" style={{ marginBottom: 14 }}>Lifecycle Stage History</h3>
            {!(profileData.stage_events || []).length ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>
                No stage transitions recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(profileData.stage_events || []).map((ev) => (
                  <div key={ev.id} style={{ padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 6, fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--teal-900)' }}>
                        {ev.from_stage || 'Start'} → {ev.to_stage}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: 2 }}>
                      By: <strong>{ev.actor_name || 'System'}</strong> · Event: {ev.event_type}
                    </div>
                    {ev.reason && (
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                        "{ev.reason}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Digital Staff ID Card Preview */}
          <div className="card" style={{ padding: 20, gridColumn: '1 / -1' }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>Digital Staff ID Card</h3>
            <div style={{ maxWidth: 500, margin: '0 auto' }}>
              <StaffIdCard staffMember={staff} />
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: PATIENTS & ASSIGNMENTS ───────────────────────────────── */}
      {activeTab === 'patients' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className="card-title">Assigned Patients</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                Active and scheduled patient assignments via care manager links and clinical booking consultations.
              </p>
            </div>
            {isAdminOrSuper && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAssignModal(true)}
                disabled={!assignCheck.allowed}
              >
                <Plus size={14} style={{ marginRight: 4 }} /> Assign Patient
              </button>
            )}
          </div>

          {!(profileData.assigned_patients || []).length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.85rem' }}>
              No patients are currently assigned to this staff member.
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Role / Relationship</th>
                    <th>Service / Booking</th>
                    <th>Scheduled Date</th>
                    <th>Status</th>
                    {isAdminOrSuper && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(profileData.assigned_patients || []).map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--teal-900)' }}>
                        {p.patient_name}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {p.mr_number || '—'}
                      </td>
                      <td>
                        <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>
                          {p.relationship}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {p.service_type || 'Care Management'}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {p.scheduled_time ? new Date(p.scheduled_time).toLocaleString() : 'Active Assignment'}
                      </td>
                      <td>
                        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                          {p.status || 'Active'}
                        </span>
                      </td>
                      {isAdminOrSuper && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#dc2626', borderColor: '#fecaca', fontSize: '0.72rem', padding: '2px 8px' }}
                            disabled={unassigningPatientId === p.patient_id}
                            onClick={() => handleUnassignPatient(p)}
                          >
                            <UserMinus size={12} style={{ marginRight: 4 }} />
                            {unassigningPatientId === p.patient_id ? 'Unassigning...' : 'Unassign'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: DUTY & ROSTER ────────────────────────────────────────── */}
      {activeTab === 'duties' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className="card-title">Published Duties &amp; Roster Schedule</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                Official published roster duties and patient visits.
              </p>
            </div>
            {isAdminOrSuper && dutyCheck.allowed && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowScheduleModal(true)}
              >
                <Plus size={14} style={{ marginRight: 4 }} /> Schedule Duty
              </button>
            )}
          </div>

          {!(profileData.duties || []).length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.85rem' }}>
              No published duties found for this staff member.
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Timing</th>
                    <th>Patients</th>
                    <th>Duty Type</th>
                  </tr>
                </thead>
                <tbody>
                  {(profileData.duties || []).map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.date}</td>
                      <td>{d.shift_name || 'Standard'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {d.start_time} – {d.end_time}
                      </td>
                      <td>
                        {d.patients && d.patients.length > 0 ? (
                          <span>{d.patients.map((pt) => pt.name).join(', ')}</span>
                        ) : (
                          <span style={{ color: 'var(--status-grey)' }}>None (Clinic/Standby)</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${d.is_off ? 'badge-grey' : 'badge-green'}`} style={{ fontSize: '0.7rem' }}>
                          {d.is_off ? 'Off' : 'On Duty'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: ONBOARDING & DOCUMENTS ───────────────────────────────── */}
      {activeTab === 'onboarding' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className="card-title">Lifecycle &amp; Document Checklist</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                Requirements checklist and verification status adhering to strict role permissions.
              </p>
            </div>
            {isAdminOrSuper && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--teal-700)', borderColor: '#cbd5e1' }}
                onClick={() => setShowOnboardingDrawer(true)}
              >
                <FileText size={14} style={{ marginRight: 4 }} /> Open Full Checklist Drawer
              </button>
            )}
          </div>

          {!profileData.onboarding ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.85rem' }}>
              Onboarding checklist is not accessible for this role or not initialized.
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 16px', background: 'var(--sage-50)', borderRadius: 8, fontSize: '0.84rem' }}>
                  <strong>Stage:</strong> {profileData.onboarding.current_stage || staff.lifecycle_stage}
                </div>
                <div style={{ padding: '8px 16px', background: 'var(--sage-50)', borderRadius: 8, fontSize: '0.84rem' }}>
                  <strong>Progress:</strong> {profileData.onboarding.completed_count || 0} / {profileData.onboarding.total_required || 0} completed
                </div>
              </div>

              {/* Requirements Table */}
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Verified By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profileData.onboarding.requirements || []).map((req) => (
                      <tr key={req.id}>
                        <td style={{ fontWeight: 600 }}>{req.title || req.requirement_type_label || req.code}</td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{req.kind || req.category}</td>
                        <td>
                          <span
                            className={`badge ${
                              req.status === 'verified'
                                ? 'badge-green'
                                : req.status === 'waived'
                                ? 'badge-teal'
                                : req.status === 'submitted'
                                ? 'badge-amber'
                                : 'badge-grey'
                            }`}
                            style={{ fontSize: '0.72rem' }}
                          >
                            {req.status_display || req.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {req.verified_by_name || (req.waived ? `Waived: ${req.waive_reason || 'Approved'}` : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: ATTENDANCE & LEAVE ────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Attendance Records */}
          <div className="card" style={{ padding: 20 }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>Recent Attendance Records</h3>
            {!(profileData.attendance || []).length ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>No attendance records found.</div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Field Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profileData.attendance || []).map((att) => (
                      <tr key={att.id}>
                        <td>{att.date}</td>
                        <td>
                          <span className={`badge ${att.status === 'present' ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.72rem' }}>
                            {att.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{att.check_in_time || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{att.check_out_time || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{att.field_hours ? `${att.field_hours}h` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Leave Requests */}
          <div className="card" style={{ padding: 20 }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>Leave Requests</h3>
            {!(profileData.leave || []).length ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>No leave requests submitted.</div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profileData.leave || []).map((l) => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>{l.leave_type_display || l.leave_type}</td>
                        <td>{l.start_date}</td>
                        <td>{l.end_date}</td>
                        <td>
                          <span className={`badge ${l.status === 'approved' ? 'badge-green' : l.status === 'rejected' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: '0.72rem' }}>
                            {l.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{l.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 6: ACTIVITY LOG ─────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 14 }}>Staff Activity &amp; Audit Trail</h3>
          {!(profileData.activity_logs || []).length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--status-grey)', fontSize: '0.84rem' }}>
              No audit log entries found for this staff member.
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Performed By</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(profileData.activity_logs || []).map((act) => (
                    <tr key={act.id}>
                      <td style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                        {new Date(act.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>
                          {act.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {act.actor_name || 'System'}
                      </td>
                      <td style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: '#475569', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {act.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAssignModal && (
        <AssignPatientModal
          staff={staff}
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            setShowAssignModal(false);
            loadProfile();
            if (fetchStaff) fetchStaff();
          }}
        />
      )}

      {showDeactivateModal && (
        <DeactivateStaffModal
          staff={staff}
          isOpen={showDeactivateModal}
          onClose={() => setShowDeactivateModal(false)}
          onSuccess={() => {
            setShowDeactivateModal(false);
            loadProfile();
            if (fetchStaff) fetchStaff();
          }}
        />
      )}

      {showScheduleModal && (
        <ScheduleDutyModal
          staff={staff}
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          onSuccess={() => {
            setShowScheduleModal(false);
            loadProfile();
            if (fetchStaff) fetchStaff();
          }}
        />
      )}

      {showOnboardingDrawer && (
        <StaffOnboardingDrawer
          staff={staff}
          isOpen={showOnboardingDrawer}
          onClose={() => setShowOnboardingDrawer(false)}
          onUpdated={() => {
            loadProfile();
            if (fetchStaff) fetchStaff();
          }}
        />
      )}

      {showEditModal && (
        <EditStaffModal
          staff={staff}
          onClose={() => setShowEditModal(false)}
          onUpdated={() => {
            setShowEditModal(false);
            loadProfile();
            if (fetchStaff) fetchStaff();
          }}
        />
      )}
    </div>
  );
}

