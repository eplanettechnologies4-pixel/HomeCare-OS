import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Play, Square, Activity, Pill, FileText, Clock, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import apiFetch from '../services/api';
import { formatElapsedTime, getVisitStatusLabel } from '../utils/visitHelpers';

/**
 * NurseVisitBanner
 * Rendered at the top of PatientFile for field nurses.
 * Handles:
 *  - Location permission explanation & one-time browser geolocation capture
 *  - Start Visit -> POST /api/staff-portal/visit/start/
 *  - Active visit banner with live elapsed time & quick clinical actions
 *  - End Visit confirmation modal -> POST /api/staff-portal/visit/end/
 */
export default function NurseVisitBanner({
  patientId,
  patientName,
  onOpenVitals,
  onOpenMar,
  onOpenNotes,
  onVisitChanged,
}) {
  const [activeVisit, setActiveVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // End Visit modal state
  const [showEndModal, setShowEndModal] = useState(false);
  const [visitSummary, setVisitSummary] = useState('');
  const [noCareReason, setNoCareReason] = useState('');
  const [endSummaryResult, setEndSummaryResult] = useState(null);

  const loadActiveVisit = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff-portal/visit/active/');
      if (res && res.active_visit && Number(res.active_visit.patient_id) === Number(patientId)) {
        setActiveVisit(res.active_visit);
      } else {
        setActiveVisit(null);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadActiveVisit();
  }, [loadActiveVisit]);

  // Tick elapsed timer every 30s while visit is active
  useEffect(() => {
    if (!activeVisit || activeVisit.is_ended) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [activeVisit]);

  const captureLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ location_denied: true, denial_reason: 'Geolocation not supported by browser' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
            location_denied: false,
          });
        },
        (err) => {
          resolve({
            location_denied: true,
            denial_reason: err?.message || 'Location permission denied',
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

  const resolveBookingId = async () => {
    const bookings = await apiFetch(`/patients/${patientId}/bookings/`);
    if (Array.isArray(bookings) && bookings.length > 0) {
      const preferred =
        bookings.find((b) => ['in_progress', 'en_route', 'assigned'].includes(b.status)) ||
        bookings[0];
      return preferred.id;
    }
    return null;
  };

  const handleStartVisit = async () => {
    setError(null);
    setEndSummaryResult(null);
    setSubmitting(true);
    try {
      const bookingId = await resolveBookingId();
      if (!bookingId) {
        setError('No booking found for this patient.');
        return;
      }
      const geo = await captureLocation();
      const res = await apiFetch('/staff-portal/visit/start/', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: Number(patientId),
          booking_id: bookingId,
          ...geo,
        }),
      });
      if (res?.visit) {
        setActiveVisit(res.visit);
        setNowMs(Date.now());
        if (onVisitChanged) onVisitChanged(res.visit);
      }
    } catch (e) {
      setError(e?.message || 'Could not start visit.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmEndVisit = async () => {
    if (!activeVisit) return;
    setError(null);
    setSubmitting(true);
    try {
      const geo = await captureLocation();
      const res = await apiFetch('/staff-portal/visit/end/', {
        method: 'POST',
        body: JSON.stringify({
          visit_id: activeVisit.id,
          visit_summary: visitSummary.trim(),
          no_care_actions_reason: noCareReason.trim(),
          ...geo,
        }),
      });
      setActiveVisit(null);
      setShowEndModal(false);
      setVisitSummary('');
      setNoCareReason('');
      if (res?.summary) {
        setEndSummaryResult(res.summary);
      }
      if (onVisitChanged) onVisitChanged(null);
    } catch (e) {
      setError(e?.message || 'Could not end visit.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const statusInfo = getVisitStatusLabel(activeVisit);
  const isWarning = statusInfo.tone === 'warning';
  const isSuccess = statusInfo.tone === 'success';

  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: `1px solid ${activeVisit ? (isWarning ? '#FCD34D' : '#A7F3D0') : '#DDD6FE'}`,
        background: activeVisit ? (isWarning ? '#FFFBEB' : '#ECFDF5') : '#F5F3FF',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Top row: status + Start/End CTA */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {activeVisit ? (
              isWarning ? <AlertTriangle size={18} color="#D97706" /> : <CheckCircle2 size={18} color="#059669" />
            ) : (
              <MapPin size={18} color="#6D28D9" />
            )}
            <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>
              {activeVisit
                ? `Active Visit: ${patientName || activeVisit.patient_name}`
                : `Visit not started — ${patientName || 'Patient'}`}
            </span>
            {activeVisit && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: isSuccess ? '#D1FAE5' : isWarning ? '#FEF3C7' : '#E0E7FF',
                  color: isSuccess ? '#065F46' : isWarning ? '#92400E' : '#3730A3',
                }}
              >
                {statusInfo.label}
              </span>
            )}
          </div>

          {activeVisit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
              <Clock size={14} />
              <span>Elapsed: {formatElapsedTime(activeVisit.checkin_time, nowMs)}</span>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#475569' }}>
              Location is used once to confirm you arrived at the patient&apos;s home.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!activeVisit ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleStartVisit}
              style={{
                background: '#6D28D9',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              <Play size={15} />
              <span>{submitting ? 'Starting…' : 'Start Visit'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowEndModal(true)}
              style={{
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <Square size={14} />
              <span>End Visit</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick clinical actions during active visit */}
      {activeVisit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
          <button
            type="button"
            onClick={onOpenVitals}
            style={{
              background: '#FFFFFF',
              color: '#DC2626',
              border: '1px solid #FECACA',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Activity size={14} />
            <span>Record Vitals</span>
          </button>
          <button
            type="button"
            onClick={onOpenMar}
            style={{
              background: '#FFFFFF',
              color: '#0284C7',
              border: '1px solid #BAE6FD',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Pill size={14} />
            <span>Give Medication</span>
          </button>
          <button
            type="button"
            onClick={onOpenNotes}
            style={{
              background: '#FFFFFF',
              color: '#EA580C',
              border: '1px solid #FED7AA',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <FileText size={14} />
            <span>Nurse Note</span>
          </button>
        </div>
      )}

      {endSummaryResult && (
        <div style={{ fontSize: '12px', color: '#065F46', fontWeight: 600 }}>
          Visit ended ({endSummaryResult.duration_minutes ?? 0} mins) — Recorded: {endSummaryResult.vitals} vitals,{' '}
          {endSummaryResult.medications} medications, {endSummaryResult.notes} notes.
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12px', color: '#B91C1C', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* End Visit Confirmation Modal */}
      {showEndModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10050,
            padding: '16px',
          }}
          onClick={() => setShowEndModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              maxWidth: '440px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>End Visit</h4>
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569' }}>
              Location is used once to confirm check-out. Add an optional visit summary below.
            </p>
            <textarea
              rows={3}
              placeholder="Optional visit summary..."
              value={visitSummary}
              onChange={(e) => setVisitSummary(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                padding: '10px',
                fontSize: '13px',
                marginBottom: '10px',
                fontFamily: 'inherit',
              }}
            />
            <input
              type="text"
              placeholder="If no care actions were recorded, brief reason (optional)"
              value={noCareReason}
              onChange={(e) => setNoCareReason(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                padding: '8px 10px',
                fontSize: '13px',
                marginBottom: '14px',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                style={{
                  background: '#F1F5F9',
                  color: '#334155',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmEndVisit}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Ending…' : 'Confirm End Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

