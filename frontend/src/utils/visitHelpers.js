/**
 * Helpers for the Nurse Visit Flow (distance, elapsed time, status labels).
 */

/**
 * Great-circle distance in metres between two GPS coordinates.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (
    lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
    Number.isNaN(Number(lat1)) || Number.isNaN(Number(lng1)) ||
    Number.isNaN(Number(lat2)) || Number.isNaN(Number(lng2))
  ) {
    return null;
  }
  const R = 6371000;
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(Number(lat2) - Number(lat1));
  const dLambda = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format elapsed time from an ISO check-in timestamp to now (or optional endIso).
 * Examples: "0 mins", "45 mins", "2 hrs 15 mins", "1 hr 0 mins"
 */
export function formatElapsedTime(checkinIso, nowMs = Date.now()) {
  if (!checkinIso) return '0 mins';
  const start = new Date(checkinIso).getTime();
  if (Number.isNaN(start)) return '0 mins';
  const diffMins = Math.max(0, Math.floor((nowMs - start) / 60000));
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hrs === 0) {
    return `${mins} ${mins === 1 ? 'min' : 'mins'}`;
  }
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${mins} ${mins === 1 ? 'min' : 'mins'}`;
}

/**
 * Human-readable label & tone for a NurseVisit object.
 */
export function getVisitStatusLabel(visit) {
  if (!visit) {
    return { label: 'Not started', tone: 'neutral' };
  }
  if (visit.is_ended) {
    if (visit.checkin_location_denied) {
      return { label: 'Completed (location not verified)', tone: 'warning' };
    }
    if (visit.checkin_outside_area) {
      return { label: 'Completed (outside area)', tone: 'warning' };
    }
    if (visit.checkin_low_accuracy) {
      return { label: 'Completed (low accuracy)', tone: 'warning' };
    }
    if (visit.checkin_denial_reason && visit.checkin_denial_reason.includes('no patient coordinates')) {
      return { label: 'Completed (no patient coordinates)', tone: 'warning' };
    }
    return { label: 'Visit completed', tone: 'success' };
  }
  if (visit.checkin_location_denied) {
    return { label: 'In progress — location not verified', tone: 'warning' };
  }
  if (visit.checkin_outside_area) {
    return { label: 'In progress — outside area', tone: 'warning' };
  }
  if (visit.checkin_low_accuracy) {
    return { label: 'In progress — low accuracy', tone: 'warning' };
  }
  if (visit.checkin_denial_reason && visit.checkin_denial_reason.includes('no patient coordinates')) {
    return { label: 'In progress — no patient coordinates', tone: 'warning' };
  }
  if (visit.checkin_verified) {
    return { label: 'In progress — location verified', tone: 'success' };
  }
  return { label: 'In progress', tone: 'info' };
}

