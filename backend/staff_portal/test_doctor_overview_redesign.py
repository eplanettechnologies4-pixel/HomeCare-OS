import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from bookings.models import Booking, BookingStatus, ServiceMode, ServiceType
from patients.models import Patient, Prescription, VitalSign
from staff.models import RosterAssignment, RosterWeek, ShiftTemplate, StaffMember
EmploymentStatus = StaffMember.EmploymentStatus
from staff_portal.models import StaffRequest
from staff_portal.views import _classify_patient_vitals, compute_roster_summary

User = get_user_model()


class DoctorOverviewRedesignTests(APITestCase):
    def setUp(self):
        # 1. Admin
        self.admin_user = User.objects.create_superuser(
            username='admin_user', password='Password123!', email='admin@example.com'
        )

        # 2. Branch Manager
        self.bm_user = User.objects.create_user(
            username='bm_user', password='Password123!', email='bm@example.com'
        )
        self.bm_staff = StaffMember.objects.create(
            user=self.bm_user, first_name='Branch', last_name='Manager', role='branch_manager',
            employee_id='BM-001', phone='+923001111111', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 3. Doctor (assigned)
        self.doc_user = User.objects.create_user(
            username='doctor_user', password='Password123!', email='doc@example.com'
        )
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user, first_name='Doctor', last_name='Zafar', role='doctor',
            employee_id='DOC-001', phone='+923002222222', hire_date=datetime.date(2024, 1, 1),
            employment_status=EmploymentStatus.PROBATIONARY,
            probation_end_date=datetime.date(2027, 1, 15),
            platform_allowed='both'
        )

        # 4. Doctor (unassigned)
        self.doc_unassigned_user = User.objects.create_user(
            username='doc_unassigned', password='Password123!', email='doc_un@example.com'
        )
        self.doc_unassigned_staff = StaffMember.objects.create(
            user=self.doc_unassigned_user, first_name='Doctor', last_name='Unassigned', role='doctor',
            employee_id='DOC-002', phone='+923003333333', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 5. Nurse
        self.nurse_user = User.objects.create_user(
            username='nurse_user', password='Password123!', email='nurse@example.com'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Nurse', last_name='Sana', role='nurse',
            employee_id='NUR-001', phone='+923004444444', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 6. Physiotherapist
        self.physio_user = User.objects.create_user(
            username='physio_user', password='Password123!', email='physio@example.com'
        )
        self.physio_staff = StaffMember.objects.create(
            user=self.physio_user, first_name='Physio', last_name='Tariq', role='physiotherapist',
            employee_id='PHY-001', phone='+923005555555', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 7. Accountant
        self.accountant_user = User.objects.create_user(
            username='acc_user', password='Password123!', email='acc@example.com'
        )
        self.accountant_staff = StaffMember.objects.create(
            user=self.accountant_user, first_name='Accountant', last_name='Ali', role='accountant',
            employee_id='ACC-001', phone='+923006666666', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 8. Patient & Booking for doc_staff
        self.patient = Patient.objects.create(
            first_name='Rashid', last_name='Minhas', mr_number='MR-DOC-001',
            date_of_birth=datetime.date(1975, 4, 12), gender='male',
            address='F-8/2, Islamabad', is_active=True
        )

        self.booking_today = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            service_mode=ServiceMode.HOME,
            scheduled_time=timezone.now(),
            status=BookingStatus.ASSIGNED,
            shift_duration='8 hours',
        )

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Employment Status RBAC
    # ──────────────────────────────────────────────────────────────────────────

    def test_employment_status_rbac(self):
        """
        StaffMember.employment_status & probation_end_date:
        - Writable ONLY by admin, super_admin, branch_manager
        - Read-only for self (400 if self attempts edit)
        - Visible to self and admins/branch_managers
        - Hidden from other staff in list/detail
        """
        # A. Self cannot edit employment_status -> 400
        self.client.force_authenticate(user=self.doc_user)
        patch_res = self.client.patch(
            f"/api/staff/members/{self.doc_staff.id}/",
            {'employment_status': EmploymentStatus.TRAINED},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('employment_status', patch_res.data)

        # B. Admin CAN update employment_status
        self.client.force_authenticate(user=self.admin_user)
        patch_res = self.client.patch(
            f"/api/staff/members/{self.doc_staff.id}/",
            {'employment_status': EmploymentStatus.TRAINED},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.doc_staff.refresh_from_db()
        self.assertEqual(self.doc_staff.employment_status, EmploymentStatus.TRAINED)

        # C. Branch Manager CAN update employment_status
        self.client.force_authenticate(user=self.bm_user)
        patch_res = self.client.patch(
            f"/api/staff/members/{self.doc_staff.id}/",
            {'employment_status': EmploymentStatus.PROFESSIONAL},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.doc_staff.refresh_from_db()
        self.assertEqual(self.doc_staff.employment_status, EmploymentStatus.PROFESSIONAL)

        # D. Self CAN view own employment_status
        self.client.force_authenticate(user=self.doc_user)
        get_res = self.client.get(f"/api/staff/members/{self.doc_staff.id}/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertIn('employment_status', get_res.data)
        self.assertEqual(get_res.data['employment_status'], EmploymentStatus.PROFESSIONAL)

        # E. Other staff (e.g. nurse) CANNOT see doc's employment_status (stripped)
        self.client.force_authenticate(user=self.nurse_user)
        get_res = self.client.get(f"/api/staff/members/{self.doc_staff.id}/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertNotIn('employment_status', get_res.data)
        self.assertNotIn('probation_end_date', get_res.data)

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Roster Summary Hours Computation
    # ──────────────────────────────────────────────────────────────────────────

    def test_roster_summary_hours(self):
        """
        Validates compute_roster_summary across shift scenarios:
        - Normal shift: 8h (08:00 - 16:00)
        - Overnight shift: 12h (20:00 - 08:00)
        - Month boundary: shifts partitioned into respective month totals
        - Off day: 0h
        - Standby day: 0h
        - Draft excluded (is_published=False ignored)
        - Staff with no roster: graceful 0.0h and no errors
        """
        local_tz = ZoneInfo('Asia/Karachi')
        fixed_dt = timezone.make_aware(datetime.datetime(2026, 11, 18, 10, 0, 0), timezone=local_tz) # Wednesday

        # Monday of this week: 2026-11-16
        rw = RosterWeek.objects.create(week_start_date=datetime.date(2026, 11, 16), status='published')

        # 1. Normal shift (8h) on Monday 2026-11-16
        RosterAssignment.objects.create(
            roster_week=rw, staff=self.doc_staff, date=datetime.date(2026, 11, 16),
            shift_name='Morning', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            is_published=True
        )

        # 2. Overnight shift (12h) on Tuesday 2026-11-17 (20:00 - 08:00)
        RosterAssignment.objects.create(
            roster_week=rw, staff=self.doc_staff, date=datetime.date(2026, 11, 17),
            shift_name='Night', start_time=datetime.time(20, 0), end_time=datetime.time(8, 0),
            is_published=True
        )

        # 3. Off day on Wednesday 2026-11-18 (0h)
        RosterAssignment.objects.create(
            roster_week=rw, staff=self.doc_staff, date=datetime.date(2026, 11, 18),
            shift_name='Off', is_off=True, is_published=True
        )

        # 4. Standby day on Thursday 2026-11-19 (0h)
        RosterAssignment.objects.create(
            roster_week=rw, staff=self.doc_staff, date=datetime.date(2026, 11, 19),
            shift_name='Standby Duty', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            is_published=True
        )

        # 5. Draft shift on Friday 2026-11-20 (must be EXCLUDED)
        RosterAssignment.objects.create(
            roster_week=rw, staff=self.doc_staff, date=datetime.date(2026, 11, 20),
            shift_name='Draft Evening', start_time=datetime.time(16, 0), end_time=datetime.time(23, 0),
            is_published=False
        )

        # 6. Shift across month boundary (in next month December 2026-12-02, 8h)
        rw_dec = RosterWeek.objects.create(week_start_date=datetime.date(2026, 11, 30), status='published')
        RosterAssignment.objects.create(
            roster_week=rw_dec, staff=self.doc_staff, date=datetime.date(2026, 12, 2),
            shift_name='Dec Morning', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            is_published=True
        )

        # Run compute_roster_summary for doc_staff
        summary = compute_roster_summary(self.doc_staff, local_now=fixed_dt, local_tz=local_tz)

        # Week hours: 8h (Mon) + 12h (Tue) + 0h (Wed Off) + 0h (Thu Standby) = 20.0h (Fri draft excluded)
        self.assertEqual(summary['summary_tiles']['hours_week'], 20.0)

        # Today hours (Wed is Off): 0.0h
        self.assertEqual(summary['summary_tiles']['hours_today'], 0.0)
        self.assertEqual(summary['duty_status']['status'], 'Off')

        # Month hours for November: 20.0h (Dec shift excluded from Nov total)
        self.assertEqual(summary['summary_tiles']['hours_month'], 20.0)

        # Days counts
        self.assertEqual(summary['summary_tiles']['days_on_week'], 2)  # Mon, Tue
        self.assertEqual(summary['summary_tiles']['days_off_week'], 1)  # Wed
        self.assertEqual(summary['summary_tiles']['days_standby_week'], 1)  # Thu

        # Verify weekly strip values
        strip = summary['weekly_strip']
        self.assertEqual(len(strip), 7)
        self.assertEqual(strip[0]['hours'], 8.0)
        self.assertEqual(strip[1]['hours'], 12.0)
        self.assertEqual(strip[2]['hours'], 0.0)
        self.assertEqual(strip[2]['status'], 'off')
        self.assertEqual(strip[3]['hours'], 0.0)
        self.assertEqual(strip[3]['status'], 'standby')
        self.assertEqual(strip[4]['hours'], 0.0)  # Friday draft assignment is excluded!

        # 7. Staff with NO roster returns 0.0h and no errors
        no_roster_summary = compute_roster_summary(self.doc_unassigned_staff, local_now=fixed_dt, local_tz=local_tz)
        self.assertEqual(no_roster_summary['summary_tiles']['hours_today'], 0.0)
        self.assertEqual(no_roster_summary['summary_tiles']['hours_week'], 0.0)
        self.assertEqual(no_roster_summary['summary_tiles']['hours_month'], 0.0)
        self.assertEqual(no_roster_summary['duty_status']['status'], 'Off')
        self.assertIsNone(no_roster_summary['duty_status']['next_duty'])

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Drawer Endpoints Scoping
    # ──────────────────────────────────────────────────────────────────────────

    def test_drawer_endpoints_scoping(self):
        """
        - Assigned doctor receives 200 on all 3 drawer endpoints.
        - Nurse, physiotherapist, accountant receive 403 Forbidden.
        - Unassigned doctor receives 404 Not Found (no assigned patients).
        """
        endpoints = [
            "/api/staff-portal/consultations-list/",
            "/api/staff-portal/pending-requests-list/",
            "/api/staff-portal/patients-by-tier/",
        ]

        # A. Assigned doctor gets 200
        self.client.force_authenticate(user=self.doc_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"Assigned doctor failed on {ep}")

        # B. Non-doctor clinical role (nurse) gets 403
        self.client.force_authenticate(user=self.nurse_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Nurse should get 403 on {ep}")

        # C. Non-doctor clinical role (physiotherapist) gets 403
        self.client.force_authenticate(user=self.physio_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Physio should get 403 on {ep}")

        # D. Non-clinical role (accountant) gets 403
        self.client.force_authenticate(user=self.accountant_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Accountant should get 403 on {ep}")

        # E. Unassigned doctor gets 404 (no assigned patients)
        self.client.force_authenticate(user=self.doc_unassigned_user)
        for ep in endpoints:
            res = self.client.get(ep)
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND, f"Unassigned doctor should get 404 on {ep}")

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Count Equals List Length (Clinician Home vs. Drawer Endpoints)
    # ──────────────────────────────────────────────────────────────────────────

    def test_count_equals_list_length(self):
        """
        Ensures exact equality between clinician-home overview counters and drawer endpoint counts/list lengths:
        - Consultations (physical today/week/month/completed/scheduled/total)
        - Pending requests (referrals, consultations, procedures, prescriptions_to_verify)
        - Acute tier counts (critical, less_critical, mild, unclassified, stable)
        """
        # Create pending requests
        StaffRequest.objects.create(
            staff=self.doc_staff, patient=self.patient, request_type='referral',
            urgency='urgent', notes='Cardiology referral needed'
        )
        StaffRequest.objects.create(
            staff=self.doc_staff, patient=self.patient, request_type='appointment',
            urgency='routine', notes='Follow-up consult'
        )
        StaffRequest.objects.create(
            staff=self.doc_staff, patient=self.patient, request_type='procedure_change',
            urgency='stat', notes='Wound dressing change'
        )
        Prescription.objects.create(
            patient=self.patient, date=datetime.date.today(),
            medication='Augmentin 625mg', dosage='625mg', frequency='TDS', route='Oral',
            verification_status='pending_verification', ordering_doctor_name='Dr. External'
        )

        # Create vital signs: critical tier
        VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff, recorded_at=timezone.now(),
            blood_pressure_systolic=190, blood_pressure_diastolic=105,
            heart_rate=140, spo2=84, temperature=39.5, blood_glucose=140
        )

        self.client.force_authenticate(user=self.doc_user)
        home_res = self.client.get("/api/staff-portal/clinician-home/")
        self.assertEqual(home_res.status_code, status.HTTP_200_OK)
        home_data = home_res.data

        # 1. Consultations count equality
        phys_counts = home_data['consultation_counts']['physical']
        for filt in ['today', 'this_week', 'this_month', 'completed', 'scheduled', 'total']:
            drawer_res = self.client.get(f"/api/staff-portal/consultations-list/?filter={filt}")
            self.assertEqual(drawer_res.status_code, status.HTTP_200_OK)
            self.assertEqual(drawer_res.data['count'], len(drawer_res.data['results']))
            self.assertEqual(drawer_res.data['count'], phys_counts[filt], f"Mismatch on consultation filter {filt}")

        # 2. Pending requests count equality
        pending_data = home_data['pending_requests']
        for req_type in ['referrals', 'consultations', 'procedures', 'prescriptions_to_verify']:
            drawer_res = self.client.get(f"/api/staff-portal/pending-requests-list/?type={req_type}")
            self.assertEqual(drawer_res.status_code, status.HTTP_200_OK)
            self.assertEqual(drawer_res.data['count'], len(drawer_res.data['results']))
            self.assertEqual(drawer_res.data['count'], len(pending_data[req_type]), f"Mismatch on pending type {req_type}")

        # 3. Tiers count equality
        tiers_data = home_data['high_alert_patients']
        for tier in ['critical', 'less_critical', 'mild', 'unclassified', 'stable']:
            drawer_res = self.client.get(f"/api/staff-portal/patients-by-tier/?tier={tier}")
            self.assertEqual(drawer_res.status_code, status.HTTP_200_OK)
            self.assertEqual(drawer_res.data['count'], len(drawer_res.data['results']))
            self.assertEqual(drawer_res.data['count'], len(tiers_data[tier]), f"Mismatch on tier {tier}")

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Unclassified Vitals Are Never Counted as Stable
    # ──────────────────────────────────────────────────────────────────────────

    def test_unclassified_never_counted_as_stable(self):
        """
        Vitals with values outside baseline normal thresholds that do NOT fall into
        critical, less_critical, or mild tiers:
        - Blood glucose 400 mg/dL (normal max: 180) -> unclassified (NEVER stable)
        - Diastolic BP 130 mmHg (normal max: 90) -> unclassified (NEVER stable)
        - Hypothermia Temp 34.0°C (normal min: 35.5) -> unclassified (NEVER stable)
        """
        now = timezone.now()

        # Case 1: Glucose 400 mg/dL with otherwise normal vitals
        v_glucose = VitalSign(
            recorded_at=now,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=75,
            spo2=98,
            temperature=36.8,
            blood_glucose=400,
        )
        tier1, reasons1 = _classify_patient_vitals(v_glucose, now=now)
        self.assertEqual(tier1, 'unclassified')
        self.assertNotEqual(tier1, 'stable')
        self.assertTrue(any('glucose' in r.lower() for r in reasons1))

        # Case 2: Diastolic BP 130 mmHg
        v_dia = VitalSign(
            recorded_at=now,
            blood_pressure_systolic=125,
            blood_pressure_diastolic=130,
            heart_rate=75,
            spo2=98,
            temperature=36.8,
            blood_glucose=100,
        )
        tier2, reasons2 = _classify_patient_vitals(v_dia, now=now)
        self.assertEqual(tier2, 'unclassified')
        self.assertNotEqual(tier2, 'stable')
        self.assertTrue(any('diastolic' in r.lower() for r in reasons2))

        # Case 3: Hypothermia (34.0°C)
        v_hypo = VitalSign(
            recorded_at=now,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=75,
            spo2=98,
            temperature=34.0,
            blood_glucose=100,
        )
        tier3, reasons3 = _classify_patient_vitals(v_hypo, now=now)
        self.assertEqual(tier3, 'unclassified')
        self.assertNotEqual(tier3, 'stable')
        self.assertTrue(any('hypothermia' in r.lower() for r in reasons3))
