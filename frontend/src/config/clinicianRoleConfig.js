/**
 * Clinician Role Configuration (Single Source of Truth)
 * =======================================================
 * Governs navigation, home widgets, patient chart tabs, and per-tab permissions
 * for the 5 clinical roles:
 *   1. doctor
 *   2. physiotherapist (alias: physio)
 *   3. speech_therapist (alias: speech)
 *   4. psychotherapist (alias: psychologist)
 *   5. nurse (alias: nursing_assistant)
 *
 * NOTE: Mirrored by backend clinician_permissions.py.
 * Frontend permissions control UI display; backend enforces strict object-level security.
 */
import {
  LayoutDashboard, Activity, Heart, Calendar, PhoneCall, Star,
  FileText, GraduationCap, Clock, CalendarDays, AlertCircle, UserMinus,
  ShieldCheck, Pill, FlaskConical, Truck, Users, Stethoscope, ClipboardList,
  FolderHeart, FileCheck
} from 'lucide-react';

export const ROLE_NORMALIZATION = {
  doctor: 'doctor',
  physio: 'physiotherapist',
  physiotherapist: 'physiotherapist',
  speech: 'speech_therapist',
  speech_therapist: 'speech_therapist',
  psychologist: 'psychotherapist',
  psychotherapist: 'psychotherapist',
  nurse: 'nurse',
  nursing_assistant: 'nurse',
};

export function normalizeRole(role) {
  if (!role) return 'doctor';
  const r = String(role).trim().toLowerCase();
  return ROLE_NORMALIZATION[r] || r;
}

export function isClinicianRole(role) {
  const norm = normalizeRole(role);
  return ['doctor', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'nurse'].includes(norm);
}

// ── Chart Tabs Definitions ──────────────────────────────────────────────────
export const CHART_TABS = [
  { id: 'medical_records', label: 'Medical Records',       icon: FolderHeart,   desc: 'Medical History & Surgical Database' },
  { id: 'doctor_notes',    label: 'Doctor Notes',          icon: Stethoscope,   desc: 'Physician Clinical Assessments' },
  { id: 'consents',        label: 'Consents',              icon: FileCheck,     desc: 'Signed Legal & Treatment Consents' },
  { id: 'procedures',      label: 'Procedures',            icon: ClipboardList, desc: 'Clinical Procedure Requests' },
  { id: 'referrals',       label: 'Referrals',             icon: Users,         desc: 'Specialist & Clinical Referrals' },
  { id: 'nursing_notes',   label: 'Nursing Notes',         icon: FileText,      desc: 'Form A Bedside Progress Notes' },
  { id: 'physiotherapy',   label: 'Physiotherapy & Rehab', icon: Activity,      desc: 'Discipline Therapy Notes & Plans' },
  { id: 'vital_charts',    label: 'Vital Charts',          icon: Heart,         desc: 'Vitals & Fluid Intake / Output' },
  { id: 'lab_results',     label: 'Lab Results',           icon: FlaskConical,  desc: 'Diagnostic Orders & Reports' },
  { id: 'medications',     label: 'Medication Record',     icon: Pill,          desc: 'Prescriptions & Form C MAR' },
];

// ── Target Rights Matrix ────────────────────────────────────────────────────
// Values: 'write' (full read/write), 'read' (view only), null (hidden)
export const ROLE_CHART_PERMISSIONS = {
  doctor: {
    medical_records: 'write',
    doctor_notes:    'write',
    consents:        'write',
    procedures:      'write',
    referrals:       'write',
    prescriptions:   'write',
    medications:     'write',
    nursing_notes:   'read',
    physiotherapy:   'read',
    vital_charts:    'read',
    lab_results:     'write', // order labs
  },
  physiotherapist: {
    medical_records: 'read',
    doctor_notes:    'read',
    consents:        'read',
    procedures:      'read',
    referrals:       'write',
    prescriptions:   'read',  // no prescribing
    medications:     'read',
    nursing_notes:   'read',
    physiotherapy:   'write', // own therapy notes & plan
    vital_charts:    'read',
    lab_results:     'read',
  },
  speech_therapist: {
    medical_records: 'read',
    doctor_notes:    'read',
    consents:        'read',
    procedures:      'read',
    referrals:       'write',
    prescriptions:   'read',  // no prescribing
    medications:     'read',
    nursing_notes:   'read',
    physiotherapy:   'write', // own speech therapy notes & plan
    vital_charts:    'read',
    lab_results:     'read',
  },
  psychotherapist: {
    medical_records: 'read',
    doctor_notes:    'read',
    consents:        'read',
    procedures:      'read',
    referrals:       'write',
    prescriptions:   'read',  // no prescribing
    medications:     'read',
    nursing_notes:   'read',
    physiotherapy:   'write', // own psychotherapy notes & plan (confidential)
    vital_charts:    'read',
    lab_results:     'read',
  },
  nurse: {
    medical_records: 'read',
    doctor_notes:    'read',
    consents:        'read',
    procedures:      'write', // send requests
    referrals:       'read',
    prescriptions:   'write', // record medication administration
    medications:     'write',
    nursing_notes:   'write', // vitals, intake/output, nursing notes
    physiotherapy:   'read',
    vital_charts:    'write',
    lab_results:     'read',
  },
};

// ── Role Metas & Sidebar Configuration ──────────────────────────────────────
export const CLINICIAN_ROLE_CONFIG = {
  doctor: {
    key: 'doctor',
    title: 'Doctors Portal',
    designation: 'Attending Physician',
    badgeColor: '#7C3AED',
    homeWidgets: ['hero', 'digital_id', 'today_visits', 'pending_requests', 'high_alert_patients', 'quick_links', 'placeholders'],
    sidebarGroups: [
      {
        title: 'Overview',
        items: [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Clinical Care',
        items: [
          { id: 'patient-chart', label: 'Patient Chart', icon: Activity },
          { id: 'pharmacy',      label: 'Pharmacy',      icon: Pill },
          { id: 'lab-orders',    label: 'Lab Orders',    icon: FlaskConical },
          { id: 'call-help',     label: 'Emergency Call',icon: PhoneCall },
        ],
      },
      {
        title: 'Clinician Profile',
        items: [
          { id: 'my-docs',          label: 'My Credentials',    icon: FileText },
          { id: 'my-timesheet',     label: 'Clinical Roster',   icon: Clock },
          { id: 'leave-application',label: 'Leave Application', icon: CalendarDays },
          { id: 'company-policies', label: 'Hospital Policies', icon: ShieldCheck },
        ],
      },
    ],
  },
  physiotherapist: {
    key: 'physiotherapist',
    title: 'Physiotherapy Portal',
    designation: 'Physical Rehabilitation Specialist',
    badgeColor: '#0284C7',
    homeWidgets: ['hero', 'digital_id', 'today_visits', 'pending_requests', 'high_alert_patients', 'quick_links', 'placeholders'],
    sidebarGroups: [
      {
        title: 'Overview',
        items: [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Rehabilitation Care',
        items: [
          { id: 'patient-chart', label: 'Patient Chart', icon: Activity },
          { id: 'equipment',     label: 'Equipment',     icon: Truck },
          { id: 'call-help',     label: 'Emergency Call',icon: PhoneCall },
        ],
      },
      {
        title: 'Clinician Profile',
        items: [
          { id: 'my-docs',          label: 'My Credentials',    icon: FileText },
          { id: 'my-timesheet',     label: 'Therapy Roster',    icon: Clock },
          { id: 'leave-application',label: 'Leave Application', icon: CalendarDays },
          { id: 'company-policies', label: 'Hospital Policies', icon: ShieldCheck },
        ],
      },
    ],
  },
  speech_therapist: {
    key: 'speech_therapist',
    title: 'Speech & Language Therapy Portal',
    designation: 'Speech-Language Pathologist (SLP)',
    badgeColor: '#0D9488',
    homeWidgets: ['hero', 'digital_id', 'today_visits', 'pending_requests', 'high_alert_patients', 'quick_links', 'placeholders'],
    sidebarGroups: [
      {
        title: 'Overview',
        items: [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Speech Pathology',
        items: [
          { id: 'patient-chart', label: 'Patient Chart', icon: Activity },
          { id: 'call-help',     label: 'Emergency Call',icon: PhoneCall },
        ],
      },
      {
        title: 'Clinician Profile',
        items: [
          { id: 'my-docs',          label: 'My Credentials',    icon: FileText },
          { id: 'my-timesheet',     label: 'Clinical Roster',   icon: Clock },
          { id: 'leave-application',label: 'Leave Application', icon: CalendarDays },
          { id: 'company-policies', label: 'Hospital Policies', icon: ShieldCheck },
        ],
      },
    ],
  },
  psychotherapist: {
    key: 'psychotherapist',
    title: 'Psychotherapy & Clinical Psychology',
    designation: 'Licensed Clinical Psychologist / Psychotherapist',
    badgeColor: '#9333EA',
    homeWidgets: ['hero', 'digital_id', 'today_visits', 'pending_requests', 'high_alert_patients', 'quick_links', 'placeholders'],
    sidebarGroups: [
      {
        title: 'Overview',
        items: [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Mental Health & CBT',
        items: [
          { id: 'patient-chart', label: 'Patient Chart', icon: Activity },
          { id: 'call-help',     label: 'Emergency Call',icon: PhoneCall },
        ],
      },
      {
        title: 'Clinician Profile',
        items: [
          { id: 'my-docs',          label: 'My Credentials',    icon: FileText },
          { id: 'my-timesheet',     label: 'Session Roster',    icon: Clock },
          { id: 'leave-application',label: 'Leave Application', icon: CalendarDays },
          { id: 'company-policies', label: 'Hospital Policies', icon: ShieldCheck },
        ],
      },
    ],
  },
  nurse: {
    key: 'nurse',
    title: 'Nurses Portal',
    designation: 'Registered Nurse (RN)',
    badgeColor: '#10B981',
    homeWidgets: ['hero', 'digital_id', 'today_visits', 'my_roster', 'my_patient', 'alerts', 'actions', 'claims'],
    sidebarGroups: [
      {
        title: 'Overview',
        items: [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Care',
        items: [
          { id: 'nurse-patient-detail', label: 'Patient Chart', icon: Activity },
          { id: 'call-help',            label: 'Call Help',     icon: PhoneCall },
          { id: 'my-reviews',           label: 'My Reviews',    icon: Star },
        ],
      },
      {
        title: 'Me',
        items: [
          { id: 'my-docs',           label: 'My Docs & ID',      icon: FileText },
          { id: 'my-trainings',      label: 'My Trainings',      icon: GraduationCap },
          { id: 'my-timesheet',      label: 'My Timesheet',      icon: Clock },
          { id: 'leave-application', label: 'Leave Application', icon: CalendarDays },
          { id: 'permission',        label: 'Permission',        icon: Clock },
          { id: 'my-complaints',     label: 'My Complaints',     icon: AlertCircle },
          { id: 'resignation',       label: 'Resignation',       icon: UserMinus },
          { id: 'company-policies',  label: 'Company Policies',  icon: ShieldCheck },
        ],
      },
    ],
  },
};

export function getClinicianConfig(role) {
  const norm = normalizeRole(role);
  return CLINICIAN_ROLE_CONFIG[norm] || CLINICIAN_ROLE_CONFIG.doctor;
}

export function getTabPermission(role, tabId) {
  const norm = normalizeRole(role);
  const permissions = ROLE_CHART_PERMISSIONS[norm] || {};
  return permissions[tabId] || null;
}

export function canWriteTab(role, tabId) {
  return getTabPermission(role, tabId) === 'write';
}

export function canReadTab(role, tabId) {
  const perm = getTabPermission(role, tabId);
  return perm === 'read' || perm === 'write';
}

