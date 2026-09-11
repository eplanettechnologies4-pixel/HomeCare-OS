import React, { useState } from 'react';
import { LayoutDashboard, Calendar, FileText, DollarSign, MessageSquare, LogOut, Heart, Phone, Download, Clock, Activity } from 'lucide-react';
import useStore from '../store/useStore';
import { format } from 'date-fns';

import NursesNotesFormA from '../components/NursesNotesFormA';
import VitalsRecordFormB from '../components/VitalsRecordFormB';

export default function FamilyPortal() {
  const patients    = useStore((s) => s.patients);
  const allBookings = useStore((s) => s.bookings);
  const allInvoices = useStore((s) => s.invoices);
  const allReports  = useStore((s) => s.dailyReports);
  const patient     = patients[0] || null;
  const bookings    = patient ? allBookings.filter(b => b.patient_name === patient.full_name || b.patient?.id === patient.id) : [];
  const invoices    = patient ? allInvoices.filter(i => i.patient_id === patient.id) : [];
  const dailyReports= patient ? allReports.filter(r => r.patient_id === patient.id) : [];
  const setCurrentRole = useStore((s) => s.setCurrentRole);
  const setActivePage = useStore((s) => s.setActivePage);

  const [activeTab, setActiveTab] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard',     icon: LayoutDashboard },
    { id: 'visits',    label: 'My Visits',      icon: Calendar },
    { id: 'notes',     label: 'Nurses Notes',   icon: FileText },
    { id: 'vitals',    label: 'Vitals History', icon: Activity },
    { id: 'reports',   label: 'My Reports',     icon: FileText },
    { id: 'invoices',  label: 'Invoices',       icon: DollarSign },
    { id: 'messages',  label: 'Messages',       icon: MessageSquare },
  ];

  const handleExitPortal = () => {
    setCurrentRole('super_admin');
    setActivePage('overview');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sage-50)', fontFamily: 'var(--font-body)', position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      
      {/* ── Separate Family Portal Sidebar ────────────────────────────── */}
      <aside style={{ width: 240, background: 'var(--teal-800)', color: 'white', display: 'flex', flexDirection: 'column', padding: 20 }}>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid white' }} />
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: 'white', margin: 0, fontWeight: 800 }}>
              e<span style={{ color: '#FDE047' }}>Health</span> Family
            </h1>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: 600 }}>
            HOSPITAL AT HOME · Patient Portal
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === id ? 'rgba(222,154,60,0.2)' : 'transparent',
                color: activeTab === id ? 'var(--amber-400)' : 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontWeight: activeTab === id ? 700 : 500,
                fontSize: '0.88rem',
                textAlign: 'left'
              }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>

        <button
          onClick={handleExitPortal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.8rem',
            marginTop: 'auto'
          }}
        >
          <LogOut size={14} /> Exit Family Portal
        </button>
      </aside>

      {/* ── Family Portal Main Content ──────────────────────────────────── */}
      <main style={{ flex: 1, padding: 30, maxWidth: 1200 }}>
        {!patient ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--status-grey)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', marginBottom: 8 }}>
              No Active Patient Profile Linked
            </h2>
            <p style={{ fontSize: '0.9rem', maxWidth: 450, margin: '0 auto 20px' }}>
              No patient records were found in the system for this portal session. You can return to the main dashboard or contact your care manager.
            </p>
            <button className="btn btn-primary" onClick={handleExitPortal} style={{ margin: '0 auto' }}>
              Return to Dashboard
            </button>
          </div>
        ) : (
          <>
            {/* Patient Banner */}
            <div className="card" style={{ padding: 20, marginBottom: 24, borderLeft: '5px solid var(--amber-500)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Welcome back, Family of</div>
                  <h2 style={{ fontFamily: 'var(--font-heading)', margin: '2px 0 0', color: 'var(--teal-800)', fontSize: '1.4rem' }}>{patient.full_name}</h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--status-grey)', marginTop: 4 }}>
                    MR#: <span className="ts">{patient.mr_number}</span> · Care Manager: {patient.care_manager_name || 'Assigned Coordinator'}
                  </div>
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>Active Care Plan</span>
              </div>
            </div>

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="grid-2" style={{ gap: 20 }}>
                {/* Upcoming Visits */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', marginBottom: 14 }}>Upcoming Scheduled Visits</div>
                  {bookings.filter(b => ['pending', 'assigned', 'en_route'].includes(b.status)).length === 0 ? (
                    <div style={{ color: 'var(--status-grey)', fontSize: '0.85rem' }}>No upcoming visits scheduled.</div>
                  ) : (
                    bookings.filter(b => ['pending', 'assigned', 'en_route'].includes(b.status)).map(b => (
                      <div key={b.id} style={{ padding: 12, borderRadius: 8, background: 'var(--sage-50)', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.88rem' }}>{b.service_type_display}</span>
                          <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>{b.status_display}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>
                          Scheduled: <span className="ts">{format(new Date(b.scheduled_time), 'dd MMM yyyy HH:mm')}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--teal-700)', marginTop: 4 }}>
                          Staff: {b.staff_name || 'Assigned Staff'}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recent Care Reports */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)', marginBottom: 14 }}>Recent Visit Reports</div>
                  {dailyReports.length === 0 ? (
                    <div style={{ color: 'var(--status-grey)', fontSize: '0.85rem' }}>No visit reports recorded yet.</div>
                  ) : (
                    dailyReports.map(r => (
                      <div key={r.id} style={{ padding: 12, borderRadius: 8, background: 'var(--sage-50)', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.85rem' }}>{r.visit_type || 'Visit Report'}</span>
                          <span className="ts" style={{ fontSize: '0.75rem' }}>{r.date}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#374151' }}>{r.summary || r.notes}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Visits Tab */}
            {activeTab === 'visits' && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 16px' }}>All Patient Visits</h3>
                {bookings.length === 0 ? (
                  <div style={{ color: 'var(--status-grey)', fontSize: '0.85rem', padding: '16px 0' }}>No visits recorded yet.</div>
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Service</th>
                          <th>Staff</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map(b => (
                          <tr key={b.id}>
                            <td className="ts">{b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM yyyy HH:mm') : '—'}</td>
                            <td>{b.service_type_display}</td>
                            <td>{b.staff_name || 'Unassigned'}</td>
                            <td><span className={`badge ${b.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>{b.status_display || b.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab (Form A) */}
            {activeTab === 'notes' && (
              <div className="card" style={{ padding: 24 }}>
                <NursesNotesFormA patientId={patient.id} />
              </div>
            )}

            {/* Vitals Tab (Form B) */}
            {activeTab === 'vitals' && (
              <div className="card" style={{ padding: 24 }}>
                <VitalsRecordFormB patientId={patient.id} />
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 16px' }}>Billing Statements</h3>
                {invoices.length === 0 ? (
                  <div style={{ color: 'var(--status-grey)', fontSize: '0.85rem' }}>No billing invoices found.</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Paid</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="ts">{inv.invoice_number || inv.id}</td>
                          <td className="ts">{inv.date || '—'}</td>
                          <td className="ts">PKR {inv.total_amount?.toLocaleString()}</td>
                          <td className="ts" style={{ color: 'var(--status-green)' }}>PKR {inv.amount_paid?.toLocaleString()}</td>
                          <td><span className={`badge ${inv.status==='paid'?'badge-green':'badge-amber'}`}>{inv.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 14px' }}>Messages with Client Care Manager</h3>
                <div style={{ background: 'var(--sage-50)', padding: 14, borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-800)' }}>{patient.care_manager_name || 'Care Coordinator'}</div>
                  <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 4 }}>
                    "Hello! Your scheduled care visits and treatment updates will be posted here. Please message us if you need any adjustments or assistance."
                  </div>
                </div>
                <textarea className="form-textarea" placeholder="Type a message to your care manager..." rows={3} />
                <button className="btn btn-primary" style={{ marginTop: 10 }}>Send Message</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
