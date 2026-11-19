/**
 * HomeCare OS — Smart Roster & Portal Helper Utilities
 */

export function formatRosterHours(hours) {
  const num = parseFloat(hours) || 0;
  return `${num.toFixed(1)}h`;
}

export function calculateWeeklyBarPercent(hoursWeek, maxWeeklyHours = 60) {
  const h = Math.max(0, parseFloat(hoursWeek) || 0);
  const max = Math.max(1, parseFloat(maxWeeklyHours) || 60);
  const percent = Math.min(100, Math.round((h / max) * 100));
  const isOvertime = h > max;
  const remaining = Math.max(0, max - h);

  return {
    percent,
    hours: h,
    maxHours: max,
    isOvertime,
    remaining: parseFloat(remaining.toFixed(1)),
  };
}

export function getDutyStatusConfig(dutyStatus = 'Off') {
  const key = String(dutyStatus || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const configs = {
    on_duty: { label: 'On duty', color: '#059669', bg: '#ECFDF5', dot: '#10B981', border: '#A7F3D0' },
    on: { label: 'On duty', color: '#059669', bg: '#ECFDF5', dot: '#10B981', border: '#A7F3D0' },
    standby: { label: 'Standby', color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B', border: '#FDE68A' },
    on_leave: { label: 'On leave', color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444', border: '#FECACA' },
    off: { label: 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF', border: '#E5E7EB' },
    off_duty: { label: 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF', border: '#E5E7EB' },
  };

  return configs[key] || { label: dutyStatus || 'Off duty', color: '#4B5563', bg: '#F3F4F6', dot: '#9CA3AF', border: '#E5E7EB' };
}

export const TIER_ORDER = ['critical', 'less_critical', 'mild', 'unclassified', 'stable'];

export function getTierChipConfig(tierKey = 'stable') {
  const key = String(tierKey || '').toLowerCase().trim();
  const configs = {
    critical: {
      key: 'critical',
      label: 'Critical',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      badge: 'Immediate action',
      order: 1,
    },
    less_critical: {
      key: 'less_critical',
      label: 'Less Critical',
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      badge: 'Review required',
      order: 2,
    },
    mild: {
      key: 'mild',
      label: 'Mild',
      color: '#CA8A04',
      bg: '#FEFCE8',
      border: '#FEF08A',
      badge: 'Monitor',
      order: 3,
    },
    unclassified: {
      key: 'unclassified',
      label: 'Unclassified',
      color: '#7C3AED',
      bg: '#FAF5FF',
      border: '#DDD6FE',
      badge: 'Needs review',
      order: 4,
    },
    stable: {
      key: 'stable',
      label: 'Stable',
      color: '#059669',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      badge: 'Normal limits',
      order: 5,
    },
  };

  return configs[key] || {
    key: key || 'unclassified',
    label: key ? (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, ' ') : 'Unclassified',
    color: '#6B7280',
    bg: '#F3F4F6',
    border: '#E5E7EB',
    badge: 'Under observation',
    order: 99,
  };
}

export function filterPatientFiles(patients = [], query = '') {
  if (!Array.isArray(patients)) return [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return patients;

  return patients.filter((pt) => {
    const name = String(pt.name || pt.full_name || '').toLowerCase();
    const mr = String(pt.mr_number || '').toLowerCase();
    const code = String(pt.patient_code || '').toLowerCase();
    const loc = String(pt.location || pt.address || '').toLowerCase();
    return name.includes(q) || mr.includes(q) || code.includes(q) || loc.includes(q);
  });
}

