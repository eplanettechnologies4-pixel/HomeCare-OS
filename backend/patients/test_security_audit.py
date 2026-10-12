import datetime
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import UserProfile, UserRole
from patients.models import Patient, VitalSign, Prescription, NurseNote, MARAdministration
from staff.models import StaffMember
from bookings.models import Booking, BookingStatus
from tracking.models import LiveVisit


class FamilySecurityAuditTests(APITestCase):
    """
    Security audit & regression tests ensuring that family and patient_family roles
    receive 403 Forbidden on detail endpoints, or empty / strictly scoped lists,
    for anything not linked to their own patient.
    """

    def setUp(self):
        # 1. Staff Member (for recording vitals / notes / bookings)
        self.staff_user = User.objects.create_user(username='staff_test', password='password123')
        self.staff_member = StaffMember.objects.create(
            user=self.staff_user,
            first_name='Nurse',
            last_name='Staff',
            employee_id='EMP-TEST-001',
            hire_date=datetime.date(2020, 1, 1),
            role='nurse',
            status='available'
        )

        # 2. Family User 1 (linked to Patient 1)
        self.family_user = User.objects.create_user(username='family', password='test1234')
        UserProfile.objects.create(user=self.family_user, role=UserRole.PATIENT_FAMILY)

        # 3. Family User 2 (linked to Patient 2)
        self.other_family_user = User.objects.create_user(username='other_family', password='test1234')
        UserProfile.objects.create(user=self.other_family_user, role=UserRole.PATIENT_FAMILY)

        # 4. Patient 1 (Belongs to self.family_user)
        self.patient_1 = Patient.objects.create(
            mr_number='MR-0001',
            first_name='Alice',
            last_name='Patient',
            date_of_birth=datetime.date(1950, 1, 1),
            gender='F',
            portal_user=self.family_user,
        )

        # 5. Patient 2 (Belongs to self.other_family_user, NOT self.family_user)
        self.patient_2 = Patient.objects.create(
            mr_number='MR-0002',
            first_name='Bob',
            last_name='Victim',
            date_of_birth=datetime.date(1960, 5, 5),
            gender='M',
            portal_user=self.other_family_user,
        )

        # Vitals
        self.vital_1 = VitalSign.objects.create(
            patient=self.patient_1,
            recorded_by=self.staff_member,
            recorded_at=timezone.now(),
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
        )
        self.vital_2 = VitalSign.objects.create(
            patient=self.patient_2,
            recorded_by=self.staff_member,
            recorded_at=timezone.now(),
            blood_pressure_systolic=140,
            blood_pressure_diastolic=90,
            heart_rate=88,
        )

        # Prescriptions
        self.rx_1 = Prescription.objects.create(
            patient=self.patient_1,
            prescribed_by='Dr. Test',
            date=datetime.date.today(),
            medication='Metformin',
            dosage='500mg',
            frequency='Twice daily',
        )
        self.rx_2 = Prescription.objects.create(
            patient=self.patient_2,
            prescribed_by='Dr. Test',
            date=datetime.date.today(),
            medication='Amlodipine',
            dosage='10mg',
            frequency='Once daily',
        )

        # Nurse Notes
        self.note_1 = NurseNote.objects.create(
            patient=self.patient_1,
            recorded_by=self.staff_member,
            note='Patient 1 stable.',
        )
        self.note_2 = NurseNote.objects.create(
            patient=self.patient_2,
            recorded_by=self.staff_member,
            note='Patient 2 sensitive clinical note.',
        )

        # Bookings (scheduled today)
        now = timezone.now()
        self.booking_1 = Booking.objects.create(
            patient=self.patient_1,
            assigned_staff=self.staff_member,
            scheduled_time=now,
            status=BookingStatus.IN_PROGRESS,
            service_type='nursing_care',
        )
        self.booking_2 = Booking.objects.create(
            patient=self.patient_2,
            assigned_staff=self.staff_member,
            scheduled_time=now,
            status=BookingStatus.IN_PROGRESS,
            service_type='nursing_care',
        )

        # Live Visits
        self.live_visit_1 = LiveVisit.objects.create(
            booking=self.booking_1,
            staff=self.staff_member,
            current_latitude=24.86,
            current_longitude=67.01,
        )
        self.live_visit_2 = LiveVisit.objects.create(
            booking=self.booking_2,
            staff=self.staff_member,
            current_latitude=24.87,
            current_longitude=67.02,
        )

        # Authenticate as family_user
        login_resp = self.client.post('/api/auth/login/', {'username': 'family', 'password': 'test1234'}, format='json')
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        token = login_resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_patient_detail_forbidden_for_other_patient(self):
        # Access own patient: 200 OK
        res_own = self.client.get(f'/api/patients/{self.patient_1.id}/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(res_own.data['id'], self.patient_1.id)

        # Access other patient: 403 Forbidden
        res_other = self.client.get(f'/api/patients/{self.patient_2.id}/')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_vitals_forbidden_for_other_patient(self):
        # Own patient vitals action: 200 OK
        res_own = self.client.get(f'/api/patients/{self.patient_1.id}/vitals/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_own.data), 1)

        # Other patient vitals action: 403 Forbidden
        res_other = self.client.get(f'/api/patients/{self.patient_2.id}/vitals/')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_mar_due_today_forbidden_for_other_patient(self):
        # Own patient MAR: 200 OK
        res_own = self.client.get(f'/api/patients/{self.patient_1.id}/mar/due-today/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)

        # Other patient MAR: 403 Forbidden
        res_other = self.client.get(f'/api/patients/{self.patient_2.id}/mar/due-today/')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_prescriptions_forbidden_for_other_patient(self):
        # Own patient prescriptions action: 200 OK
        res_own = self.client.get(f'/api/patients/{self.patient_1.id}/prescriptions/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_own.data), 1)

        # Other patient prescriptions action: 403 Forbidden
        res_other = self.client.get(f'/api/patients/{self.patient_2.id}/prescriptions/')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

        # Detail endpoint /api/patients/{id}/prescriptions/{rx_id}/: 403 Forbidden
        res_detail = self.client.get(f'/api/patients/{self.patient_2.id}/prescriptions/{self.rx_2.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_403_FORBIDDEN)

    def test_nurse_notes_forbidden_for_other_patient(self):
        # Own patient notes action: 200 OK
        res_own = self.client.get(f'/api/patients/{self.patient_1.id}/nurse_notes/')
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_own.data), 1)

        # Other patient notes action: 403 Forbidden
        res_other = self.client.get(f'/api/patients/{self.patient_2.id}/nurse_notes/')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_live_visits_scoped_to_own_patient(self):
        # List: only own patient's live visit returned
        res_list = self.client.get('/api/tracking/live-visits/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        results = res_list.data.get('results', res_list.data) if isinstance(res_list.data, dict) else res_list.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.live_visit_1.id)

        # Detail for other patient's live visit: 403 Forbidden
        res_detail = self.client.get(f'/api/tracking/live-visits/{self.live_visit_2.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_403_FORBIDDEN)

    def test_bookings_today_scoped_to_own_patient(self):
        # List today: only own patient's booking returned
        res_today = self.client.get('/api/bookings/today/')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_today.data), 1)
        self.assertEqual(res_today.data[0]['id'], self.booking_1.id)

        # Detail for other patient's booking: 403 Forbidden
        res_detail = self.client.get(f'/api/bookings/{self.booking_2.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_403_FORBIDDEN)

    def test_patients_list_scoped_to_own_patient(self):
        # Patient list: returns strictly Patient 1
        res = self.client.get('/api/patients/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.patient_1.id)

    def test_unlinked_family_user_receives_empty_lists(self):
        # Family user with no linked patient
        unlinked_user = User.objects.create_user(username='unlinked_family', password='password123')
        UserProfile.objects.create(user=unlinked_user, role=UserRole.PATIENT_FAMILY)

        login_resp = self.client.post('/api/auth/login/', {'username': 'unlinked_family', 'password': 'password123'}, format='json')
        token = login_resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # /api/patients/ -> empty
        res_patients = self.client.get('/api/patients/')
        self.assertEqual(res_patients.status_code, status.HTTP_200_OK)
        results_patients = res_patients.data.get('results', res_patients.data) if isinstance(res_patients.data, dict) else res_patients.data
        self.assertEqual(len(results_patients), 0)

        # /api/tracking/live-visits/ -> empty
        res_tracking = self.client.get('/api/tracking/live-visits/')
        self.assertEqual(res_tracking.status_code, status.HTTP_200_OK)
        results_tracking = res_tracking.data.get('results', res_tracking.data) if isinstance(res_tracking.data, dict) else res_tracking.data
        self.assertEqual(len(results_tracking), 0)

        # /api/bookings/today/ -> empty
        res_bookings = self.client.get('/api/bookings/today/')
        self.assertEqual(res_bookings.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_bookings.data), 0)
