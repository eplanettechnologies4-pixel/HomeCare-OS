import React, { useState } from 'react';
import { Calendar, Download, TrendingUp, DollarSign, Activity, Users, UserCheck } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import useStore from '../store/useStore';
import UniversalPrintButton from '../components/UniversalPrintButton';
import { DAILY_REVENUE, REVENUE_BY_SERVICE } from '../data/mockData';

const DONUT_COLORS = ['#611F8C', '#8B36C4', '#A855F7', '#C084FC', '#DE9A3C'];

export default function Analytics() {
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo]     = useState('2026-08-28');

  const bookings = useStore((s) => s.bookings);
  const patients = useStore((s) => s.patients);
  const staff    = useStore((s) => s.staff);

  const totalRevenue = bookings.reduce((sum, b) => sum + b.amount_paid, 0);
  const totalVisits  = bookings.length;
  const activePatients = patients.filter(p => p.is_active).length;
  const activeNurses   = staff.filter(s => ['nurse', 'doctor'].includes(s.role)).length;

  const topServicesData = [
    { name: 'Nursing Care', value: 45 },
    { name: 'Physiotherapy', value: 25 },
    { name: 'Elderly Care', value: 15 },
    { name: 'Baby Care', value: 10 },
    { name: 'Others', value: 5 },
  ];

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Executive metrics, revenue trends, service breakdown, and operational efficiency</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <UniversalPrintButton type="analytics" data={{ totalRevenue, totalVisits, activePatients }} label="Export PDF Report" variant="primary" size="sm" />
        </div>
      </div>

      {/* Date Range Picker Bar */}
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--teal-700)' }}>
            <Calendar size={16} /> Date Range:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>to</span>
            <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm">Apply Filter</button>
        </div>
      </div>

      {/* 4 Stat Cards with % change */}
      <div className="grid-stats" style={{ marginBottom: 20 }}>
        <div className="stat-card green">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">PKR {(totalRevenue/1000).toFixed(1)}k</div>
          <div className="stat-sub" style={{ color: 'var(--status-green)', fontWeight: 600 }}>↑ +14.2% vs prev period</div>
          <div className="stat-icon"><DollarSign size={52} /></div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Visits</div>
          <div className="stat-value">{totalVisits}</div>
          <div className="stat-sub" style={{ color: 'var(--status-green)', fontWeight: 600 }}>↑ +8.5% vs prev period</div>
          <div className="stat-icon"><Activity size={52} /></div>
        </div>

        <div className="stat-card amber">
          <div className="stat-label">Active Patients</div>
          <div className="stat-value">{activePatients}</div>
          <div className="stat-sub" style={{ color: 'var(--status-green)', fontWeight: 600 }}>↑ +5.0% census growth</div>
          <div className="stat-icon"><Users size={52} /></div>
        </div>

        <div className="stat-card green">
          <div className="stat-label">Active Field Staff</div>
          <div className="stat-value">{activeNurses}</div>
          <div className="stat-sub" style={{ color: 'var(--status-grey)' }}>100% capacity deployed</div>
          <div className="stat-icon"><UserCheck size={52} /></div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Revenue Trend Line Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Revenue Trend</h3>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={DAILY_REVENUE}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sage-200)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} interval={5} />
                <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                <Tooltip formatter={(v) => `PKR ${v.toLocaleString()}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="#611F8C" strokeWidth={2.5} dot={false} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Services Donut Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top Services Breakdown (%)</h3>
          </div>
          <div className="card-body" style={{ height: 260, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topServicesData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {topServicesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
