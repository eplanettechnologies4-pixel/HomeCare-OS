import React, { useState, useEffect } from 'react';
import {
  Clock, CheckCircle, XCircle, AlertCircle, FileText,
  UserCheck, UserMinus, ShieldCheck, ChevronRight, X
} from 'lucide-react';
import apiFetch from '../services/api';

export default function ManagerStaffInbox() {
  const [subTab, setSubTab] = useState('claims'); // 'claims', 'requests', 'complaints', 'resignations', 'permissions'
  const [claims, setClaims] = useState([]);
  const [requests, setRequests] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [resignations, setResignations] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Review modal state
  const [activeItem, setActiveItem] = useState(null);
  const [reviewType, setReviewType] = useState(null); // 'claim', 'request', 'complaint', 'resignation', 'permission'
  const [reviewAction, setReviewAction] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      if (subTab === 'claims') {
        const res = await apiFetch('/staff-portal/overtime-claims/');
        if (res.ok) {
          const json = await res.json();
          setClaims(json.results || json || []);
        }
      } else if (subTab === 'requests') {
        const res = await apiFetch('/staff-portal/requests/');
        if (res.ok) {
          const json = await res.json();
          setRequests(json.results || json || []);
        }
      } else if (subTab === 'complaints') {
        const res = await apiFetch('/staff-portal/complaints/');
        if (res.ok) {
          const json = await res.json();
          setComplaints(json.results || json || []);
        }
      } else if (subTab === 'resignations') {
        const res = await apiFetch('/staff-portal/resignation/');
        if (res.ok) {
          const json = await res.json();
          setResignations(json.results || json || []);
        }
      } else if (subTab === 'permissions') {
        const res = await apiFetch('/staff-portal/permission-requests/');
        if (res.ok) {
          const json = await res.json();
          setPermissions(json.results || json || []);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subTab]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!activeItem || !reviewType) return;
    setSubmitting(true);
    try {
      let endpoint = '';
      let body = {};

      if (reviewType === 'claim') {
        endpoint = `/staff-portal/overtime-claims/${activeItem.id}/review/`;
        body = { action: reviewAction, note: reviewNote };
      } else if (reviewType === 'request') {
        endpoint = `/staff-portal/requests/${activeItem.id}/review_action/`;
        body = { status: reviewAction, reviewer_notes: reviewNote };
      } else if (reviewType === 'complaint') {
        endpoint = `/staff-portal/complaints/${activeItem.id}/resolve/`;
        body = { resolution_note: reviewNote };
      } else if (reviewType === 'resignation') {
        endpoint = `/staff-portal/resignation/${activeItem.id}/review/`;
        body = { action: reviewAction, note: reviewNote };
      } else if (reviewType === 'permission') {
        endpoint = `/staff-portal/permission-requests/${activeItem.id}/review/`;
        body = { action: reviewAction };
      }

      if (endpoint) {
        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setActiveItem(null);
          setReviewNote('');
          loadData();
        } else {
          const err = await res.json();
          alert(err.detail || 'Could not update review status.');
        }
      }
    } catch (err) {
      alert('Network error submitting review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>Staff Requests & HR Inbox</h3>
          <p className="ts">Review pending clinical staff requests, overtime approvals, complaints, and resignations</p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16 }}>
        {[
          { id: 'claims', label: 'Overtime Claims' },
          { id: 'requests', label: 'Clinical Requests' },
          { id: 'complaints', label: 'Complaints' },
          { id: 'resignations', label: 'Resignations' },
          { id: 'permissions', label: 'Permissions' },
        ].map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${subTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner" /></div>
      ) : (
        <div>
          {/* 1. Overtime Claims */}
          {subTab === 'claims' && (
            claims.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Shift Date</th>
                      <th>Claimed</th>
                      <th>Derived Max</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.staff_name}</strong></td>
                        <td>{c.date}</td>
                        <td><strong style={{ color: 'var(--primary)' }}>{c.hours}h</strong></td>
                        <td>{c.derived_max_hours}h</td>
                        <td>{c.reason}</td>
                        <td>
                          <span className={`badge ${c.status === 'approved' ? 'badge-green' : c.status === 'rejected' ? 'badge-red' : c.status === 'paid' ? 'badge-blue' : 'badge-amber'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          {c.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--success)', borderColor: 'var(--success)', padding: '2px 6px', fontSize: '0.72rem' }}
                                onClick={() => {
                                  setActiveItem(c);
                                  setReviewType('claim');
                                  setReviewAction('approve');
                                }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '2px 6px', fontSize: '0.72rem' }}
                                onClick={() => {
                                  setActiveItem(c);
                                  setReviewType('claim');
                                  setReviewAction('reject');
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                              Reviewed ({c.reviewer_name || 'Coordinator'})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No overtime claims in queue.</p>
            )
          )}

          {/* 2. Clinical Requests Queue */}
          {subTab === 'requests' && (
            requests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requests.map((r) => (
                  <div key={r.id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: '0.86rem', textTransform: 'capitalize' }}>
                          {r.request_type?.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: r.urgency === 'urgent' ? 'var(--danger-soft)' : 'var(--primary-soft)', color: r.urgency === 'urgent' ? 'var(--danger)' : 'var(--primary)' }}>
                          {r.urgency?.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                        By: <strong>{r.staff_name}</strong> • Patient: <strong>{r.patient_name || 'General'}</strong> ({r.patient_code || '-'})
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginTop: 4 }}>{r.notes}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.status === 'pending' && (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => {
                            setActiveItem(r);
                            setReviewType('request');
                            setReviewAction('in_progress');
                          }}
                        >
                          Review Request
                        </button>
                      )}
                      <span className={`badge ${r.status === 'done' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No clinical requests pending review.</p>
            )
          )}

          {/* 3. Complaints */}
          {subTab === 'complaints' && (
            complaints.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {complaints.map((comp) => (
                  <div key={comp.id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{comp.subject}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                        From: <strong>{comp.staff_name}</strong> • Category: {comp.category}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginTop: 4 }}>{comp.description}</div>
                      {comp.resolution_note && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--success)', marginTop: 4 }}>
                          Resolved: {comp.resolution_note}
                        </div>
                      )}
                    </div>
                    <div>
                      {comp.status !== 'resolved' ? (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => {
                            setActiveItem(comp);
                            setReviewType('complaint');
                            setReviewAction('resolved');
                          }}
                        >
                          Resolve Complaint
                        </button>
                      ) : (
                        <span className="badge badge-green">Resolved</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No complaints filed.</p>
            )
          )}

          {/* 4. Resignations */}
          {subTab === 'resignations' && (
            resignations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resignations.map((res) => (
                  <div key={res.id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{res.staff_name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                        Notice: {res.notice_period_days} days • Last Working Day: <strong>{res.last_working_day}</strong>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginTop: 4 }}>"{res.reason}"</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {res.status === 'pending' ? (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--success)', borderColor: 'var(--success)', fontSize: '0.72rem' }}
                            onClick={() => {
                              setActiveItem(res);
                              setReviewType('resignation');
                              setReviewAction('accept');
                            }}
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.72rem' }}
                            onClick={() => {
                              setActiveItem(res);
                              setReviewType('resignation');
                              setReviewAction('reject');
                            }}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className={`badge ${res.status === 'accepted' ? 'badge-green' : 'badge-grey'}`}>{res.status}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No resignation requests submitted.</p>
            )
          )}

          {/* 5. Permissions */}
          {subTab === 'permissions' && (
            permissions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {permissions.map((perm) => (
                  <div key={perm.id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>
                        {perm.staff_name} • {perm.start_date} ({perm.start_time} - {perm.end_time})
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: 2 }}>{perm.reason}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {perm.status === 'pending' ? (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--success)', borderColor: 'var(--success)', fontSize: '0.72rem' }}
                            onClick={() => {
                              setActiveItem(perm);
                              setReviewType('permission');
                              setReviewAction('approve');
                            }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.72rem' }}
                            onClick={() => {
                              setActiveItem(perm);
                              setReviewType('permission');
                              setReviewAction('reject');
                            }}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className={`badge ${perm.status === 'approved' ? 'badge-green' : 'badge-red'}`}>{perm.status}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No short-leave permissions in queue.</p>
            )
          )}
        </div>
      )}

      {/* Review Modal */}
      {activeItem && (
        <div className="modal-backdrop" onClick={() => setActiveItem(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
                {reviewType === 'claim' && 'Review Overtime Claim'}
                {reviewType === 'request' && 'Action Staff Request'}
                {reviewType === 'complaint' && 'Resolve Staff Complaint'}
                {reviewType === 'resignation' && 'Review Resignation Notice'}
                {reviewType === 'permission' && 'Review Permission'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveItem(null)}><X size={16} /></button>
            </div>

            <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviewType === 'request' && (
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Set Status</label>
                  <select className="form-control" value={reviewAction} onChange={(e) => setReviewAction(e.target.value)}>
                    <option value="in_progress">In Progress (Assigning coordinator)</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="done">Done / Completed</option>
                    <option value="rejected">Reject</option>
                  </select>
                </div>
              )}

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Reviewer Notes / Feedback</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Enter remarks for the staff member..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  required={reviewType === 'complaint'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
