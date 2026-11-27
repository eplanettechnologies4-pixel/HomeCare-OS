import React, { useState, useEffect, useCallback } from 'react';
import {
  Pill, Clock, Calendar, Check, AlertTriangle, AlertCircle,
  ChevronLeft, ChevronRight, Printer, RefreshCw, X, Shield, Info,
  CheckCircle2, HelpCircle
} from 'lucide-react';
import apiFetch from '../services/api';
import useStore from '../store/useStore';

export default function PaperMedicationSheet({ patientId, readOnly = false }) {
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = useStore((s) => s.currentRole);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    // Monday of current week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  });

  // Administer modal state
  const [administerModal, setAdministerModal] = useState(null);
  const [adminStatus, setAdminStatus] = useState('given');
  const [adminSlotTime, setAdminSlotTime] = useState('');
  const [adminDose, setAdminDose] = useState('');
  const [adminRoute, setAdminRoute] = useState('');
  const [adminReason, setAdminReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [overrideAllergy, setOverrideAllergy] = useState(false);
  const [allergyAlertMsg, setAllergyAlertMsg] = useState(null);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState(null);

  const isNurse = ['nurse', 'chief_nurse', 'staff_nurse'].includes((currentRole || '').toLowerCase());
  const isTrainee = currentUser?.lifecycle_stage === 'trainee';
  const canAdminister = isNurse && !isTrainee && !readOnly;

  const fetchMarSheet = useCallback(async (start) => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const q = start ? `?start_date=${start}` : '';
      const res = await apiFetch(`/api/patients/${patientId}/mar-sheet/${q}`);
      setData(res);
      if (res?.pager?.start_date) {
        setStartDate(res.pager.start_date);
      }
    } catch (err) {
      console.error('Failed to load MAR sheet:', err);
      setError(err?.detail || err?.message || 'Unable to load Medication Administration Record');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchMarSheet(startDate);
  }, [fetchMarSheet, startDate]);

  const openAdministerModal = (rx, dayIndex, slotTime, existingCell) => {
    if (!canAdminister) return;
    setAdministerModal({
      rx,
      dayIndex,
      slotTime,
      existingCell,
    });
    setAdminStatus('given');
    setAdminSlotTime(slotTime || '08:00');
    setAdminDose(rx.dosage || '');
    setAdminRoute(rx.route || 'PO');
    setAdminReason('');
    setAdminNotes('');
    setOverrideAllergy(false);
    setAllergyAlertMsg(null);
    setAdminFeedback(null);
  };

  const submitAdminister = async (e) => {
    e.preventDefault();
    if (!administerModal) return;

    if (adminStatus !== 'given' && !adminReason.trim()) {
      setAdminFeedback({ type: 'error', text: 'Reason is required when medication is held, refused, or omitted.' });
      return;
    }

    setSubmittingAdmin(true);
    setAdminFeedback(null);
    try {
      await apiFetch(`/api/patients/${patientId}/mar/administer/`, {
        method: 'POST',
        body: JSON.stringify({
          prescription_id: administerModal.rx.id,
          day_number: administerModal.dayIndex,
          slot_time: adminSlotTime,
          status: adminStatus,
          dose_given: adminDose,
          route: adminRoute,
          reason: adminReason,
          notes: adminNotes,
          override_allergy: overrideAllergy,
        }),
      });

      setAdminFeedback({ type: 'success', text: 'Medication administration recorded successfully.' });
      setTimeout(() => {
        setAdministerModal(null);
        fetchMarSheet(startDate);
      }, 700);
    } catch (err) {
      console.error('Administer error:', err);
      if (err?.error === 'allergy_conflict') {
        setAllergyAlertMsg(err.detail || 'Patient has a recorded allergy to this medication. Clinical override is required.');
      } else {
        setAdminFeedback({ type: 'error', text: err?.detail || err?.message || 'Failed to record administration.' });
      }
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6B7280' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px', color: '#6D28D9' }} />
        <div>Loading Medication Administration Record...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '24px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, color: '#991B1B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <AlertCircle size={18} />
          <span>Medication Sheet Unavailable</span>
        </div>
        <p style={{ marginTop: 6, fontSize: '13px' }}>{error}</p>
        <button
          type="button"
          onClick={() => fetchMarSheet(startDate)}
          style={{ marginTop: 12, padding: '6px 14px', borderRadius: 8, background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
        >
          Retry
        </button>
      </div>
    );
  }

  const patient = data?.patient || {};
  const days = data?.days || [];
  const pager = data?.pager || {};
  const prescriptions = data?.prescriptions || [];

  return (
    <div className="paper-mar-container" style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20 }}>
      {/* ── Toolbar: Pager & Print ── */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => pager.prev_start_date && fetchMarSheet(pager.prev_start_date)}
            disabled={!pager.prev_start_date || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#F9FAFB',
              color: '#374151',
              cursor: pager.prev_start_date ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <ChevronLeft size={14} />
            <span>Prev 7 Days</span>
          </button>

          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937' }}>
            {pager.start_date} to {pager.end_date}
          </span>

          <button
            type="button"
            onClick={() => pager.next_start_date && fetchMarSheet(pager.next_start_date)}
            disabled={!pager.next_start_date || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#F9FAFB',
              color: '#374151',
              cursor: pager.next_start_date ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span>Next 7 Days</span>
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isTrainee && (
            <span style={{ fontSize: '11px', color: '#D97706', background: '#FEF3C7', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              Trainee Mode: Read-Only
            </span>
          )}
          {!isNurse && (
            <span style={{ fontSize: '11px', color: '#4B5563', background: '#F3F4F6', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              Viewing As {currentRole?.toUpperCase() || 'OBSERVER'} (Read-Only)
            </span>
          )}
          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              background: '#4F46E5',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Printer size={14} />
            <span>Print MAR Sheet</span>
          </button>
        </div>
      </div>

      {/* ── Paper Header: Hospital / Clinic Drug Administration Record ── */}
      <div
        className="paper-mar-header"
        style={{
          border: '2px solid #1E293B',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          background: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #CBD5E1', paddingBottom: 8, marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, letterSpacing: '0.04em', color: '#0F172A', textTransform: 'uppercase' }}>
              eHealth Home Care Services
            </h3>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
              DRUG ADMINISTRATION RECORD (MAR)
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748B' }}>
            <div>Form: MAR-7D</div>
            <div>Window: 7-Day Cycle</div>
          </div>
        </div>

        {/* Patient Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
            fontSize: '12px',
          }}
        >
          <div>
            <strong style={{ color: '#475569' }}>Patient Name: </strong>
            <span style={{ fontWeight: 800, color: '#0F172A' }}>{patient.full_name}</span>
          </div>
          <div>
            <strong style={{ color: '#475569' }}>MRN: </strong>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>{patient.mr_number || 'N/A'}</span>
          </div>
          <div>
            <strong style={{ color: '#475569' }}>Age / Sex: </strong>
            <span>{patient.age || '—'} yrs / {patient.gender || '—'}</span>
          </div>
          <div>
            <strong style={{ color: '#475569' }}>Room / Bed: </strong>
            <span>{patient.room || patient.address || 'Home Bed'}</span>
          </div>
          <div>
            <strong style={{ color: '#475569' }}>Consultant: </strong>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>{patient.consultant || 'Dr. Assigned'}</span>
          </div>
        </div>
      </div>

      {/* ── Prescriptions Grid Table ── */}
      {prescriptions.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', border: '1px dashed #CBD5E1', borderRadius: 8 }}>
          No active medication prescriptions recorded for this patient.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="paper-rx-block"
              style={{
                border: '1.5px solid #334155',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#FFFFFF',
              }}
            >
              {/* Prescription Header / Medication Order */}
              <div
                style={{
                  background: '#F1F5F9',
                  borderBottom: '1.5px solid #334155',
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>
                    {rx.brand_name || rx.medication}
                  </span>
                  {rx.generic_name && (
                    <span style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
                      ({rx.generic_name})
                    </span>
                  )}
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', background: '#E2E8F0', padding: '2px 8px', borderRadius: 4 }}>
                    {rx.dosage} • {rx.route}
                  </span>
                </div>

                {/* Doctor Verification Signature Line */}
                <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {rx.doctor_signature?.is_verified ? (
                    <span style={{ color: '#065F46', background: '#D1FAE5', padding: '3px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #A7F3D0' }}>
                      ✓ Dr. Sig: {rx.doctor_signature.label}
                    </span>
                  ) : (
                    <span style={{ color: '#92400E', background: '#FEF3C7', padding: '3px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #FDE68A' }}>
                      ⚠ {rx.doctor_signature?.label || 'Pending Dr Verification'}
                    </span>
                  )}
                </div>
              </div>

              {/* Order Meta Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 12px',
                  background: '#FAFAFA',
                  borderBottom: '1px solid #E2E8F0',
                  fontSize: '11px',
                  color: '#475569',
                }}
              >
                <div>
                  <strong>Freq: </strong>{rx.frequency} ({rx.interval_desc})
                  <span style={{ margin: '0 8px' }}>|</span>
                  <strong>Start: </strong>{rx.date || '—'}
                  <span style={{ margin: '0 8px' }}>|</span>
                  <strong>D/C: </strong>{rx.discontinued_date || 'Active'}
                </div>
                <div>
                  <strong>Prescribed By: </strong>{rx.consultant || 'Consultant'}
                </div>
              </div>

              {/* 7-Day MAR Grid */}
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'center',
                    fontSize: '12px',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #64748B' }}>
                      <th style={{ width: '80px', padding: '6px 4px', borderRight: '1px solid #CBD5E1', fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                        Time
                      </th>
                      {days.map((d, dIdx) => (
                        <th
                          key={d.date || dIdx}
                          style={{
                            padding: '6px 4px',
                            borderRight: dIdx === 6 ? 'none' : '1px solid #CBD5E1',
                            background: d.is_today ? '#EEF2FF' : '#F8FAFC',
                            color: d.is_today ? '#4F46E5' : '#1E293B',
                            fontWeight: 800,
                            fontSize: '11px',
                          }}
                        >
                          <div>{d.day_name}</div>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: d.is_today ? '#4338CA' : '#64748B' }}>
                            {d.date_str}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rx.rows && rx.rows.map((row, rIdx) => (
                      <tr key={rIdx} style={{ borderBottom: rIdx === rx.rows.length - 1 ? 'none' : '1px solid #E2E8F0', height: 42 }}>
                        {/* Time Slot Column */}
                        <td
                          style={{
                            padding: '6px 4px',
                            borderRight: '1px solid #CBD5E1',
                            fontWeight: 800,
                            color: '#1E293B',
                            background: '#F8FAFC',
                            fontSize: '12px',
                          }}
                        >
                          {row.slot_time || 'PRN'}
                        </td>

                        {/* 7 Day Columns */}
                        {days.map((d, dIdx) => {
                          const cell = row.days ? row.days[dIdx] : null;
                          const cellState = cell?.state || 'future';

                          let bg = '#FFFFFF';
                          let border = 'none';
                          let textColor = '#64748B';

                          if (d.is_today) {
                            bg = '#FAFAFA';
                          }

                          if (cellState === 'given') {
                            bg = '#DCFCE7';
                            textColor = '#166534';
                          } else if (cellState === 'due') {
                            bg = '#FEF3C7';
                            textColor = '#92400E';
                            border = '1.5px solid #F59E0B';
                          } else if (cellState === 'late') {
                            bg = '#FEE2E2';
                            textColor = '#991B1B';
                            border = '1.5px solid #EF4444';
                          } else if (cellState === 'not_given') {
                            bg = '#F1F5F9';
                            textColor = '#64748B';
                          }

                          const isClickable = canAdminister && (cellState === 'due' || cellState === 'late' || cellState === 'future');

                          return (
                            <td
                              key={dIdx}
                              onClick={() => isClickable && openAdministerModal(rx, dIdx, row.slot_time, cell)}
                              style={{
                                padding: '4px',
                                borderRight: dIdx === 6 ? 'none' : '1px solid #E2E8F0',
                                background: bg,
                                color: textColor,
                                cursor: isClickable ? 'pointer' : 'default',
                                verticalAlign: 'middle',
                                position: 'relative',
                                outline: border,
                              }}
                              title={cell?.title || ''}
                            >
                              {cellState === 'given' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
                                  <span style={{ fontWeight: 900, fontSize: '11px', color: '#166534' }}>
                                    {cell.administered_by_initials || '✓'}
                                  </span>
                                  <span style={{ fontSize: '9px', color: '#15803D' }}>
                                    {cell.label}
                                  </span>
                                </div>
                              )}

                              {cellState === 'due' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, fontSize: '10px', color: '#B45309' }}>
                                    DUE
                                  </span>
                                  {canAdminister && (
                                    <span style={{ fontSize: '8px', color: '#D97706', textDecoration: 'underline' }}>
                                      Tap to give
                                    </span>
                                  )}
                                </div>
                              )}

                              {cellState === 'late' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, fontSize: '10px', color: '#DC2626' }}>
                                    LATE
                                  </span>
                                  {canAdminister && (
                                    <span style={{ fontSize: '8px', color: '#EF4444', textDecoration: 'underline' }}>
                                      Give now
                                    </span>
                                  )}
                                </div>
                              )}

                              {cellState === 'not_given' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'line-through' }}>
                                  <span style={{ fontWeight: 700, fontSize: '10px' }}>
                                    {cell.label || 'Held'}
                                  </span>
                                  {cell.reason && (
                                    <span style={{ fontSize: '8px', textDecoration: 'none' }}>
                                      {cell.reason}
                                    </span>
                                  )}
                                </div>
                              )}

                              {cellState === 'future' && (
                                <span style={{ color: '#CBD5E1', fontSize: '11px' }}>
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Administer Medication Modal ── */}
      {administerModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              maxWidth: 500,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill size={20} style={{ color: '#4F46E5' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Administer Medication
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAdministerModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Medication Info Card */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                {administerModal.rx.brand_name || administerModal.rx.medication}
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: 2 }}>
                Dose: <strong>{administerModal.rx.dosage}</strong> • Route: <strong>{administerModal.rx.route}</strong> • Freq: <strong>{administerModal.rx.frequency}</strong>
              </div>
            </div>

            {/* Allergy Conflict Warning Banner */}
            {allergyAlertMsg && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991B1B', fontWeight: 800, fontSize: '13px' }}>
                  <AlertTriangle size={18} />
                  <span>ALLERGY ALERT</span>
                </div>
                <p style={{ margin: '6px 0 10px', fontSize: '12px', color: '#7F1D1D' }}>
                  {allergyAlertMsg}
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', fontWeight: 700, color: '#991B1B', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={overrideAllergy}
                    onChange={(e) => setOverrideAllergy(e.target.checked)}
                  />
                  <span>Confirm clinical override: Doctor approved administration</span>
                </label>
              </div>
            )}

            {adminFeedback && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  marginBottom: 14,
                  fontSize: '12px',
                  fontWeight: 600,
                  background: adminFeedback.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                  color: adminFeedback.type === 'success' ? '#166534' : '#991B1B',
                }}
              >
                {adminFeedback.text}
              </div>
            )}

            <form onSubmit={submitAdminister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Administration Status Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Action / Outcome
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {['given', 'held', 'refused', 'omitted'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setAdminStatus(st)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: 8,
                        fontSize: '12px',
                        fontWeight: adminStatus === st ? 800 : 500,
                        border: adminStatus === st ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                        background: adminStatus === st ? '#EEF2FF' : '#FFFFFF',
                        color: adminStatus === st ? '#4338CA' : '#475569',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slot Time & Dose */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Slot Time
                  </label>
                  <input
                    type="time"
                    value={adminSlotTime}
                    onChange={(e) => setAdminSlotTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Dose Given
                  </label>
                  <input
                    type="text"
                    value={adminDose}
                    onChange={(e) => setAdminDose(e.target.value)}
                    placeholder="e.g. 500mg"
                    required={adminStatus === 'given'}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Route */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Route
                </label>
                <input
                  type="text"
                  value={adminRoute}
                  onChange={(e) => setAdminRoute(e.target.value)}
                  placeholder="e.g. PO, IV, SC"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              {/* Reason (required for held/refused/omitted) */}
              {adminStatus !== 'given' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>
                    Reason for Non-Administration *
                  </label>
                  <input
                    type="text"
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    placeholder="e.g. Patient refused, NPO for surgery, Low BP"
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #F87171', fontSize: '13px' }}
                  />
                </div>
              )}

              {/* Additional Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Clinical Notes (Optional)
                </label>
                <input
                  type="text"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Given with applesauce, tolerated well"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setAdministerModal(null)}
                  disabled={submittingAdmin}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    background: '#FFFFFF',
                    color: '#374151',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdmin}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4F46E5',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: submittingAdmin ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingAdmin ? 'Recording...' : 'Record Administration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print-specific style tag */}
      <style>{`
        @media print {
          body {
            background: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          .paper-mar-container {
            border: none !important;
            padding: 0 !important;
          }
          .paper-rx-block {
            page-break-inside: avoid;
            margin-bottom: 12px;
          }
        }
      `}</style>
    </div>
  );
}

