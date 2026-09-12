import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Filter, X, MapPin, FileText, User, CreditCard, ChevronDown } from 'lucide-react';
import useStore from '../store/useStore';
import NurseAssignPanel from '../components/NurseAssignPanel';
import { format } from 'date-fns';

const STATUS_BADGE = {
  pending:     'badge-amber',
  assigned:    'badge-teal',
  en_route:    'badge-amber',
  in_progress: 'badge-green',
  completed:   'badge-grey',
  cancelled:   'badge-grey',
  late:        'badge-red',
  no_show:     'badge-red',
};
const PAYMENT_BADGE = { advance: 'badge-green', pending: 'badge-red', partial: 'badge-amber', waived: 'badge-grey' };

// ── New Booking Modal ─────────────────────────────────────────────────────────
function NewBookingModal({ onClose, onSubmit }) {
  const patients = useStore((s) => s.patients);
  const staff    = useStore((s) => s.staff);
  const [form, setForm] = useState({
    patient_id: '', service_type: 'short_service', scheduled_time: '', assigned_staff_id: '', notes: '', amount: '', payment_status: 'pending',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', margin: 0, color: 'var(--teal-700)' }}>New Booking</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Patient</label>
              <select className="form-select" value={form.patient_id} onChange={e => set('patient_id', e.target.value)}>
                <option value="">Select patient…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.mr_number})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Service Type</label>
              <select className="form-select" value={form.service_type} onChange={e => set('service_type', e.target.value)}>
                <option value="short_service">Short Service</option>
                <option value="medicine_delivery">Medicine Delivery</option>
                <option value="long_term">Long-Term Care</option>
                <option value="long_term_admission">Long-Term Admission</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled Date & Time</label>
              <input type="datetime-local" className="form-input" value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Assign Staff (optional)</label>
              <select className="form-select" value={form.assigned_staff_id} onChange={e => set('assigned_staff_id', e.target.value)}>
                <option value="">Assign later…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role_display})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (PKR)</label>
              <input type="number" className="form-input" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <select className="form-select" value={form.payment_status} onChange={e => set('payment_status', e.target.value)}>
                <option value="pending">Payment Pending</option>
                <option value="advance">Advance Paid</option>
                <option value="partial">Partial Payment</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" placeholder="Visit instructions, medication notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSubmit(form)}>Create Booking</button>
        </div>
      </div>
    </div>
  );
}

// ── Booking Drawer ─────────────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose }) {
  if (!booking) return null;
  const staff = useStore((s) => s.staff);
  const assignNurseToBooking = useStore((s) => s.assignNurseToBooking);
  return (
    <div>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: 0, color: 'var(--teal-700)' }}>
              Booking #{booking.id}
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 2 }}>
              {booking.service_type_display}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <span className={`badge ${STATUS_BADGE[booking.status]}`}>{booking.status_display}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div className="drawer-body">
          {/* Patient info */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <User size={15} style={{ color: 'var(--teal-500)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)' }}>Patient</span>
            </div>
            <div className="info-row"><span className="info-label">Name</span><span className="info-value">{booking.patient_name}</span></div>
            <div className="info-row"><span className="info-label">MR Number</span><span className="info-value ts">{booking.patient?.mr_number || booking.patient_mr}</span></div>
            <div className="info-row"><span className="info-label">Diagnosis</span><span className="info-value">{booking.patient?.primary_diagnosis || '—'}</span></div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MapPin size={15} style={{ color: 'var(--teal-500)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)' }}>Location</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 8 }}>{booking.address}</div>
            {booking.latitude && (
              <div style={{ height: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sage-200)' }}>
                <iframe
                  title="Patient location"
                  width="100%" height="140" style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${booking.longitude-0.01},${booking.latitude-0.01},${booking.longitude+0.01},${booking.latitude+0.01}&layer=mapnik&marker=${booking.latitude},${booking.longitude}`}
                />
              </div>
            )}
          </div>

          {/* Schedule */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <FileText size={15} style={{ color: 'var(--teal-500)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)' }}>Schedule & Notes</span>
            </div>
            <div className="info-row"><span className="info-label">Scheduled</span><span className="info-value ts">{format(new Date(booking.scheduled_time), 'dd MMM yyyy HH:mm')}</span></div>
            {booking.actual_start_time && <div className="info-row"><span className="info-label">Started</span><span className="info-value ts">{format(new Date(booking.actual_start_time), 'HH:mm')}</span></div>}
            {booking.actual_end_time && <div className="info-row"><span className="info-label">Ended</span><span className="info-value ts">{format(new Date(booking.actual_end_time), 'HH:mm')}</span></div>}
            {booking.notes && <p style={{ fontSize: '0.85rem', color: '#374151', marginTop: 8, padding: '10px 12px', background: 'var(--sage-50)', borderRadius: 6 }}>{booking.notes}</p>}
          </div>

          {/* Payment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CreditCard size={15} style={{ color: 'var(--teal-500)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)' }}>Payment</span>
            </div>
            <div className="info-row"><span className="info-label">Amount</span><span className="info-value ts">PKR {booking.amount?.toLocaleString()}</span></div>
            <div className="info-row"><span className="info-label">Paid</span><span className="info-value ts">PKR {booking.amount_paid?.toLocaleString()}</span></div>
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className={`badge ${PAYMENT_BADGE[booking.payment_status]}`}>{booking.payment_status_display}</span>
            </div>
          </div>

          {/* Nurse Assignment Panel */}
          <div style={{ marginBottom: 20 }}>
            <NurseAssignPanel
              booking={booking}
              staffList={staff}
              onConfirmAssignment={(data) => assignNurseToBooking(booking.id, data)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Bookings() {
  const bookings      = useStore((s) => s.bookings);
  const fetchBookings = useStore((s) => s.fetchBookings);
  const fetchPatients = useStore((s) => s.fetchPatients);
  const fetchStaff    = useStore((s) => s.fetchStaff);
  const addBooking    = useStore((s) => s.addBooking);
  const [selected, setSelected]     = useState(null);
  const [showNew, setShowNew]       = useState(false);
  const [filters, setFilters]       = useState({ status: '', service_type: '', search: '' });

  useEffect(() => {
    fetchBookings();
    fetchPatients();
    fetchStaff();
  }, [fetchBookings, fetchPatients, fetchStaff]);

  const filtered = useMemo(() => bookings.filter((b) => {
    if (filters.status && b.status !== filters.status) return false;
    if (filters.service_type && b.service_type !== filters.service_type) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (b.patient_name || '').toLowerCase().includes(q) ||
             (b.staff_name || '').toLowerCase().includes(q) ||
             (b.patient_mr || '').toLowerCase().includes(q);
    }
    return true;
  }), [bookings, filters]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">{filtered.length} of {bookings.length} bookings shown</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Booking
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrap" style={{ flex: '0 1 220px' }}>
          <Filter size={13} />
          <input
            className="form-input search-input"
            placeholder="Search patient, staff…"
            value={filters.search}
            onChange={(e) => setF('search', e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
        <select className="form-select" style={{ flex: '0 1 160px' }} value={filters.status} onChange={e => setF('status', e.target.value)}>
          <option value="">All Statuses</option>
          {['pending','assigned','en_route','in_progress','completed','cancelled','late'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ').replace(/\b\w/g, c=>c.toUpperCase())}</option>
          ))}
        </select>
        <select className="form-select" style={{ flex: '0 1 180px' }} value={filters.service_type} onChange={e => setF('service_type', e.target.value)}>
          <option value="">All Service Types</option>
          <option value="short_service">Short Service</option>
          <option value="medicine_delivery">Medicine Delivery</option>
          <option value="long_term">Long-Term Care</option>
          <option value="long_term_admission">Long-Term Admission</option>
        </select>
        {(filters.status || filters.service_type || filters.search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ status: '', service_type: '', search: '' })}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Status</th>
                <th>Assigned Staff</th>
                <th>Scheduled</th>
                <th>Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--teal-800)', marginBottom: 6 }}>
                      No Bookings Found
                    </div>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>
                      {filters.search || filters.status || filters.service_type
                        ? 'No bookings match the selected filters.'
                        : 'No patient bookings or visits have been created yet. Click "New Booking" above to schedule one.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} onClick={() => setSelected(b)}>
                    <td className="ts">{b.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.patient_name}</div>
                      <div className="ts">{b.patient_mr || b.patient?.mr_number}</div>
                    </td>
                    <td>
                      <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>{b.service_type_display}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[b.status] || 'badge-grey'}`}>{b.status_display}</span>
                    </td>
                    <td>
                      {b.staff_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="avatar" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                            {b.staff_name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <span style={{ fontSize: '0.85rem' }}>{b.staff_name}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--status-red)', fontSize: '0.8rem', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td className="ts">
                      {(() => {
                        try {
                          return b.scheduled_time ? format(new Date(b.scheduled_time), 'dd MMM HH:mm') : '—';
                        } catch(e) {
                          return '—';
                        }
                      })()}
                    </td>
                    <td className="ts">PKR {b.amount?.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${PAYMENT_BADGE[b.payment_status] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                        {b.payment_status_display}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {selected && <BookingDrawer booking={selected} onClose={() => setSelected(null)} />}

      {/* New Booking Modal */}
      {showNew && (
        <NewBookingModal
          onClose={() => setShowNew(false)}
          onSubmit={(form) => {
            const pObj = useStore.getState().patients.find(p => String(p.id) === String(form.patient_id));
            const sObj = useStore.getState().staff.find(s => String(s.id) === String(form.assigned_staff_id));
            const amt = Number(form.amount) || 2500;
            const paid = form.payment_status === 'advance' ? amt : 0;
            addBooking({
              id: Date.now(),
              patient: pObj,
              patient_name: pObj ? pObj.full_name : (form.patient_name || 'Patient'),
              patient_mr: pObj ? pObj.mr_number : 'MR-NEW',
              assigned_staff: sObj || null,
              staff_name: sObj ? sObj.full_name : null,
              service_type: form.service_type || 'short_service',
              service_type_display: form.service_type ? form.service_type.replace('_',' ').replace(/\b\w/g, c=>c.toUpperCase()) : 'Short Service',
              status: sObj ? 'assigned' : 'pending',
              status_display: sObj ? 'Assigned' : 'Pending',
              payment_status: form.payment_status || 'pending',
              payment_status_display: form.payment_status === 'advance' ? 'Advance Paid' : 'Payment Pending',
              scheduled_time: form.scheduled_time ? new Date(form.scheduled_time).toISOString() : new Date().toISOString(),
              address: pObj ? pObj.address : 'PWD / Soan Garden, Islamabad',
              latitude: pObj ? pObj.latitude : 33.57,
              longitude: pObj ? pObj.longitude : 73.15,
              amount: amt,
              amount_paid: paid,
              balance_due: amt - paid,
              notes: form.notes || '',
              created_at: new Date().toISOString()
            });
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}
