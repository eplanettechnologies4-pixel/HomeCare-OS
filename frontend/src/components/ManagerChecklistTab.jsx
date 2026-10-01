/**
 * ManagerChecklistTab.jsx
 * ───────────────────────
 * Renders the "Quality Checks" tab in Patient360 and Staff profile.
 * Shows all ManagerVisitChecklist records with expandable section details.
 *
 * Props:
 *   patientId  — show checklists for this patient (optional)
 *   staffId    — show checklists where this staff was evaluated (optional)
 *   currentRole
 */
import React, { useState, useEffect } from 'react';
import { ClipboardCheck, ChevronDown, ChevronUp, User, Clock, AlertCircle } from 'lucide-react';
import apiFetch from '../services/api';

const SECTIONS = [
  {
    key: 'patient_care',
    title: '🏥 Patient Quality Care',
    color: '#0D9488',
    fields: [
      { key: 'pc_hygienic_measures',      label: 'Hygienic Measures' },
      { key: 'pc_mobility',               label: 'Mobility' },
      { key: 'pc_diet',                   label: 'Diet' },
      { key: 'pc_bedsores',               label: 'Bedsores' },
      { key: 'pc_grooming',               label: 'Grooming' },
      { key: 'pc_dressings',              label: 'Dressings (peg/trach/wound)' },
      { key: 'pc_catheter',               label: "NG/Foley's Catheter" },
      { key: 'pc_peripheral_central_line',label: 'Peripheral & Central Line' },
      { key: 'pc_bed_bath',               label: 'Bed Bath' },
    ],
  },
  {
    key: 'staff_appearance',
    title: '👔 Staff Appearance',
    color: '#7C3AED',
    fields: [
      { key: 'sa_dress_code', label: 'Dress Code' },
      { key: 'sa_uniform',    label: 'Uniform' },
      { key: 'sa_shoes',      label: 'Shoes' },
      { key: 'sa_card',       label: 'ID Card' },
      { key: 'sa_hygiene',    label: 'Hygiene' },
      { key: 'sa_grooming',   label: 'Grooming' },
    ],
  },
  {
    key: 'staff_performance',
    title: '⭐ Staff Performance',
    color: '#D97706',
    fields: [
      { key: 'sp_with_family',          label: 'With Family' },
      { key: 'sp_with_patient',         label: 'With Patient' },
      { key: 'sp_with_colleagues',      label: 'With Senior & Junior' },
      { key: 'sp_punctuality',          label: 'Punctuality & Attendance' },
      { key: 'sp_infection_control',    label: 'Infection Control Practices' },
      { key: 'sp_care_plan_adherence',  label: 'Adherence to Care Plan' },
      { key: 'sp_burnout_signs',        label: 'Any Sign of Burnout' },
      { key: 'sp_emergency_protocols',  label: 'Emergency Protocols' },
    ],
  },
  {
    key: 'documentation',
    title: '📄 Documentation',
    color: '#059669',
    fields: [
      { key: 'doc_care_plan_update', label: 'Care Plan Update' },
      { key: 'doc_daily_records',    label: 'Daily Records Accuracy' },
      { key: 'doc_mar_event_records',label: 'MAR / Event Records' },
    ],
  },
];

function SectionBlock({ section, checklist }) {
  const filledCount = section.fields.filter(f => checklist[f.key]).length;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        background: section.color + '15', borderRadius: 8,
        padding: '7px 12px', marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: section.color, fontWeight: 800, fontSize: '0.82rem' }}>{section.title}</span>
        <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>{filledCount}/{section.fields.length} filled</span>
      </div>
      {section.fields.map(field => checklist[field.key] ? (
        <div key={field.key} className="info-row" style={{ paddingLeft: 8 }}>
          <span className="info-label" style={{ fontSize: '0.78rem' }}>{field.label}</span>
          <span className="info-value" style={{ fontSize: '0.82rem', maxWidth: '60%', textAlign: 'right' }}>{checklist[field.key]}</span>
        </div>
      ) : null)}
      {filledCount === 0 && (
        <div style={{ padding: '6px 8px', fontSize: '0.75rem', color: '#9CA3AF', fontStyle: 'italic' }}>
          No remarks recorded for this section.
        </div>
      )}
    </div>
  );
}

function ChecklistCard({ checklist }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          cursor: 'pointer', background: 'var(--sage-50)',
          borderBottom: expanded ? '1px solid var(--sage-100)' : 'none',
        }}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
              {checklist.patient_name}
            </span>
            {checklist.staff_name && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>→ {checklist.staff_name}</span>
            )}
            {checklist.manager_name && (
              <span style={{ fontSize: '0.72rem', background: '#EDE9FE', color: '#7C3AED', borderRadius: 100, padding: '2px 8px' }}>
                by {checklist.manager_name}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 3 }}>
            <Clock size={10} style={{ marginRight: 3 }} />
            {checklist.visit_date || (checklist.created_at ? new Date(checklist.created_at).toLocaleDateString() : '—')}
            {checklist.visit_time && ` at ${checklist.visit_time}`}
            {checklist.staff_initial && ` · Initial: ${checklist.staff_initial}`}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} color="#6B7280" /> : <ChevronDown size={16} color="#6B7280" />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          {SECTIONS.map(section => (
            <SectionBlock key={section.key} section={section} checklist={checklist} />
          ))}

          {/* Manager comments */}
          {(checklist.comments || checklist.family_concerns || checklist.staff_concerns) && (
            <div style={{ background: '#F0F9FF', borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#1E40AF', marginBottom: 8 }}>Manager's Section</div>
              {checklist.comments && (
                <div className="info-row">
                  <span className="info-label">Comments</span>
                  <span className="info-value" style={{ maxWidth: '60%', textAlign: 'right' }}>{checklist.comments}</span>
                </div>
              )}
              {checklist.family_concerns && (
                <div className="info-row">
                  <span className="info-label">Family Concerns</span>
                  <span className="info-value" style={{ maxWidth: '60%', textAlign: 'right', color: '#DC2626' }}>{checklist.family_concerns}</span>
                </div>
              )}
              {checklist.staff_concerns && (
                <div className="info-row">
                  <span className="info-label">Staff Concerns</span>
                  <span className="info-value" style={{ maxWidth: '60%', textAlign: 'right', color: '#D97706' }}>{checklist.staff_concerns}</span>
                </div>
              )}
            </div>
          )}

          {/* Signatures */}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            {checklist.manager_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Manager</div>
                <img src={checklist.manager_signature_url} alt="Manager sig" style={{ height: 55, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
            {checklist.guardian_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Guardian</div>
                <img src={checklist.guardian_signature_url} alt="Guardian sig" style={{ height: 55, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
            {checklist.staff_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Staff</div>
                <img src={checklist.staff_signature_url} alt="Staff sig" style={{ height: 55, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerChecklistTab({ patientId, staffId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let endpoint;
        if (patientId) {
          endpoint = `/patients/${patientId}/manager-checklist/`;
        } else if (staffId) {
          endpoint = `/staff/members/${staffId}/manager-checklist/`;
        } else {
          setLoading(false);
          return;
        }
        const res = await apiFetch(endpoint);
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setRecords(Array.isArray(data) ? data : (data.results || []));
          } else {
            setError(`Error ${res.status}`);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [patientId, staffId]);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <div className="skeleton" style={{ height: 70, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 70, borderRadius: 12 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <AlertCircle size={24} style={{ color: '#EF4444', marginBottom: 8 }} />
        <p style={{ color: 'var(--status-red)', fontSize: '0.88rem' }}>Failed to load checklists: {error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: 0 }}>
            <ClipboardCheck size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Manager Home Visit Checklists
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '4px 0 0' }}>
            Quality-check visits conducted by Care Managers. Submitted from the mobile app during on-site spot checks.
          </p>
        </div>
        <span className="badge badge-teal">{records.length} checks</span>
      </div>

      {records.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <ClipboardCheck size={32} style={{ color: '#E5E7EB', marginBottom: 8 }} />
          <p style={{ color: '#6B7280', fontSize: '0.88rem' }}>No manager checklists submitted yet.</p>
          <p style={{ color: '#9CA3AF', fontSize: '0.78rem', marginTop: 4 }}>
            Checklists are filled by Care Managers during in-person spot checks via the mobile app.
          </p>
        </div>
      ) : (
        records.map(cl => <ChecklistCard key={cl.id} checklist={cl} />)
      )}
    </div>
  );
}
