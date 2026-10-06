import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck, Plus, Search, Filter, AlertTriangle, CheckCircle,
  Clock, RotateCcw, Shield, DollarSign, Package, MapPin, X
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch from '../services/api';

export default function Equipment() {
  const [activeTab, setActiveTab] = useState('rentals'); // 'rentals' | 'fleet'
  const [rentals, setRentals] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lowUnitsOnly, setLowUnitsOnly] = useState(false);

  // Modals
  const [showNewRental, setShowNewRental] = useState(false);
  const [showNewEquipment, setShowNewEquipment] = useState(false);
  const [deliverModalRental, setDeliverModalRental] = useState(null);
  const [pickupModalRental, setPickupModalRental] = useState(null);

  // Form states
  const [deliverLat, setDeliverLat] = useState('33.5651');
  const [deliverLng, setDeliverLng] = useState('73.1512');
  const [deliverNotes, setDeliverNotes] = useState('');

  const [pickupLat, setPickupLat] = useState('33.5651');
  const [pickupLng, setPickupLng] = useState('73.1512');
  const [pickupNotes, setPickupNotes] = useState('');
  const [refundDeposit, setRefundDeposit] = useState(true);

  // New Rental form
  const [newPatientId, setNewPatientId] = useState('');
  const [newEquipmentId, setNewEquipmentId] = useState('');
  const [newRentalStart, setNewRentalStart] = useState(new Date().toISOString().split('T')[0]);
  const [newRentalEnd, setNewRentalEnd] = useState('');
  const [newRateType, setNewRateType] = useState('weekly');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [rentalError, setRentalError] = useState('');
  const [rentalSubmitting, setRentalSubmitting] = useState(false);

  // New Fleet Item form
  const [eqForm, setEqForm] = useState({
    name: '', description: '', category: 'Mobility Support',
    daily_rate: '', weekly_rate: '', monthly_rate: '',
    security_deposit: '', total_units: 1, available_units: 1
  });

  const patients = useStore((s) => s.patients);
  const staff = useStore((s) => s.staff);

  const fetchEquipmentData = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        apiFetch('/equipment/rentals/'),
        apiFetch('/equipment/catalog/')
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        setRentals(Array.isArray(d) ? d : (d.results || []));
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setCatalog(Array.isArray(d) ? d : (d.results || []));
      }
    } catch (err) {
      console.warn('Error fetching equipment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipmentData();
  }, []);

  // Filtered rentals
  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      const matchSearch = !search ||
        (r.patient_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.equipment_name || '').toLowerCase().includes(search.toLowerCase()) ||
        `EQ-${r.id}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rentals, search, statusFilter]);

  // Filtered catalog
  const filteredCatalog = useMemo(() => {
    return catalog.filter((c) => {
      const matchSearch = !search ||
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(search.toLowerCase());
      const matchUnits = !lowUnitsOnly || c.available_units <= 1;
      return matchSearch && matchUnits;
    });
  }, [catalog, search, lowUnitsOnly]);

  // KPIs
  const activeRentalsCount = rentals.filter(r => r.status === 'active').length;
  const pendingDeliveryCount = rentals.filter(r => r.status === 'requested').length;
  const pendingPickupCount = rentals.filter(r => r.status === 'pickup_pending').length;
  const totalFleetUnits = catalog.reduce((sum, item) => sum + item.total_units, 0);
  const availableFleetUnits = catalog.reduce((sum, item) => sum + item.available_units, 0);

  // Deliver Action
  const handleDeliverRental = async () => {
    if (!deliverModalRental) return;
    try {
      const res = await apiFetch(`/equipment/rentals/${deliverModalRental.id}/deliver/`, {
        method: 'PATCH',
        body: JSON.stringify({
          lat: parseFloat(deliverLat) || null,
          lng: parseFloat(deliverLng) || null,
          notes: deliverNotes
        })
      });
      if (res.ok) {
        setDeliverModalRental(null);
        setDeliverNotes('');
        fetchEquipmentData();
      }
    } catch (err) {
      console.warn('Deliver error:', err);
    }
  };

  // Pickup Action
  const handlePickupRental = async () => {
    if (!pickupModalRental) return;
    try {
      const res = await apiFetch(`/equipment/rentals/${pickupModalRental.id}/pickup/`, {
        method: 'PATCH',
        body: JSON.stringify({
          lat: parseFloat(pickupLat) || null,
          lng: parseFloat(pickupLng) || null,
          refund_deposit: refundDeposit,
          notes: pickupNotes
        })
      });
      if (res.ok) {
        setPickupModalRental(null);
        setPickupNotes('');
        fetchEquipmentData();
      }
    } catch (err) {
      console.warn('Pickup error:', err);
    }
  };

  // Submit New Rental
  const handleSubmitRental = async (e) => {
    e.preventDefault();
    setRentalError('');
    if (!newPatientId || !newEquipmentId || !newRentalEnd) {
      setRentalError('Please fill in all required fields.');
      return;
    }

    setRentalSubmitting(true);
    try {
      const res = await apiFetch('/equipment/rentals/', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: newPatientId,
          equipment_id: newEquipmentId,
          rental_start: newRentalStart,
          rental_end: newRentalEnd,
          rental_rate_type: newRateType,
          delivery_address: newAddress,
          notes: newNotes
        })
      });

      if (res.ok) {
        setShowNewRental(false);
        setNewPatientId('');
        setNewEquipmentId('');
        setNewRentalEnd('');
        setNewNotes('');
        fetchEquipmentData();
      } else {
        const err = await res.json();
        setRentalError(err.error || 'Failed to request rental.');
      }
    } catch (err) {
      setRentalError('Network error requesting rental.');
    } finally {
      setRentalSubmitting(false);
    }
  };

  // Submit New Fleet Item
  const handleSubmitEquipment = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/equipment/catalog/', {
        method: 'POST',
        body: JSON.stringify(eqForm)
      });
      if (res.ok) {
        setShowNewEquipment(false);
        setEqForm({
          name: '', description: '', category: 'Mobility Support',
          daily_rate: '', weekly_rate: '', monthly_rate: '',
          security_deposit: '', total_units: 1, available_units: 1
        });
        fetchEquipmentData();
      }
    } catch (err) {
      console.warn('Add equipment error:', err);
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', paddingBottom: 40 }}>
      {/* ── Page Header ── */}
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={26} color="var(--teal-700)" /> Equipment Rental & Fleet Management
          </h1>
          <p className="page-subtitle">Hospital at Home equipment leasing, patient deployment, and deposit return cycles</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'rentals' ? (
            <button className="btn btn-primary" onClick={() => setShowNewRental(true)}>
              <Plus size={16} /> Request Rental
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowNewEquipment(true)}>
              <Plus size={16} /> Add Equipment Item
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <div className="stat-card green">
          <div className="stat-label">Active Leases</div>
          <div className="stat-value">{activeRentalsCount}</div>
          <div className="stat-sub">Units deployed at patient homes</div>
          <Shield className="stat-icon" size={48} />
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Pending Delivery</div>
          <div className="stat-value">{pendingDeliveryCount}</div>
          <div className="stat-sub">Awaiting dispatch & GPS drop</div>
          <Clock className="stat-icon" size={48} />
        </div>
        <div className="stat-card red">
          <div className="stat-label">Pickup Pending</div>
          <div className="stat-value">{pendingPickupCount}</div>
          <div className="stat-sub">Rental ended · collection due</div>
          <RotateCcw className="stat-icon" size={48} />
        </div>
        <div className="stat-card">
          <div className="stat-label">Fleet Availability</div>
          <div className="stat-value">{availableFleetUnits} <span style={{ fontSize: '1rem', color: 'var(--status-grey)' }}>/ {totalFleetUnits}</span></div>
          <div className="stat-sub">Units ready for lease</div>
          <Package className="stat-icon" size={48} />
        </div>
      </div>

      {/* ── Module Sub-Tabs ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid var(--sage-200)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('rentals')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'rentals' ? '3px solid var(--teal-700)' : '3px solid transparent',
            fontWeight: activeTab === 'rentals' ? 700 : 500,
            color: activeTab === 'rentals' ? 'var(--teal-700)' : 'var(--status-grey)',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Rental Agreements ({rentals.length})
        </button>
        <button
          onClick={() => setActiveTab('fleet')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'fleet' ? '3px solid var(--teal-700)' : '3px solid transparent',
            fontWeight: activeTab === 'fleet' ? 700 : 500,
            color: activeTab === 'fleet' ? 'var(--teal-700)' : 'var(--status-grey)',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Fleet Catalog & Units ({catalog.length})
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="search-input-wrap" style={{ flex: '0 1 260px' }}>
          <Search size={14} />
          <input
            className="form-input search-input"
            placeholder={activeTab === 'rentals' ? "Search patient, equipment, agreement..." : "Search equipment fleet..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {activeTab === 'rentals' ? (
          <select
            className="form-select"
            style={{ width: 170 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="active">Active (Deployed)</option>
            <option value="pickup_pending">Pickup Pending</option>
            <option value="returned">Returned</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: 'var(--status-red)' }}>
            <input
              type="checkbox"
              checked={lowUnitsOnly}
              onChange={(e) => setLowUnitsOnly(e.target.checked)}
            />
            Show Low Availability (&le;1 Available)
          </label>
        )}
      </div>

      {/* ── TAB 1: RENTALS TABLE ── */}
      {activeTab === 'rentals' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '9%' }}>Rental #</th>
                  <th style={{ width: '18%' }}>Patient</th>
                  <th style={{ width: '22%' }}>Equipment Item</th>
                  <th style={{ width: '15%' }}>Lease Window</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '11%' }}>Security Deposit</th>
                  <th style={{ width: '13%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRentals.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                      No equipment rentals found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRentals.map((r) => (
                    <tr key={r.id}>
                      <td className="ts">
                        <span className="badge badge-teal" style={{ fontWeight: 700 }}>
                          EQ-{r.id.toString().padStart(4, '0')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{r.patient_name}</div>
                        <div className="ts" style={{ fontSize: '0.74rem' }}>{r.patient_mr}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{r.equipment_name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>
                          Fee: PKR {Number(r.total_rental_fee).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <div>{r.rental_start} <span style={{ color: 'var(--status-grey)' }}>to</span></div>
                        <div style={{ fontWeight: 600 }}>{r.rental_end}</div>
                      </td>
                      <td>
                        <span className={`badge ${
                          r.status === 'active' ? 'badge-green' :
                          r.status === 'pickup_pending' ? 'badge-red badge-pulse' :
                          r.status === 'requested' ? 'badge-amber' :
                          r.status === 'returned' ? 'badge-grey' : 'badge-grey'
                        }`}>
                          {r.status_display || r.status}
                        </span>
                      </td>
                      <td>
                        <div className="ts" style={{ fontWeight: 700 }}>PKR {Number(r.deposit_amount).toLocaleString()}</div>
                        {r.deposit_refunded ? (
                          <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Refunded</span>
                        ) : (
                          <span className="badge badge-grey" style={{ fontSize: '0.65rem' }}>Holding</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          {r.status === 'requested' && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                              onClick={() => setDeliverModalRental(r)}
                            >
                              <CheckCircle size={12} /> Deliver
                            </button>
                          )}
                          {['active', 'pickup_pending'].includes(r.status) && (
                            <button
                              className="btn btn-amber btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                              onClick={() => setPickupModalRental(r)}
                            >
                              <RotateCcw size={12} /> Pickup
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: FLEET CATALOG ── */}
      {activeTab === 'fleet' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Equipment Item & Category</th>
                  <th style={{ width: '18%' }}>Fleet Units (Avail / Total)</th>
                  <th style={{ width: '14%' }}>Daily Rate</th>
                  <th style={{ width: '14%' }}>Weekly Rate</th>
                  <th style={{ width: '14%' }}>Monthly Rate</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Security Deposit</th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                      No equipment fleet items match filters.
                    </td>
                  </tr>
                ) : (
                  filteredCatalog.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{c.name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>{c.category}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: c.available_units <= 1 ? 'var(--status-red)' : 'var(--teal-700)' }}>
                            {c.available_units} / {c.total_units} Available
                          </span>
                          {c.available_units <= 1 && (
                            <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>LOW</span>
                          )}
                        </div>
                      </td>
                      <td className="ts">PKR {Number(c.daily_rate).toLocaleString()}</td>
                      <td className="ts">PKR {Number(c.weekly_rate).toLocaleString()}</td>
                      <td className="ts">PKR {Number(c.monthly_rate).toLocaleString()}</td>
                      <td className="ts" style={{ textAlign: 'right', fontWeight: 700 }}>
                        PKR {Number(c.security_deposit).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: DELIVER EQUIPMENT ── */}
      {deliverModalRental && (
        <div className="modal-backdrop" onClick={() => setDeliverModalRental(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Equipment Handover & Delivery</h3>
              <button className="modal-close" onClick={() => setDeliverModalRental(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: 14 }}>
                Record GPS coordinates and confirm equipment installation at patient home.
              </p>
              <div className="grid-2 mb-4">
                <div>
                  <label className="form-label">Latitude</label>
                  <input className="form-input" value={deliverLat} onChange={(e) => setDeliverLat(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Longitude</label>
                  <input className="form-input" value={deliverLng} onChange={(e) => setDeliverLng(e.target.value)} />
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Installation & Inspection Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Demonstrated oxygen concentrator alarms, power backup verified..."
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setDeliverModalRental(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleDeliverRental}>
                  <CheckCircle size={15} /> Confirm Delivery & Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PICKUP & REFUND DEPOSIT ── */}
      {pickupModalRental && (
        <div className="modal-backdrop" onClick={() => setPickupModalRental(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Process Equipment Return & Deposit</h3>
              <button className="modal-close" onClick={() => setPickupModalRental(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: 14 }}>
                Item: <strong>{pickupModalRental.equipment_name}</strong><br />
                Patient: <strong>{pickupModalRental.patient_name}</strong><br />
                Security Deposit: <strong>PKR {Number(pickupModalRental.deposit_amount).toLocaleString()}</strong>
              </p>

              <div className="grid-2 mb-4">
                <div>
                  <label className="form-label">Pickup Latitude</label>
                  <input className="form-input" value={pickupLat} onChange={(e) => setPickupLat(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Pickup Longitude</label>
                  <input className="form-input" value={pickupLng} onChange={(e) => setPickupLng(e.target.value)} />
                </div>
              </div>

              <div className="form-group mb-4">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={refundDeposit}
                    onChange={(e) => setRefundDeposit(e.target.checked)}
                  />
                  <strong>Release & Refund Security Deposit (PKR {Number(pickupModalRental.deposit_amount).toLocaleString()})</strong>
                </label>
                <small style={{ color: 'var(--status-grey)', fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                  Item inspected without damage; initiates refund release.
                </small>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Inspection Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Unit sanitized, intact, motor functioning correctly..."
                  value={pickupNotes}
                  onChange={(e) => setPickupNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setPickupModalRental(null)}>Cancel</button>
                <button className="btn btn-amber" onClick={handlePickupRental}>
                  <RotateCcw size={15} /> Complete Return & Release
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REQUEST NEW RENTAL ── */}
      {showNewRental && (
        <div className="modal-backdrop" onClick={() => setShowNewRental(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New Equipment Rental Agreement</h3>
              <button className="modal-close" onClick={() => setShowNewRental(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitRental}>
              <div className="modal-body">
                {rentalError && (
                  <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                    {rentalError}
                  </div>
                )}

                <div className="form-group mb-4">
                  <label className="form-label">Patient</label>
                  <select
                    className="form-select"
                    value={newPatientId}
                    onChange={(e) => {
                      setNewPatientId(e.target.value);
                      const p = patients.find(pt => pt.id === parseInt(e.target.value));
                      if (p && !newAddress) setNewAddress(p.address || '');
                    }}
                    required
                  >
                    <option value="">Select Patient...</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name} ({p.mr_number})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Equipment Item</label>
                  <select
                    className="form-select"
                    value={newEquipmentId}
                    onChange={(e) => setNewEquipmentId(e.target.value)}
                    required
                  >
                    <option value="">Select Equipment Item...</option>
                    {catalog.map(c => (
                      <option key={c.id} value={c.id} disabled={c.available_units < 1}>
                        {c.name} — {c.available_units > 0 ? `(${c.available_units} Available - Dep: PKR ${c.security_deposit})` : '(OUT OF STOCK)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Rental Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newRentalStart}
                      onChange={(e) => setNewRentalStart(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Rental End Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newRentalEnd}
                      onChange={(e) => setNewRentalEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Rate Billing Frequency</label>
                    <select
                      className="form-select"
                      value={newRateType}
                      onChange={(e) => setNewRateType(e.target.value)}
                    >
                      <option value="daily">Daily Billing</option>
                      <option value="weekly">Weekly Billing</option>
                      <option value="monthly">Monthly Billing</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Delivery Address</label>
                    <input
                      className="form-input"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Home delivery address"
                    />
                  </div>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Clinical Notes</label>
                  <input
                    className="form-input"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Diagnosis or patient requirements"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewRental(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={rentalSubmitting}>
                    {rentalSubmitting ? 'Requesting...' : 'Confirm Agreement'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD EQUIPMENT ITEM ── */}
      {showNewEquipment && (
        <div className="modal-backdrop" onClick={() => setShowNewEquipment(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Equipment to Fleet</h3>
              <button className="modal-close" onClick={() => setShowNewEquipment(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitEquipment}>
              <div className="modal-body">
                <div className="form-group mb-4">
                  <label className="form-label">Equipment Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 10L High-Flow Oxygen Concentrator"
                    value={eqForm.name}
                    onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={eqForm.category}
                      onChange={(e) => setEqForm({ ...eqForm, category: e.target.value })}
                    >
                      <option value="Mobility Support">Mobility Support</option>
                      <option value="Respiratory Care">Respiratory Care</option>
                      <option value="Hospital at Home ICU">Hospital at Home ICU</option>
                      <option value="Pressure Care">Pressure Care</option>
                      <option value="Clinical Suction">Clinical Suction</option>
                      <option value="Diagnostic Monitoring">Diagnostic Monitoring</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Security Deposit (PKR)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.security_deposit}
                      onChange={(e) => setEqForm({ ...eqForm, security_deposit: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid-3 mb-4">
                  <div>
                    <label className="form-label">Daily Rate</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.daily_rate}
                      onChange={(e) => setEqForm({ ...eqForm, daily_rate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Weekly Rate</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.weekly_rate}
                      onChange={(e) => setEqForm({ ...eqForm, weekly_rate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Monthly Rate</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.monthly_rate}
                      onChange={(e) => setEqForm({ ...eqForm, monthly_rate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Total Units</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.total_units}
                      onChange={(e) => setEqForm({ ...eqForm, total_units: parseInt(e.target.value) || 1, available_units: parseInt(e.target.value) || 1 })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Available Units</label>
                    <input
                      type="number"
                      className="form-input"
                      value={eqForm.available_units}
                      onChange={(e) => setEqForm({ ...eqForm, available_units: parseInt(e.target.value) || 1 })}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewEquipment(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save to Fleet</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
