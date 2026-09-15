// ── HomeCare OS Mock Data ──────────────────────────────────────────────────
// Realistic seeded data matching all DRF serializer shapes

export const STAFF = [
  { id: 1, full_name: 'Sarah Mitchell', first_name: 'Sarah', last_name: 'Mitchell', employee_id: 'EMP001', role: 'nurse', role_display: 'Nurse', specialization: 'Palliative & Wound Care', status: 'on_visit', status_display: 'On Visit', phone: '+92-300-1234567', email: 'sarah.m@homecareos.com', rating: 4.9, hire_date: '2022-03-15', current_latitude: 33.5710, current_longitude: 73.1515, location_updated_at: new Date().toISOString() },
  { id: 2, full_name: 'Dr. Raza Khan', first_name: 'Raza', last_name: 'Khan', employee_id: 'EMP002', role: 'doctor', role_display: 'Doctor', specialization: 'Internal Medicine', status: 'on_visit', status_display: 'On Visit', phone: '+92-300-2345678', email: 'raza.k@homecareos.com', rating: 4.8, hire_date: '2021-07-01', current_latitude: 33.5680, current_longitude: 73.1490, location_updated_at: new Date().toISOString() },
  { id: 3, full_name: 'Amina Farooq', first_name: 'Amina', last_name: 'Farooq', employee_id: 'EMP003', role: 'physio', role_display: 'Physiotherapist', specialization: 'Orthopaedic Rehabilitation', status: 'available', status_display: 'Available', phone: '+92-300-3456789', email: 'amina.f@homecareos.com', rating: 4.7, hire_date: '2023-01-20', current_latitude: 33.5750, current_longitude: 73.1540, location_updated_at: new Date().toISOString() },
  { id: 4, full_name: 'Imran Siddiqui', first_name: 'Imran', last_name: 'Siddiqui', employee_id: 'EMP004', role: 'nurse', role_display: 'Nurse', specialization: 'Post-Op Care & IV Therapy', status: 'available', status_display: 'Available', phone: '+92-300-4567890', email: 'imran.s@homecareos.com', rating: 4.6, hire_date: '2022-09-10', current_latitude: 33.5630, current_longitude: 73.1530, location_updated_at: new Date().toISOString() },
  { id: 5, full_name: 'Dr. Layla Noor', first_name: 'Layla', last_name: 'Noor', employee_id: 'EMP005', role: 'psychologist', role_display: 'Psychologist', specialization: 'Anxiety & Depression', status: 'on_visit', status_display: 'On Visit', phone: '+92-300-5678901', email: 'layla.n@homecareos.com', rating: 4.9, hire_date: '2020-11-05', current_latitude: 33.5730, current_longitude: 73.1470, location_updated_at: new Date().toISOString() },
  { id: 6, full_name: 'Zara Hussain', first_name: 'Zara', last_name: 'Hussain', employee_id: 'EMP006', role: 'speech', role_display: 'Speech & Language Therapist', specialization: 'Post-Stroke Dysphasia', status: 'off_duty', status_display: 'Off Duty', phone: '+92-300-6789012', email: 'zara.h@homecareos.com', rating: 4.8, hire_date: '2023-04-12', current_latitude: null, current_longitude: null, location_updated_at: null },
  { id: 7, full_name: 'Omar Butt', first_name: 'Omar', last_name: 'Butt', employee_id: 'EMP007', role: 'dietician', role_display: 'Dietician', specialization: 'Diabetes & Renal Nutrition', status: 'available', status_display: 'Available', phone: '+92-300-7890123', email: 'omar.b@homecareos.com', rating: 4.5, hire_date: '2023-08-01', current_latitude: 33.5690, current_longitude: 73.1520, location_updated_at: new Date().toISOString() },
  { id: 8, full_name: 'Hina Malik', first_name: 'Hina', last_name: 'Malik', employee_id: 'EMP008', role: 'care_manager', role_display: 'Client Care Manager', specialization: 'Long-Term Patient Coordination', status: 'available', status_display: 'Available', phone: '+92-300-8901234', email: 'hina.m@homecareos.com', rating: 4.7, hire_date: '2021-02-28', current_latitude: null, current_longitude: null, location_updated_at: null },
];

export const PATIENTS = [
  { id: 1, mr_number: 'MR-2024-001', full_name: 'Ahmed Hassan', first_name: 'Ahmed', last_name: 'Hassan', age: 72, date_of_birth: '1952-04-10', gender: 'M', gender_display: 'Male', primary_diagnosis: 'Type 2 Diabetes with Diabetic Foot Ulcer', phone: '+92-51-111-0001', address: 'House 14, Block C, Soan Garden, Islamabad', latitude: 33.5620, longitude: 73.1530, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
  { id: 2, mr_number: 'MR-2024-002', full_name: 'Fatima Zahra', first_name: 'Fatima', last_name: 'Zahra', age: 58, date_of_birth: '1966-09-23', gender: 'F', gender_display: 'Female', primary_diagnosis: 'Post-Stroke Rehabilitation (Left Hemiplegia)', phone: '+92-51-111-0002', address: 'House 27, Street 4, Sector B, PWD Society, Islamabad', latitude: 33.5750, longitude: 73.1510, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
  { id: 3, mr_number: 'MR-2024-003', full_name: 'Khalid Mehmood', first_name: 'Khalid', last_name: 'Mehmood', age: 65, date_of_birth: '1959-01-15', gender: 'M', gender_display: 'Male', primary_diagnosis: 'COPD Stage III + CHF', phone: '+92-51-111-0003', address: 'House 8-A, Block D, Soan Garden, Islamabad', latitude: 33.5640, longitude: 73.1550, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
  { id: 4, mr_number: 'MR-2024-004', full_name: 'Nadia Alam', first_name: 'Nadia', last_name: 'Alam', age: 45, date_of_birth: '1979-06-30', gender: 'F', gender_display: 'Female', primary_diagnosis: 'Major Depressive Disorder + GAD', phone: '+92-51-111-0004', address: 'Plot 104, Main Double Road, PWD, Islamabad', latitude: 33.5770, current_longitude: 73.1490, longitude: 73.1490, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
  { id: 5, mr_number: 'MR-2024-005', full_name: 'Hassan Ali', first_name: 'Hassan', last_name: 'Ali', age: 80, date_of_birth: '1944-12-01', gender: 'M', gender_display: 'Male', primary_diagnosis: 'Alzheimer\'s Disease Moderate Stage', phone: '+92-51-111-0005', address: 'House 45, Street 12, Block A, Soan Garden, Islamabad', latitude: 33.5610, longitude: 73.1510, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
  { id: 6, mr_number: 'MR-2024-006', full_name: 'Rukhsana Begum', first_name: 'Rukhsana', last_name: 'Begum', age: 55, date_of_birth: '1969-03-19', gender: 'F', gender_display: 'Female', primary_diagnosis: 'Post-Total Knee Replacement Physiotherapy', phone: '+92-51-111-0006', address: 'House 19, Block C-1, PWD Housing Society, Islamabad', latitude: 33.5720, longitude: 73.1530, assigned_care_manager: STAFF[7], care_manager_name: 'Hina Malik', is_active: true },
];

const now = new Date();
const addMins  = (m) => new Date(now.getTime() + m * 60000).toISOString();
const subMins  = (m) => new Date(now.getTime() - m * 60000).toISOString();
const subHours = (h) => new Date(now.getTime() - h * 3600000).toISOString();
const subDays  = (d) => new Date(now.getTime() - d * 86400000).toISOString();

export const BOOKINGS = [
  { id: 1001, patient: PATIENTS[0], patient_name: 'Ahmed Hassan', patient_mr: 'MR-2024-001', assigned_staff: STAFF[0], staff_name: 'Sarah Mitchell', service_type: 'long_term', service_type_display: 'Long-Term Care', status: 'in_progress', status_display: 'In Progress', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: subMins(45), actual_start_time: subMins(38), actual_end_time: null, address: 'House 14, Block C, Soan Garden, Islamabad', latitude: 33.5620, longitude: 73.1530, amount: 2500, amount_paid: 2500, balance_due: 0, notes: 'Daily wound dressing, blood glucose monitoring, insulin administration', created_at: subDays(2) },
  { id: 1002, patient: PATIENTS[1], patient_name: 'Fatima Zahra', patient_mr: 'MR-2024-002', assigned_staff: STAFF[1], staff_name: 'Dr. Raza Khan', service_type: 'long_term', service_type_display: 'Long-Term Care', status: 'en_route', status_display: 'En Route', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: addMins(10), actual_start_time: null, actual_end_time: null, address: 'House 27, Street 4, Sector B, PWD Society, Islamabad', latitude: 33.5750, longitude: 73.1510, amount: 3500, amount_paid: 3500, balance_due: 0, notes: 'Neurological assessment, physio coordination', created_at: subDays(3) },
  { id: 1003, patient: PATIENTS[2], patient_name: 'Khalid Mehmood', patient_mr: 'MR-2024-003', assigned_staff: null, staff_name: null, service_type: 'short_service', service_type_display: 'Short Service', status: 'pending', status_display: 'Pending', payment_status: 'pending', payment_status_display: 'Payment Pending', scheduled_time: addMins(30), actual_start_time: null, actual_end_time: null, address: 'House 8-A, Block D, Soan Garden, Islamabad', latitude: 33.5640, longitude: 73.1550, amount: 1200, amount_paid: 0, balance_due: 1200, notes: 'Nebulisation + SpO2 check', created_at: subMins(120) },
  { id: 1004, patient: PATIENTS[3], patient_name: 'Nadia Alam', patient_mr: 'MR-2024-004', assigned_staff: STAFF[4], staff_name: 'Dr. Layla Noor', service_type: 'long_term', service_type_display: 'Long-Term Care', status: 'in_progress', status_display: 'In Progress', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: subMins(60), actual_start_time: subMins(55), actual_end_time: null, address: 'Plot 104, Main Double Road, PWD, Islamabad', latitude: 33.5770, longitude: 73.1490, amount: 4000, amount_paid: 4000, balance_due: 0, notes: 'Weekly therapy session — CBT protocol', created_at: subDays(7) },
  { id: 1005, patient: PATIENTS[4], patient_name: 'Hassan Ali', patient_mr: 'MR-2024-005', assigned_staff: STAFF[3], staff_name: 'Imran Siddiqui', service_type: 'long_term_admission', service_type_display: 'Long-Term Admission', status: 'assigned', status_display: 'Assigned', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: addMins(90), actual_start_time: null, actual_end_time: null, address: 'House 45, Street 12, Block A, Soan Garden, Islamabad', latitude: 33.5610, longitude: 73.1510, amount: 5000, amount_paid: 5000, balance_due: 0, notes: 'Morning care, medication, fall prevention assessment', created_at: subDays(1) },
  { id: 1006, patient: PATIENTS[5], patient_name: 'Rukhsana Begum', patient_mr: 'MR-2024-006', assigned_staff: STAFF[2], staff_name: 'Amina Farooq', service_type: 'long_term', service_type_display: 'Long-Term Care', status: 'completed', status_display: 'Completed', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: subHours(3), actual_start_time: subHours(3), actual_end_time: subMins(90), address: 'House 19, Block C-1, PWD Housing Society, Islamabad', latitude: 33.5720, longitude: 73.1530, amount: 2000, amount_paid: 2000, balance_due: 0, notes: 'ROM exercises, gait training with walker', created_at: subDays(5) },
  { id: 1007, patient: PATIENTS[0], patient_name: 'Ahmed Hassan', patient_mr: 'MR-2024-001', assigned_staff: STAFF[0], staff_name: 'Sarah Mitchell', service_type: 'medicine_delivery', service_type_display: 'Medicine Delivery', status: 'completed', status_display: 'Completed', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: subDays(1), actual_start_time: subDays(1), actual_end_time: new Date(subDays(1)).toISOString(), address: 'House 14, Block C, Soan Garden, Islamabad', latitude: 33.5620, longitude: 73.1530, amount: 800, amount_paid: 800, balance_due: 0, notes: 'Monthly insulin + dressings delivery', created_at: subDays(2) },
  { id: 1008, patient: PATIENTS[1], patient_name: 'Fatima Zahra', patient_mr: 'MR-2024-002', assigned_staff: null, staff_name: null, service_type: 'short_service', service_type_display: 'Short Service', status: 'pending', status_display: 'Pending', payment_status: 'pending', payment_status_display: 'Payment Pending', scheduled_time: addMins(180), actual_start_time: null, actual_end_time: null, address: 'House 27, Street 4, Sector B, PWD Society, Islamabad', latitude: 33.5750, longitude: 73.1510, amount: 1500, amount_paid: 0, balance_due: 1500, notes: 'Blood draw for monthly labs', created_at: subMins(30) },
  { id: 1009, patient: PATIENTS[2], patient_name: 'Khalid Mehmood', patient_mr: 'MR-2024-003', assigned_staff: STAFF[1], staff_name: 'Dr. Raza Khan', service_type: 'medicine_delivery', service_type_display: 'Medicine Delivery', status: 'cancelled', status_display: 'Cancelled', payment_status: 'waived', payment_status_display: 'Waived', scheduled_time: subHours(4), actual_start_time: null, actual_end_time: null, address: 'House 8-A, Block D, Soan Garden, Islamabad', latitude: 33.5640, longitude: 73.1550, amount: 1200, amount_paid: 0, balance_due: 0, notes: 'Cancelled by patient family due to travel', created_at: subHours(5) },
  { id: 1010, patient: PATIENTS[3], patient_name: 'Nadia Alam', patient_mr: 'MR-2024-004', assigned_staff: STAFF[0], staff_name: 'Sarah Mitchell', service_type: 'long_term', service_type_display: 'Long-Term Care', status: 'late', status_display: 'Late', payment_status: 'advance', payment_status_display: 'Advance Paid', scheduled_time: subMins(50), actual_start_time: null, actual_end_time: null, address: 'Plot 104, Main Double Road, PWD, Islamabad', latitude: 33.5770, longitude: 73.1490, amount: 2500, amount_paid: 2500, balance_due: 0, notes: 'Delayed due to severe traffic on Expressway', created_at: subHours(2) },
];

export const GEOFENCE_EVENTS = [
  { id: 1, booking: BOOKINGS[0], booking_id: 1001, staff: STAFF[0], staff_name: 'Sarah Mitchell', patient_name: 'Ahmed Hassan', event_type: 'check_in', event_type_display: 'Check In (Arrived)', timestamp: subMins(38), latitude: 33.5621, longitude: 73.1531, visit_duration_minutes: null },
  { id: 2, booking: BOOKINGS[5], booking_id: 1006, staff: STAFF[2], staff_name: 'Amina Farooq', patient_name: 'Rukhsana Begum', event_type: 'check_in', event_type_display: 'Check In (Arrived)', timestamp: subHours(3), latitude: 33.5721, longitude: 73.1531, visit_duration_minutes: null },
  { id: 3, booking: BOOKINGS[5], booking_id: 1006, staff: STAFF[2], staff_name: 'Amina Farooq', patient_name: 'Rukhsana Begum', event_type: 'check_out', event_type_display: 'Check Out (Departed)', timestamp: subMins(90), latitude: 33.5720, longitude: 73.1530, visit_duration_minutes: 90 },
  { id: 4, booking: BOOKINGS[3], booking_id: 1004, staff: STAFF[4], staff_name: 'Dr. Layla Noor', patient_name: 'Nadia Alam', event_type: 'check_in', event_type_display: 'Check In (Arrived)', timestamp: subMins(55), latitude: 33.5771, longitude: 73.1491, visit_duration_minutes: null },
  { id: 5, booking: BOOKINGS[1], booking_id: 1002, staff: STAFF[1], staff_name: 'Dr. Raza Khan', patient_name: 'Fatima Zahra', event_type: 'en_route', event_type_display: 'En Route', timestamp: subMins(15), latitude: 33.5740, longitude: 73.1505, visit_duration_minutes: null },
];

export const SOS_EVENTS = [
  { id: 1, booking: BOOKINGS[0], booking_id: 1001, staff: STAFF[0], staff_name: 'Sarah Mitchell', patient_name: 'Ahmed Hassan', triggered_at: subMins(5), latitude: 33.5621, longitude: 73.1531, status: 'active', status_display: 'Active', resolved_at: null, notes: '' },
];

export const ALERTS = [
  { id: 'a1', type: 'sos',     severity: 'critical', title: 'SOS Alert — Sarah Mitchell',    message: 'SOS triggered during visit at Ahmed Hassan (MR-2024-001). GPS: 33.5621, 73.1531', time: subMins(5),  dismissible: true },
  { id: 'a2', type: 'late',    severity: 'warning',  title: 'En Route — Dr. Raza Khan',       message: 'Booking #1002 is running 8 min late. Scheduled arrival: now. Patient: Fatima Zahra.', time: subMins(10), dismissible: true },
  { id: 'a3', type: 'stock',   severity: 'warning',  title: 'Low Equipment Stock',             message: 'Wound dressing kits below threshold (3 remaining). Reorder required.', time: subMins(25), dismissible: true },
  { id: 'a4', type: 'pending', severity: 'info',     title: '2 bookings need staff assignment', message: 'Bookings #1003 (Khalid Mehmood) and #1008 (Fatima Zahra) are unassigned.', time: subMins(40), dismissible: true },
];

export const ALERT_RULES = {
  id: 1, name: 'Default Rules',
  late_arrival_minutes: 15,
  no_show_minutes: 60,
  overstay_minutes: 30,
  is_active: true,
};

// 7-day trend data for Overview chart
export const TREND_DATA = [
  { date: 'Mon', booked: 12, completed: 10 },
  { date: 'Tue', booked: 15, completed: 14 },
  { date: 'Wed', booked: 11, completed: 9  },
  { date: 'Thu', booked: 18, completed: 16 },
  { date: 'Fri', booked: 20, completed: 19 },
  { date: 'Sat', booked: 14, completed: 13 },
  { date: 'Sun', booked: 8,  completed: 8  },
];

export const REVENUE_BY_SERVICE = [
  { service_type: 'long_term',           label: 'Long-Term Care',       total: 185000, count: 42 },
  { service_type: 'long_term_admission', label: 'Long-Term Admission',  total: 92000,  count: 18 },
  { service_type: 'short_service',       label: 'Short Service',        total: 48000,  count: 38 },
  { service_type: 'medicine_delivery',   label: 'Medicine Delivery',    total: 22400,  count: 28 },
];

export const DAILY_REVENUE = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(now.getTime() - (29 - i) * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
  total: 4000 + Math.round(Math.random() * 8000),
}));

export const VITALS = [
  {
    id: 1,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    recorded_by_name: 'Sarah Mitchell (RN)',
    recorded_at: subHours(2),
    blood_pressure_systolic: 145,
    blood_pressure_diastolic: 92,
    heart_rate: 88,
    temperature: 37.2,
    spo2: 96,
    respiratory_rate: 18,
    weight_kg: 82.5,
    intake_ng: 400,
    intake_iv: 800,
    output_urine: 750,
    output_drain: 150,
    bsr: 210,
    insulin: '8 Units Regular Insulin SC',
    notes: 'Patient reports mild dizziness. Glucose elevated. Insulin administered per sliding scale.',
    anomalies: ['High Systolic BP (145 mmHg)', 'Elevated BSR (210 mg/dL)']
  },
  {
    id: 2,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    recorded_by_name: 'Sarah Mitchell (RN)',
    recorded_at: subHours(8),
    blood_pressure_systolic: 138,
    blood_pressure_diastolic: 88,
    heart_rate: 82,
    temperature: 36.9,
    spo2: 97,
    respiratory_rate: 16,
    weight_kg: 82.5,
    intake_ng: 500,
    intake_iv: 900,
    output_urine: 850,
    output_drain: 250,
    bsr: 185,
    insulin: '6 Units Regular Insulin SC',
    notes: 'Vitals stable post dressing change.',
    anomalies: []
  },
  {
    id: 3,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    recorded_by_name: 'Imran Siddiqui (RN)',
    recorded_at: subDays(1),
    blood_pressure_systolic: 130,
    blood_pressure_diastolic: 84,
    heart_rate: 76,
    temperature: 36.8,
    spo2: 98,
    respiratory_rate: 16,
    weight_kg: 82.0,
    intake_ng: 600,
    intake_iv: 1000,
    output_urine: 1100,
    output_drain: 100,
    bsr: 140,
    insulin: '4 Units Regular Insulin SC',
    notes: 'Night shift record. Patient slept comfortably.',
    anomalies: []
  }
];

export const NURSE_NOTES = [
  {
    id: 1,
    patient_id: 1,
    doctor_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1',
    recorded_by_name: 'Sarah Mitchell (RN)',
    recorded_by_role: 'Registered Nurse',
    recorded_at: subHours(2),
    note: 'Wound on right plantar aspect — reduced exudate, granulation tissue healthy, wound edges cleaner. Cleansed with sterile normal saline, changed to hydrocolloid dressing. Patient educated on strict offloading compliance. BGL 210 mg/dL — insulin dose adjusted per sliding scale protocol. Notified Dr. Raza Khan via EMR alert.',
    is_flagged: true,
    addenda: [
      {
        id: 'add-1',
        text: 'Addendum: Dr. Raza Khan reviewed vitals note at 14:15. Agreed with 8U insulin sliding scale adjustment and ordered continuation of daily hydrocolloid dressing.',
        created_by: 'Dr. Raza Khan (Consultant Physician)',
        created_at: subHours(1)
      }
    ]
  },
  {
    id: 2,
    patient_id: 1,
    doctor_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1',
    recorded_by_name: 'Sarah Mitchell (RN)',
    recorded_by_role: 'Registered Nurse',
    recorded_at: subDays(1),
    note: 'Routine morning clinical visit. Plantar ulcer dressing intact and dry. No fever or focal neurological deficit. Patient ambulatory with frame assist. Family educated on foot hygiene and sugar monitoring regimen.',
    is_flagged: false,
    addenda: []
  }
];

export const PRESCRIPTIONS = [
  { id: 1, patient: 1, prescribed_by: 'Dr. Raza Khan', date: subDays(7), medication: 'Metformin', dosage: '1000mg', frequency: 'Twice daily', route: 'PO', duration_days: 90, notes: 'With meals' },
  { id: 2, patient: 1, prescribed_by: 'Dr. Raza Khan', date: subDays(7), medication: 'Insulin Glargine (Lantus)', dosage: '20 units', frequency: 'Once daily at bedtime', route: 'SC', duration_days: 30, notes: 'Adjust per sliding scale' },
  { id: 3, patient: 1, prescribed_by: 'Dr. Raza Khan', date: subDays(7), medication: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', route: 'PO', duration_days: 90, notes: '' },
];

export const MAR_MEDICATIONS = [
  {
    id: 101,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    brand_name: 'Glucophage',
    generic_name: 'Metformin HCl',
    dose: '1000 mg',
    route: 'PO (Oral)',
    frequency: 'BD (Twice Daily - 08:00, 20:00)',
    start_date: subDays(6).substring(0, 10),
    dc_date: addMins(86400 * 30).substring(0, 10),
    prescription_type: 'regular',
    is_discontinued: false,
    days: {
      1: { date: subDays(6).substring(0, 10), given: true, time: '08:15', nurse_name: 'Sarah Mitchell (RN)' },
      2: { date: subDays(5).substring(0, 10), given: true, time: '08:10', nurse_name: 'Sarah Mitchell (RN)' },
      3: { date: subDays(4).substring(0, 10), given: true, time: '08:00', nurse_name: 'Imran Siddiqui (RN)' },
      4: { date: subDays(3).substring(0, 10), given: true, time: '08:20', nurse_name: 'Sarah Mitchell (RN)' },
      5: { date: subDays(2).substring(0, 10), given: true, time: '08:05', nurse_name: 'Sarah Mitchell (RN)' },
      6: { date: subDays(1).substring(0, 10), given: true, time: '08:30', nurse_name: 'Imran Siddiqui (RN)' },
      7: { date: new Date().toISOString().substring(0, 10), given: true, time: '08:12', nurse_name: 'Sarah Mitchell (RN)' },
    }
  },
  {
    id: 102,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    brand_name: 'Lantus SoloStar',
    generic_name: 'Insulin Glargine',
    dose: '20 Units',
    route: 'SC (Subcutaneous)',
    frequency: 'OD Bedtime (22:00)',
    start_date: subDays(6).substring(0, 10),
    dc_date: addMins(86400 * 30).substring(0, 10),
    prescription_type: 'regular',
    is_discontinued: false,
    days: {
      1: { date: subDays(6).substring(0, 10), given: true, time: '22:00', nurse_name: 'Sarah Mitchell (RN)' },
      2: { date: subDays(5).substring(0, 10), given: true, time: '22:15', nurse_name: 'Sarah Mitchell (RN)' },
      3: { date: subDays(4).substring(0, 10), given: true, time: '22:05', nurse_name: 'Imran Siddiqui (RN)' },
      4: { date: subDays(3).substring(0, 10), given: true, time: '22:10', nurse_name: 'Sarah Mitchell (RN)' },
      5: { date: subDays(2).substring(0, 10), given: true, time: '22:00', nurse_name: 'Sarah Mitchell (RN)' },
      6: { date: subDays(1).substring(0, 10), given: true, time: '22:25', nurse_name: 'Imran Siddiqui (RN)' },
      7: { date: new Date().toISOString().substring(0, 10), given: false, time: null, nurse_name: null },
    }
  },
  {
    id: 103,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    brand_name: 'Norvasc',
    generic_name: 'Amlodipine Besylate',
    dose: '5 mg',
    route: 'PO (Oral)',
    frequency: 'OD Morning (09:00)',
    start_date: subDays(6).substring(0, 10),
    dc_date: addMins(86400 * 30).substring(0, 10),
    prescription_type: 'regular',
    is_discontinued: false,
    days: {
      1: { date: subDays(6).substring(0, 10), given: true, time: '09:00', nurse_name: 'Sarah Mitchell (RN)' },
      2: { date: subDays(5).substring(0, 10), given: true, time: '09:10', nurse_name: 'Sarah Mitchell (RN)' },
      3: { date: subDays(4).substring(0, 10), given: true, time: '09:05', nurse_name: 'Imran Siddiqui (RN)' },
      4: { date: subDays(3).substring(0, 10), given: true, time: '09:00', nurse_name: 'Sarah Mitchell (RN)' },
      5: { date: subDays(2).substring(0, 10), given: true, time: '09:15', nurse_name: 'Sarah Mitchell (RN)' },
      6: { date: subDays(1).substring(0, 10), given: true, time: '09:00', nurse_name: 'Imran Siddiqui (RN)' },
      7: { date: new Date().toISOString().substring(0, 10), given: true, time: '09:05', nurse_name: 'Sarah Mitchell (RN)' },
    }
  },
  {
    id: 104,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    brand_name: 'Panadol / Disprol',
    generic_name: 'Paracetamol',
    dose: '1000 mg',
    route: 'PO (Oral)',
    frequency: 'PRN (As Needed for Fever / Pain > 37.5°C)',
    start_date: subDays(6).substring(0, 10),
    dc_date: addMins(86400 * 30).substring(0, 10),
    prescription_type: 'prn',
    is_discontinued: false,
    days: {
      1: { date: subDays(6).substring(0, 10), given: false, time: null, nurse_name: null },
      2: { date: subDays(5).substring(0, 10), given: true, time: '14:30', nurse_name: 'Sarah Mitchell (RN)' },
      3: { date: subDays(4).substring(0, 10), given: false, time: null, nurse_name: null },
      4: { date: subDays(3).substring(0, 10), given: false, time: null, nurse_name: null },
      5: { date: subDays(2).substring(0, 10), given: false, time: null, nurse_name: null },
      6: { date: subDays(1).substring(0, 10), given: false, time: null, nurse_name: null },
      7: { date: new Date().toISOString().substring(0, 10), given: false, time: null, nurse_name: null },
    }
  },
  {
    id: 105,
    patient_id: 1,
    consultant_name: 'Dr. Raza Khan',
    ward_room: 'Home Care Bed #1 / Ward 4B',
    brand_name: 'Augmentin',
    generic_name: 'Amoxicillin / Clavulanate',
    dose: '1g',
    route: 'PO (Oral)',
    frequency: 'BD (Twice Daily)',
    start_date: subDays(20).substring(0, 10),
    dc_date: subDays(6).substring(0, 10),
    prescription_type: 'regular',
    is_discontinued: true,
    days: {
      1: { date: subDays(20).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      2: { date: subDays(19).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      3: { date: subDays(18).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      4: { date: subDays(17).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      5: { date: subDays(16).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      6: { date: subDays(15).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
      7: { date: subDays(14).substring(0, 10), given: true, time: '08:00', nurse_name: 'Sarah Mitchell (RN)' },
    }
  }
];

export const LAB_RESULTS = [
  { id: 1, patient: 1, test_name: 'HbA1c', result_value: '8.2', unit: '%', reference_range: '< 7.0%', is_abnormal: true, collected_at: subDays(14) },
  { id: 2, patient: 1, test_name: 'Fasting Blood Glucose', result_value: '195', unit: 'mg/dL', reference_range: '70-100 mg/dL', is_abnormal: true, collected_at: subDays(14) },
  { id: 3, patient: 1, test_name: 'Creatinine', result_value: '1.1', unit: 'mg/dL', reference_range: '0.7-1.2 mg/dL', is_abnormal: false, collected_at: subDays(14) },
  { id: 4, patient: 1, test_name: 'CBC - Haemoglobin', result_value: '11.8', unit: 'g/dL', reference_range: '13.5-17.5 g/dL', is_abnormal: true, collected_at: subDays(14) },
];

export const ATTENDANCE = [
  { id: 1, staff: 1, staff_name: 'Sarah Mitchell', date: new Date().toISOString().split('T')[0], check_in: subHours(8), check_out: null, visits_completed: 2, total_hours: 4.5, overtime_hours: 0 },
  { id: 2, staff: 2, staff_name: 'Dr. Raza Khan',  date: new Date().toISOString().split('T')[0], check_in: subHours(7), check_out: null, visits_completed: 1, total_hours: 3.2, overtime_hours: 0 },
  { id: 3, staff: 3, staff_name: 'Amina Farooq',   date: new Date().toISOString().split('T')[0], check_in: subHours(9), check_out: subHours(3), visits_completed: 1, total_hours: 6.0, overtime_hours: 0 },
  { id: 4, staff: 4, staff_name: 'Dr. Layla Noor', date: new Date().toISOString().split('T')[0], check_in: subHours(6), check_out: null, visits_completed: 1, total_hours: 3.0, overtime_hours: 0 },
];

export const THERAPY_SESSIONS = {
  physio: [
    { id: 1, patient_name: 'Rukhsana Begum', mr_number: 'MR-2024-006', therapist: 'Amina Farooq', date: new Date().toISOString().split('T')[0], time: '09:00', duration_mins: 60, session_number: 8, total_sessions: 24, goals: 'Increase knee flexion to 110°', notes: 'Good progress. ROM improved to 95°. Gait training with walker.', status: 'completed' },
    { id: 2, patient_name: 'Fatima Zahra', mr_number: 'MR-2024-002', therapist: 'Amina Farooq', date: new Date().toISOString().split('T')[0], time: '11:00', duration_mins: 45, session_number: 12, total_sessions: 36, goals: 'Left arm functional recovery', notes: 'Passive ROM exercises. Patient motivated.', status: 'scheduled' },
  ],
  speech: [
    { id: 1, patient_name: 'Fatima Zahra', mr_number: 'MR-2024-002', therapist: 'Zara Hussain', date: new Date().toISOString().split('T')[0], time: '14:00', duration_mins: 45, session_number: 5, total_sessions: 20, goals: 'Improve swallowing — FEES score 3→4', notes: 'Dysphagia protocol level 2. Tolerating minced diet.', status: 'scheduled' },
  ],
  psychotherapy: [
    { id: 1, patient_name: 'Nadia Alam', mr_number: 'MR-2024-004', therapist: 'Dr. Layla Noor', date: new Date().toISOString().split('T')[0], time: '16:00', duration_mins: 60, session_number: 9, total_sessions: 16, goals: 'PHQ-9 score reduction to <10', notes: 'CBT session — behavioural activation plan reviewed.', status: 'in_progress' },
  ],
  dietician: [
    { id: 1, patient_name: 'Ahmed Hassan', mr_number: 'MR-2024-001', therapist: 'Omar Butt', date: new Date().toISOString().split('T')[0], time: '10:30', duration_mins: 30, session_number: 3, total_sessions: 8, goals: 'HbA1c < 7.5%, BMI stable', notes: 'Low GI diet plan reviewed. Portion control education.', status: 'scheduled' },
    { id: 2, patient_name: 'Khalid Mehmood', mr_number: 'MR-2024-003', therapist: 'Omar Butt', date: new Date().toISOString().split('T')[0], time: '12:00', duration_mins: 30, session_number: 1, total_sessions: 4, goals: 'Fluid restriction 1.5L/day', notes: 'Renal-friendly diet — sodium < 2g/day.', status: 'scheduled' },
  ],
};

export const ANNOUNCEMENTS = [
  { id: 1, title: 'New SOP: Wound Care Protocol Update', content: 'Updated Wound Assessment & Dressing SOP (v3.2) is now live in the Documentation Library. All nursing staff must review and sign off by 31 Aug 2026.', author: 'Admin Team', date: subDays(1), priority: 'high' },
  { id: 2, title: 'September Roster Published', content: 'September 2026 duty roster is now available. Please review your schedule and submit any swap requests within 48 hours.', author: 'HR Department', date: subDays(2), priority: 'normal' },
  { id: 3, title: 'Training: Basic Life Support Refresher', content: 'Mandatory BLS refresher training scheduled for 5 Sep 2026. All clinical staff must attend. Location: Head Office Training Room.', author: 'Education Dept', date: subDays(3), priority: 'normal' },
];

export const SALARY_DATA = [
  { id: 1, staff_id: 1, staff_name: 'Sarah Mitchell', month: 'August 2026', base_salary: 75000, hours_worked: 168, overtime_hours: 12, overtime_pay: 6750, deductions: 3750, net_salary: 78000, status: 'pending' },
  { id: 2, staff_id: 2, staff_name: 'Dr. Raza Khan',  month: 'August 2026', base_salary: 120000, hours_worked: 160, overtime_hours: 0, overtime_pay: 0, deductions: 6000, net_salary: 114000, status: 'pending' },
  { id: 3, staff_id: 3, staff_name: 'Amina Farooq',   month: 'August 2026', base_salary: 65000, hours_worked: 170, overtime_hours: 10, overtime_pay: 4875, deductions: 3250, net_salary: 66625, status: 'pending' },
  { id: 4, staff_id: 4, staff_name: 'Dr. Layla Noor', month: 'August 2026', base_salary: 110000, hours_worked: 152, overtime_hours: 0, overtime_pay: 0, deductions: 5500, net_salary: 104500, status: 'paid' },
];

export const SKILLS_LIST = [
  'Elderly Care', 'BP Monitoring', 'Medication', 'Injection', 'Dressing', 'Wound Care', 'IV Therapy', 'Post-Op Rehab'
];

export const LEADS = [
  { id: 'lead-1', name: 'Zubair Qureshi', phone: '+92-321-9876543', email: 'zubair.q@gmail.com', source: 'Website Inquiry', stage: 'new_lead', service_needed: 'Elderly Nursing Care', notes: 'Needs 24/7 attendant for elderly father (82y).', assigned_to: 'Hina Malik', created_at: subDays(1) },
  { id: 'lead-2', name: 'Dr. Tariq Jamil', phone: '+92-300-5551234', email: 'tariq@jamilclinic.com', source: 'Doctor Referral', stage: 'new_lead', service_needed: 'Post-Op Wound Dressing', notes: 'Referral for post-hip replacement dressing.', assigned_to: 'Hina Malik', created_at: subDays(2) },
  { id: 'lead-3', name: 'Mariam Sohail', phone: '+92-333-4447788', email: 'm.sohail@hotmail.com', source: 'Facebook Ad', stage: 'contacted', service_needed: 'Physiotherapy', notes: 'Spoke on phone. Sent pricing packages for stroke rehab.', assigned_to: 'Hina Malik', created_at: subDays(3) },
  { id: 'lead-4', name: 'Kamran Akmal', phone: '+92-345-6668899', email: 'kamran@akmal.pk', source: 'Google Search', stage: 'contacted', service_needed: 'Medicine Delivery', notes: 'Inquired about monthly diabetic supply kit.', assigned_to: 'Hina Malik', created_at: subDays(4) },
  { id: 'lead-5', name: 'Shahida Perveen', phone: '+92-301-2223344', email: 'shahida.p@yahoo.com', source: 'Walk-in', stage: 'follow_up', service_needed: 'Long-Term Admission', notes: 'Visited head office. Family decision pending on package B.', assigned_to: 'Hina Malik', created_at: subDays(5) },
  { id: 'lead-6', name: 'Bilal Farooqui', phone: '+92-322-8889900', email: 'bilal.f@outlook.com', source: 'Phone Call', stage: 'follow_up', service_needed: 'Speech Therapy', notes: 'Requested trial session for child with stammering.', assigned_to: 'Hina Malik', created_at: subDays(6) },
  { id: 'lead-7', name: 'Usman Ghani', phone: '+92-302-1114455', email: 'usman.g@gmail.com', source: 'Website Inquiry', stage: 'converted', service_needed: 'Long-Term Care', notes: 'Converted to Patient MR-2024-001 (Ahmed Hassan).', assigned_to: 'Hina Malik', created_at: subDays(10) },
  { id: 'lead-8', name: 'Samina Baig', phone: '+92-331-7772233', email: 'samina.b@gmail.com', source: 'Instagram', stage: 'converted', service_needed: 'Short Service', notes: 'Converted to Patient MR-2024-002 (Fatima Zahra).', assigned_to: 'Hina Malik', created_at: subDays(12) },
];

export const INVOICES_V2 = [
  {
    id: 'INV-2026-0001',
    invoice_number: 'INV-2026-0001',
    patient_id: 1,
    patient_name: 'Ahmed Hassan',
    patient_mr: 'MR-2024-001',
    billing_type: 'monthly',
    billing_type_display: 'Monthly Package',
    status: 'paid',
    status_display: 'Paid',
    issued_date: '2026-08-01',
    due_date: '2026-08-10',
    subtotal: 75000,
    discount: 5000,
    tax: 0,
    total: 70000,
    amount_paid: 70000,
    balance_due: 0,
    line_items: [
      { id: 1, description: 'Monthly Skilled Nursing Care (Diabetic Foot Ulcer)', quantity: 1, unit_price: 65000, amount: 65000 },
      { id: 2, description: 'Wound Care Consumables & Dressing Pack', quantity: 1, unit_price: 10000, amount: 10000 },
    ],
    payments: [
      { id: 1, amount: 70000, method: 'Bank Transfer', received_at: '2026-08-03', reference: 'IBFT-994821' },
    ]
  },
  {
    id: 'INV-2026-0002',
    invoice_number: 'INV-2026-0002',
    patient_id: 2,
    patient_name: 'Fatima Zahra',
    patient_mr: 'MR-2024-002',
    billing_type: 'monthly',
    billing_type_display: 'Monthly Package',
    status: 'partial',
    status_display: 'Partial',
    issued_date: '2026-08-05',
    due_date: '2026-08-15',
    subtotal: 80000,
    discount: 0,
    tax: 0,
    total: 80000,
    amount_paid: 40000,
    balance_due: 40000,
    line_items: [
      { id: 1, description: 'Post-Stroke Intensive Neuro Rehabilitation Package', quantity: 1, unit_price: 70000, amount: 70000 },
      { id: 2, description: 'Speech & Language Therapy Sessions (5x)', quantity: 5, unit_price: 2000, amount: 10000 },
    ],
    payments: [
      { id: 1, amount: 40000, method: 'Cash', received_at: '2026-08-05', reference: 'RCPT-1042' },
    ]
  },
  {
    id: 'INV-2026-0003',
    invoice_number: 'INV-2026-0003',
    patient_id: 3,
    patient_name: 'Khalid Mehmood',
    patient_mr: 'MR-2024-003',
    billing_type: 'visit',
    billing_type_display: 'Per Visit',
    status: 'pending',
    status_display: 'Pending',
    issued_date: '2026-08-20',
    due_date: '2026-08-30',
    subtotal: 12000,
    discount: 0,
    tax: 0,
    total: 12000,
    amount_paid: 0,
    balance_due: 12000,
    line_items: [
      { id: 1, description: 'COPD Nebulisation & Oxygen Monitoring Visit (x4)', quantity: 4, unit_price: 3000, amount: 12000 },
    ],
    payments: []
  },
  {
    id: 'INV-2026-0004',
    invoice_number: 'INV-2026-0004',
    patient_id: 4,
    patient_name: 'Nadia Alam',
    patient_mr: 'MR-2024-004',
    billing_type: 'monthly',
    billing_type_display: 'Monthly Package',
    status: 'paid',
    status_display: 'Paid',
    issued_date: '2026-08-01',
    due_date: '2026-08-10',
    subtotal: 45000,
    discount: 0,
    tax: 0,
    total: 45000,
    amount_paid: 45000,
    balance_due: 0,
    line_items: [
      { id: 1, description: 'Weekly Psychotherapy & Home Mental Health Visits', quantity: 4, unit_price: 11250, amount: 45000 },
    ],
    payments: [
      { id: 1, amount: 45000, method: 'Card', received_at: '2026-08-02', reference: 'POS-88392' },
    ]
  },
];

export const DAILY_REPORTS = [
  {
    id: 'rep-1',
    booking_id: 1001,
    patient_id: 1,
    patient_name: 'Ahmed Hassan',
    patient_mr: 'MR-2024-001',
    nurse_name: 'Sarah Mitchell',
    visit_date: subHours(2),
    status: 'submitted',
    vitals: {
      bp_sys: 142,
      bp_dia: 90,
      pulse: 84,
      temp: 37.1,
      spo2: 96,
      blood_sugar: 210,
      weight: 82.5,
      pain_level: 3,
    },
    care_checklist: {
      medication_given: true,
      bp_check: true,
      injection: true,
      dressing: true,
      physiotherapy: false,
      spo2_check: true,
      others: false,
    },
    notes: 'Wound on right plantar aspect cleaned with sterile saline. Hydrocolloid dressing applied. Insulin 20 units SC administered. Patient reports mild discomfort during dressing change.',
    photos: [
      'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=300&q=80',
    ],
  },
  {
    id: 'rep-2',
    booking_id: 1006,
    patient_id: 6,
    patient_name: 'Rukhsana Begum',
    patient_mr: 'MR-2024-006',
    nurse_name: 'Amina Farooq',
    visit_date: subHours(4),
    status: 'submitted',
    vitals: {
      bp_sys: 128,
      bp_dia: 82,
      pulse: 76,
      temp: 36.6,
      spo2: 98,
      blood_sugar: 110,
      weight: 70.0,
      pain_level: 2,
    },
    care_checklist: {
      medication_given: true,
      bp_check: true,
      injection: false,
      dressing: false,
      physiotherapy: true,
      spo2_check: true,
      others: false,
    },
    notes: 'Knee flexion ROM exercises completed (reached 95°). Gait training with walker for 15 minutes. Patient performed exercises enthusiastically.',
    photos: [],
  },
];

export const ROLE_CONFIG = {
  super_admin:     { label: 'Super Admin',     nav: ['overview', 'bookings', 'live-tracking', 'staff', 'patients', 'therapy', 'admin-hr', 'accounts', 'billing', 'crm', 'lms', 'reports', 'analytics', 'users'] },
  admin:           { label: 'Admin',           nav: ['overview', 'bookings', 'live-tracking', 'patients', 'therapy', 'admin-hr', 'crm', 'lms', 'reports', 'analytics'] },
  branch_manager:  { label: 'Branch Manager',  nav: ['overview', 'bookings', 'live-tracking', 'patients', 'lms', 'reports', 'analytics'] },
  care_manager:    { label: 'Care Manager',    nav: ['overview', 'bookings', 'live-tracking', 'patients', 'therapy'] },
  nurse:           { label: 'Nurse / Doctor',  nav: ['overview', 'bookings', 'live-tracking', 'patients'] },
  accountant:      { label: 'Accountant',      nav: ['overview', 'accounts', 'billing', 'reports', 'analytics'] },
  crm_executive:   { label: 'CRM Executive',   nav: ['overview', 'crm', 'reports', 'analytics'] },
  patient_family:  { label: 'Patient / Family',nav: ['family-portal'] },
};

export const SYSTEM_USERS = [
  { id: 1, full_name: 'Super Administrator', email: 'admin@homecareos.com', phone: '+92-300-0000000', role: 'super_admin', role_display: 'Super Admin', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-28 11:30' },
  { id: 2, full_name: 'Shahzaib Ahmed', email: 'shahzaib.a@homecareos.com', phone: '+92-300-1112233', role: 'admin', role_display: 'Admin', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-28 10:15' },
  { id: 3, full_name: 'Hina Malik', email: 'hina.m@homecareos.com', phone: '+92-300-8901234', role: 'care_manager', role_display: 'Care Manager', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-27 16:45' },
  { id: 4, full_name: 'Tariq Mehmood', email: 'tariq.m@homecareos.com', phone: '+92-321-4445566', role: 'branch_manager', role_display: 'Operations Manager', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-26 09:20' },
  { id: 5, full_name: 'Sarah Mitchell', email: 'sarah.m@homecareos.com', phone: '+92-300-1234567', role: 'nurse', role_display: 'Nurse', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-28 08:00' },
  { id: 6, full_name: 'Fariha Yasmin', email: 'fariha.y@homecareos.com', phone: '+92-333-7778899', role: 'accountant', role_display: 'Accountant', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-28 11:10' },
  { id: 7, full_name: 'Usman Chaudhry', email: 'usman.c@homecareos.com', phone: '+92-345-9990011', role: 'crm_executive', role_display: 'CRM Executive', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'active', last_login: '2026-08-27 14:00' },
  { id: 8, full_name: 'Kamran Sheikh', email: 'kamran.s@homecareos.com', phone: '+92-301-3332211', role: 'admin', role_display: 'Admin', branch: 'Main Office (PWD / Soan Garden, Islamabad)', status: 'suspended', last_login: '2026-07-15 12:00' },
];

export const INITIAL_PERMISSION_MATRIX = {
  super_admin:    { bookings: { view: true, add: true, edit: true, delete: true }, patients: { view: true, add: true, edit: true, delete: true }, billing: { view: true, add: true, edit: true, delete: true }, staff: { view: true, add: true, edit: true, delete: true }, users: { view: true, add: true, edit: true, delete: true } },
  admin:          { bookings: { view: true, add: true, edit: true, delete: false }, patients: { view: true, add: true, edit: true, delete: false }, billing: { view: false, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  branch_manager: { bookings: { view: true, add: true, edit: true, delete: false }, patients: { view: true, add: true, edit: true, delete: false }, billing: { view: false, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  care_manager:   { bookings: { view: true, add: true, edit: true, delete: false }, patients: { view: true, add: true, edit: true, delete: false }, billing: { view: false, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  nurse:          { bookings: { view: true, add: false, edit: false, delete: false }, patients: { view: true, add: false, edit: false, delete: false }, billing: { view: false, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  accountant:     { bookings: { view: true, add: false, edit: false, delete: false }, patients: { view: true, add: false, edit: false, delete: false }, billing: { view: true, add: true, edit: true, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  crm_executive:  { bookings: { view: true, add: true, edit: false, delete: false }, patients: { view: false, add: false, edit: false, delete: false }, billing: { view: false, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
  patient_family: { bookings: { view: true, add: false, edit: false, delete: false }, patients: { view: true, add: false, edit: false, delete: false }, billing: { view: true, add: false, edit: false, delete: false }, staff: { view: false, add: false, edit: false, delete: false }, users: { view: false, add: false, edit: false, delete: false } },
};

export const AUDIT_LOGS = [
  { id: 1, actor_name: 'Super Administrator', action: 'Created Account', target_user: 'Sarah Mitchell (Nurse)', details: 'Auto-generated temporary password sent to email', timestamp: '2026-08-28 11:20' },
  { id: 2, actor_name: 'Super Administrator', action: 'Suspended Account', target_user: 'Kamran Sheikh (Admin)', details: 'Account suspended due to inactive transfer', timestamp: '2026-08-25 14:15' },
  { id: 3, actor_name: 'Shahzaib Ahmed', action: 'Updated Permissions', target_user: 'Role: Care Manager', details: 'Added view access to Patients module', timestamp: '2026-08-20 09:30' },
  { id: 4, actor_name: 'Super Administrator', action: 'Reset Password', target_user: 'Fariha Yasmin (Accountant)', details: 'Password reset link sent to phone SMS', timestamp: '2026-08-18 16:45' },
];

export const ATTENDANCE_THRESHOLDS = {
  late_threshold_mins: 15,
  standard_shift_hours: 8,
};

export const LEAVE_REQUESTS = [
  { id: 1, staff_id: 1, staff_name: 'Sarah Mitchell', leave_type: 'sick', leave_type_display: 'Sick Leave', start_date: '2026-09-02', end_date: '2026-09-03', reason: 'Fever & viral infection', status: 'pending', created_at: '2026-08-28' },
  { id: 2, staff_id: 4, staff_name: 'Imran Siddiqui', leave_type: 'annual', leave_type_display: 'Annual Leave', start_date: '2026-09-10', end_date: '2026-09-15', reason: 'Family event out of city', status: 'approved', created_at: '2026-08-24' },
  { id: 3, staff_id: 3, staff_name: 'Amina Farooq', leave_type: 'casual', leave_type_display: 'Casual Leave', start_date: '2026-08-14', end_date: '2026-08-14', reason: 'Personal emergency', status: 'approved', created_at: '2026-08-12' },
  { id: 4, staff_id: 6, staff_name: 'Zara Hussain', leave_type: 'unpaid', leave_type_display: 'Unpaid Leave', start_date: '2026-09-01', end_date: '2026-09-05', reason: 'Exams preparation', status: 'pending', created_at: '2026-08-27' },
];

export const PUBLIC_SERVICES = [
  { id: 'long_term', title: 'Long-Term Skilled Nursing', category: 'nursing', price_display: 'PKR 65,000 / month', short_desc: '24/7 or 12h dedicated registered nurse at home for chronic illness & wound care.', full_desc: 'Comprehensive home nursing care for post-operative recovery, diabetic ulcer management, stroke rehabilitation, and tracheostomy care. Includes daily vitals monitoring, IV therapy, and doctor coordination.', features: ['Licensed RN/BSN Nurse', 'Daily Vitals & I/O Monitoring', 'Sterile Wound Dressing Pack', '24/7 Care Manager Coordination'], image: '/service-nursing.png' },
  { id: 'icu_at_home', title: 'ICU & Telemetry at Home', category: 'nursing', price_display: 'PKR 120,000 / month', short_desc: 'Advanced cardiac monitor, ventilator, oxygen concentrator & 24/7 ICU trained nurse.', full_desc: 'Complete hospital ICU setup installed at home. Equipped with multi-para patient monitor, mechanical ventilator, syringe pump, and dedicated 24/7 ICU specialist nurse.', features: ['24/7 ICU Trained Specialist Nurse', 'Multi-Para Telemetry Monitor', 'Oxygen Concentrator & Ventilator', 'Daily Intensivist Doctor Tele-Visits'], image: '/service-icu.png' },
  { id: 'physiotherapy', title: 'Home Physiotherapy & Neuro Rehab', category: 'therapy', price_display: 'PKR 2,500 / session', short_desc: 'Stroke rehab, joint replacement recovery, paralysis & ROM exercise therapy.', full_desc: 'Personalized physical therapy sessions by licensed DPT physiotherapists. Specializing in neurological rehabilitation, post-TKR/THR rehab, and mobility restoration.', features: ['Doctor of Physical Therapy (DPT)', 'Custom Exercise Protocols', 'Mobility & Gait Retraining', 'Progress Tracking Metrics'], image: '/service-physio.png' },
  { id: 'doctor_visit', title: 'Doctor Home Visit & Consultation', category: 'nursing', price_display: 'PKR 3,500 / visit', short_desc: 'Senior specialist doctor consultation, prescription & diagnostic evaluation at home.', full_desc: 'Home consultation by experienced medical specialists. Includes detailed physical exam, treatment prescription, diagnostic ordering, and referral management.', features: ['Senior MBBS / FCPS Specialist', 'Comprehensive Bedside Exam', 'Instant Digital Prescription', 'Lab & Diagnostic Ordering'], image: '/service-doctor.png' },
  { id: 'short_service', title: 'Short Service & Lab Sampling', category: 'short', price_display: 'PKR 1,500 / visit', short_desc: 'At-home blood sampling, ECG, IV cannula insertion & nebulisation.', full_desc: 'Quick 30-45 minute clinical visit by a certified nurse for blood sample collection, lab testing, injections, cannula insertion, or ECG recording.', features: ['Sample Collection at Doorstep', 'Sterile Vacutainer Kits', 'Digital Lab Reports in 12h', 'Registered Phlebotomists'], image: '/service-nursing.png' },
  { id: 'medicine_delivery', title: 'Medicine & Consumables Delivery', category: 'pharmacy', price_display: 'Free Delivery on PKR 3,000+', short_desc: 'Monthly diabetic kits, dressing packs & prescription medicines delivered in 2h.', full_desc: 'Cold-chain verified pharmacy delivery service for daily medications, insulin refills, dressing packs, and adult care consumables delivered right to your home.', features: ['Cold-Chain Insulin Storage', 'Monthly Auto-Refill Subscription', 'Verified Authentic Medicines', 'Express 2-Hour Delivery'], image: '/hero-bg.png' },
  { id: 'elderly_care', title: 'Elderly Care & Attendant', category: 'nursing', price_display: 'PKR 35,000 / month', short_desc: 'Compassionate assistance for dementia, Alzheimer\'s, hygiene & fall prevention.', full_desc: 'Trained care attendants providing daily living assistance, personal hygiene, feeding, medication reminders, and mobility support for senior citizens.', features: ['Trained Geriatric Care Giver', 'Dementia & Alzheimer\'s Support', 'Fall Prevention & Transfer Assistance', 'Daily Caregiver Logs'], image: '/service-doctor.png' },
  { id: 'speech_therapy', title: 'Speech & Language Therapy', category: 'therapy', price_display: 'PKR 3,000 / session', short_desc: 'Post-stroke dysphasia, swallowing difficulties & speech rehabilitation.', full_desc: 'Clinical speech-language pathology sessions targeting post-stroke dysphasia, FEES swallowing protocols, and articulation improvements.', features: ['Certified Speech Pathologist', 'FEES Swallowing Assessment', 'Dietary Texture Modifications', 'Communication Boards'], image: '/service-physio.png' },
];

export const BLOG_POSTS = [
  { id: 1, title: 'Essential SOP for Home Wound Care & Diabetic Foot Ulcers', category: 'Clinical SOP', author: 'Dr. Raza Khan', date: '2026-08-20', summary: 'Learn proper sterile dressing techniques, signs of infection, and offloading methods for diabetic ulcer healing at home.', content: 'Diabetic foot ulcers require strict adherence to aseptic technique. Always wash hands, use sterile normal saline, avoid iodine on granulating tissue, and apply appropriate hydrocolloid dressings...' },
  { id: 2, title: 'Post-Stroke Home Rehabilitation: The First 90 Days Guide', category: 'Neuro Rehab', author: 'Amina Farooq (DPT)', date: '2026-08-15', summary: 'Maximize neuroplasticity recovery with daily passive ROM exercises, spasticity management, and home safety adaptations.', content: 'The first 90 days following an ischemic stroke are critical for functional brain recovery. Consistency in passive range-of-motion exercises prevents joint contractures...' },
  { id: 3, title: 'Preventing Senior Falls: 7 Simple Home Modification Steps', category: 'Elderly Safety', author: 'Hina Malik', date: '2026-08-10', summary: 'Simple, effective ways to eliminate trip hazards, add bathroom grab bars, and improve lighting for elderly safety.', content: 'Falls are the leading cause of hip fractures in seniors over 70. Removing loose throw rugs, installing non-slip bathroom mats, and adding nightlights cut fall risk by 80%...' },
  { id: 4, title: 'Understanding Insulin Cold-Chain Storage & Admin Tips', category: 'Medication SOP', author: 'Sarah Mitchell (RN)', date: '2026-08-05', summary: 'How to store unopened insulin, proper injection site rotation, and blood glucose monitoring intervals.', content: 'Unopened insulin vials must be stored between 2°C to 8°C. Never freeze insulin. Opened pens can remain at room temperature for up to 28 days...' },
];




