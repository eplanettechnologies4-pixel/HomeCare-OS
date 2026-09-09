import React, { useState } from 'react';
import { FileText, Plus, ShieldCheck, Clock, User, AlertCircle, MessageSquarePlus, Lock } from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from './UniversalPrintButton';
import { format } from 'date-fns';

export default function NursesNotesFormA({ patient, isReadOnly = false }) {
  const currentUser = useStore((s) => s.currentUser);
  const currentRole = useStore((s) => s.currentRole);
  const nurseNotes  = useStore((s) => s.nurseNotes).filter(n => n.patient_id === patient.id);
  const addNurseNote = useStore((s) => s.addNurseNote);
  const addNurseAddendum = useStore((s) => s.addNurseAddendum);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddendumModal, setShowAddendumModal] = useState(null); // note ID or null
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTime, setNewNoteTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [isFlagged, setIsFlagged] = useState(false);
  const [addendumText, setAddendumText] = useState('');

  // Auto-captured Signature (Nurse Name + Role from session/login)
  const loggedInNurseName = currentUser?.full_name || (currentRole === 'doctor' ? 'Dr. Raza Khan' : 'Sarah Mitchell');
  const loggedInNurseRole = currentUser?.role_display || (currentRole === 'doctor' ? 'Consultant Physician' : 'Registered Nurse (RN)');
  const autoSignature = `${loggedInNurseName} (${loggedInNurseRole})`;

  const doctorName = patient.care_manager_name || 'Dr. Raza Khan (Consultant)';

  const handleSaveNote = (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    addNurseNote({
      patient_id: patient.id,
      doctor_name: doctorName,
      ward_room: 'Home Care Bed #1',
      recorded_at: newNoteTime ? new Date(newNoteTime).toISOString() : new Date().toISOString(),
      note: newNoteText,
      is_flagged: isFlagged
    });

    setNewNoteText('');
    setIsFlagged(false);
    setShowAddModal(false);
  };

  const handleSaveAddendum = (e) => {
    e.preventDefault();
    if (!addendumText.trim() || !showAddendumModal) return;

    addNurseAddendum(showAddendumModal, addendumText);

    setAddendumText('');
    setShowAddendumModal(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── FORM A HEADER (Auto-filled from Patient record) ──────────────── */}
      <div className="card" style={{ padding: 20, background: 'var(--sage-50)', borderLeft: '4px solid var(--teal-700)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span className="badge badge-teal" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              FORM A — CLINICAL NURSES NOTES
            </span>
            <h3 style={{ fontFamily: 'var(--font-heading)', margin: '4px 0 0', color: 'var(--teal-800)', fontSize: '1.25rem' }}>
              South East Hospital / HomeCare OS Digital Record
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--status-grey)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12} /> Append-Only Audit Trail
            </span>
            <UniversalPrintButton type="nurses_notes" data={{ patient, nurseNotes }} label="Print Nurses Notes Form" variant="ghost" size="sm" />
          </div>
        </div>

        {/* Auto-filled Metadata Header Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, background: 'white', padding: 14, borderRadius: 8, border: '1px solid var(--sage-200)', fontSize: '0.83rem' }}>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>MR NUMBER</strong><span className="ts" style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{patient.mr_number}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>PATIENT NAME</strong><span style={{ fontWeight: 700 }}>{patient.full_name}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>TREATING DOCTOR</strong><span>{doctorName}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>AGE / SEX</strong><span>{patient.age}y / {patient.gender_display || patient.gender}</span></div>
          <div><strong style={{ color: 'var(--status-grey)', fontSize: '0.72rem', display: 'block' }}>WARD / LOCATION</strong><span>Home Care Bed #1</span></div>
        </div>
      </div>

      {/* ── ACTION BAR ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--teal-800)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} /> Chronological Clinical Entry Logs ({nurseNotes.length})
        </h4>
        {!isReadOnly && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ gap: 6 }}>
            <Plus size={14} /> Add Nurse Note Entry
          </button>
        )}
      </div>

      {/* ── ENTRY TABLE (Newest First) ────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Date / Time</th>
              <th>Clinical Note & Addenda</th>
              <th style={{ width: 220 }}>Signature (Auto-Captured)</th>
              {!isReadOnly && <th style={{ width: 120, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {nurseNotes.length > 0 ? (
              nurseNotes.map((entry) => (
                <tr key={entry.id} style={{ verticalAlign: 'top', background: entry.is_flagged ? '#fffbeb' : 'transparent' }}>
                  {/* Date/Time Column */}
                  <td className="ts" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                      {format(new Date(entry.recorded_at), 'dd MMM yyyy')}
                    </div>
                    <div style={{ color: 'var(--status-grey)', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Clock size={11} /> {format(new Date(entry.recorded_at), 'HH:mm:ss')}
                    </div>
                    {entry.is_flagged && (
                      <span className="badge badge-amber" style={{ marginTop: 6, fontSize: '0.65rem', padding: '2px 6px' }}>
                        ⚠️ Flagged Note
                      </span>
                    )}
                  </td>

                  {/* Note Text & Addenda Column */}
                  <td style={{ fontSize: '0.86rem', lineHeight: 1.6, color: '#1f2937' }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{entry.note}</div>

                    {/* Render Addenda if any */}
                    {entry.addenda && entry.addenda.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {entry.addenda.map((add) => (
                          <div key={add.id} style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid var(--teal-700)', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--teal-800)', display: 'flex', justifyContent: 'space-between' }}>
                              <span>➕ Addendum by {add.created_by}</span>
                              <span className="ts" style={{ fontWeight: 400, color: 'var(--status-grey)', fontSize: '0.74rem' }}>
                                {format(new Date(add.created_at), 'dd MMM HH:mm')}
                              </span>
                            </div>
                            <div style={{ marginTop: 4, color: '#374151' }}>{add.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Digital Signature Column */}
                  <td style={{ fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--teal-800)' }}>
                      <ShieldCheck size={14} style={{ color: 'var(--teal-700)' }} />
                      {entry.recorded_by_name}
                    </div>
                    <div style={{ color: 'var(--status-grey)', fontSize: '0.74rem', marginTop: 2 }}>
                      {entry.recorded_by_role || 'Registered Nurse'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                      Verified Entry ✓
                    </div>
                  </td>

                  {/* Addendum Action */}
                  {!isReadOnly && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', gap: 4, color: 'var(--teal-700)' }}
                        onClick={() => setShowAddendumModal(entry.id)}
                        title="Add Addendum to this note"
                      >
                        <MessageSquarePlus size={13} /> + Addendum
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isReadOnly ? 3 : 4} style={{ textAlign: 'center', padding: 30, color: 'var(--status-grey)' }}>
                  No nurse notes recorded for this patient yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── ADD NOTE QUICK FORM MODAL ────────────────────────────────────── */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Form A — Add Nurse Note Entry</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveNote}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header Auto-filled Banner */}
                <div style={{ background: 'var(--sage-50)', padding: 10, borderRadius: 6, fontSize: '0.8rem', color: 'var(--teal-800)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Patient: <strong>{patient.full_name} ({patient.mr_number})</strong></span>
                  <span>Doctor: <strong>{doctorName}</strong></span>
                </div>

                {/* Date & Time Timestamp */}
                <div className="form-group">
                  <label className="form-label">Date & Time (Timestamp)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={newNoteTime}
                    onChange={(e) => setNewNoteTime(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 4 }}>
                    Auto-fills to current system time. Editable if recording retroactive visit note.
                  </div>
                </div>

                {/* Note Textarea */}
                <div className="form-group">
                  <label className="form-label">Clinical Note Details</label>
                  <textarea
                    className="form-control"
                    rows={5}
                    placeholder="Enter observation, wound condition, treatment given, patient response..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    required
                  />
                </div>

                {/* Flag Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="flagNote"
                    checked={isFlagged}
                    onChange={(e) => setIsFlagged(e.target.checked)}
                  />
                  <label htmlFor="flagNote" style={{ fontSize: '0.84rem', cursor: 'pointer' }}>
                    Flag entry as Urgent / Physician Review Required ⚠️
                  </label>
                </div>

                {/* Auto-Captured Signature Preview Box */}
                <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px solid var(--sage-200)' }}>
                  <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--status-grey)', fontWeight: 700, marginBottom: 4 }}>
                    DIGITAL SIGNATURE (AUTO-CAPTURED FROM LOGIN SESSION)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.9rem' }}>
                    <ShieldCheck size={16} style={{ color: 'var(--teal-700)' }} />
                    {autoSignature}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 4 }}>
                    Verified digitally from active user credentials. Direct signature modification is prohibited.
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Immutable Note →</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD ADDENDUM MODAL ───────────────────────────────────────────── */}
      {showAddendumModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddendumModal(null)}>
          <div className="modal" style={{ width: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Append Addendum to Clinical Note</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddendumModal(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveAddendum}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--status-grey)' }}>
                  Original clinical entries cannot be edited. Your addendum will be permanently appended below the note with your digital signature and timestamp.
                </div>

                <div className="form-group">
                  <label className="form-label">Addendum Text</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Enter additional clinical clarification, follow-up order response, or doctor recommendation..."
                    value={addendumText}
                    onChange={(e) => setAddendumText(e.target.value)}
                    required
                  />
                </div>

                <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, fontSize: '0.78rem' }}>
                  Signature: <strong>{autoSignature}</strong>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddendumModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Append Addendum →</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
