/**
 * Staff Directory Helpers
 * Status badges, assignment permission checks, filter & sort logic, and pagination.
 */

export const NON_CLINICAL_ROLES = [
  'accountant',
  'crm_executive',
  'patient_family',
  'delivery_rider',
];

export const CLINICAL_ROLES = [
  'nurse',
  'doctor',
  'physio',
  'speech',
  'psychologist',
  'dietician',
  'care_manager',
];

export function getLiveStatusBadge(liveStatus, isActive = true) {
  if (isActive === false || liveStatus === 'inactive') {
    return {
      status: 'inactive',
      label: 'Inactive',
      className: 'badge-red',
      color: '#dc2626',
    };
  }
  const norm = String(liveStatus || '').toLowerCase();
  if (norm === 'on_duty_now' || norm === 'on_duty' || norm === 'on duty now' || norm === 'on_visit') {
    return {
      status: 'on_duty_now',
      label: 'On duty now',
      className: 'badge-teal',
      color: '#0d9488',
    };
  }
  if (norm === 'off_duty' || norm === 'off duty') {
    return {
      status: 'off_duty',
      label: 'Off duty',
      className: 'badge-grey',
      color: '#64748b',
    };
  }
  return {
    status: 'available',
    label: 'Available',
    className: 'badge-green',
    color: '#16a34a',
  };
}

export function canAssignPatient(staff) {
  if (!staff) {
    return { allowed: false, reason: 'No staff selected' };
  }
  if (staff.is_active === false) {
    return { allowed: false, reason: 'Staff member is inactive' };
  }
  if (staff.lifecycle_stage === 'trainee') {
    return {
      allowed: false,
      reason: 'Trainees cannot be assigned patients until advancing to probation or active employee status',
    };
  }
  const role = staff.role;
  if (NON_CLINICAL_ROLES.includes(role)) {
    return {
      allowed: false,
      reason: `Non-clinical role (${staff.role_display || role}) cannot be assigned patients`,
    };
  }
  if (!CLINICAL_ROLES.includes(role)) {
    return {
      allowed: false,
      reason: `Role (${staff.role_display || role}) is not authorized for patient care`,
    };
  }
  return { allowed: true };
}

export function canScheduleDuty(staff) {
  if (!staff) return { allowed: false, reason: 'No staff selected' };
  if (staff.is_active === false) return { allowed: false, reason: 'Staff member is inactive' };
  if (NON_CLINICAL_ROLES.includes(staff.role)) {
    return { allowed: false, reason: 'Non-clinical roles do not have rostered duty' };
  }
  return { allowed: true };
}

export function filterAndSortStaff(staffList = [], filters = {}) {
  const {
    search = '',
    role = '',
    stage = '',
    status = '',
    sortField = 'full_name',
    sortOrder = 'asc',
  } = filters;

  const q = search.trim().toLowerCase();

  const filtered = staffList.filter((s) => {
    if (role && s.role !== role) return false;

    if (stage) {
      if (stage === 'null' || stage === 'not_reviewed') {
        if (s.lifecycle_stage !== null && s.lifecycle_stage !== undefined && s.lifecycle_stage !== 'not_reviewed') {
          return false;
        }
      } else if (s.lifecycle_stage !== stage) {
        return false;
      }
    }

    if (status) {
      const live = s.live_status || (s.is_active === false ? 'inactive' : 'available');
      if (status === 'inactive' && s.is_active !== false && live !== 'inactive') return false;
      if (status !== 'inactive' && live !== status) return false;
    }

    if (q) {
      const name = (s.full_name || '').toLowerCase();
      const spec = (s.specialization || '').toLowerCase();
      const empId = (s.employee_id || '').toLowerCase();
      const user = (s.username || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      const rDisp = (s.role_display || '').toLowerCase();
      if (
        !name.includes(q) &&
        !spec.includes(q) &&
        !empId.includes(q) &&
        !user.includes(q) &&
        !phone.includes(q) &&
        !rDisp.includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return filtered.sort((a, b) => {
    let valA = '';
    let valB = '';
    if (sortField === 'role') {
      valA = (a.role_display || a.role || '').toLowerCase();
      valB = (b.role_display || b.role || '').toLowerCase();
    } else {
      valA = (a.full_name || a.username || '').toLowerCase();
      valB = (b.full_name || b.username || '').toLowerCase();
    }
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

export function paginateStaff(items = [], page = 1, pageSize = 15) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const start = (validPage - 1) * pageSize;
  const sliced = items.slice(start, start + pageSize);
  return {
    items: sliced,
    total,
    totalPages,
    currentPage: validPage,
    pageSize,
  };
}

