import React, { useState } from 'react';
import { Pill, Plus, ShieldCheck, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Calendar, AlertTriangle, Lock } from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from './UniversalPrintButton';
import { format, subDays, addDays } from 'date-fns';

export default function MarSheetFormC({ patient, isReadOnly = false }) {
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = useStore((s) => s.currentRole);
  const marMedications = useStore((s) => s.marMedications).filter(m => m.patient_id === patient.id);
  const addMarMedication = useStore((s) => s.addMarMedication);
  const administerMarDose = useStore((s) => s.administerMarDose);
  const discontinueMarMedication = useStore((s) => s.discontinueMarMedication);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiscontinued, setShowDiscontinued] = useState(false);

  // Auto-captured Signature
  const loggedInNurseName = currentUser?.full_name || (currentRole === 'doctor' ? 'Dr. Raza Khan' : 'Sarah Mitchell');
  const loggedInNurseRole = currentUser?.role_display || (currentRole === 'doctor' ? 'Consultant Physician' : 'Registered Nurse (RN)');
  const autoSignature = `${loggedInNurseName} (${loggedInNurseRole})`;

  const consultantName = patient.care_manager_name || 'Dr. Raza Khan (Consultant)';

  // Generate 7-day grid headers (Day 1 through Day 7)
  const today = new Date();
  const daysHeader = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    return {
      dayIndex: i + 1,
      label: `Day ${i + 1}`,
      dateStr: format(d, 'dd MMM'),
      isToday: i === 6
    };
  });

  // Active vs Discontinued Medications
  const activeMeds = marMedications.filter(m => !m.is_discontinued);
  const discontinuedMeds = marMedications.filter(m => m.is_discontinued);

  // Today's MAR Tasks due count
  const todayDueTasks = activeMeds.filter(m => !m.days?.[7]?.given);

  // Add Drug Form State
  const [newMedData, setNewMedData] = useState({
    brand_name: '',
    generic_name: '',
    dose: '',
    route: 'PO (Oral)',
    frequency: 'OD Morning (09:00)',
    prescription_type: 'regular',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    dc_date: format(addDays(new Date(), 30), 'yyyy-MM-dd')
  });

  const handleSaveDrug = (e) => {
    e.preventDefault();
    if (!newMedData.brand_name.trim()) return;

    addMarMedication({
      patient_id: patient.id,
      consultant_name: consultantName,
      ward_room: 'Home Care Bed #1 / Ward 4B',
      ...newMedData
    });

    setNewMedData({
      brand_name: '',
      generic_name: '',
      dose: '',
      route: 'PO (Oral)',
      frequency: 'OD Morning (09:00)',
      prescription_type: 'regular',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      dc_date: format(addDays(new Date(), 30), 'yyyy-MM-dd')
    });
    setShowAddModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── FORM C HEADER (South East Hospital MAR Format) ────────────────── */}
      <div className="card" style={{ padding: 20, background: 'var(--sage-50)', borderLeft: '4px solid var(--teal-700)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span className="badge badge-teal" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              FORM C — DRUG ADMINISTRATION RECORD (MAR SHEET & PRN MEDS)
            </span>
            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '4px 0 0', color: 'var(--teal-800)', fontSize: '1.25rem' }}>
              South East Hospital / Medication Chart
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <UniversalPrintButton type="mar_sheet" data={{ patient, activeMeds, discontinuedMeds }} label="Print MAR Sheet" variant="ghost" size="sm" />
          </div>
        </div>

        {/* Header Metadata Banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, background: 'white', padding: 14, borderRadius: 8, border: '1px solid var(--sage-200)', fontSize: '0.83rem' }}>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>CONSULTANT NAME</strong><span>{consultantName}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>WARD / ROOM</strong><span>Home Care Bed #1 / Ward 4B</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>PATIENT NAME</strong><span style={{ fontWeight: 700 }}>{patient.full_name}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>AGE / SEX</strong><span>{patient.age}y / {patient.gender_display || patient.gender}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>PATIENT # / MR</strong><span className="ts" style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{patient.mr_number}</span></div>
        </div>
      </div>

      {/* ── TODAY'S MAR QUICK TASKS BANNER ───────────────────────────────── */}
      <div className="card" style={{ padding: 16, background: todayDueTasks.length > 0 ? '#fffbeb' : '#f0fdf4', borderLeft: `5px solid ${todayDueTasks.length > 0 ? '#f59e0b' : '#10b981'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: todayDueTasks.length > 0 ? '#92400e' : '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
              {todayDueTasks.length > 0 ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
              Today's MAR Administration Tasks ({todayDueTasks.length} Pending Doses Today)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: 2 }}>
              Logged-in Nurse: <strong>{autoSignature}</strong> · Anti-backdating digital verification enabled.
            </div>
          </div>

          {!isReadOnly && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ gap: 6 }}>
              <Plus size={14} /> Add Prescribed Drug Card
            </button>
          )}
        </div>
      </div>

      {/* ── ACTIVE MAR DRUGS CARDS & 7-DAY GRID ──────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill size={18} /> Active Prescribed Medication Cards ({activeMeds.length})
        </div>

        {activeMeds.map((med) => (
          <div key={med.id} className="card" style={{ padding: 18, border: '1px solid var(--sage-200)', borderTop: '4px solid var(--teal-700)' }}>
            {/* Drug Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--sage-100)', paddingBottom: 10, marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--teal-800)' }}>
                    {med.brand_name}
                  </h4>
                  <span style={{ fontSize: '0.85rem', color: 'var(--status-grey)' }}>({med.generic_name})</span>
                  <span className={`badge ${med.prescription_type === 'regular' ? 'badge-teal' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                    {med.prescription_type === 'regular' ? 'Regular Prescription' : 'PRN Medication'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: '0.82rem', color: '#4b5563' }}>
                  <span><strong>Dose:</strong> {med.dose}</span>
                  <span><strong>Route:</strong> {med.route}</span>
                  <span><strong>Frequency:</strong> {med.frequency}</span>
                  <span><strong>Consultant:</strong> {med.consultant_name}</span>
                </div>
              </div>

              {!isReadOnly && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--status-red)', fontSize: '0.75rem' }}
                  onClick={() => discontinueMarMedication(med.id)}
                  title="Discontinue drug (move to audit archive)"
                >
                  Discontinue (D/C)
                </button>
              )}
            </div>

            {/* 7-DAY ADMINISTRATION GRID */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.78rem', textAlign: 'center', border: '1px solid var(--sage-200)' }}>
                <thead>
                  <tr style={{ background: 'var(--sage-100)', color: 'var(--teal-800)' }}>
                    {daysHeader.map((dh) => (
                      <th key={dh.dayIndex} style={{ textAlign: 'center', background: dh.isToday ? 'rgba(222,154,60,0.15)' : 'transparent', color: dh.isToday ? 'var(--amber-800)' : 'inherit' }}>
                        <div>{dh.label}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--status-grey)' }}>{dh.dateStr}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {daysHeader.map((dh) => {
                      const dayRecord = med.days?.[dh.dayIndex] || { given: false };

                      return (
                        <td
                          key={dh.dayIndex}
                          style={{
                            padding: 10,
                            background: dh.isToday ? '#fefce8' : 'white',
                            verticalAlign: 'middle',
                            minWidth: 100
                          }}
                        >
                          {dayRecord.given ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: '1.2rem', color: 'var(--teal-700)', fontWeight: 800 }}>✓</span>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--teal-800)' }}>
                                {dayRecord.time}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--status-grey)', textAlign: 'center', maxWidth: 90, lineHeight: 1.1 }}>
                                {dayRecord.nurse_name}
                              </div>
                            </div>
                          ) : dh.isToday && !isReadOnly ? (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.7rem', padding: '4px 8px', gap: 4 }}
                              onClick={() => administerMarDose(med.id, 7)}
                            >
                              <CheckCircle size={12} /> Administer & Sign
                            </button>
                          ) : (
                            <div style={{ color: '#d1d5db', fontSize: '0.75rem' }}>
                              {dh.dayIndex > 7 ? 'Future' : '—'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* ── DISCONTINUED MEDICATIONS COLLAPSED SECTION ───────────────────── */}
      {discontinuedMeds.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'space-between', fontWeight: 700, color: 'var(--status-grey)' }}
            onClick={() => setShowDiscontinued(!showDiscontinued)}
          >
            <span>Discontinued Medications Audit Trail ({discontinuedMeds.length})</span>
            {showDiscontinued ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showDiscontinued && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {discontinuedMeds.map((med) => (
                <div key={med.id} style={{ background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px dashed #d1d5db', opacity: 0.75 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ textDecoration: 'line-through' }}>{med.brand_name} ({med.generic_name})</strong>
                    <span className="badge badge-grey">D/C Discontinued</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
                    Dose: {med.dose} · Route: {med.route} · D/C Date: {med.dc_date || 'Past Date'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ADD DRUG MODAL ───────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Form C — Add Medication to Patient MAR Sheet</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveDrug}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                <div style={{ background: 'var(--sage-50)', padding: 10, borderRadius: 6, fontSize: '0.8rem', color: 'var(--teal-800)' }}>
                  Adding to Active MAR for <strong>{patient.full_name} ({patient.mr_number})</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Brand Name</label>
                    <input type="text" placeholder="e.g. Glucophage" className="form-control" value={newMedData.brand_name} onChange={(e) => setNewMedData({ ...newMedData, brand_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Generic Name</label>
                    <input type="text" placeholder="e.g. Metformin HCl" className="form-control" value={newMedData.generic_name} onChange={(e) => setNewMedData({ ...newMedData, generic_name: e.target.value })} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Dose</label>
                    <input type="text" placeholder="500 mg" className="form-control" value={newMedData.dose} onChange={(e) => setNewMedData({ ...newMedData, dose: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Route</label>
                    <select className="form-control" value={newMedData.route} onChange={(e) => setNewMedData({ ...newMedData, route: e.target.value })}>
                      <option value="PO (Oral)">PO (Oral)</option>
                      <option value="SC (Subcutaneous)">SC (Subcutaneous)</option>
                      <option value="IV (Intravenous)">IV (Intravenous)</option>
                      <option value="IM (Intramuscular)">IM (Intramuscular)</option>
                      <option value="Topical">Topical</option>
                      <option value="Inhalation">Inhalation</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={newMedData.prescription_type} onChange={(e) => setNewMedData({ ...newMedData, prescription_type: e.target.value })}>
                      <option value="regular">Regular Prescription</option>
                      <option value="prn">PRN Medication</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Frequency & Schedule</label>
                  <input type="text" placeholder="e.g. BD (Twice Daily - 08:00, 20:00)" className="form-control" value={newMedData.frequency} onChange={(e) => setNewMedData({ ...newMedData, frequency: e.target.value })} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input type="date" className="form-control" value={newMedData.start_date} onChange={(e) => setNewMedData({ ...newMedData, start_date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discontinue (D/C) Date</label>
                    <input type="date" className="form-control" value={newMedData.dc_date} onChange={(e) => setNewMedData({ ...newMedData, dc_date: e.target.value })} />
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, fontSize: '0.78rem' }}>
                  Prescribing Consultant: <strong>{consultantName}</strong>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Drug to Active MAR →</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
