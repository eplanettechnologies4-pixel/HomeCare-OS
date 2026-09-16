import { create } from 'zustand';
import {
  ALERT_RULES, INITIAL_PERMISSION_MATRIX, ATTENDANCE_THRESHOLDS
} from '../data/mockData';
import { apiFetch, setTokenGetter } from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const savedToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
let savedUser = null;
try {
  savedUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('currentUser') || 'null') : null;
} catch (e) { }

const useStore = create((set, get) => ({
  // ── Authentication State ──────────────────────────────────────────────────
  isAuthenticated: !!savedToken,
  currentUser: savedUser,
  userToken: savedToken,
  refreshToken: savedRefresh,
  failedLoginAttempts: 0,
  isLockedOut: false,

  login: async ({ emailOrPhone, password }) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: emailOrPhone.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        const user = data.user || {
          id: 1,
          username: emailOrPhone,
          role: 'super_admin',
          full_name: emailOrPhone,
        };
        if (data.access) {
          localStorage.setItem('access_token', data.access);
        }
        if (data.refresh) {
          localStorage.setItem('refresh_token', data.refresh);
        }
        if (user) {
          localStorage.setItem('currentUser', JSON.stringify(user));
        }
        set({
          isAuthenticated: true,
          currentUser: user,
          userToken: data.access,
          refreshToken: data.refresh,
          currentRole: user.role || 'super_admin',
          failedLoginAttempts: 0,
          isLockedOut: false,
        });
        // Refresh all store data from backend
        get().fetchAllData();
        return { success: true, user, role: user.role };
      } else {
        const err = data.detail || (data.non_field_errors && data.non_field_errors[0]) || 'Incorrect username or password.';
        return { success: false, error: err };
      }
    } catch (err) {
      return { success: false, error: 'Cannot connect to server. Please check backend is running on port 8000.' };
    }
  },

  logout: () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('currentUser');
    } catch (e) { }
    set({
      isAuthenticated: false,
      currentUser: null,
      userToken: null,
      refreshToken: null,
      currentRole: 'super_admin',
      activePage: 'overview',
      staff: [],
      patients: [],
      bookings: [],
      liveVisits: [],
      alerts: [],
    });
  },

  // ── Role RBAC ────────────────────────────────────────────────────────────
  currentRole: 'super_admin',
  setCurrentRole: (role) => set({ currentRole: role }),

  // ── Active Page ──────────────────────────────────────────────────────────
  activePage: typeof window !== 'undefined' ? (localStorage.getItem('activePage') || 'overview') : 'overview',
  setActivePage: (page) => {
    try { localStorage.setItem('activePage', page); } catch (e) { }
    set({ activePage: page });
  },

  // ── Alerts Feed ──────────────────────────────────────────────────────────
  alerts: [],
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts] })),

  // ── Live Visits (GPS state) ──────────────────────────────────────────────
  liveVisits: [],

  fetchLiveVisits: async () => {
    try {
      const res = await apiFetch('/tracking/live-visits/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({
          liveVisits: items.map((lv) => ({
            id: lv.booking || lv.id,
            staff_name: lv.staff_name || 'Staff',
            staff_role: lv.staff_role || 'Nurse',
            staff_lat: parseFloat(lv.current_latitude) || null,
            staff_lng: parseFloat(lv.current_longitude) || null,
            current_latitude: parseFloat(lv.current_latitude) || null,
            current_longitude: parseFloat(lv.current_longitude) || null,
            patient_name: lv.patient_name || 'Patient',
            patient_lat: lv.patient_lat ? parseFloat(lv.patient_lat) : null,
            patient_lng: lv.patient_lng ? parseFloat(lv.patient_lng) : null,
            service_type_display: 'Home Care',
            status: lv.booking_status || 'in_progress',
            status_display: lv.booking_status === 'in_progress' ? 'In Progress' : lv.booking_status === 'en_route' ? 'En Route' : 'Assigned',
            scheduled_time: lv.scheduled_time || new Date().toISOString(),
            eta_minutes: lv.eta_minutes,
            assigned_staff: { id: lv.staff, full_name: lv.staff_name, role_display: lv.staff_role },
          })),
        });
      } else {
        set({ liveVisits: [] });
      }
    } catch (err) {
      console.warn('[Store] fetchLiveVisits error:', err);
      set({ liveVisits: [] });
    }
  },

  updateStaffLocation: (staffId, lat, lng) =>
    set((s) => ({
      liveVisits: s.liveVisits.map((v) =>
        v.assigned_staff?.id === staffId
          ? { ...v, staff_lat: lat, staff_lng: lng, current_latitude: lat, current_longitude: lng }
          : v
      ),
    })),

  // ── Staff Route Trails (real-time polyline history) ──────────────────────
  // Keyed by staff_id → array of {lat, lng, ts} (ring buffer, max 30 pings).
  // Written by the WS hook on every location_update; read by StaffProfilePanel.
  staffTrails: {},

  appendStaffPing: (staffId, lat, lng) =>
    set((s) => {
      const prev = s.staffTrails[staffId] || [];
      const next = [...prev, { lat, lng, ts: Date.now() }].slice(-30);
      return { staffTrails: { ...s.staffTrails, [staffId]: next } };
    }),

  /**
   * Seed the trail with historical pings from the REST endpoint.
   * Called once when StaffProfilePanel first mounts, so the polyline
   * is populated even before any new WS pings arrive.
   */
  fetchStaffRoute: async (staffId, limit = 30) => {
    try {
      const res = await apiFetch(`/tracking/staff/${staffId}/route/?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        const pings = (data.pings || []).map((p) => ({
          lat: parseFloat(p.lat),
          lng: parseFloat(p.lng),
          ts: new Date(p.ts).getTime(),
        }));
        if (pings.length > 0) {
          set((s) => ({
            staffTrails: {
              ...s.staffTrails,
              [staffId]: pings,
            },
          }));
        }
      }
    } catch (err) {
      console.warn('[Store] fetchStaffRoute error:', err);
    }
  },

  sosEvents: [],
  activeSosAlerts: [],

  fetchActiveSOS: async () => {
    try {
      const res = await apiFetch('/tracking/sos/active/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({
          activeSosAlerts: items,
          sosEvents: items,
        });
      } else {
        set({ activeSosAlerts: [], sosEvents: [] });
      }
    } catch (err) {
      console.warn('[Store] fetchActiveSOS error:', err);
      set({ activeSosAlerts: [], sosEvents: [] });
    }
  },

  resolveSOSAlert: async (id, notes = '') => {
    try {
      const res = await apiFetch(`/tracking/sos/${id}/resolve/`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        const resolved = await res.json();
        set((s) => ({
          activeSosAlerts: (s.activeSosAlerts || []).filter((a) => a.id !== id),
          sosEvents: s.sosEvents.map((e) =>
            e.id === id ? { ...e, status: 'resolved', resolved_at: new Date().toISOString(), notes } : e
          ),
        }));
        return { success: true, data: resolved };
      }
    } catch (err) {
      console.warn('[Store] resolveSOSAlert error:', err);
    }
    set((s) => ({
      activeSosAlerts: (s.activeSosAlerts || []).filter((a) => a.id !== id),
      sosEvents: s.sosEvents.map((e) =>
        e.id === id ? { ...e, status: 'resolved', resolved_at: new Date().toISOString(), notes } : e
      ),
    }));
    return { success: true };
  },

  resolveSOS: (id) =>
    set((s) => ({
      activeSosAlerts: (s.activeSosAlerts || []).filter((a) => a.id !== id),
      sosEvents: s.sosEvents.map((e) =>
        e.id === id ? { ...e, status: 'resolved', resolved_at: new Date().toISOString() } : e
      ),
    })),

  // ── Geofence Events ──────────────────────────────────────────────────────
  geofenceEvents: [],

  // ── Alert Rules ──────────────────────────────────────────────────────────
  alertRules: ALERT_RULES,

  fetchAlertRules: async () => {
    try {
      const res = await apiFetch('/tracking/alert-rules/');
      if (res.ok) {
        const data = await res.json();
        const rule = Array.isArray(data) ? data[0] : (data.results ? data.results[0] : data);
        if (rule) {
          set({
            alertRules: {
              late_arrival_minutes: rule.late_arrival_minutes,
              no_show_minutes: rule.no_show_minutes,
              overstay_minutes: rule.overstay_minutes,
              ...rule,
            },
          });
        }
      }
    } catch (err) {
      console.warn('[Store] fetchAlertRules error:', err);
    }
  },

  saveAlertRules: async (rules) => {
    set({ alertRules: rules });
    try {
      const res = await apiFetch('/tracking/alert-rules/', {
        method: 'POST',
        body: JSON.stringify(rules),
      });
      if (res.ok) {
        const data = await res.json();
        set({ alertRules: data });
        return { success: true, data };
      }
    } catch (err) {
      console.warn('[Store] saveAlertRules error:', err);
    }
    return { success: true };
  },

  updateAlertRules: (rules) => set({ alertRules: rules }),

  // ── Bookings ─────────────────────────────────────────────────────────────
  bookings: [],
  selectedBooking: null,
  setSelectedBooking: (b) => set({ selectedBooking: b }),
  fetchBookings: async () => {
    try {
      const res = await apiFetch('/bookings/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        const formatted = items.map((b) => ({
          ...b,
          patient_name: b.patient_name || (b.patient ? `${b.patient.first_name || ''} ${b.patient.last_name || ''}`.trim() : 'Unknown Patient'),
          patient_mr: b.patient_mr || b.patient?.mr_number || 'MR-N/A',
          staff_name: b.assigned_staff_name || (b.assigned_staff ? `${b.assigned_staff.first_name || ''} ${b.assigned_staff.last_name || ''}`.trim() : null),
        }));
        set({ bookings: formatted });
        return formatted;
      }
    } catch (err) {
      console.warn('[Store] fetchBookings error:', err);
    }
    return get().bookings;
  },
  addBooking: (booking) => set((s) => ({ bookings: [booking, ...s.bookings] })),
  createBooking: async (bookingData) => {
    try {
      const res = await apiFetch('/bookings/', {
        method: 'POST',
        body: JSON.stringify(bookingData),
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchBookings();
        return { success: true, data };
      } else {
        const errorMsg = data.detail || JSON.stringify(data);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  assignNurseToBooking: async (bookingId, assignmentData) => {
    const assignedOnIso = assignmentData.assignedOn || new Date().toISOString();
    // 1. Optimistic update
    set((s) => ({
      bookings: s.bookings.map(b => b.id === bookingId ? {
        ...b,
        assigned_staff: assignmentData.staff,
        staff_name: assignmentData.staff?.full_name,
        staff_employee_id: assignmentData.staff?.employee_id,
        staff_designation: assignmentData.staff ? `${assignmentData.staff.role_display || assignmentData.staff.role} ${assignmentData.staff.specialization ? `(${assignmentData.staff.specialization})` : ''}`.trim() : null,
        backup_staff: assignmentData.backupStaff,
        backup_staff_name: assignmentData.backupStaff?.full_name,
        backup_staff_employee_id: assignmentData.backupStaff?.employee_id,
        backup_staff_designation: assignmentData.backupStaff ? `${assignmentData.backupStaff.role_display || assignmentData.backupStaff.role} ${assignmentData.backupStaff.specialization ? `(${assignmentData.backupStaff.specialization})` : ''}`.trim() : null,
        care_manager_name: assignmentData.careManagerName || b.care_manager_name,
        clinical_requirements: assignmentData.clinicalRequirements || b.clinical_requirements,
        recurring_days: assignmentData.recurringDays,
        nurse_instructions: assignmentData.instructions,
        notes: assignmentData.instructions || b.notes,
        assigned_on: assignedOnIso,
        status: assignmentData.status || 'assigned',
        status_display: assignmentData.status === 'confirmed' ? 'Confirmed' : assignmentData.status === 'en_route' ? 'En Route' : 'Assigned'
      } : b)
    }));

    // 2. Persist to backend API if staff id is available
    if (assignmentData.staff?.id) {
      try {
        await apiFetch(`/bookings/${bookingId}/assign_staff/`, {
          method: 'POST',
          body: JSON.stringify({
            staff_id: assignmentData.staff.id,
            backup_staff_id: assignmentData.backupStaff?.id || null,
            care_manager_name: assignmentData.careManagerName || '',
            clinical_requirements: assignmentData.clinicalRequirements || '',
            instructions: assignmentData.instructions || '',
            status: assignmentData.status || 'assigned',
          }),
        });
        await get().fetchBookings();
      } catch (err) {
        console.warn('[Store] assign_staff error:', err);
      }
    }
  },
  updateBookingStatus: async (bookingId, status) => {
    // 1. Optimistic update
    set((s) => ({
      bookings: s.bookings.map(b => b.id === bookingId ? {
        ...b,
        status,
        status_display: status === 'in_progress' ? 'In Progress' : status === 'completed' ? 'Completed' : status.charAt(0).toUpperCase() + status.slice(1)
      } : b)
    }));
    // 2. Persist to backend PATCH /bookings/{id}/
    try {
      await apiFetch(`/bookings/${bookingId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await get().fetchBookings();
    } catch (err) {
      console.warn('[Store] updateBookingStatus error:', err);
    }
  },
  staff: [],
  selectedStaff: null,
  setSelectedStaff: (s_) => set({ selectedStaff: s_ }),
  fetchStaff: async () => {
    try {
      const res = await apiFetch('/staff/members/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({ staff: items });
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchStaff error:', err);
    }
    return get().staff;
  },
  createStaffMember: async (staffData) => {
    try {
      const res = await apiFetch('/staff/members/', {
        method: 'POST',
        body: JSON.stringify(staffData),
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchStaff();
        return { success: true, data };
      } else {
        const errorMsg = data.username?.[0] || data.password?.[0] || data.password_confirm?.[0] || data.non_field_errors?.[0] || data.detail || (typeof data === 'string' ? data : JSON.stringify(data));
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      return { success: false, error: err.message || 'Network error creating staff member' };
    }
  },
  toggleStaffStatus: async (staffId) => {
    try {
      const res = await apiFetch(`/staff/members/${staffId}/toggle-status/`, {
        method: 'POST',
      });
      if (res.ok) {
        await get().fetchStaff();
        return { success: true };
      }
      return { success: false, error: 'Failed to update staff status' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  setStaffPassword: async (staffId, password, passwordConfirm) => {
    try {
      const res = await apiFetch(`/staff/members/${staffId}/set-password/`, {
        method: 'POST',
        body: JSON.stringify({ password, password_confirm: passwordConfirm }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      const errorMsg = data.password?.[0] || data.password_confirm?.[0] || data.error || 'Failed to update password';
      return { success: false, error: errorMsg };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  deleteStaffMember: async (staffId) => {
    try {
      const res = await apiFetch(`/staff/members/${staffId}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await get().fetchStaff();
        return { success: true };
      }
      return { success: false, error: 'Failed to delete staff member' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── LMS — Staff Training Module ────────────────────────────────────────────
  lmsCourses: [],
  lmsAssignments: [],
  staffTrainingData: {},   // keyed by staff_id
  lmsCertificates: [],
  staffCertificatesData: {}, // keyed by staff_id

  fetchCourses: async () => {
    try {
      const res = await apiFetch('/lms/courses/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({ lmsCourses: items });
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchCourses error:', err);
    }
    return get().lmsCourses;
  },

  createCourse: async (courseData) => {
    try {
      const res = await apiFetch('/lms/courses/', {
        method: 'POST',
        body: JSON.stringify(courseData),
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchCourses();
        return { success: true, data };
      }
      return { success: false, error: data.detail || JSON.stringify(data) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  updateCourse: async (courseId, courseData) => {
    try {
      const res = await apiFetch(`/lms/courses/${courseId}/`, {
        method: 'PATCH',
        body: JSON.stringify(courseData),
      });
      const data = await res.json();
      if (res.ok) { await get().fetchCourses(); return { success: true, data }; }
      return { success: false, error: data.detail || JSON.stringify(data) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  deleteCourse: async (courseId) => {
    try {
      const res = await apiFetch(`/lms/courses/${courseId}/`, { method: 'DELETE' });
      if (res.ok || res.status === 204) { await get().fetchCourses(); return { success: true }; }
      return { success: false, error: 'Failed to delete course' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  createLecture: async (lectureData) => {
    // lectureData may be a FormData (for file upload) or plain JSON
    try {
      const isFormData = lectureData instanceof FormData;
      const res = await apiFetch('/lms/lectures/', {
        method: 'POST',
        body: isFormData ? lectureData : JSON.stringify(lectureData),
        headers: isFormData ? {} : { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { await get().fetchCourses(); return { success: true, data }; }
      return { success: false, error: data.detail || JSON.stringify(data) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  deleteLecture: async (lectureId) => {
    try {
      const res = await apiFetch(`/lms/lectures/${lectureId}/`, { method: 'DELETE' });
      if (res.ok || res.status === 204) { await get().fetchCourses(); return { success: true }; }
      return { success: false, error: 'Failed to delete lecture' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  assignCourse: async (courseId, staffIds, dueDate = null) => {
    try {
      const res = await apiFetch(`/lms/courses/${courseId}/assign/`, {
        method: 'POST',
        body: JSON.stringify({ staff_ids: staffIds, due_date: dueDate }),
      });
      const data = await res.json();
      if (res.ok) { await get().fetchLmsAssignments(); return { success: true, data }; }
      return { success: false, error: data.error || data.detail || JSON.stringify(data) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  fetchLmsAssignments: async (params = {}) => {
    try {
      let url = '/lms/assignments/';
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({ lmsAssignments: items });
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchLmsAssignments error:', err);
    }
    return get().lmsAssignments;
  },

  /**
   * Fetch all course assignments for a specific staff member.
   * Used by the Staff Profile Training tab.
   */
  fetchStaffTraining: async (staffId) => {
    try {
      const res = await apiFetch(`/lms/staff/${staffId}/training/`);
      if (res.ok) {
        const data = await res.json();
        set((s) => ({ staffTrainingData: { ...s.staffTrainingData, [staffId]: data } }));
        return data;
      }
    } catch (err) {
      console.warn('[Store] fetchStaffTraining error:', err);
    }
    return [];
  },

  /**
   * Watch-progress ping — mirrors the GPS 30-second ping architecture.
   * Called by the video player every 30 seconds.
   */
  postLectureProgress: async (lectureId, watchedSeconds, percentage, staffId = null) => {
    try {
      const body = { watched_seconds: watchedSeconds, percentage };
      if (staffId) body.staff_id = staffId;
      const res = await apiFetch(`/lms/lectures/${lectureId}/progress/`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) return { success: true, data: await res.json() };
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Download certificate PDF as a blob and trigger browser download.
   */
  downloadCertificate: async (assignmentId, certNumber = 'certificate') => {
    try {
      const { API_BASE, getAuthToken } = await import('../services/api.js');
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/lms/assignments/${assignmentId}/certificate/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { success: false, error: 'Failed to download certificate' };
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${certNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetch all certificates (LMS Course Completion + General Manual Certificates).
   */
  fetchCertificates: async (params = {}) => {
    try {
      let url = '/lms/certificates/';
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({ lmsCertificates: items });
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchCertificates error:', err);
    }
    return get().lmsCertificates;
  },

  /**
   * Manually generate a certificate via the Admin Certificate Generator Tool.
   */
  generateCertificate: async (certData) => {
    try {
      const res = await apiFetch('/lms/certificates/', {
        method: 'POST',
        body: JSON.stringify(certData),
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchCertificates();
        if (certData.staff) {
          await get().fetchStaffCertificates(certData.staff);
        }
        return { success: true, data };
      }

      // Parse validation errors into human-readable text
      let errorMsg = 'Failed to generate certificate.';
      if (typeof data === 'string') {
        errorMsg = data;
      } else if (data.error && typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (data.detail && typeof data.detail === 'string') {
        errorMsg = data.detail;
      } else if (data.assignment) {
        const asgnErr = Array.isArray(data.assignment) ? data.assignment[0] : data.assignment;
        if (typeof asgnErr === 'string' && asgnErr.toLowerCase().includes('already exists')) {
          errorMsg = 'A certificate has already been issued for this course assignment.';
        } else {
          errorMsg = `Course Assignment error: ${asgnErr}`;
        }
      } else {
        const parts = [];
        for (const [k, v] of Object.entries(data)) {
          const val = Array.isArray(v) ? v.join(', ') : String(v);
          const field = k.replace(/_/g, ' ');
          parts.push(`${field}: ${val}`);
        }
        if (parts.length > 0) errorMsg = parts.join('; ');
      }
      return { success: false, error: errorMsg };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetch all certificates issued to a specific staff member.
   */
  fetchStaffCertificates: async (staffId) => {
    try {
      const res = await apiFetch(`/lms/staff/${staffId}/certificates/`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set((s) => ({ staffCertificatesData: { ...s.staffCertificatesData, [staffId]: items } }));
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchStaffCertificates error:', err);
    }
    return [];
  },

  /**
   * Download any certificate directly by its certificate database ID or certificate_id.
   */
  downloadCertificateById: async (certId, filename = 'certificate') => {
    try {
      const { API_BASE, getAuthToken } = await import('../services/api.js');
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/lms/certificates/${certId}/download/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { success: false, error: 'Failed to download certificate' };
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Patients ──────────────────────────────────────────────────────────────
  patients: [],
  selectedPatient: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('selectedPatient') || 'null') : null,
  setSelectedPatient: (p) => {
    try {
      if (p) localStorage.setItem('selectedPatient', JSON.stringify(p));
      else localStorage.removeItem('selectedPatient');
    } catch (e) { }
    set({ selectedPatient: p });
  },
  fetchPatients: async () => {
    try {
      const res = await apiFetch('/patients/');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results || []);
        set({ patients: items });
        return items;
      }
    } catch (err) {
      console.warn('[Store] fetchPatients error:', err);
    }
    set({ patients: [] });
    return [];
  },
  createPatient: async (patientData) => {
    try {
      const res = await apiFetch('/patients/', {
        method: 'POST',
        body: JSON.stringify(patientData),
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchPatients();
        return { success: true, data };
      }
      const errorMsg = data.detail || (typeof data === 'object' ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ') : String(data));
      return { success: false, error: errorMsg };
    } catch (err) {
      return { success: false, error: err.message || 'Network error creating patient' };
    }
  },
  addPatient: (patient) => set((s) => ({ patients: [patient, ...s.patients] })),
  updatePatient: async (id, updatedFields) => {
    try {
      const res = await apiFetch(`/patients/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(updatedFields),
      });
      if (res.ok) {
        await get().fetchPatients();
        return { success: true };
      }
      return { success: false, error: 'Failed to update patient' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  deletePatient: async (id) => {
    try {
      const res = await apiFetch(`/patients/${id}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await get().fetchPatients();
        return { success: true };
      }
      return { success: false, error: 'Failed to delete patient' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Load All Active Data ──────────────────────────────────────────────────
  fetchAllData: async () => {
    await Promise.allSettled([
      get().fetchStaff(),
      get().fetchPatients(),
      get().fetchBookings(),
      get().fetchLiveVisits(),
      get().fetchActiveSOS(),
      get().fetchAlertRules(),
    ]);
  },

  // ── CRM Leads ─────────────────────────────────────────────────────────────
  leads: [],
  addLead: (lead) => set((s) => ({ leads: [lead, ...s.leads] })),
  updateLeadStage: (id, newStage) => set((s) => ({
    leads: s.leads.map(l => l.id === id ? { ...l, stage: newStage } : l)
  })),

  // ── Billing Invoices ──────────────────────────────────────────────────────
  invoices: [],
  addInvoice: (inv) => set((s) => ({ invoices: [inv, ...s.invoices] })),
  recordInvoicePayment: (invoiceId, payment) => set((s) => ({
    invoices: s.invoices.map(inv => {
      if (inv.id === invoiceId) {
        const paid = inv.amount_paid + payment.amount;
        const bal = inv.total - paid;
        const st = bal <= 0 ? 'paid' : 'partial';
        return {
          ...inv,
          amount_paid: paid,
          balance_due: Math.max(0, bal),
          status: st,
          status_display: st.charAt(0).toUpperCase() + st.slice(1),
          payments: [...(inv.payments || []), payment]
        };
      }
      return inv;
    })
  })),

  // ── Daily Patient Visit Reports ────────────────────────────────────────────
  dailyReports: [],
  addDailyReport: (report) => set((s) => ({ dailyReports: [report, ...s.dailyReports] })),

  // ── Patient EMR Clinical Forms (Form A, Form B, Form C) ───────────────────
  nurseNotes: [],
  addNurseNote: (newNote) => set((s) => {
    const user = s.currentUser;
    const authorName = user?.full_name || (s.currentRole === 'doctor' ? 'Doctor' : 'Staff Nurse');
    const authorRole = user?.role_display || (s.currentRole === 'doctor' ? 'Consultant Physician' : 'Registered Nurse');

    const entry = {
      id: Date.now(),
      patient_id: newNote.patient_id,
      doctor_name: newNote.doctor_name || 'Attending Physician',
      ward_room: newNote.ward_room || 'Home Care Bed',
      recorded_by_name: `${authorName}`,
      recorded_by_role: authorRole,
      recorded_at: newNote.recorded_at || new Date().toISOString(),
      note: newNote.note,
      is_flagged: Boolean(newNote.is_flagged),
      addenda: []
    };
    return { nurseNotes: [entry, ...s.nurseNotes] };
  }),

  addNurseAddendum: (noteId, addendumText) => set((s) => {
    const user = s.currentUser;
    const authorName = user?.full_name || (s.currentRole === 'doctor' ? 'Doctor' : 'Staff Nurse');
    const newAddendum = {
      id: `add-${Date.now()}`,
      text: addendumText,
      created_by: authorName,
      created_at: new Date().toISOString()
    };
    return {
      nurseNotes: s.nurseNotes.map(n => n.id === noteId ? { ...n, addenda: [...(n.addenda || []), newAddendum] } : n)
    };
  }),

  vitals: [],
  addVitalReading: (reading) => set((s) => {
    const user = s.currentUser;
    const authorName = user?.full_name ? `${user.full_name} (${user.role_display || 'Staff'})` : 'Staff Nurse';

    // AI Anomaly Detection Logic
    const anomalies = [];
    const sys = Number(reading.blood_pressure_systolic);
    const dia = Number(reading.blood_pressure_diastolic);
    const temp = Number(reading.temperature);
    const pulse = Number(reading.heart_rate);
    const spo2 = Number(reading.spo2);
    const bsr = Number(reading.bsr);

    if (sys && sys > 140) anomalies.push(`High Systolic BP (${sys} mmHg)`);
    if (sys && sys < 90) anomalies.push(`Low Systolic BP (${sys} mmHg)`);
    if (dia && dia > 90) anomalies.push(`High Diastolic BP (${dia} mmHg)`);
    if (temp && temp > 38.0) anomalies.push(`Fever Alert (${temp}°C)`);
    if (temp && temp < 35.5) anomalies.push(`Hypothermia Alert (${temp}°C)`);
    if (pulse && pulse > 100) anomalies.push(`Tachycardia (${pulse} bpm)`);
    if (pulse && pulse < 60) anomalies.push(`Bradycardia (${pulse} bpm)`);
    if (spo2 && spo2 < 95) anomalies.push(`Hypoxia Warning (SpO2 ${spo2}%)`);
    if (bsr && bsr > 180) anomalies.push(`Hyperglycemia (BSR ${bsr} mg/dL)`);
    if (bsr && bsr < 70) anomalies.push(`Hypoglycemia (BSR ${bsr} mg/dL)`);

    const newReading = {
      id: Date.now(),
      patient_id: reading.patient_id,
      consultant_name: reading.consultant_name || 'Attending Physician',
      ward_room: reading.ward_room || 'Home Care Bed',
      recorded_by_name: authorName,
      recorded_at: reading.recorded_at || new Date().toISOString(),
      blood_pressure_systolic: sys || null,
      blood_pressure_diastolic: dia || null,
      heart_rate: pulse || null,
      temperature: temp || null,
      spo2: spo2 || null,
      respiratory_rate: Number(reading.respiratory_rate) || null,
      weight_kg: Number(reading.weight_kg) || null,
      intake_ng: Number(reading.intake_ng) || 0,
      intake_iv: Number(reading.intake_iv) || 0,
      output_urine: Number(reading.output_urine) || 0,
      output_drain: Number(reading.output_drain) || 0,
      bsr: bsr || null,
      insulin: reading.insulin || '',
      notes: reading.notes || '',
      anomalies: anomalies
    };

    let updatedAlerts = s.alerts;
    if (anomalies.length > 0) {
      const alertItem = {
        id: `vitals-alert-${Date.now()}`,
        type: 'sos',
        severity: 'critical',
        title: `AI Vitals Anomaly Flagged — ${anomalies[0]}`,
        message: `Patient ID #${reading.patient_id || 'N/A'}: ${anomalies.join(', ')}. Recorded by ${authorName}.`,
        time: new Date().toISOString(),
        dismissible: true
      };
      updatedAlerts = [alertItem, ...s.alerts];
    }

    return {
      vitals: [newReading, ...s.vitals],
      alerts: updatedAlerts
    };
  }),

  marMedications: [],
  addMarMedication: (med) => set((s) => {
    const todayStr = new Date().toISOString().substring(0, 10);
    const newMed = {
      id: Date.now(),
      patient_id: med.patient_id,
      consultant_name: med.consultant_name || 'Attending Physician',
      ward_room: med.ward_room || 'Home Care Bed',
      brand_name: med.brand_name,
      generic_name: med.generic_name,
      dose: med.dose,
      route: med.route || 'PO (Oral)',
      frequency: med.frequency,
      start_date: med.start_date || todayStr,
      dc_date: med.dc_date || '',
      prescription_type: med.prescription_type || 'regular',
      is_discontinued: false,
      days: {
        1: { date: todayStr, given: false, time: null, nurse_name: null },
        2: { date: todayStr, given: false, time: null, nurse_name: null },
        3: { date: todayStr, given: false, time: null, nurse_name: null },
        4: { date: todayStr, given: false, time: null, nurse_name: null },
        5: { date: todayStr, given: false, time: null, nurse_name: null },
        6: { date: todayStr, given: false, time: null, nurse_name: null },
        7: { date: todayStr, given: false, time: null, nurse_name: null },
      }
    };
    return { marMedications: [newMed, ...s.marMedications] };
  }),

  administerMarDose: (medId, dayKey = 7) => set((s) => {
    const user = s.currentUser;
    const nurseName = user?.full_name ? `${user.full_name} (${user.role_display || 'Nurse'})` : 'Staff Nurse';
    const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      marMedications: s.marMedications.map(med => {
        if (med.id === medId) {
          const updatedDays = { ...med.days };
          updatedDays[dayKey] = {
            ...updatedDays[dayKey],
            given: true,
            time: currentTimeStr,
            nurse_name: nurseName
          };
          return { ...med, days: updatedDays };
        }
        return med;
      })
    };
  }),

  discontinueMarMedication: (medId) => set((s) => ({
    marMedications: s.marMedications.map(m => m.id === medId ? { ...m, is_discontinued: true } : m)
  })),

  // ── User Management & RBAC Matrix ─────────────────────────────────────────
  systemUsers: [],
  addSystemUser: (user) => set((s) => ({ systemUsers: [user, ...s.systemUsers] })),
  toggleUserStatus: (id) => set((s) => ({
    systemUsers: s.systemUsers.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' } : u)
  })),
  deleteSystemUser: (id) => set((s) => ({
    systemUsers: s.systemUsers.filter(u => u.id !== id)
  })),

  permissionMatrix: INITIAL_PERMISSION_MATRIX,
  togglePermission: (role, moduleName, permKey) => set((s) => ({
    permissionMatrix: {
      ...s.permissionMatrix,
      [role]: {
        ...s.permissionMatrix[role],
        [moduleName]: {
          ...s.permissionMatrix[role]?.[moduleName],
          [permKey]: !s.permissionMatrix[role]?.[moduleName]?.[permKey]
        }
      }
    }
  })),

  auditLogs: [],
  addAuditLog: (log) => set((s) => ({ auditLogs: [log, ...s.auditLogs] })),

  // ── Attendance & Leave Management ─────────────────────────────────────────
  leaveRequests: [],
  updateLeaveStatus: (id, newStatus) => set((s) => ({
    leaveRequests: s.leaveRequests.map(l => l.id === id ? { ...l, status: newStatus } : l)
  })),
  addLeaveRequest: (req) => set((s) => ({ leaveRequests: [req, ...s.leaveRequests] })),

  attendanceThresholds: ATTENDANCE_THRESHOLDS,
  updateAttendanceThresholds: (t) => set({ attendanceThresholds: t }),

  // ── CMS Content & Blog ────────────────────────────────────────────────────
  blogPosts: [],
  addBlogPost: (post) => set((s) => ({ blogPosts: [post, ...s.blogPosts] })),

  // ── Public Self-Service 6-Step Booking Integration (Requirement 13) ────────
  submitPublicBooking: (data) => {
    const state = get();
    const count = state.patients.length + 1;
    const pId = count;
    const mrNum = `MR-2024-${String(count).padStart(3, '0')}`;
    const bkRef = `BK-2026-${String(state.bookings.length + 1).padStart(4, '0')}`;

    // 1. Auto-create Patient Record
    const newPatient = {
      id: pId,
      mr_number: mrNum,
      full_name: data.patient_name,
      first_name: data.patient_name.split(' ')[0],
      last_name: data.patient_name.split(' ').slice(1).join(' ') || '',
      age: Number(data.age) || 60,
      date_of_birth: data.date_of_birth || `${2026 - (Number(data.age) || 60)}-01-01`,
      gender: data.gender || 'M',
      gender_display: data.gender === 'F' ? 'Female' : 'Male',
      blood_type: data.blood_type || 'O+',
      primary_diagnosis: data.diagnosis || data.service_title || 'Home Medical Visit',
      phone: data.phone,
      email: data.email || '',
      address: data.address,
      latitude: data.lat || 33.57,
      longitude: data.lng || 73.15,
      care_manager_name: 'Hina Malik (Care Coordinator)',
      is_active: true,
      allergies: data.allergies || 'NKDA',
      emergency_contact: `${data.emergency_contact_name || data.contact_person || data.patient_name} (${data.emergency_contact_phone || data.phone})`,
      emergency_contact_name: data.emergency_contact_name || data.contact_person || '',
      emergency_contact_phone: data.emergency_contact_phone || '',
      service_package: {
        type: data.service_id,
        plan: data.payment_method === 'advance' ? 'Prepaid Online' : 'Pay on Service',
        start_date: data.preferred_date,
      },
    };

    // 2. Auto-create Booking Record
    const newBooking = {
      id: state.bookings.length + 1,
      reference_code: bkRef,
      patient: newPatient,
      patient_name: newPatient.full_name,
      patient_mr: mrNum,
      service_type: data.service_id,
      service_type_display: data.service_title,
      scheduled_time: `${data.preferred_date} ${data.preferred_slot === 'morning' ? '09:00' : '15:00'}`,
      shift_duration: data.shift_duration || '4_hours',
      shift_duration_display: data.shift_duration === '8_hours' ? '8 Hours (Full Day/Night)' : data.shift_duration === '12_hours' ? '12 Hours (Extended Shift)' : data.shift_duration === '24_hours' ? '24 Hours (Full Bedside)' : '4 Hours (Half Day)',
      shift_frequency: data.shift_frequency || 'once',
      shift_frequency_display: data.shift_frequency === 'daily' ? 'Daily' : data.shift_frequency === 'alternate_days' ? 'Alternate Days' : 'Once (Single Visit)',
      status: 'pending',
      status_display: 'Pending Nurse Assignment',
      assigned_staff: null,
      backup_staff: null,
      care_manager_name: 'Hina Malik (Care Coordinator)',
      clinical_requirements: data.clinical_requirements || '',
      address: data.address,
      latitude: data.lat || 33.57,
      longitude: data.lng || 73.15,
      patient_lat: data.lat || 33.57,
      patient_lng: data.lng || 73.15,
      patient_dob: newPatient.date_of_birth,
      patient_age: newPatient.age,
      emergency_contact_name: newPatient.emergency_contact_name,
      emergency_contact_phone: newPatient.emergency_contact_phone,
      diagnosis: data.diagnosis || data.service_title || 'Home Care Admission',
      allergies: data.allergies || 'NKDA',
      has_prescription: !!data.has_prescription,
      consult_doctor_needed: !!data.consult_doctor_needed,
      prescription_attachment: data.prescription_name || null,
      gender_preference: data.gender_preference || 'any',
      consultant_name: data.consultant_name || '',
      consultant_details: data.consultant_details || '',
      notes: data.notes || '',
      amount: data.amount || 2500,
      amount_paid: data.payment_method === 'advance' ? (data.amount || 2500) : 0,
      payment_method: data.payment_method || 'pay_on_service',
      payment_status: data.payment_method === 'advance' ? 'advance' : 'pending',
      payment_status_display: data.payment_method === 'advance' ? 'Advance Paid' : 'Payment Pending',
      created_at: new Date().toISOString(),
    };

    // 3. Auto-create Lead in CRM Pipeline
    const newLead = {
      id: state.leads.length + 1,
      lead_name: data.patient_name,
      phone: data.phone,
      email: data.email || 'online.booking@homecareos.com',
      service_type: data.service_title,
      stage: 'converted',
      stage_display: 'Converted to Booking',
      assigned_to: 'Usman Chaudhry',
      value: 5000,
      notes: `Public Website Self-Service Booking ref ${bkRef}`,
      created_at: new Date().toISOString().substring(0, 10),
    };

    // Save to store
    set((s) => ({
      patients: [newPatient, ...s.patients],
      bookings: [newBooking, ...s.bookings],
      leads: [newLead, ...s.leads],
    }));

    return { patient: newPatient, booking: newBooking, reference: bkRef };
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

// Wire centralized API client with the store's user token
setTokenGetter(() => useStore.getState()?.userToken);

export default useStore;
