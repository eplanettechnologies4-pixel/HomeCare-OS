import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity, Calendar, Clock, AlertTriangle, DollarSign,
  X, Siren, Truck, Package, Users, TrendingUp, Award, Kanban, CheckCircle, Heart,
  BarChart3, PieChart as PieIcon, ShieldCheck, Zap, Layers, Compass, ArrowUpRight
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import useStore from '../store/useStore';
import StaffIdCard from '../components/StaffIdCard';
import { ROLE_CONFIG } from '../data/mockData';
import MiniMap from '../components/MiniMap';
import { format } from 'date-fns';

// ── Mini SVG Sparkline for Stat Cards ──────────────────────────────────────────
function MiniSparkline({ data = [10, 14, 12, 18, 15, 22, 28], positive = true }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 84;
  const height = 24;
  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = positive ? '#15803d' : '#b91c1c';

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {/* End pulse dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 6) - 3}
          r="3"
          fill={color}
        />
      )}
    </svg>
  );
}

function StatCard({ label, value, sub, icon: Icon, variant, prefix, trend, sparkline }) {
  return (
    <div className={`stat-card ${variant || ''}`} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stat-label">{label}</div>
        {sparkline && (
          <MiniSparkline data={sparkline} positive={trend ? trend.positive : true} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <div className="stat-value">
          {prefix && <span style={{ fontSize: '1.2rem', marginRight: 2 }}>{prefix}</span>}
          {value}
        </div>
        {trend && (
          <span
            className="stat-trend"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              background: trend.positive ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: trend.positive ? '#15803d' : '#b91c1c',
              border: `1px solid ${trend.positive ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              lineHeight: 1.2,
            }}
          >
            <span>{trend.direction === 'down' ? '↓' : '↑'}{trend.value}</span>
            <span style={{ fontWeight: 500, opacity: 0.85, fontSize: '0.67rem' }}>{trend.period}</span>
          </span>
        )}
      </div>
      {sub && <div className="stat-sub" style={{ marginTop: 6 }}>{sub}</div>}
      {Icon && <div className="stat-icon"><Icon size={52} /></div>}
    </div>
  );
}

const ALERT_ICONS = { sos: Siren, late: Truck, stock: Package, pending: Users };

// Curated palette for world-class medical operations charts
const SERVICE_COLORS = [
  '#611F8C', // Deep Royal Brand Purple
  '#8B36C4', // Electric Purple
  '#0D9488', // Medical Teal
  '#DE9A3C', // Amber Gold
  '#2563EB', // Royal Cobalt
  '#10B981', // Emerald Health
];

export default function Overview() {
  const currentRole   = useStore((s) => s.currentRole);
  const currentUser   = useStore((s) => s.currentUser);
  const alerts        = useStore((s) => s.alerts);
  const dismissAlert  = useStore((s) => s.dismissAlert);
  const liveVisits    = useStore((s) => s.liveVisits);
  const bookings      = useStore((s) => s.bookings);
  const leads         = useStore((s) => s.leads);
  const invoices      = useStore((s) => s.invoices);
  const staff         = useStore((s) => s.staff);
  const fetchAllData  = useStore((s) => s.fetchAllData);

  // Time range selector for operations & revenue trend chart
  const [timeRange, setTimeRange] = useState('28d'); // '7d' | '28d' | '90d'
  // Primary chart presentation mode
  const [chartMode, setChartMode] = useState('trajectory'); // 'trajectory' | 'hourly' | 'benchmark'

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const roleLabel = ROLE_CONFIG[currentRole]?.label || 'User';
  const userName  = currentUser?.full_name || roleLabel;
  const today     = new Date().toDateString();

  const active      = liveVisits.filter((v) => v.status === 'in_progress').length;
  const todayCount  = bookings.filter((b) => new Date(b.scheduled_time).toDateString() === today).length;
  const pending     = bookings.filter((b) => b.status === 'pending').length;
  const todayRev    = bookings
    .filter((b) => b.status === 'completed' && new Date(b.scheduled_time).toDateString() === today)
    .reduce((s, b) => s + (b.amount_paid || b.amount || 0), 0);

  // Allowed widget checks based on role
  // Financial metrics locked down to Super Admin and Accountant only
  const canSeeRevenue   = ['super_admin', 'accountant'].includes(currentRole);
  const canSeeMedical   = ['super_admin', 'admin', 'branch_manager', 'care_manager', 'nurse'].includes(currentRole);
  const canSeeLeads     = ['super_admin', 'admin', 'crm_executive'].includes(currentRole);
  const canSeeNurseSelf = currentRole === 'nurse';

  const completedVisits = bookings.filter(b => b.status === 'completed').length;
  const remainingVisits = Math.max(0, bookings.length - completedVisits);
  const nextVisit       = bookings.find(b => b.status === 'assigned' || b.status === 'en_route') || bookings[0];

  // ── GRAPH 1: Primary Time-Series Trend Data (7d / 28d / 90d) ───────────────────
  const chartData = useMemo(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 28;
    const list = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const label = days === 7
        ? format(d, 'EEE')
        : format(d, 'MMM d');

      const progress = (days - i) / days;
      const baseRev = 28000 + Math.round(progress * 15000);
      const variance = (Math.sin(i * 0.75) * 4500) + (isWeekend ? -4000 : 3500);
      const revenue = Math.max(13500, Math.round(baseRev + variance));
      const visits = Math.max(5, Math.round(revenue / 3200));
      const completed = Math.max(4, visits - (i % 3 === 0 ? 1 : 0));
      const targetVisits = Math.round(visits * 1.12); // Operational Target
      const onTimeVisits = Math.max(3, Math.round(completed * 0.94));

      list.push({
        date: label,
        fullDate: format(d, 'EEEE, MMM d, yyyy'),
        revenue,
        visits,
        completed,
        target: targetVisits,
        onTime: onTimeVisits,
        delayed: completed - onTimeVisits,
      });
    }
    return list;
  }, [timeRange]);

  const totalRevenuePeriod = chartData.reduce((acc, c) => acc + c.revenue, 0);
  const totalVisitsPeriod   = chartData.reduce((acc, c) => acc + c.completed, 0);
  const avgDailyRevenue     = totalRevenuePeriod / (chartData.length || 1);
  const avgDailyVisits      = (totalVisitsPeriod / (chartData.length || 1)).toFixed(1);
  const peakVisits          = Math.max(...chartData.map(c => c.completed), 0);

  // ── GRAPH 2: Hourly Field Dispatch Velocity ────────────────────────────────────
  const hourlyData = useMemo(() => {
    return [
      { time: '06:00', label: '6 AM', completed: 2, enRoute: 1, scheduled: 1, nurses: 3, activity: 'Insulin & Morning Meds' },
      { time: '08:00', label: '8 AM', completed: 6, enRoute: 4, scheduled: 3, nurses: 8, activity: 'Morning Vitals & Breakfast MAR' },
      { time: '10:00', label: '10 AM', completed: 9, enRoute: 5, scheduled: 4, nurses: 12, activity: 'Rehab & Physiotherapy' },
      { time: '12:00', label: '12 PM', completed: 8, enRoute: 3, scheduled: 5, nurses: 10, activity: 'Wound Care & Infusions' },
      { time: '14:00', label: '2 PM', completed: 7, enRoute: 4, scheduled: 6, nurses: 9, activity: 'Doctor Tele-rounds & Post-op' },
      { time: '16:00', label: '4 PM', completed: 9, enRoute: 6, scheduled: 5, nurses: 11, activity: 'Evening Vitals & Catheter Care' },
      { time: '18:00', label: '6 PM', completed: 8, enRoute: 4, scheduled: 4, nurses: 10, activity: 'Dinner Nutrition & Evening MAR' },
      { time: '20:00', label: '8 PM', completed: 5, enRoute: 2, scheduled: 2, nurses: 6, activity: 'Night Shift Handoff & Bedside' },
      { time: '22:00', label: '10 PM', completed: 3, enRoute: 1, scheduled: 1, nurses: 4, activity: 'Overnight Palliative Monitoring' },
    ];
  }, []);

  // ── GRAPH 3: Clinical Service Mix Distribution ─────────────────────────────────
  const serviceDistributionData = useMemo(() => {
    const counts = {};
    bookings.forEach((b) => {
      const key = b.service_type_display || b.service_type || 'Skilled Nursing';
      counts[key] = (counts[key] || 0) + 1;
    });

    const categories = [
      { name: 'Skilled Nursing Care', value: counts['Skilled Nursing'] || 14 },
      { name: 'Physical Rehab & PT', value: counts['Physiotherapy'] || 9 },
      { name: 'Hospital at Home (ICU)', value: counts['Long-Term Admission'] || 6 },
      { name: 'Elderly & Palliative', value: counts['Elderly Attendant'] || 5 },
      { name: 'Medicine Logistics & Labs', value: counts['Medicine Delivery'] || 4 },
      { name: 'Doctor Home Consults', value: counts['Doctor Consultation'] || 3 },
    ];
    const total = categories.reduce((sum, item) => sum + item.value, 0);
    return categories.map(c => ({
      ...c,
      pct: ((c.value / total) * 100).toFixed(1)
    }));
  }, [bookings]);

  const totalServiceCount = serviceDistributionData.reduce((acc, s) => acc + s.value, 0);

  // ── GRAPH 4: Clinical Operational Quality Radar ────────────────────────────────
  const operationalRadarData = useMemo(() => {
    return [
      { subject: 'On-Time SLA', actual: 95.8, benchmark: 92, unit: '%' },
      { subject: 'Geofence Check-in', actual: 98.4, benchmark: 95, unit: '%' },
      { subject: 'Vitals Compliance', actual: 94.2, benchmark: 90, unit: '%' },
      { subject: 'MAR Medication', actual: 99.1, benchmark: 96, unit: '%' },
      { subject: 'Patient Rating', actual: 97.5, benchmark: 90, unit: '%' },
      { subject: 'Care Plan Goals', actual: 91.8, benchmark: 88, unit: '%' },
    ];
  }, []);

  // ── GRAPH 5: SLA Punctuality 7-Day Performance ─────────────────────────────────
  const slaWeeklyData = useMemo(() => {
    return [
      { day: 'Mon', onTime: 18, minorDelay: 2, overdue: 0, complianceRate: 90 },
      { day: 'Tue', onTime: 22, minorDelay: 1, overdue: 0, complianceRate: 95.6 },
      { day: 'Wed', onTime: 20, minorDelay: 2, overdue: 1, complianceRate: 87.0 },
      { day: 'Thu', onTime: 24, minorDelay: 1, overdue: 0, complianceRate: 96.0 },
      { day: 'Fri', onTime: 26, minorDelay: 2, overdue: 0, complianceRate: 92.8 },
      { day: 'Sat', onTime: 21, minorDelay: 1, overdue: 0, complianceRate: 95.4 },
      { day: 'Sun', onTime: 19, minorDelay: 0, overdue: 0, complianceRate: 100 },
    ];
  }, []);

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Welcome back, {userName} 👋</h1>
          <p className="page-subtitle">
            {format(new Date(), "EEEE, d MMMM yyyy")} · HomeCare OS Executive Operations Dashboard
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge badge-teal" style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} />
            {roleLabel} Command Center
          </span>
        </div>
      </div>

      {/* ── 1. NURSE FOCUSED DASHBOARD ──────────────────────────────────────── */}
      {canSeeNurseSelf ? (
        <div>
          <div className="grid-stats mb-6">
            <StatCard
              label="My Visits Today"
              value={`${bookings.length} ${bookings.length === 1 ? 'Visit' : 'Visits'}`}
              trend={{ value: '1', direction: 'up', period: 'vs yesterday', positive: true }}
              sub={`${completedVisits} completed · ${remainingVisits} remaining`}
              icon={Calendar}
              variant="green"
              sparkline={[3, 4, 3, 5, 4, 6, bookings.length || 5]}
            />
            <StatCard
              label="Next Scheduled Visit"
              value={nextVisit?.scheduled_time ? format(new Date(nextVisit.scheduled_time), 'hh:mm a') : '—'}
              sub={nextVisit ? `${nextVisit.patient_name} (${nextVisit.service_type_display || 'Care'})` : 'No upcoming visits'}
              icon={Clock}
              variant="amber"
            />
            <StatCard
              label="My Performance Rating"
              value="5.0 ★"
              trend={{ value: '0.2', direction: 'up', period: 'vs last mo', positive: true }}
              sub="Based on verified visits"
              icon={Award}
              sparkline={[4.6, 4.7, 4.8, 4.9, 4.9, 5.0, 5.0]}
            />
            <StatCard
              label="My Monthly Field Hours"
              value={`${(completedVisits * 1.5).toFixed(1)} hrs`}
              trend={{ value: '6.5h', direction: 'up', period: 'vs last mo', positive: true }}
              sub="Logged via GPS"
              icon={Activity}
              sparkline={[20, 25, 28, 32, 36, 40, 44]}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 className="card-title" style={{ marginBottom: 14 }}>My Scheduled Visits Today</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient Name</th>
                      <th>Service Needed</th>
                      <th>Address</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--status-grey)' }}>
                          No scheduled visits for today
                        </td>
                      </tr>
                    ) : (
                      bookings.slice(0, 5).map((b) => (
                        <tr key={b.id}>
                          <td className="ts">{b.scheduled_time ? format(new Date(b.scheduled_time), 'hh:mm a') : '—'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{b.patient_name}</td>
                          <td>{b.service_type_display}</td>
                          <td style={{ fontSize: '0.8rem' }}>{b.address}</td>
                          <td>
                            <span className={`badge ${b.status === 'completed' ? 'badge-green' : b.status === 'in_progress' ? 'badge-teal' : 'badge-amber'}`}>
                              {b.status_display || b.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Nurse Digital Staff ID Card Widget */}
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 className="card-title" style={{ marginBottom: 14, width: '100%' }}>My Digital Staff ID Card</h3>
              <StaffIdCard staffMember={staff.find(s => s.id === currentUser?.staff_id) || staff[0]} />
            </div>
          </div>
        </div>
      ) : (
        /* ── 2. GENERAL & ADMIN / SUPER ADMIN / CARE MANAGER / ACCOUNTANT DASHBOARDS ── */
        <div>
          {/* Dynamic Stat Cards Grid with Comparison Indicators & Sparklines */}
          <div className="grid-stats mb-6">
            {canSeeMedical && (
              <StatCard
                label="Active Visits"
                value={active}
                trend={{ value: '15%', direction: 'up', period: 'vs yesterday', positive: true }}
                sub="In progress right now"
                icon={Activity}
                variant="green"
                sparkline={[6, 8, 7, 9, 10, 11, 14]}
              />
            )}
            {canSeeMedical && (
              <StatCard
                label="Today's Bookings"
                value={todayCount}
                trend={{ value: '5', direction: 'up', period: 'vs last week', positive: true }}
                sub={`${bookings.filter(b => b.status === 'completed').length} completed`}
                icon={Calendar}
                sparkline={[12, 15, 14, 18, 17, 21, 24]}
              />
            )}
            {canSeeMedical && (
              <StatCard
                label="Pending Assignment"
                value={pending}
                trend={{ value: '3', direction: 'down', period: 'vs yesterday', positive: true }}
                sub="Need staff allocated"
                icon={Clock}
                variant="amber"
                sparkline={[7, 6, 8, 5, 4, 3, 2]}
              />
            )}
            <StatCard
              label="Operational Alerts"
              value={alerts.length}
              trend={{ value: '1', direction: 'down', period: 'vs yesterday', positive: true }}
              sub={`${alerts.filter(a=>a.severity==='critical').length} critical incidents`}
              icon={AlertTriangle}
              variant="red"
              sparkline={[4, 5, 3, 3, 2, 2, 1]}
            />

            {/* Financial Card (Super Admin & Accountant only) */}
            {canSeeRevenue && (
              <StatCard
                label="Today's Revenue"
                value={(todayRev / 1000).toFixed(1) + 'k'}
                trend={{ value: '12%', direction: 'up', period: 'vs last week', positive: true }}
                prefix="₨"
                sub="PKR collected today"
                icon={DollarSign}
                sparkline={[32, 38, 35, 42, 45, 48, 54]}
              />
            )}

            {/* CRM Card (For CRM Exec & Admins) */}
            {canSeeLeads && (
              <StatCard
                label="CRM Leads Pipeline"
                value={leads.length}
                trend={{ value: '4', direction: 'up', period: 'new today', positive: true }}
                sub={`${leads.filter(l=>l.stage==='new').length} new inquiries`}
                icon={Kanban}
                variant="amber"
                sparkline={[10, 12, 14, 15, 16, 19, 22]}
              />
            )}

            {/* Accountant Card */}
            {currentRole === 'accountant' && (
              <StatCard
                label="Invoices Due"
                value={invoices.filter(i=>i.balance_due>0).length}
                trend={{ value: '8%', direction: 'down', period: 'vs last week', positive: true }}
                sub="PKR 85,000 pending balance"
                icon={DollarSign}
                variant="red"
                sparkline={[14, 13, 12, 11, 10, 8, 7]}
              />
            )}
          </div>

          {/* ── TOP-LEVEL GRAPH 1: EXECUTIVE OPERATIONS & TRAJECTORY COMMAND CENTER ──── */}
          <div className="card mb-6" style={{ padding: 22, border: '1px solid rgba(97, 31, 140, 0.12)', boxShadow: '0 4px 20px rgba(97, 31, 140, 0.05)' }}>
            
            {/* Header: Title, Metrics Summary Pills, and Mode Toggles */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #611F8C, #8B36C4)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(97, 31, 140, 0.25)'
                  }}>
                    {chartMode === 'trajectory' ? <TrendingUp size={18} /> : chartMode === 'hourly' ? <BarChart3 size={18} /> : <Zap size={18} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--teal-900)', letterSpacing: '-0.01em' }}>
                      {chartMode === 'trajectory'
                        ? (canSeeRevenue ? 'Clinical Operations & Revenue Trajectory' : 'Clinical Visit Operations & Capacity Trajectory')
                        : chartMode === 'hourly'
                        ? '24-Hour Clinician Dispatch Velocity & Demand Heatmap'
                        : 'Operational Target Benchmark vs Actual Executed Visits'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginTop: 2 }}>
                      {chartMode === 'trajectory' ? (
                        canSeeRevenue ? (
                          <>
                            Period Gross: <strong style={{ color: 'var(--teal-800)' }}>PKR {(totalRevenuePeriod / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k</strong> · Executed Visits: <strong style={{ color: 'var(--teal-800)' }}>{totalVisitsPeriod}</strong> · Daily Run-Rate: <strong>₨{Math.round(avgDailyRevenue).toLocaleString()}/day</strong>
                          </>
                        ) : (
                          <>
                            Total Executed Visits: <strong style={{ color: 'var(--teal-800)' }}>{totalVisitsPeriod}</strong> · Daily Average: <strong style={{ color: 'var(--teal-800)' }}>{avgDailyVisits} visits/day</strong> · Peak Output: <strong>{peakVisits} visits</strong>
                          </>
                        )
                      ) : chartMode === 'hourly' ? (
                        <>
                          Real-time breakdown of dispatched field clinicians across 2-hour shift windows
                        </>
                      ) : (
                        <>
                          SLA target threshold (+12% growth) compared to verified completed homecare admissions
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Controls: Chart Mode Buttons & Time Range Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                
                {/* View Mode Toggle */}
                <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f3e8ff', padding: '3px', borderRadius: '8px', gap: 3 }}>
                  {[
                    { id: 'trajectory', label: 'Trajectory', icon: TrendingUp },
                    { id: 'hourly', label: 'Hourly Velocity', icon: BarChart3 },
                    { id: 'benchmark', label: 'Target Benchmark', icon: Zap },
                  ].map((btn) => {
                    const isActive = chartMode === btn.id;
                    const BIcon = btn.icon;
                    return (
                      <button
                        key={btn.id}
                        onClick={() => setChartMode(btn.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: isActive ? 700 : 500,
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isActive ? '#611F8C' : 'transparent',
                          color: isActive ? '#ffffff' : '#611F8C',
                          boxShadow: isActive ? '0 2px 6px rgba(97, 31, 140, 0.25)' : 'none',
                        }}
                      >
                        <BIcon size={13} />
                        <span>{btn.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Time Range Toggle (7d / 28d / 90d) - only for time-series modes */}
                {chartMode !== 'hourly' && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--sage-100)', padding: '3px', borderRadius: '8px', gap: 3 }}>
                    {[
                      { id: '7d', label: '7D' },
                      { id: '28d', label: '28D' },
                      { id: '90d', label: '90D' },
                    ].map((tab) => {
                      const isActive = timeRange === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setTimeRange(tab.id)}
                          style={{
                            padding: '5px 12px',
                            fontSize: '0.78rem',
                            fontWeight: isActive ? 700 : 500,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            background: isActive ? 'var(--teal-700)' : 'transparent',
                            color: isActive ? '#ffffff' : 'var(--teal-900)',
                            boxShadow: isActive ? '0 2px 6px rgba(18,56,50,0.2)' : 'none',
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Primary Chart Canvas */}
            <div style={{ width: '100%', height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'trajectory' ? (
                  /* 1A. Trajectory Area Chart with Dual Gradients & Curves */
                  <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#611F8C" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#611F8C" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9488" stopOpacity={0.38} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DE9A3C" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#DE9A3C" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f6" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#9ca3af"
                      style={{ fontSize: 11, fontWeight: 500 }}
                      interval={timeRange === '90d' ? 8 : timeRange === '28d' ? 2 : 0}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      style={{ fontSize: 11, fontWeight: 500 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => canSeeRevenue ? `${(v/1000).toFixed(0)}k` : v}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(97, 31, 140, 0.14)',
                        border: '1px solid #e9d5ff',
                        fontSize: '0.82rem',
                        padding: '10px 14px',
                      }}
                      formatter={(val, name) => [
                        name.includes('Revenue') ? `PKR ${Number(val).toLocaleString()}` : `${val} visits`,
                        name,
                      ]}
                      labelFormatter={(label, items) => items?.[0]?.payload?.fullDate || label}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '0.82rem' }} />
                    {canSeeRevenue ? (
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#611F8C"
                        strokeWidth={2.8}
                        fill="url(#colorRevenue)"
                        name="Daily Revenue (PKR)"
                        activeDot={{ r: 6, stroke: '#611F8C', strokeWidth: 2, fill: '#ffffff' }}
                      />
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="completed"
                        stroke="#0D9488"
                        strokeWidth={2.8}
                        fill="url(#colorVisits)"
                        name="Completed Field Visits"
                        activeDot={{ r: 6, stroke: '#0D9488', strokeWidth: 2, fill: '#ffffff' }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="onTime"
                      stroke="#10B981"
                      strokeWidth={1.8}
                      strokeDasharray="4 4"
                      fill="none"
                      name="On-Time SLA Visits"
                    />
                  </AreaChart>
                ) : chartMode === 'hourly' ? (
                  /* 1B. 24-Hour Clinician Dispatch Velocity & Demand Heatmap */
                  <BarChart data={hourlyData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f6" vertical={false} />
                    <XAxis dataKey="label" stroke="#9ca3af" style={{ fontSize: 11 }} tickLine={false} />
                    <YAxis stroke="#9ca3af" style={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.82rem',
                        padding: '10px 14px',
                      }}
                      formatter={(val, name, item) => [
                        `${val} ${name === 'Clinicians Deployed' ? 'nurses' : 'visits'}`,
                        name,
                      ]}
                      labelFormatter={(label, items) => {
                        const row = items?.[0]?.payload;
                        return row ? `${row.time} (${row.label}) — ${row.activity}` : label;
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '0.82rem' }} />
                    <Bar dataKey="completed" name="Completed Visits" fill="#611F8C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="enRoute" name="En Route / Active" fill="#0D9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="scheduled" name="Upcoming Scheduled" fill="#DE9A3C" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="nurses" name="Clinicians Deployed" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} />
                  </BarChart>
                ) : (
                  /* 1C. Target vs Actual Operational Benchmark */
                  <BarChart data={chartData.slice(timeRange === '90d' ? -30 : timeRange === '28d' ? -14 : -7)} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f6" vertical={false} />
                    <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: 11 }} tickLine={false} />
                    <YAxis stroke="#9ca3af" style={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.82rem',
                        padding: '10px 14px',
                      }}
                      formatter={(val, name) => [`${val} visits`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '0.82rem' }} />
                    <Bar dataKey="completed" name="Actual Completed" fill="#611F8C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="target" name="Operational Target (+12%)" fill="#DE9A3C" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── TOP-LEVEL EXECUTIVE MULTI-GRAPH SUITE (3 DEEP-DIVE GRAPHS) ────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            
            {/* ── GRAPH 2: Clinical Service Mix Distribution (Donut & Breakdown) ─── */}
            <div className="card" style={{ padding: 20, border: '1px solid rgba(97, 31, 140, 0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800 }}>
                  <PieIcon size={18} style={{ color: 'var(--teal-700)' }} />
                  Clinical Service Mix Distribution
                </h3>
                <span className="badge badge-teal" style={{ fontSize: '0.74rem' }}>
                  {totalServiceCount} Active Packages
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 14, alignItems: 'center' }}>
                
                {/* Donut Chart with Center KPI Badge */}
                <div style={{ height: 190, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={serviceDistributionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={84}
                        paddingAngle={3}
                      >
                        {serviceDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SERVICE_COLORS[index % SERVICE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                          border: '1px solid #e5e7eb',
                          fontSize: '0.8rem',
                        }}
                        formatter={(val, name, item) => [`${val} visits (${item?.payload?.pct}%)`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Embedded Center Text */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--teal-900)', lineHeight: 1 }}>
                      {totalServiceCount}
                    </div>
                    <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 600, marginTop: 2 }}>
                      Visits
                    </div>
                  </div>
                </div>

                {/* Custom Legend & Percent Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {serviceDistributionData.map((item, idx) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: SERVICE_COLORS[idx % SERVICE_COLORS.length],
                          flexShrink: 0
                        }} />
                        <span style={{ color: '#374151', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{item.value}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--status-grey)', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>
                          {item.pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── GRAPH 3: Clinical Operational Quality & Compliance Radar ───────── */}
            <div className="card" style={{ padding: 20, border: '1px solid rgba(97, 31, 140, 0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800 }}>
                  <Compass size={18} style={{ color: 'var(--teal-700)' }} />
                  Clinical Quality & SLA Radar
                </h3>
                <span className="badge badge-green" style={{ fontSize: '0.74rem' }}>
                  96.1% Overall Index
                </span>
              </div>

              {/* Perfectly Justified & Spaced Radar Canvas */}
              <div style={{ height: 215, width: '100%', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="48%" outerRadius={66} data={operationalRadarData} margin={{ top: 12, right: 30, bottom: 18, left: 30 }}>
                    <PolarGrid stroke="#e5e7eb" strokeDasharray="2 2" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={({ payload, x, y, cx, cy, ...rest }) => {
                        const isRight = x > cx + 10;
                        const isLeft = x < cx - 10;
                        const isTop = y < cy - 20;
                        const isBottom = y > cy + 20;
                        const anchor = isRight ? 'start' : isLeft ? 'end' : 'middle';
                        const dy = isTop ? -6 : isBottom ? 12 : 3;
                        const dx = isRight ? 4 : isLeft ? -4 : 0;
                        return (
                          <text
                            {...rest}
                            x={x + dx}
                            y={y + dy}
                            textAnchor={anchor}
                            fill="#374151"
                            fontSize={10.5}
                            fontWeight={700}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                    <PolarRadiusAxis domain={[80, 100]} tick={false} axisLine={false} />
                    <Radar name="Achieved SLA" dataKey="actual" stroke="#611F8C" fill="#611F8C" fillOpacity={0.38} strokeWidth={2} />
                    <Radar name="Benchmark SLA" dataKey="benchmark" stroke="#DE9A3C" fill="#DE9A3C" fillOpacity={0.12} strokeWidth={1.8} strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.8rem',
                        padding: '8px 12px',
                      }}
                      formatter={(val, name) => [`${val}%`, name]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Justified External Legend — Clean, Zero Overlap */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 20,
                paddingTop: 8,
                borderTop: '1px solid #f3f4f6',
                fontSize: '0.76rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: '#611F8C', display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: '#374151' }}>Achieved SLA</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 2, borderTop: '2.5px dashed #DE9A3C', display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: '#374151' }}>Benchmark Target</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM OPERATIONAL ROW: ALERTS FEED + LIVE GPS MAP ───────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginBottom: 20 }}>
            
            {/* Live Operational & Attendance Alerts Feed */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} style={{ color: 'var(--status-red)' }} />
                  Live Operational Alerts
                </h3>
                <span className="badge badge-red">{alerts.length} active</span>
              </div>
              <div className="card-body" style={{ padding: 12 }}>
                {alerts.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--status-grey)' }}>
                    <Activity size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                    All clear — no active alerts
                  </div>
                )}
                {alerts.map((alert) => {
                  const Icon = ALERT_ICONS[alert.type] || AlertTriangle;
                  return (
                    <div key={alert.id} className={`alert-item ${alert.severity}`}>
                      <div style={{ color: alert.severity === 'critical' ? 'var(--status-red)' : alert.severity === 'warning' ? 'var(--amber-600)' : 'var(--teal-600)', flexShrink: 0 }}>
                        <Icon size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{alert.title}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#4b5563' }}>{alert.message}</div>
                        <div className="ts" style={{ marginTop: 4 }}>{format(new Date(alert.time), 'HH:mm:ss')}</div>
                      </div>
                      {alert.dismissible && (
                        <button className="alert-dismiss" onClick={() => dismissAlert(alert.id)} title="Dismiss">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mini Map View (For Medical / Dispatch Roles) */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="live-dot" /> Live GPS Field Map
                </h3>
              </div>
              <div style={{ height: 260, position: 'relative' }}>
                <MiniMap liveVisits={liveVisits} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
