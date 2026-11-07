import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock, Shield, User, MapPin, Calendar, Users, Phone, ArrowUpRight,
  AlertTriangle, CheckCircle2, ChevronRight, Activity, Pill, Truck,
  Folder, Video, Sparkles, AlertOctagon, Heart, Stethoscope, RefreshCw,
  AlertCircle
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';
import { getClinicianConfig } from '../config/clinicianRoleConfig';

export default function ClinicianHome() {
  const currentRole = useStore((s) => s.currentRole);
  const currentUser = useStore((s) => s.currentUser);
  const setActivePage = useStore((s) => s.setActivePage);
  const setSelectedPatient = useStore((s) => s.setSelectedPatient);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const config = getClinicianConfig(currentRole);
  const inFlightRef = useRef(false);

  const fetchClinicianData = useCallback(async (isBackground = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!isBackground) setLoading(true);

    try {
      const res = await apiFetch('/staff-portal/clinician-home/');
      if (!res.ok) {
        throw new Error(`Failed to load clinician dashboard (${res.status})`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      if (!isBackground) setError(err.message || 'Error loading dashboard');
    } finally {
      inFlightRef.current = false;
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClinicianData(false);

    // 30s visibility-aware polling
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchClinicianData(true);
      }
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchClinicianData(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchClinicianData]);

  const handleOpenPatientChart = (patientSummary) => {
    setSelectedPatient({
      id: patientSummary.patient_id || patientSummary.id,
      full_name: patientSummary.patient_name || patientSummary.name,
      patient_code: patientSummary.patient_code,
      mr_number: patientSummary.mr_number,
    });
    setActivePage('patient-chart');
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="skeleton" style={{ height: 260, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 260, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  const staff = data?.staff || {
    name: currentUser?.full_name || currentUser?.username || 'Clinician',
    employee_id: currentUser?.employee_id || 'DOC-001',
    designation: config.designation,
    specialities: 'General Clinical Practice',
    contact: currentUser?.email || 'clinical@homecareos.com',
    employment_type: 'Full-time Clinical Staff',
  };

  const workingHours = data?.working_hours || {
    start: '09:00',
    end: '17:00',
    timezone: 'Asia/Karachi',
    is_open_now: true,
    status_label: 'Official Hospital Shift Hours',
  };

  const todayVisits = data?.today_visits || [];
  const pendingRequests = data?.pending_requests || { total_pending: 0, referrals: [], consultations: [], procedures: [] };
  const highAlert = {
    critical: data?.high_alert_patients?.critical || [],
    less_critical: data?.high_alert_patients?.less_critical || [],
    mild: data?.high_alert_patients?.mild || [],
    unclassified: data?.high_alert_patients?.unclassified || [],
    no_recent_vitals: data?.high_alert_patients?.no_recent_vitals || [],
    stable: data?.high_alert_patients?.stable || [],
  };
  const quickLinks = data?.quick_links || [];
  const placeholders = data?.placeholders || [];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1440px', margin: '0 auto' }}>

      {/* ── 1. Hero Band: Greeting, Working Hours, Live Refresh ── */}
      <div
        className="card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 60%, #F5F3FF 100%)',
          borderTop: `4px solid ${config.badgeColor}`,
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(124, 58, 237, 0.06)',
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
                color: config.badgeColor,
                letterSpacing: '0.04em',
              }}
            >
              {config.title}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} />
              Official Hours: {workingHours.start} – {workingHours.end} ({workingHours.timezone})
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
            <strong>{staff.designation}</strong> • Speciality: <em>{staff.specialities}</em>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => fetchClinicianData(false)}
            className="btn btn-ghost btn-sm"
            style={{ color: config.badgeColor, borderColor: '#DDD6FE', gap: 6 }}
            title="Refresh clinician dashboard"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
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

      {/* ── 2. Top Split: Digital ID Card & Pending Requests ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        
        {/* Digital ID Pass */}
        <div
          className="card"
          style={{
            padding: '20px 24px',
            borderTop: '4px solid #7C3AED',
            background: '#FFFFFF',
            borderRadius: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: '#6D28D9', letterSpacing: '0.05em' }}>
              Digital Clinician Credential
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: 999 }}>
              Active Duty
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {staff.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827' }}>
                {staff.name}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#4B5563', fontWeight: 600 }}>
                ID: {staff.employee_id} • {staff.designation}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 4 }}>
                Contact: {staff.contact}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 2 }}>
                Status: {staff.employment_type}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Clinical Requests */}
        <div
          className="card"
          style={{
            padding: '20px 24px',
            borderTop: '4px solid #F59E0B',
            background: '#FFFFFF',
            borderRadius: 14,
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            <div style={{ padding: '12px 8px', background: '#FFFBEB', borderRadius: 10, border: '1px solid #FDE68A' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#B45309' }}>
                {pendingRequests.referrals?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92400E', fontWeight: 600, marginTop: 2 }}>
                Referrals
              </div>
            </div>

            <div style={{ padding: '12px 8px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1D4ED8' }}>
                {pendingRequests.consultations?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 600, marginTop: 2 }}>
                Consultations
              </div>
            </div>

            <div style={{ padding: '12px 8px', background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#047857' }}>
                {pendingRequests.procedures?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#065F46', fontWeight: 600, marginTop: 2 }}>
                Procedures
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Today's Visits Table ── */}
      <div
        className="card"
        style={{
          padding: '24px',
          borderTop: `4px solid ${config.badgeColor}`,
          background: '#FFFFFF',
          borderRadius: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
              Today's Scheduled Visits
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#6B7280' }}>
              Patients assigned for clinical rounds, consultations, and therapy sessions today
            </p>
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4B5563', background: '#F3F4F6', padding: '4px 10px', borderRadius: 8 }}>
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
                  <tr key={v.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '14px' }}>
                      <div style={{ fontWeight: 700, color: '#111827' }}>{v.patient_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                        {v.patient_code} • MRN: {v.mr_number}
                      </div>
                    </td>
                    <td style={{ padding: '14px', fontWeight: 600, color: '#374151' }}>
                      {v.visit_time}
                    </td>
                    <td style={{ padding: '14px', color: '#4B5563', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} style={{ color: '#9CA3AF' }} /> {v.location}
                      </span>
                    </td>
                    <td style={{ padding: '14px', fontWeight: 600, color: config.badgeColor }}>
                      {v.visit_type}
                    </td>
                    <td style={{ padding: '14px', color: '#4B5563' }}>
                      {v.buddy_staff}
                    </td>
                    <td style={{ padding: '14px', color: '#4B5563' }}>
                      {v.care_manager}
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
                        {v.status_display}
                      </span>
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenPatientChart(v)}
                        className="btn btn-primary btn-sm"
                        style={{ background: config.badgeColor, borderColor: config.badgeColor, gap: 4, padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        View Chart <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. High-Alert Patients (Grouped: Critical, Less critical, Mild, Stable) ── */}
      <div
        className="card"
        style={{
          padding: '24px',
          borderTop: '4px solid #EF4444',
          background: '#FFFFFF',
          borderRadius: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                Patient Vitals & Clinical Alerts Tiering
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#92400E',
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  padding: '3px 8px',
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
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#6B7280' }}>
              Assigned patients grouped by physiological stability using official threshold definitions
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          
          {/* Tier 1: Critical */}
          <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertOctagon size={18} style={{ color: '#DC2626' }} />
                <span style={{ fontWeight: 800, color: '#991B1B', fontSize: '0.92rem' }}>Critical</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.critical.length}
              </span>
            </div>

            {highAlert.critical.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>No patients in critical range</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.critical.map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #FCA5A5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#DC2626' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#DC2626', fontWeight: 600, marginTop: 4 }}>
                      SpO2: {p.spo2}% • BP: {p.bp} • HR: {p.hr} bpm
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier 2: Less Critical */}
          <div style={{ padding: '16px', background: '#FFFBEB', borderRadius: 12, border: '1px solid #FDE68A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={18} style={{ color: '#D97706' }} />
                <span style={{ fontWeight: 800, color: '#92400E', fontSize: '0.92rem' }}>Less Critical</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.less_critical.length}
              </span>
            </div>

            {highAlert.less_critical.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>No patients in less critical tier</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.less_critical.map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #FCD34D' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#D97706' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#B45309', fontWeight: 600, marginTop: 4 }}>
                      SpO2: {p.spo2}% • BP: {p.bp} • HR: {p.hr} bpm
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier 3: Mild */}
          <div style={{ padding: '16px', background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={18} style={{ color: '#2563EB' }} />
                <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: '0.92rem' }}>Mild</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#DBEAFE', color: '#2563EB', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.mild.length}
              </span>
            </div>

            {highAlert.mild.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>No borderline deviations</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.mild.map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #93C5FD' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#2563EB' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#1E40AF', fontWeight: 600, marginTop: 4 }}>
                      Temp: {p.temp ? `${p.temp}°C` : '-'} • BP: {p.bp}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier 4: Needs Review (Unclassified) */}
          <div style={{ padding: '16px', background: '#F5F3FF', borderRadius: 12, border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={18} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 800, color: '#6D28D9', fontSize: '0.92rem' }}>Needs review</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#EDE9FE', color: '#7C3AED', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.unclassified.length}
              </span>
            </div>

            {highAlert.unclassified.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>No unclassified anomalies</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.unclassified.map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #C4B5FD' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#7C3AED' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#6D28D9', fontWeight: 600, marginTop: 4 }}>
                      {p.unclassified_reasons && p.unclassified_reasons.length > 0
                        ? p.unclassified_reasons.join(' • ')
                        : `BP: ${p.bp} • HR: ${p.hr} • Glu: ${p.blood_glucose ?? '-'}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier 5: No Recent Vitals */}
          <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={18} style={{ color: '#64748B' }} />
                <span style={{ fontWeight: 800, color: '#334155', fontSize: '0.92rem' }}>No recent vitals</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#E2E8F0', color: '#475569', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.no_recent_vitals.length}
              </span>
            </div>

            {highAlert.no_recent_vitals.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>All patients have recent vitals</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.no_recent_vitals.slice(0, 5).map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #CBD5E1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#475569' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 500, marginTop: 4 }}>
                      {p.reason || 'No vitals recorded within 24 hours'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier 6: Stable */}
          <div style={{ padding: '16px', background: '#F0FDF4', borderRadius: 12, border: '1px solid #BBF7D0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={18} style={{ color: '#16A34A' }} />
                <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.92rem' }}>Stable</span>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 999 }}>
                {highAlert.stable.length}
              </span>
            </div>

            {highAlert.stable.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>No records logged yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {highAlert.stable.slice(0, 3).map((p) => (
                  <div key={p.patient_id} style={{ padding: '10px', background: '#FFFFFF', borderRadius: 8, border: '1px solid #86EFAC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#111827' }}>{p.patient_name}</span>
                      <button onClick={() => handleOpenPatientChart(p)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#16A34A' }}>
                        Chart →
                      </button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#15803D', fontWeight: 600, marginTop: 4 }}>
                      Vitals within normal limits
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 5. Quick Links & Disabled Placeholders ("Coming Soon") ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        
        {/* Quick Links */}
        <div className="card" style={{ padding: '20px 24px', borderTop: '4px solid #0284C7', background: '#FFFFFF', borderRadius: 14 }}>
          <h4 style={{ margin: '0 0 14px 0', fontSize: '1rem', fontWeight: 800, color: '#111827' }}>
            Clinical Quick Links
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <button
              onClick={() => setActivePage('patient-chart')}
              className="btn btn-outline"
              style={{ padding: '14px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderColor: '#E0F2FE', background: '#F0F9FF', color: '#0369A1' }}
            >
              <Folder size={20} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Patient Records</span>
            </button>

            <button
              onClick={() => setActivePage('pharmacy')}
              className="btn btn-outline"
              style={{ padding: '14px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderColor: '#E0E7FF', background: '#EEF2FF', color: '#4338CA' }}
            >
              <Pill size={20} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Pharmacy</span>
            </button>

            <button
              onClick={() => setActivePage('equipment')}
              className="btn btn-outline"
              style={{ padding: '14px 10px', flexDirection: 'column', gap: 8, height: 'auto', borderColor: '#FEF3C7', background: '#FFFBEB', color: '#B45309' }}
            >
              <Truck size={20} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Equipment</span>
            </button>
          </div>
        </div>

        {/* Disabled Placeholders (Coming Soon) */}
        <div className="card" style={{ padding: '20px 24px', borderTop: '4px solid #94A3B8', background: '#F8FAFC', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#475569' }}>
              Future Tele-Health Tools
            </h4>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#E2E8F0', padding: '2px 8px', borderRadius: 999 }}>
              Placeholders
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#FFFFFF',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                opacity: 0.65,
                cursor: 'not-allowed',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Video size={18} style={{ color: '#64748B' }} />
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155' }}>
                  Online consultation (audio, video)
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 999 }}>
                Coming soon
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#FFFFFF',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                opacity: 0.65,
                cursor: 'not-allowed',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={18} style={{ color: '#64748B' }} />
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155' }}>
                  AI Assistant
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 999 }}>
                Coming soon
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

