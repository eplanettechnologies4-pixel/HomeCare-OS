import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock, Shield, User, MapPin, Calendar, Users, Phone, ArrowUpRight,
  AlertTriangle, CheckCircle2, ChevronRight, Activity, Pill, Truck,
  Folder, Video, Sparkles, AlertOctagon, Heart, Stethoscope, RefreshCw,
  AlertCircle, ChevronDown, Check, ShieldCheck, Search
} from 'lucide-react';
import apiFetch from '../services/api';
import useStore from '../store/useStore';
import StaffOverviewHeader from '../components/StaffOverviewHeader';
import SmartRosterSection from '../components/SmartRosterSection';
import DoctorActivityBar from '../components/DoctorActivityBar';
import DoctorDrawer from '../components/DoctorDrawer';
import { filterPatientFiles, getTierChipConfig } from '../utils/rosterHelpers';

// Helper to sanitize table cells: replace "None", "N/A", null, or empty with "-"
function sanitize(val) {
  if (val === null || val === undefined) return '-';
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') {
    return '-';
  }
  return s;
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

export default function DoctorOverview({
  data,
  fetchClinicianData,
  lastUpdated,
  currentUser,
  setActivePage,
  setSelectedPatient,
  handleOpenPatientChart,
}) {
  // Employee Card state
  const [employeeCard, setEmployeeCard] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [isFetchError, setIsFetchError] = useState(false);

  // Drawer state
  const [drawer, setDrawer] = useState({
    isOpen: false,
    type: 'consultations', // 'consultations' | 'pending_requests' | 'patients_by_tier'
    filterParam: 'today',
    title: 'Clinical Consultations',
  });

  // Assigned Patient Files state (Section E)
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  // Fetch employee card details
  const fetchEmployeeCard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/staff-portal/employee-card/');
      if (res && (res.id || res.employee_id)) {
        setEmployeeCard(res);
      }
    } catch {
      // Fallback to data.staff
    }
  }, []);

  // Fetch assigned patients
  const fetchAssignedPatients = useCallback(async () => {
    setLoadingPatients(true);
    try {
      const res = await apiFetch('/api/staff-portal/patients/?page_size=50');
      if (res && res.results) {
        setAssignedPatients(res.results);
      }
    } catch (err) {
      console.error('Failed to load assigned patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployeeCard();
    fetchAssignedPatients();
  }, [fetchEmployeeCard, fetchAssignedPatients]);

  const handleRefreshAll = useCallback(async () => {
    setIsFetchError(false);
    try {
      if (fetchClinicianData) {
        await fetchClinicianData(false);
      }
      await fetchEmployeeCard();
      await fetchAssignedPatients();
      setLastFetchedAt(Date.now());
    } catch (err) {
      console.error('Refresh error:', err);
      setIsFetchError(true);
    }
  }, [fetchClinicianData, fetchEmployeeCard, fetchAssignedPatients]);

  // Fallbacks from API data
  const staff = data?.staff || {
    name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() : (currentUser?.username || 'Attending Physician'),
    employee_id: 'DOC-PORTAL',
    designation: 'Doctor / Physician',
    specialities: 'Clinical Medicine & Surgery',
    contact: currentUser?.email || 'N/A',
    photo_url: null,
    employment_type: 'Full-time Clinical Staff',
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
    prescriptions_to_verify: [],
    prescriptions_to_verify_count: 0,
  };

  const highAlert = {
    critical: data?.high_alert_patients?.critical || [],
    less_critical: data?.high_alert_patients?.less_critical || [],
    mild: data?.high_alert_patients?.mild || [],
    unclassified: data?.high_alert_patients?.unclassified || [],
    stable: data?.high_alert_patients?.stable || [],
  };

  // Drawer opener
  const handleOpenDrawer = (type, filterParam, title) => {
    setDrawer({
      isOpen: true,
      type,
      filterParam,
      title,
    });
  };

  // Drawer patient select handler
  const handleDrawerPatientSelect = (patientId, context = {}) => {
    setDrawer((prev) => ({ ...prev, isOpen: false }));
    if (setSelectedPatient) {
      setSelectedPatient({ id: patientId });
    }
    if (context.isRx) {
      // Medication verification flow: navigate to chart
      if (handleOpenPatientChart) {
        handleOpenPatientChart({ patient_id: patientId, prescriptionId: context.prescriptionId });
      } else if (setActivePage) {
        setActivePage('patient-chart');
      }
    } else {
      if (handleOpenPatientChart) {
        handleOpenPatientChart({ patient_id: patientId });
      } else if (setActivePage) {
        setActivePage('patient-chart');
      }
    }
  };

  // Filtered assigned patients
  const filteredPatients = useMemo(() => {
    return filterPatientFiles(assignedPatients, patientSearch);
  }, [assignedPatients, patientSearch]);

  const displayedPatients = filteredPatients.slice(0, visibleCount);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>

      {/* ── 1. Shared Staff Overview Top Bar (Taller min-height, Left info + Right Integrated StaffIdCard) ── */}
      <StaffOverviewHeader
        staff={staff}
        employeeCard={employeeCard}
        roleTitle="Doctors Portal"
        badgeColor="#6D28D9"
        dutyStatus={data?.roster_summary?.duty_status?.status || 'On duty'}
        workingHours={workingHours}
        employmentStatus={data?.employment_status}
        lastUpdated={lastUpdated}
        lastFetchedAt={lastFetchedAt}
        isError={isFetchError}
        onRefresh={handleRefreshAll}
      />

      {/* ── 2. Today's Roster & Duty Schedule (Shared, All Figures from Published Roster) ── */}
      {data?.roster_summary && (
        <SmartRosterSection rosterSummary={data.roster_summary} />
      )}

      {/* ── 3. Slim Activity Bar (Doctor Only: Physical, Video Muted, Pending Requests Chips, Alerts Tier Chips) ── */}
      <DoctorActivityBar
        consultationCounts={data?.consultation_counts || {}}
        pendingRequests={pendingRequests}
        highAlertPatients={highAlert}
        onOpenDrawer={handleOpenDrawer}
      />

      {/* ── 4. Today's Scheduled Visits (Directly Above Patient Files) ── */}
      <section
        className="card doctor-today-visits-section"
        style={{
          padding: '24px',
          borderTop: '4px solid #6D28D9',
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(109, 40, 217, 0.06)',
          border: '1px solid #E9D5FF',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>
              Today's Scheduled Visits
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
              Patients assigned for clinical rounds, physical consultations, and orders today
            </p>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '4px 12px', borderRadius: 999 }}>
            {todayVisits.length} {todayVisits.length === 1 ? 'Visit' : 'Visits'} Scheduled
          </span>
        </div>

        {todayVisits.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
            <Calendar size={32} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No visits scheduled for today</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9CA3AF' }}>You have no clinical appointments or rounds on the calendar today.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF5FF', borderBottom: '2px solid #E9D5FF' }}>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Time (PKT)</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Patient</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Location</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Shift Buddy</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {todayVisits.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1E1B4B' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={13} style={{ color: '#6D28D9' }} />
                        <span>{sanitize(v.visit_time)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#111827' }}>{sanitize(v.patient_name)}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{sanitize(v.mr_number || v.patient_code)}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: '#FAF5FF', color: '#6D28D9', padding: '3px 8px', borderRadius: 6, fontSize: '11px', fontWeight: 600 }}>
                        {sanitize(v.visit_type)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#4B5563', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sanitize(v.location)}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#4B5563' }}>
                      {sanitize(v.buddy_staff)}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: v.status === 'completed' ? '#ECFDF5' : '#FFFBEB',
                          color: v.status === 'completed' ? '#059669' : '#D97706',
                        }}
                      >
                        {sanitize(v.status_display || v.status)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDrawerPatientSelect(v.patient_id, { bookingId: v.id })}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#6D28D9', fontSize: '12px', fontWeight: 700 }}
                      >
                        Open Chart →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 5. Assigned Patient Files (Doctor Only) ── */}
      <section
        className="card doctor-patient-files-section"
        style={{
          background: '#FFFFFF',
          borderRadius: 18,
          border: '1px solid #E9D5FF',
          boxShadow: '0 4px 20px rgba(109,40,217,0.06)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1E1B4B' }}>
              Patient Files
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
              Your assigned clinical records searchable by patient name and MR number
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search assigned patients..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="form-input"
                style={{
                  width: 240,
                  fontSize: '13px',
                  padding: '7px 12px 7px 32px',
                  borderRadius: 8,
                  borderColor: '#E5E7EB',
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            </div>

            <button
              type="button"
              onClick={() => setActivePage && setActivePage('patient-file')}
              className="btn btn-primary btn-sm"
              style={{ background: '#6D28D9', borderColor: '#6D28D9', fontSize: '12px', gap: 6, fontWeight: 700 }}
            >
              <Folder size={13} /> Open full Patient File directory
            </button>
          </div>
        </div>

        {loadingPatients && (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#6D28D9', fontSize: '13px' }}>
            Loading assigned patient directory...
          </div>
        )}

        {!loadingPatients && displayedPatients.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px', background: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#4B5563' }}>No assigned patients found</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9CA3AF' }}>
              {patientSearch ? `No patient matches "${patientSearch}".` : 'You currently have no patients assigned.'}
            </p>
          </div>
        )}

        {!loadingPatients && displayedPatients.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF5FF', borderBottom: '2px solid #E9D5FF' }}>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Patient Name</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>MR Number</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Demographics</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Location</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Complaints</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700 }}>Clinical Tier</th>
                  <th style={{ padding: '10px 14px', color: '#6D28D9', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedPatients.map((pt) => {
                  const tierConf = getTierChipConfig(pt.latest_tier);
                  return (
                    <tr
                      key={pt.id}
                      style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                      onClick={() => handleDrawerPatientSelect(pt.id)}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1E1B4B' }}>
                        {pt.name}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#4B5563', fontFamily: 'monospace' }}>
                        {pt.mr_number || pt.patient_code}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#4B5563' }}>
                        {pt.age ? `${pt.age} yrs` : '-'} • {pt.gender || '-'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#4B5563', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pt.location || '-'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {pt.has_active_complaint ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: '#FEE2E2',
                              color: '#DC2626',
                              fontSize: '11px',
                              fontWeight: 700,
                              border: '1px solid #FCA5A5',
                            }}
                          >
                            <AlertOctagon size={11} /> Active
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 9px',
                            borderRadius: 999,
                            background: tierConf.bg,
                            color: tierConf.color,
                            fontSize: '11px',
                            fontWeight: 700,
                            border: `1px solid ${tierConf.border}`,
                          }}
                        >
                          {tierConf.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDrawerPatientSelect(pt.id);
                          }}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#6D28D9', fontSize: '12px', fontWeight: 700 }}
                        >
                          View File →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Show More Button */}
        {filteredPatients.length > visibleCount && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 10)}
              className="btn btn-ghost btn-sm"
              style={{ color: '#6D28D9', borderColor: '#E9D5FF', fontWeight: 700, fontSize: '12px' }}
            >
              Show more ({filteredPatients.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </section>

      {/* ── Slide-Over Clinical Drawer ── */}
      <DoctorDrawer
        isOpen={drawer.isOpen}
        onClose={() => setDrawer((prev) => ({ ...prev, isOpen: false }))}
        type={drawer.type}
        filterParam={drawer.filterParam}
        title={drawer.title}
        onPatientSelect={handleDrawerPatientSelect}
      />
    </div>
  );
}
