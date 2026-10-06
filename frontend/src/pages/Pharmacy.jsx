import React, { useState, useEffect, useMemo } from 'react';
import {
  Pill, Plus, Search, Filter, AlertTriangle, CheckCircle,
  Truck, Clock, FileText, Upload, X, ShieldAlert, DollarSign,
  Package, MapPin, Eye, ExternalLink
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch, { API_BASE } from '../services/api';

export default function Pharmacy() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'inventory'
  const [orders, setOrders] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewMedicine, setShowNewMedicine] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmModalOrder, setConfirmModalOrder] = useState(null);
  const [deliverModalOrder, setDeliverModalOrder] = useState(null);

  // Form states
  const [assignRiderId, setAssignRiderId] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [deliverLat, setDeliverLat] = useState('33.5651');
  const [deliverLng, setDeliverLng] = useState('73.1512');
  const [deliverNotes, setDeliverNotes] = useState('');

  // New Order Form state
  const [newOrderPatientId, setNewOrderPatientId] = useState('');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderSelectedMeds, setNewOrderSelectedMeds] = useState([{ medicine_id: '', quantity: 1 }]);
  const [newOrderPrescription, setNewOrderPrescription] = useState(null);
  const [newOrderPayment, setNewOrderPayment] = useState('cod');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderFormError, setOrderFormError] = useState('');

  // New Medicine Form state
  const [medForm, setMedForm] = useState({
    name: '', generic_name: '', category: 'general',
    unit_price: '', stock_quantity: '', requires_prescription: false,
    strength: '', dosage_form: 'Tablet'
  });

  const patients = useStore((s) => s.patients);
  const staff = useStore((s) => s.staff);

  const fetchPharmacyData = async () => {
    setLoading(true);
    try {
      const [ordRes, medRes] = await Promise.all([
        apiFetch('/pharmacy/orders/'),
        apiFetch('/pharmacy/medicines/')
      ]);
      if (ordRes.ok) {
        const d = await ordRes.json();
        setOrders(Array.isArray(d) ? d : (d.results || []));
      }
      if (medRes.ok) {
        const d = await medRes.json();
        setMedicines(Array.isArray(d) ? d : (d.results || []));
      }
    } catch (err) {
      console.warn('Error fetching pharmacy data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPharmacyData();
  }, []);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch = !search ||
        (o.patient_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.delivery_address || '').toLowerCase().includes(search.toLowerCase()) ||
        `MED-${o.id}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // Filtered Medicines
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const matchSearch = !search ||
        (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.generic_name || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = !categoryFilter || m.category === categoryFilter;
      const matchStock = !lowStockOnly || m.stock_quantity <= 15;
      return matchSearch && matchCat && matchStock;
    });
  }, [medicines, search, categoryFilter, lowStockOnly]);

  // KPIs
  const totalOrdersCount = orders.length;
  const pendingRxOrders = orders.filter(o => o.status === 'pending');
  const outForDeliveryCount = orders.filter(o => o.status === 'out_for_delivery').length;
  const lowStockCount = medicines.filter(m => m.stock_quantity <= 15).length;

  // Handle Confirm Order
  const handleConfirmOrder = async () => {
    if (!confirmModalOrder) return;
    setConfirmError('');
    try {
      const res = await apiFetch(`/pharmacy/orders/${confirmModalOrder.id}/confirm/`, {
        method: 'PATCH',
        body: JSON.stringify({
          delivery_staff_id: assignRiderId || undefined,
          status: assignRiderId ? 'out_for_delivery' : 'confirmed'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || 'Failed to confirm order.');
        return;
      }
      setConfirmModalOrder(null);
      setAssignRiderId('');
      fetchPharmacyData();
    } catch (err) {
      setConfirmError('Network error while confirming order.');
    }
  };

  // Handle Deliver Order
  const handleDeliverOrder = async () => {
    if (!deliverModalOrder) return;
    try {
      const res = await apiFetch(`/pharmacy/orders/${deliverModalOrder.id}/deliver/`, {
        method: 'POST',
        body: JSON.stringify({
          lat: parseFloat(deliverLat) || null,
          lng: parseFloat(deliverLng) || null,
          notes: deliverNotes
        })
      });
      if (res.ok) {
        setDeliverModalOrder(null);
        setDeliverNotes('');
        fetchPharmacyData();
      }
    } catch (err) {
      console.warn('Delivery update failed:', err);
    }
  };

  // Submit New Order
  const handleSubmitNewOrder = async (e) => {
    e.preventDefault();
    setOrderFormError('');
    if (!newOrderPatientId) {
      setOrderFormError('Please select a patient.');
      return;
    }
    const validItems = newOrderSelectedMeds.filter(i => i.medicine_id && i.quantity > 0);
    if (validItems.length === 0) {
      setOrderFormError('Please select at least one medicine item.');
      return;
    }

    setOrderSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('patient_id', newOrderPatientId);
      formData.append('delivery_address', newOrderAddress);
      formData.append('payment_status', newOrderPayment);
      formData.append('notes', newOrderNotes);
      formData.append('items', JSON.stringify(validItems));
      if (newOrderPrescription) {
        formData.append('prescription_file', newOrderPrescription);
      }

      const res = await apiFetch('/pharmacy/orders/', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        setShowNewOrder(false);
        setNewOrderPatientId('');
        setNewOrderAddress('');
        setNewOrderSelectedMeds([{ medicine_id: '', quantity: 1 }]);
        setNewOrderPrescription(null);
        setNewOrderNotes('');
        fetchPharmacyData();
      } else {
        const err = await res.json();
        setOrderFormError(err.error || 'Failed to create order.');
      }
    } catch (err) {
      setOrderFormError('Error submitting order.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Submit New Medicine
  const handleSubmitNewMedicine = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/pharmacy/medicines/', {
        method: 'POST',
        body: JSON.stringify(medForm)
      });
      if (res.ok) {
        setShowNewMedicine(false);
        setMedForm({
          name: '', generic_name: '', category: 'general',
          unit_price: '', stock_quantity: '', requires_prescription: false,
          strength: '', dosage_form: 'Tablet'
        });
        fetchPharmacyData();
      }
    } catch (err) {
      console.warn('Error adding medicine:', err);
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', paddingBottom: 40 }}>
      {/* ── Page Header ── */}
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pill size={26} color="var(--teal-700)" /> Pharmacy & Medicine Dispensing
          </h1>
          <p className="page-subtitle">Prescription validation, express home delivery, and cold-chain stock management</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'orders' ? (
            <button className="btn btn-primary" onClick={() => setShowNewOrder(true)}>
              <Plus size={16} /> New Medicine Order
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowNewMedicine(true)}>
              <Plus size={16} /> Add Medicine
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Orders</div>
          <div className="stat-value">{totalOrdersCount}</div>
          <div className="stat-sub">Active & fulfilled</div>
          <Package className="stat-icon" size={48} />
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value">{pendingRxOrders.length}</div>
          <div className="stat-sub">Awaiting verification</div>
          <Clock className="stat-icon" size={48} />
        </div>
        <div className="stat-card green">
          <div className="stat-label">Out for Delivery</div>
          <div className="stat-value">{outForDeliveryCount}</div>
          <div className="stat-sub">Riders in transit</div>
          <Truck className="stat-icon" size={48} />
        </div>
        <div className={`stat-card ${lowStockCount > 0 ? 'red' : ''}`}>
          <div className="stat-label">Low Stock Alerts</div>
          <div className="stat-value" style={{ color: lowStockCount > 0 ? 'var(--status-red)' : 'inherit' }}>
            {lowStockCount}
          </div>
          <div className="stat-sub">Units below 15 threshold</div>
          <AlertTriangle className="stat-icon" size={48} />
        </div>
      </div>

      {/* ── Module Sub-Tabs ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid var(--sage-200)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'orders' ? '3px solid var(--teal-700)' : '3px solid transparent',
            fontWeight: activeTab === 'orders' ? 700 : 500,
            color: activeTab === 'orders' ? 'var(--teal-700)' : 'var(--status-grey)',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Orders & Deliveries ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'inventory' ? '3px solid var(--teal-700)' : '3px solid transparent',
            fontWeight: activeTab === 'inventory' ? 700 : 500,
            color: activeTab === 'inventory' ? 'var(--teal-700)' : 'var(--status-grey)',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Medicine Catalog & Inventory ({medicines.length})
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="search-input-wrap" style={{ flex: '0 1 260px' }}>
          <Search size={14} />
          <input
            className="form-input search-input"
            placeholder={activeTab === 'orders' ? "Search patient, order, address..." : "Search medicine or generic..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {activeTab === 'orders' ? (
          <select
            className="form-select"
            style={{ width: 170 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending Review</option>
            <option value="confirmed">Confirmed</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ) : (
          <>
            <select
              className="form-select"
              style={{ width: 190 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="antibiotics">Antibiotics</option>
              <option value="analgesics">Analgesics & Pain</option>
              <option value="cardiac">Cardiac & BP</option>
              <option value="diabetes">Diabetes Care</option>
              <option value="respiratory">Respiratory</option>
              <option value="gastro">Gastrointestinal</option>
              <option value="vitamins">Vitamins</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: 'var(--status-red)' }}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              Show Low Stock Only (&le;15)
            </label>
          </>
        )}
      </div>

      {/* ── TAB 1: ORDERS TABLE ── */}
      {activeTab === 'orders' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '9%' }}>Order #</th>
                  <th style={{ width: '18%' }}>Patient</th>
                  <th style={{ width: '22%' }}>Delivery Address</th>
                  <th style={{ width: '13%' }}>Rx Verification</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '13%' }}>Assigned Rider</th>
                  <th style={{ width: '13%', textAlign: 'right' }}>Total & Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                      No medicine orders found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td className="ts">
                        <span className="badge badge-teal" style={{ fontWeight: 700 }}>
                          MED-{ord.id.toString().padStart(4, '0')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{ord.patient_name}</div>
                        <div className="ts" style={{ fontSize: '0.74rem' }}>{ord.patient_mr}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                        {ord.delivery_address}
                      </td>
                      <td>
                        {ord.prescription_file ? (
                          <a
                            href={ord.prescription_file.startsWith('http') ? ord.prescription_file : `${API_BASE.replace('/api', '')}${ord.prescription_file}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge badge-green"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <FileText size={12} /> Rx Attached <ExternalLink size={10} />
                          </a>
                        ) : ord.requires_prescription ? (
                          <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ShieldAlert size={12} /> Rx Required (Missing)
                          </span>
                        ) : (
                          <span className="badge badge-grey">OTC / Non-Rx</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          ord.status === 'delivered' ? 'badge-green' :
                          ord.status === 'out_for_delivery' ? 'badge-amber badge-pulse' :
                          ord.status === 'confirmed' ? 'badge-teal' : 'badge-grey'
                        }`}>
                          {ord.status_display || ord.status}
                        </span>
                      </td>
                      <td>
                        {ord.delivery_staff_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                            <Truck size={14} color="var(--teal-600)" /> {ord.delivery_staff_name}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--status-grey)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="ts" style={{ fontWeight: 700, marginBottom: 4 }}>
                          PKR {Number(ord.total_amount).toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          {ord.status === 'pending' && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => {
                                setConfirmModalOrder(ord);
                                setConfirmError('');
                              }}
                            >
                              Confirm
                            </button>
                          )}
                          {['confirmed', 'out_for_delivery'].includes(ord.status) && (
                            <button
                              className="btn btn-amber btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => setDeliverModalOrder(ord)}
                            >
                              <CheckCircle size={12} /> Deliver
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

      {/* ── TAB 2: INVENTORY TABLE ── */}
      {activeTab === 'inventory' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Medicine Name & Strength</th>
                  <th style={{ width: '22%' }}>Generic Name</th>
                  <th style={{ width: '15%' }}>Category</th>
                  <th style={{ width: '12%' }}>Rx Status</th>
                  <th style={{ width: '13%' }}>In Stock</th>
                  <th style={{ width: '13%', textAlign: 'right' }}>Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedicines.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                      No medicines in inventory match filters.
                    </td>
                  </tr>
                ) : (
                  filteredMedicines.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{m.name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>{m.dosage_form} · {m.strength || 'Standard'}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#374151' }}>
                        {m.generic_name || '—'}
                      </td>
                      <td>
                        <span className="badge badge-grey" style={{ textTransform: 'capitalize' }}>
                          {m.category}
                        </span>
                      </td>
                      <td>
                        {m.requires_prescription ? (
                          <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>Prescription Required</span>
                        ) : (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>OTC Drug</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: m.stock_quantity <= 15 ? 'var(--status-red)' : 'inherit' }}>
                            {m.stock_quantity}
                          </span>
                          {m.stock_quantity <= 15 && (
                            <span className="badge badge-red" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                              LOW STOCK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="ts" style={{ textAlign: 'right', fontWeight: 700 }}>
                        PKR {Number(m.unit_price).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRM ORDER (ADMIN) ── */}
      {confirmModalOrder && (
        <div className="modal-backdrop" onClick={() => setConfirmModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirm Order #{confirmModalOrder.id}</h3>
              <button className="modal-close" onClick={() => setConfirmModalOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {confirmError && (
                <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 14, fontSize: '0.85rem' }}>
                  <strong>Server Enforcement:</strong> {confirmError}
                </div>
              )}

              <p style={{ fontSize: '0.88rem', color: '#374151', marginBottom: 16 }}>
                Patient: <strong>{confirmModalOrder.patient_name}</strong><br />
                Address: <strong>{confirmModalOrder.delivery_address}</strong><br />
                Rx Attached: <strong>{confirmModalOrder.prescription_file ? 'Yes' : 'No'}</strong>
              </p>

              <div className="form-group mb-4">
                <label className="form-label">Assign Delivery Staff / Rider</label>
                <select
                  className="form-select"
                  value={assignRiderId}
                  onChange={(e) => setAssignRiderId(e.target.value)}
                >
                  <option value="">Select Delivery Staff (Optional)...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.role_display || s.role})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setConfirmModalOrder(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleConfirmOrder}>
                  Confirm & Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: MARK DELIVERED WITH GPS PROOF ── */}
      {deliverModalOrder && (
        <div className="modal-backdrop" onClick={() => setDeliverModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirm Delivery Completion</h3>
              <button className="modal-close" onClick={() => setDeliverModalOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: 14 }}>
                Record GPS coordinates and confirm that medicines have been delivered into patient custody.
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
                <label className="form-label">Delivery Notes / Handover Sign-off</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Handed over to patient daughter, temperature maintained..."
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setDeliverModalOrder(null)}>Cancel</button>
                <button className="btn btn-amber" onClick={handleDeliverOrder}>
                  <CheckCircle size={15} /> Mark Delivered
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NEW MEDICINE ORDER ── */}
      {showNewOrder && (
        <div className="modal-backdrop" onClick={() => setShowNewOrder(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Place New Medicine Order</h3>
              <button className="modal-close" onClick={() => setShowNewOrder(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitNewOrder}>
              <div className="modal-body">
                {orderFormError && (
                  <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                    {orderFormError}
                  </div>
                )}

                <div className="form-group mb-4">
                  <label className="form-label">Patient</label>
                  <select
                    className="form-select"
                    value={newOrderPatientId}
                    onChange={(e) => {
                      setNewOrderPatientId(e.target.value);
                      const p = patients.find(pt => pt.id === parseInt(e.target.value));
                      if (p && !newOrderAddress) setNewOrderAddress(p.address || '');
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
                  <label className="form-label">Delivery Address</label>
                  <input
                    className="form-input"
                    value={newOrderAddress}
                    onChange={(e) => setNewOrderAddress(e.target.value)}
                    placeholder="Street address for delivery"
                    required
                  />
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Medicines & Quantities</label>
                  {newOrderSelectedMeds.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <select
                        className="form-select"
                        style={{ flex: 1 }}
                        value={row.medicine_id}
                        onChange={(e) => {
                          const updated = [...newOrderSelectedMeds];
                          updated[idx].medicine_id = e.target.value;
                          setNewOrderSelectedMeds(updated);
                        }}
                        required
                      >
                        <option value="">Select Medicine...</option>
                        {medicines.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} (PKR {m.unit_price}) {m.requires_prescription ? '— [Rx]' : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        style={{ width: 80 }}
                        value={row.quantity}
                        onChange={(e) => {
                          const updated = [...newOrderSelectedMeds];
                          updated[idx].quantity = parseInt(e.target.value) || 1;
                          setNewOrderSelectedMeds(updated);
                        }}
                      />
                      {newOrderSelectedMeds.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0 8px' }}
                          onClick={() => setNewOrderSelectedMeds(newOrderSelectedMeds.filter((_, i) => i !== idx))}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setNewOrderSelectedMeds([...newOrderSelectedMeds, { medicine_id: '', quantity: 1 }])}
                  >
                    + Add Another Medicine
                  </button>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Prescription Document (Upload PDF or Photo)</label>
                  <input
                    type="file"
                    className="form-input"
                    accept=".pdf,image/*"
                    onChange={(e) => setNewOrderPrescription(e.target.files[0])}
                  />
                  <small style={{ color: 'var(--status-grey)', fontSize: '0.75rem' }}>
                    Required for prescription-only medications prior to order confirmation.
                  </small>
                </div>

                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Payment Method</label>
                    <select
                      className="form-select"
                      value={newOrderPayment}
                      onChange={(e) => setNewOrderPayment(e.target.value)}
                    >
                      <option value="cod">Cash on Delivery (COD)</option>
                      <option value="paid">Prepaid / Bank Transfer</option>
                      <option value="unpaid">Unpaid Invoice</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Order Notes</label>
                    <input
                      className="form-input"
                      placeholder="Special instructions"
                      value={newOrderNotes}
                      onChange={(e) => setNewOrderNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewOrder(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={orderSubmitting}>
                    {orderSubmitting ? 'Placing Order...' : 'Place Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD MEDICINE TO CATALOG ── */}
      {showNewMedicine && (
        <div className="modal-backdrop" onClick={() => setShowNewMedicine(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Medicine to Catalog</h3>
              <button className="modal-close" onClick={() => setShowNewMedicine(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitNewMedicine}>
              <div className="modal-body">
                <div className="form-group mb-4">
                  <label className="form-label">Brand Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Augmentin 625mg"
                    value={medForm.name}
                    onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">Generic Formula</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Amoxicillin + Clavulanate"
                    value={medForm.generic_name}
                    onChange={(e) => setMedForm({ ...medForm, generic_name: e.target.value })}
                  />
                </div>
                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={medForm.category}
                      onChange={(e) => setMedForm({ ...medForm, category: e.target.value })}
                    >
                      <option value="antibiotics">Antibiotics</option>
                      <option value="analgesics">Analgesics & Pain</option>
                      <option value="cardiac">Cardiac & BP</option>
                      <option value="diabetes">Diabetes</option>
                      <option value="respiratory">Respiratory</option>
                      <option value="gastro">Gastrointestinal</option>
                      <option value="vitamins">Vitamins</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Unit Price (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={medForm.unit_price}
                      onChange={(e) => setMedForm({ ...medForm, unit_price: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Stock Quantity</label>
                    <input
                      type="number"
                      className="form-input"
                      value={medForm.stock_quantity}
                      onChange={(e) => setMedForm({ ...medForm, stock_quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Dosage Form</label>
                    <input
                      className="form-input"
                      placeholder="Tablet, Syrup, Inhaler"
                      value={medForm.dosage_form}
                      onChange={(e) => setMedForm({ ...medForm, dosage_form: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group mb-4">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={medForm.requires_prescription}
                      onChange={(e) => setMedForm({ ...medForm, requires_prescription: e.target.checked })}
                    />
                    <strong>Requires Doctor Prescription (Rx)</strong>
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewMedicine(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Medicine</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
