import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical, Plus, Search, Filter, AlertTriangle, CheckCircle,
  Clock, FileText, Upload, X, ShieldAlert, DollarSign,
  UserCheck, MapPin, Eye, ExternalLink, Calendar
} from 'lucide-react';
import useStore from '../store/useStore';
import apiFetch, { API_BASE } from '../services/api';

export default function LabOrders() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'tests'
  const [orders, setOrders] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [assignCollectorModalOrder, setAssignCollectorModalOrder] = useState(null);
  const [collectSampleModalOrder, setCollectSampleModalOrder] = useState(null);
  const [uploadReportModalOrder, setUploadReportModalOrder] = useState(null);
  const [viewReportModalOrder, setViewReportModalOrder] = useState(null);
  const [activeReportData, setActiveReportData] = useState(null);

  // Assign Collector state
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // Collect Sample state (GPS proof)
  const [collectLat, setCollectLat] = useState('33.5651');
  const [collectLng, setCollectLng] = useState('73.1512');
  const [collectNotes, setCollectNotes] = useState('');

  // Upload Report state
  const [reportFile, setReportFile] = useState(null);
  const [reportParam1Name, setReportParam1Name] = useState('Hemoglobin');
  const [reportParam1Val, setReportParam1Val] = useState('13.4 g/dL');
  const [reportParam2Name, setReportParam2Name] = useState('WBC Count');
  const [reportParam2Val, setReportParam2Val] = useState('7,100 /mcL');
  const [reportParam3Name, setReportParam3Name] = useState('Platelets');
  const [reportParam3Val, setReportParam3Val] = useState('230,000 /mcL');
  const [flaggedAbnormal, setFlaggedAbnormal] = useState(false);
  const [clinicalRemarks, setClinicalRemarks] = useState('');
  const [uploadingReport, setUploadingReport] = useState(false);

  // New Order Form state
  const [newPatientId, setNewPatientId] = useState('');
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [newCollectionTime, setNewCollectionTime] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newFastingRequired, setNewFastingRequired] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [orderError, setOrderError] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const patients = useStore((s) => s.patients);
  const staff = useStore((s) => s.staff);

  const fetchLabData = async () => {
    setLoading(true);
    try {
      const [ordRes, testRes] = await Promise.all([
        apiFetch('/lab/orders/'),
        apiFetch('/lab/tests/')
      ]);
      if (ordRes.ok) {
        const d = await ordRes.json();
        setOrders(Array.isArray(d) ? d : (d.results || []));
      }
      if (testRes.ok) {
        const d = await testRes.json();
        setTests(Array.isArray(d) ? d : (d.results || []));
      }
    } catch (err) {
      console.warn('Error fetching lab data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabData();
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch = !search ||
        (o.patient_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.tests_summary || '').toLowerCase().includes(search.toLowerCase()) ||
        `LAB-${o.id}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // KPIs
  const totalOrdersCount = orders.length;
  const awaitingCollectionCount = orders.filter(o => ['requested', 'collector_assigned'].includes(o.status)).length;
  const processingCount = orders.filter(o => ['sample_collected', 'processing'].includes(o.status)).length;
  const reportsReadyCount = orders.filter(o => ['report_ready', 'delivered'].includes(o.status)).length;

  // Assign Collector
  const handleAssignCollector = async () => {
    if (!assignCollectorModalOrder || !selectedStaffId) return;
    try {
      const res = await apiFetch(`/lab/orders/${assignCollectorModalOrder.id}/assign-collector/`, {
        method: 'PATCH',
        body: JSON.stringify({ staff_id: selectedStaffId })
      });
      if (res.ok) {
        setAssignCollectorModalOrder(null);
        setSelectedStaffId('');
        fetchLabData();
      }
    } catch (err) {
      console.warn('Assign collector error:', err);
    }
  };

  // Collect Sample
  const handleCollectSample = async () => {
    if (!collectSampleModalOrder) return;
    try {
      const res = await apiFetch(`/lab/orders/${collectSampleModalOrder.id}/collect-sample/`, {
        method: 'POST',
        body: JSON.stringify({
          lat: parseFloat(collectLat) || null,
          lng: parseFloat(collectLng) || null,
          notes: collectNotes
        })
      });
      if (res.ok) {
        setCollectSampleModalOrder(null);
        setCollectNotes('');
        fetchLabData();
      }
    } catch (err) {
      console.warn('Collect sample error:', err);
    }
  };

  // Upload Report
  const handleUploadReport = async (e) => {
    e.preventDefault();
    if (!uploadReportModalOrder) return;
    setUploadingReport(true);
    try {
      const formData = new FormData();
      if (reportFile) {
        formData.append('result_file', reportFile);
      }
      const structured = {};
      if (reportParam1Name && reportParam1Val) structured[reportParam1Name] = reportParam1Val;
      if (reportParam2Name && reportParam2Val) structured[reportParam2Name] = reportParam2Val;
      if (reportParam3Name && reportParam3Val) structured[reportParam3Name] = reportParam3Val;

      formData.append('result_data', JSON.stringify(structured));
      formData.append('flagged_abnormal', flaggedAbnormal ? 'true' : 'false');
      formData.append('clinical_remarks', clinicalRemarks);

      const res = await apiFetch(`/lab/orders/${uploadReportModalOrder.id}/upload-report/`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        setUploadReportModalOrder(null);
        setReportFile(null);
        setFlaggedAbnormal(false);
        setClinicalRemarks('');
        fetchLabData();
      }
    } catch (err) {
      console.warn('Upload report error:', err);
    } finally {
      setUploadingReport(false);
    }
  };

  // View Report
  const handleViewReport = async (order) => {
    setViewReportModalOrder(order);
    try {
      const res = await apiFetch(`/lab/orders/${order.id}/report/`);
      if (res.ok) {
        const d = await res.json();
        setActiveReportData(d);
      }
    } catch (err) {
      console.warn('Fetch report error:', err);
    }
  };

  // Create Lab Order
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setOrderError('');
    if (!newPatientId || selectedTestIds.length === 0) {
      setOrderError('Please select a patient and at least one diagnostic test.');
      return;
    }

    setOrderSubmitting(true);
    try {
      const res = await apiFetch('/lab/orders/', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: newPatientId,
          test_ids: selectedTestIds,
          scheduled_collection_time: newCollectionTime || undefined,
          collection_address: newAddress,
          fasting_required: newFastingRequired,
          notes: newNotes
        })
      });

      if (res.ok) {
        setShowNewOrder(false);
        setNewPatientId('');
        setSelectedTestIds([]);
        setNewCollectionTime('');
        setNewNotes('');
        fetchLabData();
      } else {
        const err = await res.json();
        setOrderError(err.error || 'Failed to create lab order.');
      }
    } catch (err) {
      setOrderError('Network error creating lab order.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', paddingBottom: 40 }}>
      {/* ── Page Header ── */}
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={26} color="var(--teal-700)" /> Diagnostic Lab Testing & Reports
          </h1>
          <p className="page-subtitle">At-home phlebotomy sample collections, verified timestamps, and digital PDF results</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewOrder(true)}>
          <Plus size={16} /> New Lab Order
        </button>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Lab Orders</div>
          <div className="stat-value">{totalOrdersCount}</div>
          <div className="stat-sub">All test requisitions</div>
          <FlaskConical className="stat-icon" size={48} />
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Awaiting Collection</div>
          <div className="stat-value">{awaitingCollectionCount}</div>
          <div className="stat-sub">Phlebotomist dispatches pending</div>
          <Clock className="stat-icon" size={48} />
        </div>
        <div className="stat-card">
          <div className="stat-label">In Lab Processing</div>
          <div className="stat-value">{processingCount}</div>
          <div className="stat-sub">Samples under analysis</div>
          <AlertTriangle className="stat-icon" size={48} />
        </div>
        <div className="stat-card green">
          <div className="stat-label">Reports Ready</div>
          <div className="stat-value">{reportsReadyCount}</div>
          <div className="stat-sub">Delivered to patient & EMR 360</div>
          <CheckCircle className="stat-icon" size={48} />
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
          Lab Requisitions & Reports ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tests' ? '3px solid var(--teal-700)' : '3px solid transparent',
            fontWeight: activeTab === 'tests' ? 700 : 500,
            color: activeTab === 'tests' ? 'var(--teal-700)' : 'var(--status-grey)',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Test Directory & Menu ({tests.length})
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="search-input-wrap" style={{ flex: '0 1 260px' }}>
          <Search size={14} />
          <input
            className="form-input search-input"
            placeholder={activeTab === 'orders' ? "Search patient, test, requisition..." : "Search test catalog..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {activeTab === 'orders' && (
          <select
            className="form-select"
            style={{ width: 190 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="collector_assigned">Collector Assigned</option>
            <option value="sample_collected">Sample Collected</option>
            <option value="processing">Processing in Lab</option>
            <option value="report_ready">Report Ready</option>
          </select>
        )}
      </div>

      {/* ── TAB 1: LAB ORDERS TABLE ── */}
      {activeTab === 'orders' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '9%' }}>Lab #</th>
                  <th style={{ width: '18%' }}>Patient</th>
                  <th style={{ width: '22%' }}>Tests Requested</th>
                  <th style={{ width: '15%' }}>Schedule & Collection</th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '12%' }}>Phlebotomist</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--status-grey)' }}>
                      No lab requisitions found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td className="ts">
                        <span className="badge badge-teal" style={{ fontWeight: 700 }}>
                          LAB-{ord.id.toString().padStart(4, '0')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{ord.patient_name}</div>
                        <div className="ts" style={{ fontSize: '0.74rem' }}>{ord.patient_mr}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{ord.tests_summary}</div>
                        {ord.fasting_required && (
                          <span className="badge badge-amber" style={{ fontSize: '0.65rem', marginTop: 3 }}>
                            Fasting Required
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <div>{new Date(ord.scheduled_collection_time).toLocaleDateString()} {new Date(ord.scheduled_collection_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        {ord.collected_at && (
                          <div style={{ color: 'var(--status-green)', fontWeight: 600, fontSize: '0.74rem' }}>
                            ✓ Collected {new Date(ord.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          ord.status === 'report_ready' ? 'badge-green' :
                          ord.status === 'sample_collected' ? 'badge-teal' :
                          ord.status === 'collector_assigned' ? 'badge-amber' :
                          'badge-grey'
                        }`}>
                          {ord.status_display || ord.status}
                        </span>
                      </td>
                      <td>
                        {ord.collection_staff_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                            <UserCheck size={14} color="var(--teal-600)" /> {ord.collection_staff_name}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--status-grey)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                          {ord.status === 'requested' && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => setAssignCollectorModalOrder(ord)}
                            >
                              Assign
                            </button>
                          )}
                          {ord.status === 'collector_assigned' && (
                            <button
                              className="btn btn-amber btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => setCollectSampleModalOrder(ord)}
                            >
                              <CheckCircle size={11} /> Collect
                            </button>
                          )}
                          {['sample_collected', 'processing'].includes(ord.status) && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => setUploadReportModalOrder(ord)}
                            >
                              <Upload size={11} /> Upload
                            </button>
                          )}
                          {ord.has_report && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', borderColor: 'var(--teal-300)' }}
                              onClick={() => handleViewReport(ord)}
                            >
                              <Eye size={11} /> Report
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

      {/* ── TAB 2: TEST DIRECTORY TABLE ── */}
      {activeTab === 'tests' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Test Name</th>
                  <th style={{ width: '18%' }}>Sample Specimen</th>
                  <th style={{ width: '16%' }}>Turnaround Time</th>
                  <th style={{ width: '24%' }}>Patient Preparation</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Standard Price</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{t.name}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--status-grey)' }}>{t.description}</div>
                    </td>
                    <td>
                      <span className="badge badge-grey">{t.sample_type}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {t.turnaround_hours} Hours
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                      {t.preparation_instructions || 'Standard collection protocol'}
                    </td>
                    <td className="ts" style={{ textAlign: 'right', fontWeight: 700 }}>
                      PKR {Number(t.price).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: ASSIGN COLLECTOR ── */}
      {assignCollectorModalOrder && (
        <div className="modal-backdrop" onClick={() => setAssignCollectorModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Assign Sample Collector</h3>
              <button className="modal-close" onClick={() => setAssignCollectorModalOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 14 }}>
                Patient: <strong>{assignCollectorModalOrder.patient_name}</strong><br />
                Tests: <strong>{assignCollectorModalOrder.tests_summary}</strong>
              </p>
              <div className="form-group mb-4">
                <label className="form-label">Select Phlebotomist / Lab Technician</label>
                <select
                  className="form-select"
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                >
                  <option value="">Choose Staff Member...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.specialization || s.role})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setAssignCollectorModalOrder(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAssignCollector}>Confirm Assignment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: COLLECT SAMPLE (GPS PROOF) ── */}
      {collectSampleModalOrder && (
        <div className="modal-backdrop" onClick={() => setCollectSampleModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Record Sample Collection</h3>
              <button className="modal-close" onClick={() => setCollectSampleModalOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: 14 }}>
                Mark specimen collected. The server will permanently record the verified collection timestamp and your GPS location.
              </p>
              <div className="grid-2 mb-4">
                <div>
                  <label className="form-label">Latitude</label>
                  <input className="form-input" value={collectLat} onChange={(e) => setCollectLat(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Longitude</label>
                  <input className="form-input" value={collectLng} onChange={(e) => setCollectLng(e.target.value)} />
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="form-label">Phlebotomy Notes (Optional)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="e.g. Sample collected via 21G vacutainer, 2 EDTA vials drawn..."
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setCollectSampleModalOrder(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCollectSample}>
                  <CheckCircle size={15} /> Confirm Specimen Collection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: UPLOAD LAB REPORT ── */}
      {uploadReportModalOrder && (
        <div className="modal-backdrop" onClick={() => setUploadReportModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Upload Diagnostic Report</h3>
              <button className="modal-close" onClick={() => setUploadReportModalOrder(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUploadReport}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: 14 }}>
                  Order: <strong>LAB-{uploadReportModalOrder.id.toString().padStart(4, '0')}</strong> ({uploadReportModalOrder.tests_summary})<br />
                  Uploading this report will trigger instant in-app alerts to the patient and their Care Manager.
                </p>

                <div className="form-group mb-4">
                  <label className="form-label">Result Document (PDF / Image)</label>
                  <input
                    type="file"
                    className="form-input"
                    accept=".pdf,image/*"
                    onChange={(e) => setReportFile(e.target.files[0])}
                  />
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Structured Key Parameters (Surfaces in EMR 360)</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="form-input" placeholder="Parameter" value={reportParam1Name} onChange={(e) => setReportParam1Name(e.target.value)} />
                    <input className="form-input" placeholder="Value & Unit" value={reportParam1Val} onChange={(e) => setReportParam1Val(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="form-input" placeholder="Parameter" value={reportParam2Name} onChange={(e) => setReportParam2Name(e.target.value)} />
                    <input className="form-input" placeholder="Value & Unit" value={reportParam2Val} onChange={(e) => setReportParam2Val(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="form-input" placeholder="Parameter" value={reportParam3Name} onChange={(e) => setReportParam3Name(e.target.value)} />
                    <input className="form-input" placeholder="Value & Unit" value={reportParam3Val} onChange={(e) => setReportParam3Val(e.target.value)} />
                  </div>
                </div>

                <div className="form-group mb-4">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', color: flaggedAbnormal ? 'var(--status-red)' : 'inherit' }}>
                    <input
                      type="checkbox"
                      checked={flaggedAbnormal}
                      onChange={(e) => setFlaggedAbnormal(e.target.checked)}
                    />
                    <strong>Flag Abnormal / Critical Value Alert</strong>
                  </label>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Pathologist / Clinical Remarks</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="Findings within expected therapeutic limits..."
                    value={clinicalRemarks}
                    onChange={(e) => setClinicalRemarks(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setUploadReportModalOrder(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={uploadingReport}>
                    {uploadingReport ? 'Uploading...' : 'Publish & Notify Patient'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: VIEW REPORT ── */}
      {viewReportModalOrder && activeReportData && (
        <div className="modal-backdrop" onClick={() => setViewReportModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Lab Report Details</h3>
              <button className="modal-close" onClick={() => setViewReportModalOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--teal-900)' }}>{viewReportModalOrder.patient_name}</h4>
                  <div className="ts">{viewReportModalOrder.tests_summary}</div>
                </div>
                {activeReportData.flagged_abnormal ? (
                  <span className="badge badge-red">ABNORMAL VALUES</span>
                ) : (
                  <span className="badge badge-green">NORMAL FINDINGS</span>
                )}
              </div>

              <div style={{ background: 'var(--sage-50)', padding: 14, borderRadius: 8, marginBottom: 16 }}>
                <h5 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--teal-800)', textTransform: 'uppercase' }}>
                  Structured Diagnostic Values
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeReportData.result_data && Object.entries(activeReportData.result_data).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--status-grey)' }}>{k}:</span>
                      <strong style={{ color: 'var(--teal-900)' }}>{String(v)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {activeReportData.clinical_remarks && (
                <div style={{ fontSize: '0.84rem', color: '#4b5563', marginBottom: 16 }}>
                  <strong>Pathologist Remarks:</strong> {activeReportData.clinical_remarks}
                </div>
              )}

              {activeReportData.result_file && (
                <a
                  href={activeReportData.result_file.startsWith('http') ? activeReportData.result_file : `${API_BASE.replace('/api', '')}${activeReportData.result_file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <FileText size={16} /> Download Full Diagnostic PDF
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NEW LAB REQUISITION ORDER ── */}
      {showNewOrder && (
        <div className="modal-backdrop" onClick={() => setShowNewOrder(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Order Home Lab Testing</h3>
              <button className="modal-close" onClick={() => setShowNewOrder(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateOrder}>
              <div className="modal-body">
                {orderError && (
                  <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                    {orderError}
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
                  <label className="form-label">Diagnostic Tests to Include</label>
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--sage-200)', borderRadius: 6, padding: 10 }}>
                    {tests.map(t => {
                      const isChecked = selectedTestIds.includes(t.id);
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--sage-100)', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedTestIds(selectedTestIds.filter(id => id !== t.id));
                                } else {
                                  setSelectedTestIds([...selectedTestIds, t.id]);
                                }
                              }}
                            />
                            <span>{t.name} ({t.sample_type})</span>
                          </div>
                          <strong className="ts">PKR {Number(t.price).toLocaleString()}</strong>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid-2 mb-4">
                  <div>
                    <label className="form-label">Scheduled Collection Time</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={newCollectionTime}
                      onChange={(e) => setNewCollectionTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Collection Address</label>
                    <input
                      className="form-input"
                      placeholder="Patient residence"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group mb-4">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={newFastingRequired}
                      onChange={(e) => setNewFastingRequired(e.target.checked)}
                    />
                    <strong>Fasting Required (8-10 Hours)</strong>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewOrder(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={orderSubmitting}>
                    {orderSubmitting ? 'Submitting...' : 'Create Lab Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
