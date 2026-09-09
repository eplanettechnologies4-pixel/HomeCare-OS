import React from 'react';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import useStore from '../store/useStore';
import { REVENUE_BY_SERVICE, DAILY_REVENUE } from '../data/mockData';
import { format } from 'date-fns';

const PIE_COLORS = ['#611F8C', '#8B36C4', '#A855F7', '#DE9A3C'];
const PAYMENT_BADGE = { advance: 'badge-green', pending: 'badge-red', partial: 'badge-amber', waived: 'badge-grey' };

export default function Accounts() {
  const bookings = useStore((s) => s.bookings);

  const totalBilled = bookings.reduce((s, b) => s + b.amount, 0);
  const totalPaid   = bookings.reduce((s, b) => s + b.amount_paid, 0);
  const totalDue    = bookings.reduce((s, b) => s + b.balance_due, 0);

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Payment status, revenue breakdown, and financial overview</p>
        </div>
        <button className="btn btn-ghost"><Download size={15} /> Export CSV</button>
      </div>

      {/* Summary Cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Billed',  value: `PKR ${(totalBilled/1000).toFixed(1)}k`, sub: 'All time', color: 'var(--teal-700)' },
          { label: 'Total Collected', value: `PKR ${(totalPaid/1000).toFixed(1)}k`, sub: `${Math.round(totalPaid/totalBilled*100)}% collected`, color: 'var(--status-green)' },
          { label: 'Outstanding',  value: `PKR ${(totalDue/1000).toFixed(1)}k`,   sub: 'Pending collection', color: totalDue > 0 ? 'var(--status-red)' : 'var(--status-grey)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Revenue by service line */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Revenue by Service Line</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ flex: 1, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={REVENUE_BY_SERVICE} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {REVENUE_BY_SERVICE.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `PKR ${v.toLocaleString()}`} contentStyle={{ fontSize: 12, fontFamily: 'var(--font-body)', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                {REVENUE_BY_SERVICE.map((r, i) => (
                  <div key={r.service_type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--sage-100)', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i], flexShrink: 0 }} />
                      <span>{r.label}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="ts" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>PKR {r.total.toLocaleString()}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)' }}>{r.count} visits</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 30-day revenue bar */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Daily Revenue (Last 30 Days)</h3>
          </div>
          <div className="card-body" style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DAILY_REVENUE.slice(-14)} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sage-200)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#9ca3af' }} />
                <Tooltip formatter={(v) => `PKR ${v.toLocaleString()}`} contentStyle={{ fontSize: 12, fontFamily: 'var(--font-body)', borderRadius: 8 }} />
                <Bar dataKey="total" fill="#611F8C" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Payment Status Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Payment Ledger</h3>
          <button className="btn btn-ghost btn-sm"><Download size={13} /> Export</button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Patient</th><th>Service</th><th>Scheduled</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Payment</th></tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id}>
                  <td className="ts">{b.id}</td>
                  <td style={{ fontWeight: 600 }}>{b.patient_name}</td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>{b.service_type_display}</span></td>
                  <td className="ts">{(() => { try { return b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM HH:mm') : '—'; } catch(e) { return '—'; } })()}</td>
                  <td className="ts">PKR {b.amount?.toLocaleString()}</td>
                  <td className="ts" style={{ color: 'var(--status-green)', fontWeight: 600 }}>PKR {b.amount_paid?.toLocaleString()}</td>
                  <td className="ts" style={{ color: b.balance_due > 0 ? 'var(--status-red)' : 'var(--status-grey)', fontWeight: b.balance_due > 0 ? 700 : 400 }}>
                    PKR {b.balance_due?.toLocaleString()}
                  </td>
                  <td><span className={`badge ${PAYMENT_BADGE[b.payment_status] || 'badge-grey'}`} style={{ fontSize: '0.68rem' }}>{b.payment_status_display}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
