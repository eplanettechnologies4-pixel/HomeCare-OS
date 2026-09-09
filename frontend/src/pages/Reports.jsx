import React, { useState } from 'react';
import { Download, FileText, BarChart2, Users, UserCheck, Clock } from 'lucide-react';
import useStore from '../store/useStore';
import { ATTENDANCE } from '../data/mockData';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { TREND_DATA, DAILY_REVENUE } from '../data/mockData';

const REPORT_TYPES = [
  { id: 'attendance',    label: 'Staff Attendance',       icon: UserCheck, desc: 'Date range attendance, hours worked, overtime' },
  { id: 'compliance',    label: 'Visit Compliance',       icon: Clock,     desc: 'On-time %, late arrivals, no-shows' },
  { id: 'revenue',       label: 'Revenue Report',         icon: BarChart2, desc: 'Revenue by service, daily breakdown, outstanding' },
  { id: 'census',        label: 'Patient Census',         icon: Users,     desc: 'Active patients, admissions, discharges, diagnoses' },
];

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState('attendance');
  const bookings = useStore((s) => s.bookings);
  const staff    = useStore((s) => s.staff);
  const patients = useStore((s) => s.patients);

  const onTimeCount = bookings.filter(b => b.status === 'completed').length;
  const totalCompleted = bookings.filter(b => b.status === 'completed').length;
  const onTimePct = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 0;

  const complianceData = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => ({
    day: d,
    on_time: TREND_DATA[i].completed,
    late: Math.max(0, TREND_DATA[i].booked - TREND_DATA[i].completed),
  }));

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Generate and export operational reports</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost"><Download size={15} /> Export CSV</button>
          <button className="btn btn-primary"><FileText size={15} /> Export PDF</button>
        </div>
      </div>

      {/* Report type selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {REPORT_TYPES.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setSelectedReport(id)}
            style={{
              padding: '14px', borderRadius: 'var(--radius-md)',
              border: `2px solid ${selectedReport === id ? 'var(--teal-400)' : 'var(--sage-200)'}`,
              background: selectedReport === id ? 'var(--teal-50)' : 'white',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <Icon size={18} style={{ color: selectedReport===id ? 'var(--teal-600)' : 'var(--status-grey)', marginBottom: 8 }} />
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: selectedReport===id ? 'var(--teal-700)' : '#374151' }}>{label}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 3 }}>{desc}</div>
          </button>
        ))}
      </div>

      {/* ── Attendance Report ─────────────────────────────────────────────── */}
      {selectedReport === 'attendance' && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label className="form-label" style={{ marginBottom: 4 }}>Date From</label>
                <input type="date" className="form-input" style={{ width: 160 }} defaultValue="2026-08-01" />
              </div>
              <div>
                <label className="form-label" style={{ marginBottom: 4 }}>Date To</label>
                <input type="date" className="form-input" style={{ width: 160 }} defaultValue="2026-08-28" />
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-primary">Generate Report</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Staff Attendance — August 2026</h3>
              <button className="btn btn-ghost btn-sm"><Download size={13} /></button>
            </div>
            <table className="data-table">
              <thead><tr><th>Staff</th><th>Role</th><th>Days Present</th><th>Hours Worked</th><th>Overtime</th><th>Visits</th></tr></thead>
              <tbody>
                {staff.map(s => {
                  const rec = ATTENDANCE.find(a => a.staff === s.id);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                      <td><span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>{s.role_display}</span></td>
                      <td className="ts">22 / 26</td>
                      <td className="ts">{rec ? `${rec.total_hours}h` : '—'}</td>
                      <td className="ts">{rec && rec.overtime_hours > 0 ? `${rec.overtime_hours}h` : '—'}</td>
                      <td className="ts">{rec ? rec.visits_completed : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Compliance Report ──────────────────────────────────────────────── */}
      {selectedReport === 'compliance' && (
        <div>
          <div className="grid-3" style={{ marginBottom: 20 }}>
            {[
              { label: 'On-Time Rate', value: `${onTimePct}%`,  color: 'var(--status-green)' },
              { label: 'Completed',    value: totalCompleted,   color: 'var(--teal-700)' },
              { label: 'Late / No-Show', value: bookings.filter(b=>['late','no_show'].includes(b.status)).length, color: 'var(--status-red)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-grey)', textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Visit Compliance — Last 7 Days</h3></div>
            <div className="card-body" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={complianceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sage-200)" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 12, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} />
                  <Tooltip contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="on_time" name="On Time"   fill="#2D6A4F" radius={[4,4,0,0]} />
                  <Bar dataKey="late"    name="Late/Miss" fill="#DE9A3C" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Revenue Report ─────────────────────────────────────────────────── */}
      {selectedReport === 'revenue' && (
        <div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Daily Revenue Trend — Last 30 Days</h3></div>
            <div className="card-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={DAILY_REVENUE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sage-200)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} />
                  <Tooltip formatter={(v) => `PKR ${v.toLocaleString()}`} contentStyle={{ fontSize: 12, fontFamily: 'var(--font-body)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="total" stroke="#611F8C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Patient Census ─────────────────────────────────────────────────── */}
      {selectedReport === 'census' && (
        <div>
          <div className="grid-3" style={{ marginBottom: 20 }}>
            {[
              { label: 'Active Patients',       value: 6, color: 'var(--status-green)' },
              { label: 'Total Visits (Month)',   value: bookings.length, color: 'var(--teal-700)' },
              { label: 'Avg Visits / Patient',   value: (bookings.length / 6).toFixed(1), color: 'var(--amber-500)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-grey)', textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Active Patient Summary</h3></div>
            <table className="data-table">
              <thead><tr><th>MR #</th><th>Patient</th><th>Diagnosis</th><th>Visits This Month</th><th>Last Visit</th></tr></thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id}>
                    <td className="ts">{p.mr_number}</td>
                    <td style={{ fontWeight: 600 }}>{p.full_name}</td>
                    <td style={{ maxWidth: 200, fontSize: '0.82rem' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.primary_diagnosis}</div></td>
                    <td className="ts">{bookings.filter(b=>b.patient_name===p.full_name).length}</td>
                    <td className="ts">{format(new Date(), 'dd MMM yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
