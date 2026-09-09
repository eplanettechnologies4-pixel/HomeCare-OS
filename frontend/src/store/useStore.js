import { create } from 'zustand';
import {
  ALERTS, BOOKINGS, STAFF, PATIENTS, GEOFENCE_EVENTS, SOS_EVENTS, ALERT_RULES,
  LEADS, INVOICES_V2, DAILY_REPORTS, SYSTEM_USERS, INITIAL_PERMISSION_MATRIX, AUDIT_LOGS,
  LEAVE_REQUESTS, ATTENDANCE_THRESHOLDS, BLOG_POSTS, NURSE_NOTES, VITALS, MAR_MEDICATIONS
} from '../data/mockData';

const useStore = create((set, get) => ({
  // ── Authentication State ──────────────────────────────────────────────────
  isAuthenticated: false,
  currentUser: null,
  userToken: null,
  failedLoginAttempts: 0,
  isLockedOut: false,

  login: ({ emailOrPhone, password }) => {
    const { systemUsers, failedLoginAttempts } = get();

    if (get().isLockedOut) {
      return { success: false, error: 'Account locked due to 5 failed attempts. Please try again in 15 minutes.' };
    }

    const user = systemUsers.find(
      (u) => u.email.toLowerCase() === emailOrPhone.toLowerCase() || u.phone === emailOrPhone
    );

    if (!user) {
      const nextFail = failedLoginAttempts + 1;
      set({ failedLoginAttempts: nextFail, isLockedOut: nextFail >= 5 });
      return {
        success: false,
        error: nextFail >= 5 ? 'Account locked due to 5 failed attempts.' : 'Incorrect email or password.',
      };
    }

    if (user.status === 'suspended') {
      return {
        success: false,
        isSuspended: true,
        error: 'Your account has been suspended by system administrator. Please contact HR.',
      };
    }

    const validPasses = ['password', 'admin123', 'pass123', user.temp_password];
    if (!validPasses.includes(password) && password !== '123456') {
      const nextFail = failedLoginAttempts + 1;
      set({ failedLoginAttempts: nextFail, isLockedOut: nextFail >= 5 });
      return {
        success: false,
        error: nextFail >= 5 ? 'Account locked due to 5 failed attempts.' : 'Incorrect email or password.',
      };
    }

    const dummyJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: user.id, role: user.role }))}.signature`;
    set({
      isAuthenticated: true,
      currentUser: user,
      userToken: dummyJwt,
      currentRole: user.role,
      failedLoginAttempts: 0,
      isLockedOut: false,
    });

    return { success: true, user, role: user.role };
  },

  logout: () =>
    set({
      isAuthenticated: false,
      currentUser: null,
      userToken: null,
      currentRole: 'super_admin',
      activePage: 'overview',
    }),

  // ── Role RBAC ────────────────────────────────────────────────────────────
  currentRole: 'super_admin',
  setCurrentRole: (role) => set({ currentRole: role }),

  // ── Active Page ──────────────────────────────────────────────────────────
  activePage: 'overview',
  setActivePage: (page) => set({ activePage: page }),

  // ── Alerts Feed ──────────────────────────────────────────────────────────
  alerts: ALERTS,
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts] })),

  // ── Live Visits (GPS state) ──────────────────────────────────────────────
  liveVisits: BOOKINGS.filter((b) => ['in_progress', 'en_route', 'assigned'].includes(b.status)).map((b) => ({
    ...b,
    staff_lat: b.assigned_staff?.current_latitude || null,
    staff_lng: b.assigned_staff?.current_longitude || null,
    eta_minutes: b.status === 'en_route' ? 8 : null,
  })),

  updateStaffLocation: (staffId, lat, lng) =>
    set((s) => ({
      liveVisits: s.liveVisits.map((v) =>
        v.assigned_staff?.id === staffId
          ? { ...v, staff_lat: lat, staff_lng: lng }
          : v
      ),
    })),

  // ── SOS Events ───────────────────────────────────────────────────────────
  sosEvents: SOS_EVENTS,
  resolveSOS: (id) =>
    set((s) => ({
      sosEvents: s.sosEvents.map((e) =>
        e.id === id ? { ...e, status: 'resolved', resolved_at: new Date().toISOString() } : e
      ),
    })),

  // ── Geofence Events ──────────────────────────────────────────────────────
  geofenceEvents: GEOFENCE_EVENTS,

  // ── Alert Rules ──────────────────────────────────────────────────────────
  alertRules: ALERT_RULES,
  updateAlertRules: (rules) => set({ alertRules: rules }),

  // ── Bookings ─────────────────────────────────────────────────────────────
  bookings: BOOKINGS,
  selectedBooking: null,
  setSelectedBooking: (b) => set({ selectedBooking: b }),
  addBooking: (booking) => set((s) => ({ bookings: [booking, ...s.bookings] })),
  assignNurseToBooking: (bookingId, assignmentData) => set((s) => ({
    bookings: s.bookings.map(b => b.id === bookingId ? {
      ...b,
      assigned_staff: assignmentData.staff,
      staff_name: assignmentData.staff?.full_name,
      backup_staff: assignmentData.backupStaff,
      recurring_days: assignmentData.recurringDays,
      nurse_instructions: assignmentData.instructions,
      status: 'assigned',
      status_display: 'Assigned'
    } : b)
  })),

  // ── Staff ─────────────────────────────────────────────────────────────────
  staff: STAFF,
  selectedStaff: null,
  setSelectedStaff: (s_) => set({ selectedStaff: s_ }),

  // ── Patients ──────────────────────────────────────────────────────────────
  patients: PATIENTS,
  selectedPatient: null,
  setSelectedPatient: (p) => set({ selectedPatient: p }),
  addPatient: (patient) => set((s) => ({ patients: [patient, ...s.patients] })),
  updatePatient: (id, updatedFields) => set((s) => ({
    patients: s.patients.map((p) => (p.id === id ? { ...p, ...updatedFields } : p)),
  })),
  deletePatient: (id) => set((s) => ({
    patients: s.patients.filter((p) => p.id !== id),
  })),

  // ── CRM Leads ─────────────────────────────────────────────────────────────
  leads: LEADS,
  addLead: (lead) => set((s) => ({ leads: [lead, ...s.leads] })),
  updateLeadStage: (id, newStage) => set((s) => ({
    leads: s.leads.map(l => l.id === id ? { ...l, stage: newStage } : l)
  })),

  // ── Billing Invoices ──────────────────────────────────────────────────────
  invoices: INVOICES_V2,
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
  dailyReports: DAILY_REPORTS,
  addDailyReport: (report) => set((s) => ({ dailyReports: [report, ...s.dailyReports] })),

  // ── Patient EMR Clinical Forms (Form A, Form B, Form C) ───────────────────
  nurseNotes: NURSE_NOTES,
  addNurseNote: (newNote) => set((s) => {
    const user = s.currentUser;
    const authorName = user?.full_name || (s.currentRole === 'doctor' ? 'Dr. Raza Khan' : 'Sarah Mitchell (RN)');
    const authorRole = user?.role_display || (s.currentRole === 'doctor' ? 'Consultant Physician' : 'Registered Nurse');
    
    const entry = {
      id: Date.now(),
      patient_id: newNote.patient_id || 1,
      doctor_name: newNote.doctor_name || 'Dr. Raza Khan',
      ward_room: newNote.ward_room || 'Home Care Bed #1',
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
    const authorName = user?.full_name || (s.currentRole === 'doctor' ? 'Dr. Raza Khan' : 'Sarah Mitchell (RN)');
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

  vitals: VITALS,
  addVitalReading: (reading) => set((s) => {
    const user = s.currentUser;
    const authorName = user?.full_name ? `${user.full_name} (${user.role_display || 'Staff'})` : 'Sarah Mitchell (RN)';
    
    // AI Anomaly Detection Logic (Item 14-A)
    const anomalies = [];
    const sys = Number(reading.blood_pressure_systolic);
    const dia = Number(reading.blood_pressure_diastolic);
    const temp = Number(reading.temperature);
    const pulse = Number(reading.heart_rate);
    const spo2 = Number(reading.spo2);
    const bsr = Number(reading.bsr);

    if (sys && sys > 140) anomalies.push(`High Systolic BP (${sys} mmHg)`);
    if (sys && sys < 90)  anomalies.push(`Low Systolic BP (${sys} mmHg)`);
    if (dia && dia > 90)  anomalies.push(`High Diastolic BP (${dia} mmHg)`);
    if (temp && temp > 38.0) anomalies.push(`Fever Alert (${temp}°C)`);
    if (temp && temp < 35.5) anomalies.push(`Hypothermia Alert (${temp}°C)`);
    if (pulse && pulse > 100) anomalies.push(`Tachycardia (${pulse} bpm)`);
    if (pulse && pulse < 60)  anomalies.push(`Bradycardia (${pulse} bpm)`);
    if (spo2 && spo2 < 95) anomalies.push(`Hypoxia Warning (SpO2 ${spo2}%)`);
    if (bsr && bsr > 180) anomalies.push(`Hyperglycemia (BSR ${bsr} mg/dL)`);
    if (bsr && bsr < 70)  anomalies.push(`Hypoglycemia (BSR ${bsr} mg/dL)`);

    const newReading = {
      id: Date.now(),
      patient_id: reading.patient_id || 1,
      consultant_name: reading.consultant_name || 'Dr. Raza Khan',
      ward_room: reading.ward_room || 'Home Care Bed #1',
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

    // Auto-generate system alert if out-of-range anomalies detected
    let updatedAlerts = s.alerts;
    if (anomalies.length > 0) {
      const alertItem = {
        id: `vitals-alert-${Date.now()}`,
        type: 'sos',
        severity: 'critical',
        title: `AI Vitals Anomaly Flagged — ${anomalies[0]}`,
        message: `Patient ID #${reading.patient_id || 1}: ${anomalies.join(', ')}. Recorded by ${authorName}.`,
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

  marMedications: MAR_MEDICATIONS,
  addMarMedication: (med) => set((s) => {
    const todayStr = new Date().toISOString().substring(0, 10);
    const newMed = {
      id: Date.now(),
      patient_id: med.patient_id || 1,
      consultant_name: med.consultant_name || 'Dr. Raza Khan',
      ward_room: med.ward_room || 'Home Care Bed #1',
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
    const nurseName = user?.full_name ? `${user.full_name} (${user.role_display || 'Nurse'})` : 'Sarah Mitchell (RN)';
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
  systemUsers: SYSTEM_USERS,
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

  auditLogs: AUDIT_LOGS,
  addAuditLog: (log) => set((s) => ({ auditLogs: [log, ...s.auditLogs] })),

  // ── Attendance & Leave Management ─────────────────────────────────────────
  leaveRequests: LEAVE_REQUESTS,
  updateLeaveStatus: (id, newStatus) => set((s) => ({
    leaveRequests: s.leaveRequests.map(l => l.id === id ? { ...l, status: newStatus } : l)
  })),
  addLeaveRequest: (req) => set((s) => ({ leaveRequests: [req, ...s.leaveRequests] })),

  attendanceThresholds: ATTENDANCE_THRESHOLDS,
  updateAttendanceThresholds: (t) => set({ attendanceThresholds: t }),

  // ── CMS Content & Blog ────────────────────────────────────────────────────
  blogPosts: BLOG_POSTS,
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
      date_of_birth: `${2026 - (Number(data.age) || 60)}-01-01`,
      gender: data.gender || 'M',
      gender_display: data.gender === 'F' ? 'Female' : 'Male',
      blood_type: 'O+',
      primary_diagnosis: data.service_title || 'Home Medical Visit',
      phone: data.phone,
      address: data.address,
      latitude: data.lat || 24.86,
      longitude: data.lng || 67.01,
      care_manager_name: 'Hina Malik',
      is_active: true,
      allergies: 'NKDA',
      emergency_contact: `${data.contact_person || data.patient_name} (${data.phone})`,
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
      service_type: data.service_id,
      service_type_display: data.service_title,
      scheduled_time: `${data.preferred_date} ${data.preferred_slot === 'morning' ? '09:00' : '15:00'}`,
      status: 'pending',
      status_display: 'Pending Nurse Assignment',
      assigned_staff: null,
      address: data.address,
      patient_lat: data.lat || 24.86,
      patient_lng: data.lng || 67.01,
      payment_status: data.payment_method === 'advance' ? 'Paid' : 'Unpaid (Pay on Service)',
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

export default useStore;
