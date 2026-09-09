import React from 'react';
import {
  Activity, Calendar, Clock, AlertTriangle, DollarSign,
  X, Siren, Truck, Package, Users, TrendingUp, Award, Kanban, CheckCircle, Heart
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import useStore from '../store/useStore';
import StaffIdCard from '../components/StaffIdCard';
import { TREND_DATA, ROLE_CONFIG } from '../data/mockData';
import MiniMap from '../components/MiniMap';
import { format } from 'date-fns';

function StatCard({ label, value, sub, icon: Icon, variant, prefix }) {
  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {prefix && <span style={{ fontSize: '1.2rem', marginRight: 2 }}>{prefix}</span>}
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {Icon && <div className="stat-icon"><Icon size={52} /></div>}
    </div>
  );
}

const ALERT_ICONS = { sos: Siren, late: Truck, stock: Package, pending: Users };

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

  const roleLabel = ROLE_CONFIG[currentRole]?.label || 'User';
  const userName  = currentUser?.full_name || roleLabel;
  const today     = new Date().toDateString();

  const active      = liveVisits.filter((v) => v.status === 'in_progress').length;
  const todayCount  = bookings.filter((b) => new Date(b.scheduled_time).toDateString() === today).length;
  const pending     = bookings.filter((b) => b.status === 'pending').length;
  const todayRev    = bookings
    .filter((b) => b.status === 'completed' && new Date(b.scheduled_time).toDateString() === today)
    .reduce((s, b) => s + b.amount_paid, 0);

  // Allowed widget checks based on role (Requirement 16)
  const canSeeRevenue   = ['super_admin', 'admin', 'branch_manager', 'accountant'].includes(currentRole);
  const canSeeMedical   = ['super_admin', 'admin', 'branch_manager', 'care_manager', 'nurse'].includes(currentRole);
  const canSeeLeads     = ['super_admin', 'admin', 'crm_executive'].includes(currentRole);
  const canSeeNurseSelf = currentRole === 'nurse';

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Welcome back, {userName} 👋</h1>
          <p className="page-subtitle">
            {format(new Date(), "EEEE, d MMMM yyyy")} · Customized {roleLabel} Operations Overview
          </p>
        </div>
        <span className="badge badge-teal" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Role: {roleLabel} Dashboard
        </span>
      </div>

      {/* ── 1. NURSE FOCUSED DASHBOARD ──────────────────────────────────────── */}
      {canSeeNurseSelf ? (
        <div>
          <div className="grid-stats mb-6">
            <StatCard label="My Visits Today" value="3 Visits" sub="2 completed · 1 remaining" icon={Calendar} variant="green" />
            <StatCard label="Next Scheduled Visit" value="02:30 PM" sub="Ahmed Hassan (Wound Care)" icon={Clock} variant="amber" />
            <StatCard label="My Performance Rating" value="4.9 ★" sub="Based on 48 patient reviews" icon={Award} />
            <StatCard label="My Monthly Field Hours" value="168.5 hrs" sub="+8.5 hrs Overtime" icon={Activity} />
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
                    {bookings.slice(0, 3).map((b, idx) => (
                      <tr key={b.id}>
                        <td className="ts">{idx === 0 ? '09:00 AM' : idx === 1 ? '11:30 AM' : '02:30 PM'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{b.patient_name}</td>
                        <td>{b.service_type_display}</td>
                        <td style={{ fontSize: '0.8rem' }}>{b.address}</td>
                        <td>
                          <span className={`badge ${idx === 0 ? 'badge-green' : idx === 1 ? 'badge-green' : 'badge-amber'}`}>
                            {idx === 0 ? 'Completed' : idx === 1 ? 'Completed' : 'Upcoming'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Nurse Digital Staff ID Card Widget */}
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 className="card-title" style={{ marginBottom: 14, width: '100%' }}>My Digital Staff ID Card</h3>
              <StaffIdCard staffMember={staff[0]} />
            </div>
          </div>
        </div>
      ) : (
        /* ── 2. GENERAL & ADMIN / CARE MANAGER / ACCOUNTANT / CRM DASHBOARDS ── */
        <div>
          {/* Dynamic Stat Cards Grid */}
          <div className="grid-stats mb-6">
            {canSeeMedical && <StatCard label="Active Visits" value={active} sub="In progress right now" icon={Activity} variant="green" />}
            {canSeeMedical && <StatCard label="Today's Bookings" value={todayCount} sub={`${bookings.filter(b => b.status === 'completed').length} completed`} icon={Calendar} />}
            {canSeeMedical && <StatCard label="Pending Assignment" value={pending} sub="Need staff allocated" icon={Clock} variant="amber" />}
            <StatCard label="Operational Alerts" value={alerts.length} sub={`${alerts.filter(a=>a.severity==='critical').length} critical`} icon={AlertTriangle} variant="red" />

            {/* Financial Card (Omitted for Care Manager / Nurse / CRM Exec) */}
            {canSeeRevenue && (
              <StatCard label="Today's Revenue" value={(todayRev/1000).toFixed(1) + 'k'} prefix="₨" sub="PKR collected today" icon={DollarSign} />
            )}

            {/* CRM Card (For CRM Exec & Admins) */}
            {canSeeLeads && (
              <StatCard label="CRM Leads Pipeline" value={leads.length} sub={`${leads.filter(l=>l.stage==='new').length} new inquiries`} icon={Kanban} variant="amber" />
            )}

            {/* Accountant Card */}
            {currentRole === 'accountant' && (
              <StatCard label="Invoices Due" value={invoices.filter(i=>i.balance_due>0).length} sub="PKR 85,000 pending balance" icon={DollarSign} variant="red" />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 20 }}>
            
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

          {/* Revenue Trend Chart (Only for Revenue Allowed Roles) */}
          {canSeeRevenue && (
            <div className="card mb-6" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--teal-800)', marginBottom: 16 }}>
                28-Day Operations & Revenue Trend
              </div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={TREND_DATA}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: 11 }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#611F8C" fill="#611F8C" fillOpacity={0.15} name="Revenue (PKR)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
