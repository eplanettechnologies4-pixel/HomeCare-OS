import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import StaffMember, StaffRole, RosterWeek, RosterAssignment
from patients.models import Patient, Prescription, VitalSign, NurseNote, MARAdministration
from bookings.models import Booking, BookingStatus
from staff_portal.models import NurseVisit
from accounts.models import UserProfile, UserRole
from tracking.models import GeofenceEvent

User = get_user_model()


class NurseVisitFlowE2ETests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tz = ZoneInfo('Asia/Karachi')
        self.now = timezone.now()
        self.local_now = self.now.astimezone(self.tz)
        self.today = self.local_now.date()
        self.monday = self.today - datetime.timedelta(days=self.today.weekday())

        # 1. Assigned active nurse
        self.nurse_user = User.objects.create_user(
            username='visit_nurse', password='Password123!', first_name='Fatima', last_name='Nurse'
        )
        self.nurse = StaffMember.objects.create(
            user=self.nurse_user, first_name='Fatima', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-VISIT-1', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923001111111'
        )

        # 2. Unassigned active nurse
        self.other_nurse_user = User.objects.create_user(
            username='visit_other_nurse', password='Password123!', first_name='Zainab', last_name='Nurse'
        )
        self.other_nurse = StaffMember.objects.create(
            user=self.other_nurse_user, first_name='Zainab', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-VISIT-2', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923002222222'
        )

        # 3. Trainee nurse
        self.trainee_user = User.objects.create_user(
            username='visit_trainee', password='Password123!', first_name='Amina', last_name='Trainee'
        )
        self.trainee = StaffMember.objects.create(
            user=self.trainee_user, first_name='Amina', last_name='Trainee',
            role=StaffRole.NURSE, employee_id='TR-VISIT-1', hire_date=datetime.date(2024, 1, 1),
            lifecycle_stage='trainee', phone='+923003333333'
        )

        # 4. Admin StaffMember
        self.admin_user = User.objects.create_user(
            username='visit_admin', password='Password123!', first_name='Admin', last_name='User', is_staff=True
        )
        self.admin = StaffMember.objects.create(
            user=self.admin_user, first_name='Admin', last_name='User',
            role=StaffRole.ADMIN, employee_id='ADM-VISIT-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active'
        )

        # 5. Real super_admin (superuser flag, NO StaffMember row)
        self.super_admin_user = User.objects.create_superuser(
            username='visit_superadmin', email='super@hospital.org', password='Password123!'
        )

        # 6. Care Manager
        self.cm_user = User.objects.create_user(
            username='visit_cm', password='Password123!', first_name='Care', last_name='Manager'
        )
        self.cm = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Manager',
            role=StaffRole.CARE_MANAGER, employee_id='CM-VISIT-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active'
        )

        # 7. Doctor
        self.doctor_user = User.objects.create_user(
            username='visit_doctor', password='Password123!', first_name='Dr', last_name='Khan'
        )
        self.doctor = StaffMember.objects.create(
            user=self.doctor_user, first_name='Dr', last_name='Khan',
            role=StaffRole.DOCTOR, employee_id='DOC-VISIT-1', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active'
        )

        # 8. Branch Manager
        self.bm_user = User.objects.create_user(
            username='visit_bm', password='Password123!', first_name='Branch', last_name='Manager'
        )
        self.bm = StaffMember.objects.create(
            user=self.bm_user, first_name='Branch', last_name='Manager',
            role=StaffRole.BRANCH_MANAGER, employee_id='BM-VISIT-1', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active'
        )

        # 9. Accountant
        self.acc_user = User.objects.create_user(
            username='visit_acc', password='Password123!', first_name='Account', last_name='Ant'
        )
        self.acc = StaffMember.objects.create(
            user=self.acc_user, first_name='Account', last_name='Ant',
            role=StaffRole.ACCOUNTANT, employee_id='ACC-VISIT-1', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active'
        )

        # 10. CRM Executive
        self.crm_user = User.objects.create_user(
            username='visit_crm', password='Password123!', first_name='CRM', last_name='Exec'
        )
        self.crm = StaffMember.objects.create(
            user=self.crm_user, first_name='CRM', last_name='Exec',
            role=StaffRole.CRM_EXECUTIVE, employee_id='CRM-VISIT-1', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active'
        )

        # 11. Patient Family user
        self.family_user = User.objects.create_user(
            username='visit_family', password='Password123!', first_name='Family', last_name='User'
        )
        UserProfile.objects.create(
            user=self.family_user, role=UserRole.PATIENT_FAMILY
        )

        # 12. Patient with coordinates (F-8/2 Islamabad)
        self.patient = Patient.objects.create(
            first_name='Tariq', last_name='Mahmood',
            mr_number='MR-VISIT-MAIN',
            phone='+923009998877',
            address='House 42, Street 5, F-8/2, Islamabad',
            latitude=33.712345,
            longitude=73.045678,
            primary_diagnosis='Type 2 Diabetes',
            emergency_contact_name='Bilal Mahmood',
            emergency_contact_phone='+923001234567',
            date_of_birth=datetime.date(1955, 6, 15),
        )

        # 13. Active booking today assigned to self.nurse
        self.booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse,
            scheduled_time=self.now,
            shift_end_time=self.now + datetime.timedelta(hours=12),
            status=BookingStatus.ASSIGNED,
        )

        # 14. Published roster assignment today
        self.week = RosterWeek.objects.create(
            week_start_date=self.monday,
            status=RosterWeek.Status.PUBLISHED,
            revision=1,
        )
        self.assignment = RosterAssignment.objects.create(
            roster_week=self.week,
            staff=self.nurse,
            date=self.today,
            shift_name='Morning Shift',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0),
            is_published=True,
        )
        self.assignment.patients.add(self.patient)

        # 15. Prescriptions: one verified, one pending_verification
        self.verified_rx = Prescription.objects.create(
            patient=self.patient,
            prescribed_by='Dr. Khan',
            date=self.today,
            medication='Paracetamol',
            dosage='500mg',
            frequency='BID',
            route='PO',
            verification_status=Prescription.VerificationStatus.VERIFIED,
        )
        self.pending_rx = Prescription.objects.create(
            patient=self.patient,
            prescribed_by='Dr. Khan',
            date=self.today,
            medication='Amoxicillin',
            dosage='250mg',
            frequency='TID',
            route='PO',
            verification_status=Prescription.VerificationStatus.PENDING_VERIFICATION,
        )

    def _start_visit(self, lat=33.712350, lng=73.045680, accuracy=12.0, location_denied=False, denial_reason='', booking_id=None, patient_id=None):
        return self.client.post('/api/staff-portal/visit/start/', {
            'patient_id': patient_id or self.patient.id,
            'booking_id': booking_id or self.booking.id,
            'roster_assignment_id': self.assignment.id,
            'lat': lat,
            'lng': lng,
            'accuracy': accuracy,
            'location_denied': location_denied,
            'denial_reason': denial_reason,
        }, format='json')

    def test_01_scheduled_duty_appears_in_my_roster(self):
        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        duty = res.data['roster_summary']['today_duty']
        self.assertIsNotNone(duty)
        self.assertEqual(duty['patients'][0]['id'], self.patient.id)

    def test_02_start_visit_inside_radius_verifies_checkin(self):
        self.client.force_authenticate(user=self.nurse_user)
        res = self._start_visit()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['visit']['checkin_verified'])
        self.assertFalse(res.data['visit']['checkin_outside_area'])
        self.assertEqual(res.data['location_status'], 'verified')
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.IN_PROGRESS)

    def test_03_to_08_full_visit_e2e_flow_vitals_mar_note_end_and_log(self):
        self.client.force_authenticate(user=self.nurse_user)
        start_res = self._start_visit()
        self.assertEqual(start_res.status_code, status.HTTP_201_CREATED)
        visit_id = start_res.data['visit']['id']

        # 03. Record vitals twice (normal + abnormal)
        v1 = self.client.post(f'/api/patients/{self.patient.id}/vitals/', {
            'blood_pressure_systolic': 120,
            'blood_pressure_diastolic': 80,
            'heart_rate': 74,
            'temperature': '36.8',
            'spo2': 98,
        }, format='json')
        self.assertEqual(v1.status_code, status.HTTP_201_CREATED)
        self.assertFalse(v1.data['recorded_outside_visit'])

        v2 = self.client.post(f'/api/patients/{self.patient.id}/vitals/', {
            'blood_pressure_systolic': 195,
            'blood_pressure_diastolic': 115,
            'heart_rate': 132,
            'temperature': '39.4',
            'spo2': 88,
        }, format='json')
        self.assertEqual(v2.status_code, status.HTTP_201_CREATED)

        # 04. Give MAR medication (verified rx)
        mar_res = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': self.verified_rx.id,
            'day_number': self.today.weekday(),
            'slot_time': '08:00',
            'status': 'given',
        }, format='json')
        self.assertEqual(mar_res.status_code, status.HTTP_201_CREATED)

        # 05. Add nurse note
        note_res = self.client.post(f'/api/patients/{self.patient.id}/nurse-notes/', {
            'note': 'Patient resting comfortably after morning meds.',
            'shift': 'morning',
        }, format='json')
        self.assertEqual(note_res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(note_res.data['recorded_outside_visit'])

        # 06. Vitals history returns both with visit_highlighted=True
        hist_res = self.client.get(f'/api/patients/{self.patient.id}/vitals/')
        self.assertEqual(hist_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(hist_res.data), 2)
        self.assertTrue(all(item['visit_highlighted'] for item in hist_res.data))

        # 07. Nurse ends visit -> summary counts correct
        end_res = self.client.post('/api/staff-portal/visit/end/', {
            'visit_id': visit_id,
            'lat': 33.712350,
            'lng': 73.045680,
            'visit_summary': 'Routine morning care completed.',
        }, format='json')
        self.assertEqual(end_res.status_code, status.HTTP_200_OK)
        self.assertEqual(end_res.data['summary']['vitals'], 2)
        self.assertEqual(end_res.data['summary']['medications'], 1)
        self.assertEqual(end_res.data['summary']['notes'], 1)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.COMPLETED)

        # 08. Admin visit log shows the visit with coords
        self.client.force_authenticate(user=self.admin_user)
        log_res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(log_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(log_res.data['visits']), 1)
        self.assertIn('checkin_lat', log_res.data['visits'][0])

    def test_09_location_denied_allowed_and_not_verified(self):
        self.client.force_authenticate(user=self.nurse_user)
        res = self._start_visit(lat=None, lng=None, location_denied=True, denial_reason='User denied GPS')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['visit']['checkin_location_denied'])
        self.assertFalse(res.data['visit']['checkin_verified'])
        self.assertEqual(res.data['location_status'], 'denied')

    def test_10_outside_radius_flagged_and_allowed(self):
        self.client.force_authenticate(user=self.nurse_user)
        # ~5 km away
        res = self._start_visit(lat=33.750000, lng=73.090000)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['visit']['checkin_outside_area'])
        self.assertFalse(res.data['visit']['checkin_verified'])
        self.assertEqual(res.data['location_status'], 'outside_area')

    def test_11_double_checkin_rejected(self):
        self.client.force_authenticate(user=self.nurse_user)
        r1 = self._start_visit()
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        r2 = self._start_visit()
        self.assertEqual(r2.status_code, status.HTTP_409_CONFLICT)

    def test_12_double_checkout_rejected(self):
        self.client.force_authenticate(user=self.nurse_user)
        r1 = self._start_visit()
        visit_id = r1.data['visit']['id']
        e1 = self.client.post('/api/staff-portal/visit/end/', {'visit_id': visit_id}, format='json')
        self.assertEqual(e1.status_code, status.HTTP_200_OK)
        e2 = self.client.post('/api/staff-portal/visit/end/', {'visit_id': visit_id}, format='json')
        self.assertEqual(e2.status_code, status.HTTP_409_CONFLICT)

    def test_13_unassigned_nurse_checkin_forbidden(self):
        self.client.force_authenticate(user=self.other_nurse_user)
        res = self._start_visit()
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_14_trainee_nurse_checkin_forbidden(self):
        self.client.force_authenticate(user=self.trainee_user)
        res = self._start_visit()
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_15_admin_checkin_forbidden(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self._start_visit()
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_16_role_checks_visit_log_and_coordinate_visibility(self):
        """
        Tests central get_user_role integration:
        - Real super_admin (superuser flag, no StaffMember) and admin StaffMember both see raw coordinates
        - care_manager and doctor see only flags
        - branch_manager, nurse, trainee, accountant, crm_executive, patient_family get 403 on the visit log
        """
        self.client.force_authenticate(user=self.nurse_user)
        self._start_visit()

        # 1. Real super_admin sees raw coordinates
        self.client.force_authenticate(user=self.super_admin_user)
        res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('checkin_lat', res.data['visits'][0])
        self.assertIsNotNone(res.data['visits'][0]['checkin_lat'])

        # 2. Admin StaffMember sees raw coordinates
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('checkin_lat', res.data['visits'][0])
        self.assertIsNotNone(res.data['visits'][0]['checkin_lat'])

        # 3. Care Manager sees only flags (no raw coordinates)
        self.client.force_authenticate(user=self.cm_user)
        res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('checkin_lat', res.data['visits'][0])
        self.assertNotIn('checkin_lng', res.data['visits'][0])
        self.assertTrue(res.data['visits'][0]['checkin_verified'])

        # 4. Doctor sees only flags (no raw coordinates)
        self.client.force_authenticate(user=self.doctor_user)
        res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('checkin_lat', res.data['visits'][0])
        self.assertNotIn('checkin_lng', res.data['visits'][0])
        self.assertTrue(res.data['visits'][0]['checkin_verified'])

        # 5. Forbidden roles: branch_manager, nurse, trainee, accountant, crm_executive, patient_family
        forbidden_users = [
            self.bm_user,
            self.nurse_user,
            self.trainee_user,
            self.acc_user,
            self.crm_user,
            self.family_user,
        ]
        for u in forbidden_users:
            self.client.force_authenticate(user=u)
            res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Failed for {u.username}")

    def test_17_nurse_can_read_only_own_active_visit(self):
        # Nurse Fatima starts visit
        self.client.force_authenticate(user=self.nurse_user)
        self._start_visit()

        # Fatima sees her active visit
        res1 = self.client.get('/api/staff-portal/visit/active/')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res1.data['active_visit'])
        self.assertEqual(res1.data['active_visit']['nurse_id'], self.nurse.id)

        # Other nurse Zainab queries active visit -> receives None (cannot see Fatima's active visit)
        self.client.force_authenticate(user=self.other_nurse_user)
        res2 = self.client.get('/api/staff-portal/visit/active/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertIsNone(res2.data['active_visit'])

    def test_18_missing_patient_coordinates_allowed_and_distinctly_marked(self):
        """
        When patient and booking have no saved coordinates:
        - Visit is allowed (201 Created)
        - Marked 'location not verified: no patient coordinates'
        - checkin_verified is False and checkin_outside_area is False
        """
        p_no_coords = Patient.objects.create(
            first_name='Unmapped', last_name='Patient',
            mr_number='MR-NOCOORDS-1',
            phone='+923000000000',
            address='Rural area with no GPS pin',
            latitude=None, longitude=None,
            date_of_birth=datetime.date(1970, 1, 1),
        )
        b_no_coords = Booking.objects.create(
            patient=p_no_coords,
            assigned_staff=self.nurse,
            scheduled_time=self.now,
            shift_end_time=self.now + datetime.timedelta(hours=8),
            status=BookingStatus.ASSIGNED,
            latitude=None, longitude=None,
        )
        self.assignment.patients.add(p_no_coords)

        self.client.force_authenticate(user=self.nurse_user)
        res = self._start_visit(patient_id=p_no_coords.id, booking_id=b_no_coords.id, lat=33.712, lng=73.045)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data['visit']['checkin_verified'])
        self.assertFalse(res.data['visit']['checkin_outside_area'])
        self.assertFalse(res.data['visit']['checkin_location_denied'])
        self.assertEqual(res.data['location_status'], 'location not verified: no patient coordinates')
        self.assertEqual(res.data['visit']['checkin_denial_reason'], 'location not verified: no patient coordinates')

    def test_19_poor_accuracy_coordinates_marked_low_accuracy_not_outside_area(self):
        """
        When nurse GPS accuracy is poor (e.g. 450m > VISIT_GEOFENCE_METERS 300m):
        - Marked 'low accuracy' (not 'outside area')
        - checkin_low_accuracy is True
        - checkin_outside_area is False
        - checkin_verified is False
        """
        self.client.force_authenticate(user=self.nurse_user)
        # accuracy 450m > 300m
        res = self._start_visit(lat=33.715000, lng=73.048000, accuracy=450.0)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data['visit']['checkin_verified'])
        self.assertFalse(res.data['visit']['checkin_outside_area'])
        self.assertTrue(res.data['visit']['checkin_low_accuracy'])
        self.assertEqual(res.data['location_status'], 'low accuracy')

    def test_20_deterministic_booking_selection_multi_booking(self):
        """
        When multiple bookings exist for the same patient on the same day in duty window,
        Start Visit selects the booking closest to now deterministically.
        """
        # Delete default setUp booking so we have exactly b1 and b2
        self.booking.delete()
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(12, 0)), self.tz)

        # Booking 1 at 09:00 (3 hours before 12:00)
        b1 = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse,
            scheduled_time=timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(9, 0)), self.tz),
            shift_end_time=timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(11, 0)), self.tz),
            status=BookingStatus.ASSIGNED,
        )
        # Booking 2 at 13:00 (1 hour after 12:00 -> closer to now!)
        b2 = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse,
            scheduled_time=timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(13, 0)), self.tz),
            shift_end_time=timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(15, 0)), self.tz),
            status=BookingStatus.ASSIGNED,
        )

        # Nurse starts visit without specifying booking_id (at fixed_now = 12:00 PKT)
        from unittest.mock import patch
        self.client.force_authenticate(user=self.nurse_user)
        with patch('staff_portal.visit_views.timezone.now', return_value=fixed_now):
            res = self.client.post('/api/staff-portal/visit/start/', {
                'patient_id': self.patient.id,
                'lat': 33.712350,
                'lng': 73.045680,
            }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Closest to now is chosen (b2)
        self.assertEqual(res.data['visit']['booking_id'], b2.id)
        b2.refresh_from_db()
        self.assertEqual(b2.status, BookingStatus.IN_PROGRESS)
        b1.refresh_from_db()
        self.assertEqual(b1.status, BookingStatus.ASSIGNED)

    def test_21_deterministic_booking_selection_buddy_case(self):
        """
        Nurse is not assigned_staff, but buddy / buddy_staff on booking.
        Start Visit finds and selects this booking deterministically.
        """
        # Create duty assignment where Fatima is buddy_staff
        other_staff = StaffMember.objects.create(
            first_name='Lead', last_name='Nurse', role=StaffRole.NURSE, employee_id='RN-LEAD-1',
            hire_date=datetime.date(2023, 1, 1),
        )
        buddy_assign = RosterAssignment.objects.create(
            roster_week=self.week,
            staff=other_staff,
            buddy_staff=self.nurse,
            date=self.today,
            shift_name='Morning Shift',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0),
            is_published=True,
        )
        p_buddy = Patient.objects.create(
            first_name='Buddy', last_name='Patient', mr_number='MR-BUDDY-1', phone='+923005555555',
            date_of_birth=datetime.date(1980, 5, 20),
        )
        buddy_assign.patients.add(p_buddy)

        b_buddy = Booking.objects.create(
            patient=p_buddy,
            assigned_staff=other_staff,
            buddy=self.nurse,
            scheduled_time=self.now,
            shift_end_time=self.now + datetime.timedelta(hours=8),
            status=BookingStatus.ASSIGNED,
        )

        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.post('/api/staff-portal/visit/start/', {
            'patient_id': p_buddy.id,
            'lat': 33.712350,
            'lng': 73.045680,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['visit']['booking_id'], b_buddy.id)
        b_buddy.refresh_from_db()
        self.assertEqual(b_buddy.status, BookingStatus.IN_PROGRESS)

    def test_22_refuse_when_no_booking_in_duty_window(self):
        """
        Nurse has a booking on another day or outside published duty window:
        Start visit is refused with clear error message.
        """
        p_other = Patient.objects.create(
            first_name='Future', last_name='Patient', mr_number='MR-FUTURE-1', phone='+923004443322',
            date_of_birth=datetime.date(1990, 8, 15),
        )
        # Booking next week
        Booking.objects.create(
            patient=p_other,
            assigned_staff=self.nurse,
            scheduled_time=self.now + datetime.timedelta(days=7),
            shift_end_time=self.now + datetime.timedelta(days=7, hours=8),
            status=BookingStatus.ASSIGNED,
        )
        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.post('/api/staff-portal/visit/start/', {
            'patient_id': p_other.id,
            'lat': 33.712350,
            'lng': 73.045680,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No matching booking found in your published duty window', res.data['error'])

    def test_23_unified_checkin_mobile_to_web_and_no_double_checkin(self):
        """
        Check-in started from mobile tracking (/api/tracking/check-in/):
        1. Transitions booking status to IN_PROGRESS via shared function.
        2. Automatically creates NurseVisit so it shows in web active visit banner and visit log.
        3. Web Start Visit (/api/staff-portal/visit/start/) rejects double check-in with 409 Conflict.
        """
        self.client.force_authenticate(user=self.nurse_user)
        # Mobile check-in
        mob_res = self.client.post('/api/tracking/check-in/', {
            'booking_id': self.booking.id,
            'lat': 33.712350,
            'lng': 73.045680,
            'method': 'manual',
        }, format='json')
        self.assertEqual(mob_res.status_code, status.HTTP_201_CREATED)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.IN_PROGRESS)

        # Web active visit banner sees it
        web_active = self.client.get('/api/staff-portal/visit/active/')
        self.assertEqual(web_active.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(web_active.data['active_visit'])
        self.assertEqual(web_active.data['active_visit']['booking_id'], self.booking.id)

        # Web visit log sees it
        self.client.force_authenticate(user=self.admin_user)
        log_res = self.client.get(f'/api/staff-portal/visit/log/?patient_id={self.patient.id}')
        self.assertEqual(log_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(log_res.data['visits']), 1)

        # Web check-in rejects double check-in
        self.client.force_authenticate(user=self.nurse_user)
        web_checkin = self.client.post('/api/staff-portal/visit/start/', {
            'patient_id': self.patient.id,
            'booking_id': self.booking.id,
            'lat': 33.712350,
            'lng': 73.045680,
        }, format='json')
        self.assertEqual(web_checkin.status_code, status.HTTP_409_CONFLICT)

    def test_24_unified_checkin_web_to_mobile_and_no_double_checkin(self):
        """
        Check-in started from web portal (/api/staff-portal/visit/start/):
        1. Transitions booking status to IN_PROGRESS via shared function.
        2. Creates GeofenceEvent.
        3. Mobile CheckInView returns "Already checked in.", refusing double check-in.
        """
        self.client.force_authenticate(user=self.nurse_user)
        web_res = self._start_visit()
        self.assertEqual(web_res.status_code, status.HTTP_201_CREATED)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.IN_PROGRESS)

        # Mobile check-in rejects second check-in
        mob_res = self.client.post('/api/tracking/check-in/', {
            'booking_id': self.booking.id,
            'lat': 33.712350,
            'lng': 73.045680,
        }, format='json')
        self.assertEqual(mob_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mob_res.data['detail'], 'Already checked in.')

    def test_25_unified_checkout_web_and_mobile_cross_ended(self):
        """
        Web check-in + Mobile check-out ends visit, updates booking status to COMPLETED,
        and sets counts on NurseVisit.
        """
        self.client.force_authenticate(user=self.nurse_user)
        self._start_visit()
        # Add a vital
        self.client.post(f'/api/patients/{self.patient.id}/vitals/', {
            'blood_pressure_systolic': 120, 'blood_pressure_diastolic': 80
        }, format='json')

        # Mobile checks out
        mob_out = self.client.post('/api/tracking/check-out/', {
            'booking_id': self.booking.id,
            'lat': 33.712350,
            'lng': 73.045680,
        }, format='json')
        self.assertEqual(mob_out.status_code, status.HTTP_201_CREATED)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, BookingStatus.COMPLETED)

        # Web NurseVisit is marked ended with vitals count = 1
        nv = NurseVisit.objects.get(booking=self.booking)
        self.assertTrue(nv.is_ended)
        self.assertEqual(nv.vitals_count, 1)

        # Web active banner now shows None
        web_active = self.client.get('/api/staff-portal/visit/active/')
        self.assertIsNone(web_active.data['active_visit'])

    def test_26_vitals_without_active_visit_flagged_but_accepted(self):
        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.post(f'/api/patients/{self.patient.id}/vitals/', {
            'blood_pressure_systolic': 125,
            'blood_pressure_diastolic': 82,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['recorded_outside_visit'])
        self.assertFalse(res.data['visit_highlighted'])

    def test_27_unverified_prescription_blocked_inside_visit(self):
        self.client.force_authenticate(user=self.nurse_user)
        self._start_visit()
        res = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': self.pending_rx.id,
            'day_number': self.today.weekday(),
            'slot_time': '08:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'pending_verification')
