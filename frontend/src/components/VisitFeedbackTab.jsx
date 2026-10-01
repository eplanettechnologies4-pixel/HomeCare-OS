/**
 * VisitFeedbackTab.jsx
 * ────────────────────
 * Renders the "Feedback History" tab in Patient360 and Staff profile.
 * Shows all VisitFeedback records with ratings, suggestions, and signature images.
 *
 * Props:
 *   patientId  — show all feedback for this patient (optional)
 *   staffId    — show all feedback received by this staff member (optional)
 */
import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, CheckCircle, Clock, Download, ChevronDown, ChevronUp } from 'lucide-react';
import apiFetch from '../services/api';

const RATING_COLORS = {
  excellent: { bg: '#D1FAE5', text: '#065F46', label: 'Excellent' },
  good:      { bg: '#DBEAFE', text: '#1E40AF', label: 'Good' },
  fair:      { bg: '#FEF3C7', text: '#92400E', label: 'Fair' },
  poor:      { bg: '#FEE2E2', text: '#991B1B', label: 'Poor' },
};

const CRITERIA_LABELS = {
  rating_professionalism: 'Professionalism',
  rating_punctuality:     'Punctuality',
  rating_communication:   'Communication & Behaviour',
  rating_hygiene:         'Hygiene Maintenance',
  rating_privacy:         'Respect for Privacy',
  rating_clinical_skills: 'Clinical Skills',
  rating_overall:         'Overall Satisfaction',
};

function RatingBadge({ value }) {
  if (!value) return <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>—</span>;
  const c = RATING_COLORS[value] || RATING_COLORS.good;
  return (
    <span style={{
      background: c.bg, color: c.text,
      borderRadius: 100, padding: '2px 10px',
      fontSize: '0.72rem', fontWeight: 700,
    }}>
      {c.label}
    </span>
  );
}

function ScoreBar({ score }) {
  // score is 1-4; render as coloured bar
  const pct = score ? ((score - 1) / 3) * 100 : 0;
  const color = score >= 3.5 ? '#10B981' : score >= 2.5 ? '#3B82F6' : score >= 1.5 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 100, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 100, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 28 }}>{score?.toFixed(1) ?? '—'}</span>
    </div>
  );
}

function FeedbackCard({ fb, onManagerSign }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
      {/* Card Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          cursor: 'pointer', borderBottom: expanded ? '1px solid var(--sage-100)' : 'none',
          background: 'var(--sage-50)',
        }}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
              {fb.patient_name}
            </span>
            {fb.staff_name && (
              <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>→ {fb.staff_name}</span>
            )}
            {fb.average_rating_score && (
              <ScoreBar score={fb.average_rating_score} />
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 3 }}>
            <Clock size={10} style={{ marginRight: 3 }} />
            {fb.created_at ? new Date(fb.created_at).toLocaleString() : '—'}
            {fb.patient_contact_number && ` · ${fb.patient_contact_number}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!fb.manager_quality_signature_url && onManagerSign && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', color: '#D97706', borderColor: '#FDE68A' }}
              onClick={e => { e.stopPropagation(); onManagerSign(fb.id); }}
            >
              + Manager Sign
            </button>
          )}
          {fb.manager_quality_signature_url && (
            <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700 }}>✔ Mgr Signed</span>
          )}
          {expanded ? <ChevronUp size={16} color="#6B7280" /> : <ChevronDown size={16} color="#6B7280" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          {/* 7-criteria grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
            {Object.entries(CRITERIA_LABELS).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#F9FAFB', borderRadius: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#374151' }}>{label}</span>
                <RatingBadge value={fb[key]} />
              </div>
            ))}
          </div>

          {/* Clinical fields */}
          {fb.prescription_by && (
            <div className="info-row">
              <span className="info-label">Prescription By</span>
              <span className="info-value">{fb.prescription_by}</span>
            </div>
          )}
          {fb.sign_of_reaction && (
            <div className="info-row">
              <span className="info-label">Sign of Reaction</span>
              <span className="info-value" style={{ color: '#DC2626' }}>{fb.sign_of_reaction}</span>
            </div>
          )}
          {fb.suggestions && (
            <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065F46', marginBottom: 4 }}>
                <MessageSquare size={11} style={{ marginRight: 4 }} />Suggestions
              </div>
              <div style={{ fontSize: '0.82rem', color: '#1F2937', lineHeight: 1.5 }}>{fb.suggestions}</div>
            </div>
          )}

          {/* Timestamps */}
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: '0.75rem', color: '#6B7280', flexWrap: 'wrap' }}>
            {fb.attending_time && <span>Attending: {new Date(fb.attending_time).toLocaleTimeString()}</span>}
            {fb.leaving_time   && <span>Leaving: {new Date(fb.leaving_time).toLocaleTimeString()}</span>}
          </div>

          {/* Signatures row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            {fb.patient_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Patient Signature</div>
                <img src={fb.patient_signature_url} alt="Patient signature" style={{ height: 60, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
            {fb.staff_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Staff Signature</div>
                <img src={fb.staff_signature_url} alt="Staff signature" style={{ height: 60, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
            {fb.manager_quality_signature_url && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4 }}>Manager Signature</div>
                <img src={fb.manager_quality_signature_url} alt="Manager signature" style={{ height: 60, border: '1px solid #E5E7EB', borderRadius: 6 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisitFeedbackTab({ patientId, staffId, currentRole }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canManagerSign = ['super_admin', 'admin', 'branch_manager', 'care_manager'].includes(currentRole);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let endpoint;
        if (patientId) {
          endpoint = `/patients/${patientId}/feedback/`;
        } else if (staffId) {
          endpoint = `/staff/members/${staffId}/feedback/`;
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

  const handleManagerSign = async (feedbackId) => {
    const sig = prompt('Paste your base64 signature data URI (data:image/png;base64,...) or use the mobile app for digital signing.');
    if (!sig) return;
    try {
      const res = await apiFetch(`/feedback/${feedbackId}/manager_sign/`, {
        method: 'PATCH',
        body: JSON.stringify({ manager_quality_signature: sig }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecords(prev => prev.map(r => r.id === feedbackId ? updated : r));
        alert('Manager signature added successfully.');
      } else {
        alert('Failed to add manager signature.');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--status-red)', fontSize: '0.88rem' }}>Failed to load feedback: {error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: 0 }}>
            <Star size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Visit Quality Feedback
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '4px 0 0' }}>
            Ratings submitted by patients/families after each visit.
            {canManagerSign && ' Click "Manager Sign" to add your quality signature.'}
          </p>
        </div>
        <span className="badge badge-teal">{records.length} records</span>
      </div>

      {records.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <Star size={32} style={{ color: '#E5E7EB', marginBottom: 8 }} />
          <p style={{ color: '#6B7280', fontSize: '0.88rem' }}>No feedback forms submitted yet.</p>
          <p style={{ color: '#9CA3AF', fontSize: '0.78rem', marginTop: 4 }}>
            Feedback is submitted from the mobile app at the end of each visit.
          </p>
        </div>
      ) : (
        <>
          {/* Average score banner */}
          {records.some(r => r.average_rating_score) && (
            <div className="card" style={{ padding: '12px 18px', marginBottom: 16, background: 'var(--sage-50)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', marginBottom: 2 }}>Average Rating Score</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-700)' }}>
                  {(records.reduce((sum, r) => sum + (r.average_rating_score || 0), 0) / records.filter(r => r.average_rating_score).length).toFixed(2)}
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6B7280', marginLeft: 4 }}>/4.00</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', marginBottom: 2 }}>Total Reviews</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#374151' }}>{records.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', marginBottom: 2 }}>Manager Signed</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10B981' }}>
                  {records.filter(r => r.manager_quality_signature_url).length}
                </div>
              </div>
            </div>
          )}

          {records.map(fb => (
            <FeedbackCard
              key={fb.id}
              fb={fb}
              onManagerSign={canManagerSign ? handleManagerSign : null}
            />
          ))}
        </>
      )}
    </div>
  );
}
