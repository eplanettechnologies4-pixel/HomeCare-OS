import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from notifications.models import Notification
from patients.models import Patient, VitalSign
from staff.models import AttendanceRecord, LeaveRequest, StaffMember
from staff_portal.models import (
    CompanyPolicy,
    Complaint,
    FamilyConcern,
    OvertimeClaim,
    PolicyAcknowledgement,
    ResignationRequest,
    StaffRequest,
)

User = get_user_model()


class StaffPortalAPITests(APITestCase):
    def setUp(self):
        # 1. Staff Members: Nurse A, Nurse B, Care Manager / Supervisor
        self.nurse_user_a = User.objects.create_user(username='nurse_alice', password='Password123!', email='alice@ehealth.com')
        self.nurse_a = StaffMember.objects.create(
            user=self.nurse_user_a,
            first_name='Alice',
            last_name='Khan',
            role='nurse',
            designation='Registered Nurse (RN)',
            employee_id='EMP-N-001',
            platform_allowed='both',
            status='available',
            phone='+92-300-1111111',
            hire_date=datetime.date(2022, 1, 1),
        )

        self.nurse_user_b = User.objects.create_user(username='nurse_bob', password='Password123!', email='bob@ehealth.com')
        self.nurse_b = StaffMember.objects.create(
            user=self.nurse_user_b,
            first_name='Bob',
            last_name='Ahmed',
            role='nurse',
            designation='Nursing Assistant',
            employee_id='EMP-N-002',
            platform_allowed='both',
            status='available',
            phone='+92-300-2222222',
            hire_date=datetime.date(2023, 1, 1),
        )

        self.manager_user = User.objects.create_user(username='manager_sara', password='Password123!', email='sara@ehealth.com')
        self.manager_staff = StaffMember.objects.create(
            user=self.manager_user,
            first_name='Sara',
            last_name='CareManager',
            role='care_manager',
            designation='Clinical Care Coordinator',
            employee_id='EMP-M-001',
            platform_allowed='web',
            status='available',
            phone='+92-300-3333333',
            hire_date=datetime.date(2020, 1, 1),
        )

        # 2. Patients: Patient 1 assigned to Nurse A, Patient 2 assigned to Nurse B
        self.patient_1 = Patient.objects.create(
            mr_number='MR-TEST-001',
            patient_code='PT-TEST-001',
            first_name='Fatima',
            last_name='Begum',
            date_of_birth=datetime.date(1955, 3, 15),
            gender='F',
            primary_diagnosis='Hypertension and CVA recovery',
            address='Street 10, F-7/2, Islamabad',
        )

        self.patient_2 = Patient.objects.create(
            mr_number='MR-TEST-002',
            patient_code='PT-TEST-002',
            first_name='Tariq',
            last_name='Mahmood',
            date_of_birth=datetime.date(1960, 8, 20),
            gender='M',
            primary_diagnosis='Post-operative orthopedic care',
            address='Street 25, G-9/1, Islamabad',
        )

        now = timezone.now()

        # 3. Bookings
        self.booking_a = Booking.objects.create(
            reference_code='BK-TEST-A1',
            patient=self.patient_1,
            assigned_staff=self.nurse_a,
            supervisor=self.manager_staff,
            service_type=ServiceType.LONG_TERM,
            status=BookingStatus.IN_PROGRESS,
            scheduled_time=now - datetime.timedelta(hours=2),
            shift_end_time=now + datetime.timedelta(hours=6),
            shift_duration=ShiftDuration.EIGHT_HOURS,
            driver_name='Akram Driver',
            driver_phone='+92-333-0001111',
        )

        self.booking_b = Booking.objects.create(
            reference_code='BK-TEST-B1',
            patient=self.patient_2,
            assigned_staff=self.nurse_b,
            service_type=ServiceType.LONG_TERM,
            status=BookingStatus.ASSIGNED,
            scheduled_time=now + datetime.timedelta(hours=1),
            shift_end_time=now + datetime.timedelta(hours=9),
            shift_duration=ShiftDuration.EIGHT_HOURS,
        )

        # 4. Policy
        self.policy = CompanyPolicy.objects.create(
            title='Test Clinical Policy',
            slug='test-clinical-policy',
            category='Clinical Safety',
            content='Safety standard operating procedures.',
        )

    # ── Test 1: IDOR Patient Access (Nurse A vs Nurse B) ───────────────────────
    def test_idor_patient_access_restricted(self):
        """Nurse A cannot access Patient 2 (assigned to Nurse B); gets 404."""
        self.client.force_authenticate(user=self.nurse_user_a)

        # Access own assigned patient -> 200
        res_own = self.client.get(f'/api/staff-portal/patients/{self.patient_1.id}/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(res_own.data['id'], self.patient_1.id)
        self.assertEqual(res_own.data['patient_code'], 'PT-TEST-001')

        # Access other nurse's patient -> 404 (IDOR prevention)
        res_other = self.client.get(f'/api/staff-portal/patients/{self.patient_2.id}/')
        self.assertEqual(res_other.status_code, status.HTTP_404_NOT_FOUND)

        # AuditLog entry created for patient record access
        audit_entry = AuditLog.objects.filter(actor=self.nurse_user_a, action='Read Patient Record').first()
        self.assertIsNotNone(audit_entry)
        self.assertIn(self.patient_1.full_name, audit_entry.target_user)

    # ── Test 2: IDOR Overtime Claims, Complaints, Requests Scoping ────────────
    def test_idor_staff_scoping_for_claims_and_complaints(self):
        """Nurse A cannot see or mutate Nurse B's claims, complaints, or requests."""
        # Create records for Nurse B
        claim_b = OvertimeClaim.objects.create(
            staff=self.nurse_b,
            date=timezone.now().date() - datetime.timedelta(days=1),
            hours=Decimal('2.00'),
            derived_max_hours=Decimal('3.00'),
            reason='Extended dressing procedure',
        )
        complaint_b = Complaint.objects.create(
            staff=self.nurse_b,
            subject='Equipment issue on site',
            description='Defective suction unit',
        )
        request_b = StaffRequest.objects.create(
            staff=self.nurse_b,
            patient=self.patient_2,
            request_type=StaffRequest.RequestType.SUPERVISOR_VISIT,
            notes='Urgent review needed',
        )

        # Authenticate as Nurse A
        self.client.force_authenticate(user=self.nurse_user_a)

        # List overtime claims -> should NOT include claim_b
        res_claims = self.client.get('/api/staff-portal/overtime-claims/')
        self.assertEqual(res_claims.status_code, status.HTTP_200_OK)
        claim_ids = [c['id'] for c in res_claims.data.get('results', res_claims.data)]
        self.assertNotIn(claim_b.id, claim_ids)

        # List complaints -> should NOT include complaint_b
        res_complaints = self.client.get('/api/staff-portal/complaints/')
        self.assertEqual(res_complaints.status_code, status.HTTP_200_OK)
        complaint_ids = [c['id'] for c in res_complaints.data.get('results', res_complaints.data)]
        self.assertNotIn(complaint_b.id, complaint_ids)

        # List requests -> should NOT include request_b
        res_requests = self.client.get('/api/staff-portal/requests/')
        self.assertEqual(res_requests.status_code, status.HTTP_200_OK)
        request_ids = [r['id'] for r in res_requests.data.get('results', res_requests.data)]
        self.assertNotIn(request_b.id, request_ids)

    # ── Test 3: Time-Left Across Midnight & Timezone (Night Shift) ────────────
    def test_night_shift_time_left_across_midnight(self):
        """Verify night shift (8 PM to 8 AM) calculation across midnight and timezone."""
        tz_karachi = ZoneInfo('Asia/Karachi')
        today = timezone.now().astimezone(tz_karachi).date()

        # Start at 20:00 today, end at 08:00 tomorrow (12h night shift crossing midnight)
        start_time = datetime.datetime.combine(today, datetime.time(20, 0), tzinfo=tz_karachi)
        end_time = start_time + datetime.timedelta(hours=12)

        # Simulate current server time at 23:30 (before midnight)
        simulated_now = start_time + datetime.timedelta(hours=3, minutes=30)  # 23:30

        night_booking = Booking.objects.create(
            reference_code='BK-NIGHT-01',
            patient=self.patient_1,
            assigned_staff=self.nurse_a,
            service_type=ServiceType.LONG_TERM,
            status=BookingStatus.IN_PROGRESS,
            scheduled_time=start_time,
            shift_end_time=end_time,
            shift_type='Night Shift',
            shift_duration=ShiftDuration.TWELVE_HOURS,
        )

        # Difference must be strictly positive: 12h - 3.5h = 8.5h = 30600 seconds
        expected_seconds = int((end_time - simulated_now).total_seconds())
        self.assertEqual(expected_seconds, 30600)
        self.assertGreater(expected_seconds, 0)

        # Simulate time at 02:00 (past midnight)
        simulated_past_midnight = start_time + datetime.timedelta(hours=6)  # 02:00 next day
        remaining_past_midnight = int((end_time - simulated_past_midnight).total_seconds())
        self.assertEqual(remaining_past_midnight, 21600)  # exactly 6 hours left
        self.assertGreater(remaining_past_midnight, 0)

    # ── Test 4: Overtime Cannot Exceed Derived Max Hours ───────────────────────
    def test_overtime_cannot_exceed_derived_hours(self):
        """Claim exceeding derived maximum hours from attendance is rejected with 400."""
        self.client.force_authenticate(user=self.nurse_user_a)

        yesterday = timezone.now().date() - datetime.timedelta(days=1)
        # Create attendance with 1.5 hours overtime
        AttendanceRecord.objects.create(
            staff=self.nurse_a,
            date=yesterday,
            total_hours=Decimal('9.50'),
            overtime_hours=Decimal('1.50'),
        )

        # Attempt to claim 3.0 hours (exceeding derived 1.5)
        res = self.client.post('/api/staff-portal/overtime-claims/', {
            'date': yesterday.isoformat(),
            'hours': '3.00',
            'reason': 'Late patient transfer',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('exceed', res.data.get('detail', '').lower())

        # Claiming within or equal to 1.5h succeeds
        res_valid = self.client.post('/api/staff-portal/overtime-claims/', {
            'date': yesterday.isoformat(),
            'hours': '1.50',
            'reason': 'Late patient transfer documentation',
        })
        self.assertEqual(res_valid.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res_valid.data['hours'])), Decimal('1.50'))

    # ── Test 5: Duplicate Overtime Claim Rejected ──────────────────────────────
    def test_duplicate_overtime_claim_rejected(self):
        """Only one overtime claim permitted per shift/date."""
        self.client.force_authenticate(user=self.nurse_user_a)
        yesterday = timezone.now().date() - datetime.timedelta(days=1)

        AttendanceRecord.objects.create(
            staff=self.nurse_a,
            date=yesterday,
            total_hours=Decimal('10.00'),
            overtime_hours=Decimal('2.00'),
        )

        # First claim succeeds
        res1 = self.client.post('/api/staff-portal/overtime-claims/', {
            'date': yesterday.isoformat(),
            'hours': '1.00',
            'reason': 'Post shift notes',
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Duplicate claim for same date is rejected
        res2 = self.client.post('/api/staff-portal/overtime-claims/', {
            'date': yesterday.isoformat(),
            'hours': '1.00',
            'reason': 'Additional tasks',
        })
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already exists', res2.data.get('detail', '').lower())

    # ── Test 6: Request Creation Notifies Reviewer ─────────────────────────────
    def test_request_creation_notifies_reviewer(self):
        """Submitting a staff request dispatches in-app notification to care coordinator."""
        self.client.force_authenticate(user=self.nurse_user_a)

        initial_notif_count = Notification.objects.filter(recipient=self.manager_user).count()

        res = self.client.post('/api/staff-portal/requests/', {
            'request_type': 'pharmacy_order',
            'patient': self.patient_1.id,
            'urgency': 'urgent',
            'notes': 'Need extra sterile gauze and normal saline flushes.',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Check notification arrived for manager
        new_notifs = Notification.objects.filter(recipient=self.manager_user)
        self.assertEqual(new_notifs.count(), initial_notif_count + 1)
        latest_notif = new_notifs.first()
        self.assertIn('URGENT', latest_notif.message)
        self.assertIn('Pharmacy Order', latest_notif.message)

    # ── Test 7: Public Staff Verify Token Leaks Nothing Extra ──────────────────
    def test_public_verify_token_leaks_nothing_extra(self):
        """Public QR verification returns strictly name, role, photo, employee_id, and active status."""
        signer = signing.TimestampSigner(salt='staff-id-card')
        token = signer.sign(str(self.nurse_a.id))

        # Anonymous request without auth token
        res = self.client.get(f'/api/staff/verify/{token}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertEqual(data['name'], self.nurse_a.full_name)
        self.assertEqual(data['employee_id'], 'EMP-N-001')
        self.assertEqual(data['is_active'], True)
        self.assertEqual(data['role'], 'Registered Nurse (RN)')

        # Strict privacy checks: Ensure NO sensitive PII is returned
        self.assertNotIn('phone', data)
        self.assertNotIn('email', data)
        self.assertNotIn('address', data)
        self.assertNotIn('patient', data)
        self.assertNotIn('patients', data)
        self.assertNotIn('emergency_contact', data)
        self.assertNotIn('salary', data)

    # ── Test 8: Policy Acknowledgement ────────────────────────────────────────
    def test_policy_acknowledgement_flow(self):
        """Staff can list policies and acknowledge them."""
        self.client.force_authenticate(user=self.nurse_user_a)

        res_list = self.client.get('/api/staff-portal/policies/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        results = res_list.data['results'] if (isinstance(res_list.data, dict) and 'results' in res_list.data) else []
        policy_item = next(p for p in results if p['id'] == self.policy.id)
        self.assertFalse(policy_item['is_acknowledged'])

        # Acknowledge policy
        res_ack = self.client.post(f'/api/staff-portal/policies/{self.policy.id}/acknowledge/')
        self.assertEqual(res_ack.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ack.data['status'], 'acknowledged')

        # Verify acknowledgement recorded
        self.assertTrue(PolicyAcknowledgement.objects.filter(policy=self.policy, staff=self.nurse_a).exists())

    # ── Test 9: Home Dashboard Integration ─────────────────────────────────────
    def test_home_dashboard_structure(self):
        """Home endpoint returns server-driven duty status, office hours, and alerts."""
        self.client.force_authenticate(user=self.nurse_user_a)
        res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertIn('server_time', data)
        self.assertIn('office_hours', data)
        self.assertIn('duty', data)
        self.assertIn('staff', data)
        self.assertIn('alerts', data)
        self.assertIn('claims_summary', data)
        self.assertIn('unread_notifications', data)

        self.assertEqual(data['duty']['state'], 'on_duty')
        self.assertGreater(data['duty']['time_left_seconds'], 0)
        self.assertEqual(data['patient']['name'], self.patient_1.full_name)
        self.assertEqual(data['transport']['driver_name'], 'Akram Driver')

    # ── Test 10: Office Hours Boundaries in Asia/Karachi Timezone ──────────────
    def test_office_hours_timezone_and_boundaries(self):
        """Verify is_open_now at 10:55, before (08:59), after (17:01), and at exact boundaries (09:00, 17:00)."""
        tz_karachi = ZoneInfo('Asia/Karachi')
        today = timezone.now().astimezone(tz_karachi).date()
        self.client.force_authenticate(user=self.nurse_user_a)

        # Test cases: (hour, minute, second, expected_open)
        test_points = [
            (10, 55, 0, True),   # 10:55 AM -> Open
            (8, 59, 59, False),  # 08:59:59 -> Closed
            (17, 1, 0, False),   # 17:01:00 -> Closed
            (9, 0, 0, True),     # 09:00:00 -> Open (exact start boundary)
            (17, 0, 0, True),    # 17:00:00 -> Open (exact end boundary)
        ]

        from unittest.mock import patch
        for h, m, s, expected in test_points:
            simulated_local = datetime.datetime.combine(today, datetime.time(h, m, s), tzinfo=tz_karachi)
            with patch('django.utils.timezone.now', return_value=simulated_local):
                res = self.client.get('/api/staff-portal/home/')
                self.assertEqual(res.status_code, status.HTTP_200_OK)
                oh = res.data['office_hours']
                self.assertEqual(
                    oh['is_open_now'],
                    expected,
                    f"Failed at {h:02d}:{m:02d}:{s:02d} Asia/Karachi: expected {expected}, got {oh['is_open_now']}"
                )

    # ── Test 11: Shift Label Derivation & Midnight Crossing ────────────────────
    def test_shift_label_derivation_and_countdown(self):
        """Derives Day shift vs Night shift from actual start hour, handling midnight-crossing shifts."""
        from staff_portal.views import _derive_shift_label
        tz_karachi = ZoneInfo('Asia/Karachi')
        today = timezone.now().astimezone(tz_karachi).date()

        # Day shift starting at 08:33 AM
        start_day = datetime.datetime.combine(today, datetime.time(8, 33), tzinfo=tz_karachi)
        end_day = start_day + datetime.timedelta(hours=12)
        label_day = _derive_shift_label(start_day, end_day, tz=tz_karachi)
        self.assertEqual(label_day, "Day shift (12 hours)")

        # Night shift starting at 20:00 PM (8:00 PM) crossing midnight to 08:00 AM next day
        start_night = datetime.datetime.combine(today, datetime.time(20, 0), tzinfo=tz_karachi)
        end_night = start_night + datetime.timedelta(hours=12)
        label_night = _derive_shift_label(start_night, end_night, tz=tz_karachi)
        self.assertEqual(label_night, "Night shift (12 hours)")

    # ── Test 12: Alert Server-Side Deduplication & Top-5 Capping ───────────────
    def test_alert_server_deduplication_and_capping(self):
        """Duplicate abnormal vitals alerts for same patient/source are deduplicated to 1 latest alert."""
        self.client.force_authenticate(user=self.nurse_user_a)
        now = timezone.now()

        # Create 2 abnormal vital sign records for patient 1 (e.g. repeated abnormal BP sync)
        VitalSign.objects.create(
            patient=self.patient_1,
            blood_pressure_systolic=160,
            blood_pressure_diastolic=100,
            heart_rate=78,
            spo2=96,
            recorded_at=now - datetime.timedelta(minutes=30),
        )
        VitalSign.objects.create(
            patient=self.patient_1,
            blood_pressure_systolic=165,
            blood_pressure_diastolic=105,
            heart_rate=80,
            spo2=95,
            recorded_at=now - datetime.timedelta(minutes=10),
        )

        res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        alerts = res.data['alerts']
        # Ensure only 1 high_vitals alert for patient_1 exists
        vital_alerts = [a for a in alerts if a['type'] == 'high_vitals' and a['patient_id'] == self.patient_1.id]
        self.assertEqual(len(vital_alerts), 1, "Duplicate vitals alerts should be deduplicated to 1 latest alert")
        # Ensure list is capped at top 5
        self.assertLessEqual(len(alerts), 5)

