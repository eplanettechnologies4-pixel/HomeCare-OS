import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard, Activity, Pill, Heart, Stethoscope, Calendar,
  FileText, Bell, User, Users, LogOut, Star, ChevronRight,
  AlertTriangle, CheckCircle, Clock, Phone, Mail, Droplets,
  Thermometer, Wind, Zap, Shield, Eye, EyeOff, Copy, Check,
  TrendingUp, ArrowUpRight, ClipboardList, Syringe, Utensils,
  PersonStanding, BookOpen, MessageSquare, DollarSign, Download
} from 'lucide-react';
import useStore from '../store/useStore';
import { format, formatDistanceToNow } from 'date-fns';

// ── Helpers ───────────────────────────────────────────────────────────────────
function VitalBadge({ label, value, unit, icon: Icon, status = 'normal' }) {
  const colors = {
    normal:   { bg: 'rgba(13,148,136,0.08)', border: '#0d9488', text: '#0f766e' },
    warning:  { bg: 'rgba(222,154,60,0.10)', border: '#DE9A3C', text: '#b45309' },
    critical: { bg: 'rgba(239,68,68,0.10)',  border: '#ef4444', text: '#b91c1c' },
  }[status];

  return (
    <div style={{
      background: colors.bg,
      border: `1.5px solid ${colors.border}44`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={14} style={{ color: colors.text, flexShrink: 0 }} />}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: '1.55rem', fontWeight: 800, color: colors.text, lineHeight: 1 }}>{value ?? '—'}</span>
        {unit && <span style={{ fontSize: '0.72rem', color: colors.text, opacity: 0.8, fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, color = 'var(--teal-700)' }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: `linear-gradient(135deg, ${color}, ${color}bb)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', boxShadow: `0 2px 8px ${color}44`
        }}>
          <Icon size={17} />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--teal-900)' }}>{title}</h2>
      </div>
      {subtitle && <p style={{ margin: '0 0 0 44px', fontSize: '0.8rem', color: 'var(--status-grey)' }}>{subtitle}</p>}
    </div>
  );
}

// ── Star Rating Widget ────────────────────────────────────────────────────────
function StarRating({ staffId, staffName, onRated }) {
  const rateStaff = useStore((s) => s.rateStaff);
  const [hovered, setHovered]   = useState(0);
  const [selected, setSelected] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleRate = async (rating) => {
    setSelected(rating);
    setAnimating(true);
    await rateStaff(staffId, rating);
    setTimeout(() => {
      setSubmitted(true);
      setAnimating(false);
      if (onRated) onRated(rating);
    }, 600);
  };

  if (submitted) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10,
      }}>
        <CheckCircle size={18} style={{ color: '#16a34a' }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#15803d' }}>
          Thank you! {selected} ★ rating submitted for {staffName}.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal-800)' }}>
        Rate your nurse · <span style={{ fontWeight: 400, color: 'var(--status-grey)' }}>How was the care today?</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              transform: `scale(${animating && star <= selected ? 1.3 : 1})`,
              transition: 'transform 0.15s ease',
            }}
          >
            <Star
              size={28}
              fill={(hovered || selected) >= star ? '#DE9A3C' : 'none'}
              stroke={(hovered || selected) >= star ? '#DE9A3C' : '#9ca3af'}
              strokeWidth={1.8}
            />
          </button>
        ))}
        <span style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginLeft: 4 }}>
          {hovered ? ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][hovered] : 'Tap to rate'}
        </span>
      </div>
    </div>
  );
}

// ── NAV CONFIG ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',     label: 'EMR Overview',       icon: LayoutDashboard },
  { id: 'vitals',       label: 'Vital Signs',         icon: Activity },
  { id: 'medications',  label: 'Medications',         icon: Pill },
  { id: 'care',         label: 'Care Provided',       icon: Heart },
  { id: 'condition',    label: 'Patient Condition',   icon: Stethoscope },
  { id: 'appointments', label: 'Appointments',        icon: Calendar },
  { id: 'reports',      label: 'Reports',             icon: FileText },
  { id: 'alerts',       label: 'Important Alerts',    icon: Bell },
  { id: 'staff-duty',   label: 'Staff on Duty',       icon: User },
  { id: 'care-manager', label: 'Care Manager',        icon: Users },
  { id: 'invoices',     label: 'Invoices',            icon: DollarSign },
  { id: 'messages',     label: 'Messages',            icon: MessageSquare },
];

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function FamilyPortal() {
  const patients       = useStore((s) => s.patients);
  const allBookings    = useStore((s) => s.bookings);
  const allInvoices    = useStore((s) => s.invoices);
  const allReports     = useStore((s) => s.dailyReports);
  const allVitals      = useStore((s) => s.vitals);
  const allNurseNotes  = useStore((s) => s.nurseNotes);
  const allAlerts      = useStore((s) => s.alerts);
  const staff          = useStore((s) => s.staff);
  const currentUser    = useStore((s) => s.currentUser);
  const setCurrentRole = useStore((s) => s.setCurrentRole);
  const setActivePage  = useStore((s) => s.setActivePage);

  // Resolve the current patient (family sees their own patient)
  const patient = useMemo(() => {
    if (currentUser?.patient_id) return patients.find((p) => p.id === currentUser.patient_id);
    return patients[0] || null;
  }, [patients, currentUser]);

  const bookings    = patient ? allBookings.filter((b) => b.patient_name === patient.full_name || b.patient?.id === patient.id) : [];
  const invoices    = patient ? allInvoices.filter((i) => i.patient_id === patient.id) : [];
  const reports     = patient ? allReports.filter((r) => r.patient_id === patient.id) : [];
  const vitals      = patient ? allVitals.filter((v) => v.patient_id === patient.id) : [];
  const nurseNotes  = patient ? allNurseNotes.filter((n) => n.patient_id === patient.id) : [];

  const [activeTab, setActiveTab] = useState('overview');

  // Booking/staff helpers
  const activeBooking    = bookings.find((b) => b.status === 'in_progress' || b.status === 'en_route' || b.status === 'assigned');
  const upcomingBookings = bookings.filter((b) => ['pending', 'assigned', 'en_route'].includes(b.status));
  const completedBookings= bookings.filter((b) => b.status === 'completed');

  const assignedNurseId = activeBooking?.assigned_staff?.id || activeBooking?.assigned_staff_id;
  const assignedNurse   = assignedNurseId ? staff.find((s) => String(s.id) === String(assignedNurseId)) : null;
  const careManager     = patient?.assigned_care_manager
    ? (typeof patient.assigned_care_manager === 'object' ? patient.assigned_care_manager : staff.find((s) => String(s.id) === String(patient.assigned_care_manager)))
    : staff.find((s) => s.role === 'care_manager');

  // Latest vitals
  const latestVitals = vitals[0] || null;

  const handleExitPortal = () => {
    setCurrentRole('super_admin');
    setActivePage('overview');
  };

  // ── SIDEBAR ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
      fontFamily: 'var(--font-body)',
      position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 250, minHeight: '100vh', flexShrink: 0,
        background: 'linear-gradient(180deg, #0f766e 0%, #115e59 60%, #0d4f4a 100%)',
        color: 'white', display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <img src="/ehealth-logo.png" alt="eHealth" style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', objectFit: 'cover' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>
                e<span style={{ color: '#FDE047' }}>Health</span> Family
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, letterSpacing: '0.04em' }}>
                PATIENT PORTAL · EMR VIEW
              </div>
            </div>
          </div>
          {patient && (
            <div style={{
              background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px',
              fontSize: '0.78rem',
            }}>
              <div style={{ fontWeight: 700, color: 'white', marginBottom: 2 }}>{patient.full_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
                MR# {patient.mr_number} · {patient.age || '—'} yrs
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: 'none', marginBottom: 2, cursor: 'pointer',
                  background: isActive ? 'rgba(253,224,71,0.18)' : 'transparent',
                  color: isActive ? '#FDE047' : 'rgba(255,255,255,0.82)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.84rem', textAlign: 'left',
                  borderLeft: isActive ? '3px solid #FDE047' : '3px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={15} style={{ flexShrink: 0 }} />
                <span>{label}</span>
                {id === 'alerts' && allAlerts.length > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: '#ef4444', color: 'white',
                    borderRadius: 10, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 800,
                  }}>{allAlerts.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Exit Button */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <button
            onClick={handleExitPortal}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '9px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <LogOut size={14} /> Exit Family Portal
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 1100 }}>

        {!patient ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh',
          }}>
            <div className="card" style={{ padding: 48, textAlign: 'center', maxWidth: 480 }}>
              <Stethoscope size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal-600)' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', marginBottom: 8 }}>No Patient Profile Linked</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--status-grey)', marginBottom: 20 }}>
                No patient record is linked to this portal account. Please contact your care manager.
              </p>
              <button className="btn btn-primary" onClick={handleExitPortal}>Return to Dashboard</button>
            </div>
          </div>
        ) : (
          <div>
            {/* Patient Banner */}
            <div className="card" style={{
              padding: '16px 20px', marginBottom: 24,
              background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
              border: 'none', boxShadow: '0 4px 20px rgba(15,118,110,0.25)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', fontWeight: 800, color: 'white',
                  }}>
                    {patient.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>
                      Patient EMR — Family View
                    </div>
                    <div style={{ color: 'white', fontWeight: 800, fontSize: '1.25rem', fontFamily: 'var(--font-heading)', lineHeight: 1.2 }}>
                      {patient.full_name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginTop: 2 }}>
                      MR# {patient.mr_number} &nbsp;·&nbsp; {patient.age || '—'} yrs &nbsp;·&nbsp; {patient.gender_display || (patient.gender === 'F' ? 'Female' : 'Male')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
                    background: patient.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(156,163,175,0.2)',
                    border: `1px solid ${patient.is_active ? 'rgba(34,197,94,0.4)' : 'rgba(156,163,175,0.4)'}`,
                    color: patient.is_active ? '#bbf7d0' : '#d1d5db',
                  }}>
                    {patient.is_active ? '● Active Care Plan' : '○ Inactive'}
                  </span>
                  {activeBooking && (
                    <span style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
                      background: 'rgba(253,224,71,0.2)', border: '1px solid rgba(253,224,71,0.4)', color: '#FDE047',
                    }}>
                      ● Visit in Progress
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── TAB CONTENT ──────────────────────────────────────────────────── */}

            {/* ① EMR OVERVIEW */}
            {activeTab === 'overview' && (
              <div>
                <SectionTitle icon={LayoutDashboard} title="EMR Overview" subtitle="Patient demographics, diagnosis, and current care summary" color="#0f766e" />

                {/* Patient Details Card */}
                <div className="card" style={{ padding: 24, marginBottom: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <User size={15} /> Patient Details
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                    {[
                      { label: 'Full Name', value: patient.full_name },
                      { label: 'Age', value: patient.age ? `${patient.age} years` : '—' },
                      { label: 'Date of Birth', value: patient.date_of_birth ? format(new Date(patient.date_of_birth), 'dd MMM yyyy') : '—' },
                      { label: 'Gender', value: patient.gender_display || (patient.gender === 'F' ? 'Female' : 'Male') },
                      { label: 'Blood Type', value: patient.blood_type || '—', highlight: true },
                      { label: 'Contact', value: patient.phone || '—' },
                      { label: 'Address', value: patient.address || '—', wide: true },
                      { label: 'MR Number', value: patient.mr_number, mono: true },
                    ].map(({ label, value, highlight, wide, mono }) => (
                      <div key={label} style={{
                        gridColumn: wide ? '1 / -1' : undefined,
                        background: highlight ? 'rgba(239,68,68,0.06)' : 'var(--sage-50)',
                        border: highlight ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--sage-200)',
                        borderRadius: 8, padding: '10px 14px',
                      }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--status-grey)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: highlight ? '#b91c1c' : 'var(--teal-900)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Diagnosis & Allergies */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div className="card" style={{ padding: 20, borderLeft: '4px solid #0d9488' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--teal-700)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stethoscope size={14} /> Primary Diagnosis
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--teal-900)', lineHeight: 1.5 }}>
                      {patient.primary_diagnosis || 'Not specified'}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 20, borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#b91c1c', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} /> Known Allergies
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: patient.allergies === 'NKDA' ? '#15803d' : '#b91c1c', lineHeight: 1.5 }}>
                      {patient.allergies || 'NKDA (No Known Drug Allergies)'}
                    </div>
                  </div>
                </div>

                {/* Live Nurse Rating (after a completed visit) */}
                {completedBookings.length > 0 && assignedNurse && (
                  <div className="card" style={{ padding: 20, background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', border: '1px solid #fde68a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#92400e' }}>
                        ⭐ Rate Your Nurse — {assignedNurse.full_name}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#b45309', background: '#fef3c7', padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>
                        {completedBookings.length} Visit{completedBookings.length !== 1 ? 's' : ''} Completed
                      </span>
                    </div>
                    <StarRating staffId={assignedNurse.id} staffName={assignedNurse.full_name} />
                  </div>
                )}
              </div>
            )}

            {/* ② VITAL SIGNS */}
            {activeTab === 'vitals' && (
              <div>
                <SectionTitle icon={Activity} title="Vital Signs" subtitle="Latest recorded clinical measurements" color="#7c3aed" />
                {vitals.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <Activity size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No vital signs recorded yet.</div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Your care team will record vitals during each visit.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
                      <VitalBadge label="Blood Pressure" icon={TrendingUp}
                        value={latestVitals?.blood_pressure_systolic ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` : '—'}
                        unit="mmHg"
                        status={latestVitals?.blood_pressure_systolic > 160 ? 'critical' : latestVitals?.blood_pressure_systolic > 140 ? 'warning' : 'normal'}
                      />
                      <VitalBadge label="Heart Rate" icon={Heart}
                        value={latestVitals?.heart_rate ?? '—'} unit="bpm"
                        status={latestVitals?.heart_rate > 100 || latestVitals?.heart_rate < 55 ? 'warning' : 'normal'}
                      />
                      <VitalBadge label="Temperature" icon={Thermometer}
                        value={latestVitals?.temperature ?? '—'} unit="°C"
                        status={latestVitals?.temperature > 38 ? 'critical' : latestVitals?.temperature > 37.5 ? 'warning' : 'normal'}
                      />
                      <VitalBadge label="SpO₂" icon={Wind}
                        value={latestVitals?.spo2 ? `${latestVitals.spo2}%` : '—'} unit=""
                        status={latestVitals?.spo2 < 90 ? 'critical' : latestVitals?.spo2 < 95 ? 'warning' : 'normal'}
                      />
                      <VitalBadge label="Blood Glucose" icon={Droplets}
                        value={latestVitals?.blood_glucose ?? '—'} unit="mg/dL"
                        status={latestVitals?.blood_glucose > 200 ? 'critical' : latestVitals?.blood_glucose > 140 ? 'warning' : 'normal'}
                      />
                      <VitalBadge label="Respiratory Rate" icon={Zap}
                        value={latestVitals?.respiratory_rate ?? '—'} unit="br/min"
                        status={latestVitals?.respiratory_rate > 24 ? 'warning' : 'normal'}
                      />
                    </div>

                    {/* Vitals History Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sage-200)', fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.9rem' }}>
                        Vitals History (All Recorded Readings)
                      </div>
                      <div className="data-table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date & Time</th>
                              <th>BP</th>
                              <th>Pulse</th>
                              <th>Temp</th>
                              <th>SpO₂</th>
                              <th>Glucose</th>
                              <th>Recorded By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vitals.map((v, i) => (
                              <tr key={v.id || i}>
                                <td className="ts">{v.recorded_at ? format(new Date(v.recorded_at), 'dd MMM yyyy HH:mm') : '—'}</td>
                                <td className="ts">{v.blood_pressure_systolic}/{v.blood_pressure_diastolic}</td>
                                <td className="ts">{v.heart_rate} bpm</td>
                                <td className="ts">{v.temperature} °C</td>
                                <td className="ts">{v.spo2}%</td>
                                <td className="ts">{v.blood_glucose} mg/dL</td>
                                <td style={{ fontSize: '0.8rem' }}>{v.recorded_by_name || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ③ MEDICATIONS */}
            {activeTab === 'medications' && (
              <div>
                <SectionTitle icon={Pill} title="Medications (MAR)" subtitle="Medication Administration Record — what was given, dose, and time" color="#611F8C" />
                {nurseNotes.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <Pill size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No medication records yet.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {nurseNotes.map((note, i) => (
                      <div key={note.id || i} className="card" style={{ padding: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.9rem' }}>Visit on {note.recorded_at ? format(new Date(note.recorded_at), 'dd MMM yyyy') : '—'}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>Nurse: {note.recorded_by_name || '—'}</div>
                          </div>
                          <span className={`badge ${note.is_flagged ? 'badge-red' : 'badge-green'}`}>{note.is_flagged ? '⚠ Flagged' : '✓ Normal'}</span>
                        </div>
                        <div style={{ background: 'var(--sage-50)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>
                          {note.note || 'No medication notes recorded for this visit.'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ④ CARE PROVIDED */}
            {activeTab === 'care' && (
              <div>
                <SectionTitle icon={Heart} title="Care Provided" subtitle="Nursing care, feeding, hygiene, mobility assistance per visit" color="#e11d48" />
                {reports.length === 0 && completedBookings.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <Heart size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No care records yet.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {completedBookings.map((b) => (
                      <div key={b.id} className="card" style={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.92rem' }}>
                              {b.service_type_display}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
                              {b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM yyyy · hh:mm a') : '—'} · Nurse: {b.staff_name || '—'}
                            </div>
                          </div>
                          <span className="badge badge-green">Completed</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                          {[
                            { label: 'Nursing Care', icon: Stethoscope, value: 'Provided' },
                            { label: 'Feeding / Nutrition', icon: Utensils, value: b.notes?.toLowerCase().includes('feed') ? 'Assisted' : 'Independent' },
                            { label: 'Hygiene', icon: Shield, value: 'Completed' },
                            { label: 'Mobility Assist', icon: PersonStanding, value: b.notes?.toLowerCase().includes('walker') || b.notes?.toLowerCase().includes('gait') ? 'Assisted' : 'Assessed' },
                            { label: 'Wound Care', icon: Heart, value: b.notes?.toLowerCase().includes('wound') || b.notes?.toLowerCase().includes('dressing') ? 'Done' : 'N/A' },
                            { label: 'Medication Admin', icon: Syringe, value: 'Given' },
                          ].map(({ label, icon: Icon, value }) => (
                            <div key={label} style={{
                              background: 'var(--sage-50)', borderRadius: 8, padding: '8px 12px',
                              border: '1px solid var(--sage-200)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                <Icon size={12} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.68rem', color: 'var(--status-grey)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
                              </div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: value === 'N/A' ? 'var(--status-grey)' : 'var(--teal-800)' }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        {b.notes && (
                          <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: '0.82rem', color: '#374151', borderLeft: '3px solid #0d9488' }}>
                            <strong>Nurse's Note:</strong> {b.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ⑤ PATIENT CONDITION */}
            {activeTab === 'condition' && (
              <div>
                <SectionTitle icon={Stethoscope} title="Patient Condition" subtitle="General health status and care plan progress" color="#0891b2" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.9rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={14} /> Current Status
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '8px 18px', borderRadius: 20,
                      background: patient.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(156,163,175,0.1)',
                      border: `1px solid ${patient.is_active ? 'rgba(34,197,94,0.3)' : '#d1d5db'}`,
                      color: patient.is_active ? '#15803d' : '#6b7280',
                      fontWeight: 800, fontSize: '0.9rem', marginBottom: 14,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: patient.is_active ? 'pulse 2s infinite' : 'none' }} />
                      {patient.is_active ? 'Active — Under Care' : 'Inactive'}
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#374151', lineHeight: 1.6 }}>
                      <strong>Diagnosis:</strong> {patient.primary_diagnosis || '—'}<br />
                      <strong>Total Visits:</strong> {bookings.length} ({completedBookings.length} completed)<br />
                      <strong>Care Plan:</strong> {activeBooking ? 'Currently Active' : upcomingBookings.length > 0 ? 'Scheduled' : 'Review Needed'}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.9rem', marginBottom: 14 }}>
                      📋 Care Plan Progress
                    </div>
                    {[
                      { label: 'Visits Completed', val: completedBookings.length, total: bookings.length },
                      { label: 'Vitals Recorded', val: vitals.length, total: vitals.length + 3 },
                      { label: 'Care Notes Filed', val: nurseNotes.length, total: nurseNotes.length + 2 },
                    ].map(({ label, val, total }) => {
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={label} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                            <span style={{ color: '#374151', fontWeight: 600 }}>{label}</span>
                            <span style={{ color: 'var(--teal-700)', fontWeight: 700 }}>{val}/{total}</span>
                          </div>
                          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #0d9488, #0f766e)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {nurseNotes.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.9rem', marginBottom: 14 }}>
                      Latest Clinical Note
                    </div>
                    <div style={{ background: 'var(--sage-50)', borderRadius: 8, padding: '14px 16px', fontSize: '0.88rem', color: '#374151', lineHeight: 1.7 }}>
                      {nurseNotes[0].note}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 8 }}>
                      Recorded by {nurseNotes[0].recorded_by_name} · {nurseNotes[0].recorded_at ? formatDistanceToNow(new Date(nurseNotes[0].recorded_at), { addSuffix: true }) : '—'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ⑥ APPOINTMENTS */}
            {activeTab === 'appointments' && (
              <div>
                <SectionTitle icon={Calendar} title="Appointments" subtitle="Upcoming visits and scheduled care sessions" color="#0d9488" />
                {upcomingBookings.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No upcoming appointments.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {upcomingBookings.map((b) => (
                      <div key={b.id} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18, borderLeft: '4px solid #0d9488' }}>
                        <div style={{ textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--teal-700)', lineHeight: 1 }}>
                            {b.scheduled_time ? format(new Date(b.scheduled_time), 'd') : '—'}
                          </div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--teal-600)', textTransform: 'uppercase' }}>
                            {b.scheduled_time ? format(new Date(b.scheduled_time), 'MMM') : '—'}
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: 'var(--teal-800)', fontSize: '0.92rem' }}>{b.service_type_display}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
                            <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                            {b.scheduled_time ? format(new Date(b.scheduled_time), 'hh:mm a') : '—'} &nbsp;·&nbsp;
                            Nurse: {b.staff_name || 'To be assigned'}
                          </div>
                        </div>
                        <span className={`badge ${b.status === 'assigned' ? 'badge-green' : b.status === 'en_route' ? 'badge-teal' : 'badge-amber'}`}>
                          {b.status_display || b.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ⑦ REPORTS */}
            {activeTab === 'reports' && (
              <div>
                <SectionTitle icon={FileText} title="Medical Reports" subtitle="Approved documents, lab results, and clinical summaries" color="#7c3aed" />
                {reports.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <FileText size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No reports available yet.</div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Your care team will upload approved reports here.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {reports.map((r, i) => (
                      <div key={r.id || i} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0 }}>
                          <FileText size={18} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.88rem' }}>{r.visit_type || 'Visit Report'}</div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--status-grey)', marginTop: 2 }}>{r.date || '—'}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Download size={13} /> View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ⑧ IMPORTANT ALERTS */}
            {activeTab === 'alerts' && (
              <div>
                <SectionTitle icon={Bell} title="Important Alerts" subtitle="Significant changes, instructions, or care notifications" color="#dc2626" />
                {allAlerts.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <CheckCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#22c55e' }} />
                    <div style={{ fontWeight: 600, color: '#16a34a' }}>All clear — No active alerts.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {allAlerts.map((a) => {
                      const sevColor = a.severity === 'critical' ? { bg: '#fef2f2', border: '#f87171', text: '#b91c1c', badge: 'badge-red' }
                        : a.severity === 'warning' ? { bg: '#fffbeb', border: '#fbbf24', text: '#92400e', badge: 'badge-amber' }
                        : { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: 'badge-teal' };
                      return (
                        <div key={a.id} style={{ background: sevColor.bg, border: `1px solid ${sevColor.border}`, borderRadius: 10, padding: '14px 18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <AlertTriangle size={16} style={{ color: sevColor.text, flexShrink: 0 }} />
                              <span style={{ fontWeight: 800, color: sevColor.text, fontSize: '0.9rem' }}>{a.title}</span>
                            </div>
                            <span className={`badge ${sevColor.badge}`} style={{ fontSize: '0.68rem' }}>{a.severity}</span>
                          </div>
                          <div style={{ fontSize: '0.84rem', color: '#374151', marginLeft: 24 }}>{a.message}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 6, marginLeft: 24 }}>
                            {a.time ? formatDistanceToNow(new Date(a.time), { addSuffix: true }) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ⑨ STAFF ON DUTY */}
            {activeTab === 'staff-duty' && (
              <div>
                <SectionTitle icon={User} title="Staff on Duty" subtitle="Nurse and clinicians currently assigned to this patient" color="#611F8C" />
                {!assignedNurse && !activeBooking ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <User size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No staff currently on duty.</div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Staff will appear here when a visit is active or assigned.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {[assignedNurse, ...(activeBooking?.backup_staff ? [staff.find((s) => String(s.id) === String(activeBooking.backup_staff))] : [])].filter(Boolean).map((nurse) => (
                      <div key={nurse.id} className="card" style={{ padding: 22, border: '2px solid rgba(97,31,140,0.15)' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
                          <div style={{
                            width: 56, height: 56, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #611F8C, #8B36C4)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.1rem', fontWeight: 800, flexShrink: 0,
                          }}>
                            {nurse.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--teal-800)' }}>{nurse.full_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>{nurse.role_display}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              {[1,2,3,4,5].map((s) => (
                                <Star key={s} size={13} fill={s <= Math.round(nurse.rating || 5) ? '#DE9A3C' : 'none'} stroke={s <= Math.round(nurse.rating || 5) ? '#DE9A3C' : '#d1d5db'} strokeWidth={1.5} />
                              ))}
                              <span style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginLeft: 2 }}>{Number(nurse.rating || 5).toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <Stethoscope size={13} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                            <span><strong>Specialization:</strong> {nurse.specialization || 'General Care'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <Phone size={13} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                            <span>{nurse.phone || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <Mail size={13} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                            <span>{nurse.email || '—'}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--sage-200)' }}>
                          <span className={`badge ${nurse.status === 'on_visit' ? 'badge-green' : nurse.status === 'available' ? 'badge-teal' : 'badge-grey'}`}>
                            {nurse.status_display || nurse.status}
                          </span>
                          <span className="ts" style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginLeft: 8 }}>ID: {nurse.employee_id}</span>
                        </div>
                      </div>
                    ))}
                    {/* Current Visit Info */}
                    {activeBooking && (
                      <div className="card" style={{ padding: 20, background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.2)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--teal-700)', fontSize: '0.88rem', marginBottom: 12 }}>
                          Current Visit Details
                        </div>
                        {[
                          ['Service', activeBooking.service_type_display],
                          ['Scheduled', activeBooking.scheduled_time ? format(new Date(activeBooking.scheduled_time), 'hh:mm a') : '—'],
                          ['Status', activeBooking.status_display || activeBooking.status],
                          ['Notes', activeBooking.notes || 'None'],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 8, padding: '4px 0', borderBottom: '1px dashed #e5e7eb' }}>
                            <span style={{ color: 'var(--status-grey)', fontWeight: 600 }}>{k}</span>
                            <span style={{ color: '#374151', fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ⑩ CARE MANAGER */}
            {activeTab === 'care-manager' && (
              <div>
                <SectionTitle icon={Users} title="Care Manager on Duty" subtitle="Your dedicated care coordinator and case manager" color="#0891b2" />
                {!careManager ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No care manager assigned yet.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
                    <div className="card" style={{ padding: 24, textAlign: 'center', border: '2px solid rgba(8,145,178,0.2)' }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
                        background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem', fontWeight: 900,
                      }}>
                        {(careManager.full_name || careManager.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--teal-900)', marginBottom: 4 }}>{careManager.full_name || careManager.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)', marginBottom: 12 }}>{careManager.role_display || 'Care Manager'}</div>
                      <span className="badge badge-teal" style={{ marginBottom: 12 }}>● On Duty</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.84rem', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 8 }}>
                          <Phone size={14} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                          <span style={{ color: '#374151', fontWeight: 600 }}>{careManager.phone || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 8 }}>
                          <Mail size={14} style={{ color: 'var(--teal-600)', flexShrink: 0 }} />
                          <span style={{ color: '#374151', fontWeight: 600 }}>{careManager.email || '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="card" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 800, color: 'var(--teal-800)', marginBottom: 12 }}>Specialization</div>
                        <div style={{ fontSize: '0.88rem', color: '#374151' }}>{careManager.specialization || 'Patient Coordination & Care Management'}</div>
                      </div>
                      <div className="card" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 800, color: 'var(--teal-800)', marginBottom: 12 }}>Send a Message</div>
                        <textarea className="form-textarea" placeholder="Type a message to your care manager..." rows={3} style={{ marginBottom: 10 }} />
                        <button className="btn btn-primary" style={{ background: '#0891b2' }}>
                          <MessageSquare size={14} /> Send Message
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── INVOICES TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'invoices' && (
              <div>
                <SectionTitle icon={DollarSign} title="Billing Statements" subtitle="Invoices, payments, and outstanding balances" color="#0d9488" />
                {invoices.length === 0 ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--status-grey)' }}>
                    <DollarSign size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600 }}>No invoices yet.</div>
                  </div>
                ) : (
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {invoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="ts">{inv.invoice_number || inv.id}</td>
                              <td className="ts">{inv.date || '—'}</td>
                              <td className="ts">PKR {(inv.total_amount || inv.total || 0).toLocaleString()}</td>
                              <td className="ts" style={{ color: 'var(--status-green)', fontWeight: 700 }}>PKR {(inv.amount_paid || 0).toLocaleString()}</td>
                              <td className="ts" style={{ color: (inv.balance_due || 0) > 0 ? 'var(--status-red)' : 'var(--status-green)', fontWeight: 700 }}>PKR {(inv.balance_due || 0).toLocaleString()}</td>
                              <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : 'badge-amber'}`}>{inv.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MESSAGES TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'messages' && (
              <div>
                <SectionTitle icon={MessageSquare} title="Messages" subtitle="Communicate with your care team" color="#7c3aed" />
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ background: 'var(--sage-50)', padding: 14, borderRadius: 8, marginBottom: 14, borderLeft: '3px solid var(--teal-600)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)', marginBottom: 4 }}>
                      {careManager?.full_name || 'Care Coordinator'} <span style={{ fontWeight: 400, color: 'var(--status-grey)' }}>· Care Manager</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                      "Hello! Your scheduled care visits and treatment updates will be posted here. Please message us if you need any adjustments or assistance."
                    </div>
                  </div>
                  <textarea className="form-textarea" placeholder="Type a message to your care manager..." rows={3} style={{ marginBottom: 10 }} />
                  <button className="btn btn-primary">Send Message</button>
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
