import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import (
    StaffMember, StaffRole, RosterWeek, RosterAssignment
)
from patients.models import (
    Patient, Prescription, MARAdministration, NurseNote
)
from bookings.models import Booking, BookingStatus
from accounts.models import AuditLog

User = get_user_model()


class StaffDirectoryAndAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.karachi_tz = ZoneInfo('Asia/Karachi')
        local_now = timezone.now().astimezone(self.karachi_tz)
        self.today = local_now.date()
        self.monday = self.today - datetime.timedelta(days=self.today.weekday())

        # 1. Super Admin 1
        self.super_user = User.objects.create_superuser(
            username='super_admin_test', password='Password123!', first_name='Super', last_name='One'
        )
        self.super_staff = StaffMember.objects.create(
            user=self.super_user, first_name='Super', last_name='One',
            role=StaffRole.ADMIN, employee_id='SA-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 2. Super Admin 2 (so last superadmin rule doesn't block when testing SA-01 deactivation by another SA)
        self.super_user_2 = User.objects.create_superuser(
            username='super_admin_test2', password='Password123!', first_name='Super', last_name='Two'
        )
        self.super_staff_2 = StaffMember.objects.create(
            user=self.super_user_2, first_name='Super', last_name='Two',
            role=StaffRole.ADMIN, employee_id='SA-02', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 3. Hospital Admin
        self.admin_user = User.objects.create_user(
            username='admin_test', password='Password123!', first_name='Hospital', last_name='Admin', is_staff=True
        )
        self.admin_staff = StaffMember.objects.create(
            user=self.admin_user, first_name='Hospital', last_name='Admin',
            role=StaffRole.ADMIN, employee_id='ADM-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 4. Care Manager
        self.cm_user = User.objects.create_user(
            username='cm_test', password='Password123!', first_name='Care', last_name='Manager'
        )
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Manager',
            role=StaffRole.CARE_MANAGER, employee_id='CM-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 5. Active Nurse
        self.nurse_user = User.objects.create_user(
            username='nurse_test', password='Password123!', first_name='Staff', last_name='Nurse'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Staff', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='NUR-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 6. Trainee Nurse
        self.trainee_user = User.objects.create_user(
            username='trainee_test', password='Password123!', first_name='Trainee', last_name='Nurse'
        )
        self.trainee_staff = StaffMember.objects.create(
            user=self.trainee_user, first_name='Trainee', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='TRN-01', hire_date=datetime.date(2026, 1, 1),
            lifecycle_stage='trainee'
        )

        # 7. Doctor
        self.doctor_user = User.objects.create_user(
            username='doc_test', password='Password123!', first_name='Ali', last_name='Doctor'
        )
        self.doctor_staff = StaffMember.objects.create(
            user=self.doctor_user, first_name='Ali', last_name='Doctor',
            role=StaffRole.DOCTOR, employee_id='DOC-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 8. Non-Clinical Staff (Accountant)
        self.accountant_user = User.objects.create_user(
            username='acct_test', password='Password123!', first_name='Finance', last_name='User'
        )
        self.accountant_staff = StaffMember.objects.create(
            user=self.accountant_user, first_name='Finance', last_name='User',
            role='accountant', employee_id='ACC-01', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 9. Test Patient
        self.patient = Patient.objects.create(
            first_name='Tariq', last_name='Mahmood', mr_number='MR-DIR-001',
            date_of_birth=datetime.date(1965, 5, 12), gender='male',
            phone='+923001234567', is_active=True
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. DEACTIVATE AND REACTIVATE TESTS
    # ─────────────────────────────────────────────────────────────────────────
    def test_deactivate_requires_reason(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.nurse_staff.id}/deactivate/'
        res = self.client.post(url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'reason_required')

    def test_deactivate_and_reactivate_flow(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.nurse_staff.id}/deactivate/'
        res = self.client.post(url, {'reason': 'Extended leave of absence without pay'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))

        self.nurse_staff.refresh_from_db()
        self.nurse_user.refresh_from_db()
        self.assertFalse(self.nurse_staff.is_active)
        self.assertFalse(self.nurse_user.is_active)

        # Check audit log written
        self.assertTrue(AuditLog.objects.filter(action='staff_deactivated', target_user=self.nurse_user.username).exists())

        # Reactivate
        reactivate_url = f'/api/staff/members/{self.nurse_staff.id}/reactivate/'
        rres = self.client.post(reactivate_url, {}, format='json')
        self.assertEqual(rres.status_code, status.HTTP_200_OK)
        self.assertTrue(rres.data.get('success'))

        self.nurse_staff.refresh_from_db()
        self.nurse_user.refresh_from_db()
        self.assertTrue(self.nurse_staff.is_active)
        self.assertTrue(self.nurse_user.is_active)
        self.assertTrue(AuditLog.objects.filter(action='staff_reactivated', target_user=self.nurse_user.username).exists())

    def test_admin_cannot_deactivate_super_admin(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'/api/staff/members/{self.super_staff.id}/deactivate/'
        res = self.client.post(url, {'reason': 'Attempted unauthorized deactivation'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get('error'), 'permission_denied')

    def test_admin_cannot_deactivate_self(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'/api/staff/members/{self.admin_staff.id}/deactivate/'
        res = self.client.post(url, {'reason': 'Self deactivation attempt'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'cannot_deactivate_self')

    def test_last_super_admin_cannot_be_deactivated(self):
        # Delete second superadmin to leave only one
        self.super_staff_2.delete()
        self.super_user_2.delete()

        # Try to deactivate the only remaining super admin
        self.client.force_authenticate(user=self.admin_user)
        url = f'/api/staff/members/{self.super_staff.id}/deactivate/'
        res = self.client.post(url, {'reason': 'Attempt to remove sole super admin'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'last_super_admin')

    # ─────────────────────────────────────────────────────────────────────────
    # 2. DELETE GUARD (409 CONFLICT)
    # ─────────────────────────────────────────────────────────────────────────
    def test_delete_guard_returns_409_when_records_exist(self):
        # Create a linked booking
        Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse_staff,
            service_type='Nursing Care',
            scheduled_time=timezone.now(),
            shift_end_time=timezone.now() + timezone.timedelta(hours=8),
            status=BookingStatus.ASSIGNED
        )
        self.client.force_authenticate(user=self.super_user)
        res = self.client.delete(f'/api/staff/members/{self.nurse_staff.id}/')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data.get('error'), 'cannot_delete_staff_with_records')

        # Staff member must still exist in DB
        self.assertTrue(StaffMember.objects.filter(id=self.nurse_staff.id).exists())

    def test_delete_guard_allows_deletion_when_zero_records_exist(self):
        # Staff member with zero history
        clean_user = User.objects.create_user(username='clean_staff', password='Password123!')
        clean_staff = StaffMember.objects.create(
            user=clean_user, first_name='Clean', last_name='Staff',
            role=StaffRole.NURSE, employee_id='CLN-99', hire_date=datetime.date(2026, 1, 1)
        )
        self.client.force_authenticate(user=self.super_user)
        res = self.client.delete(f'/api/staff/members/{clean_staff.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StaffMember.objects.filter(id=clean_staff.id).exists())

    # ─────────────────────────────────────────────────────────────────────────
    # 3. ASSIGN PATIENT ROLE-AWARE TESTS
    # ─────────────────────────────────────────────────────────────────────────
    def test_assign_nurse_via_booking(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.nurse_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id,
            'assignment_type': 'primary'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('model'), 'Booking')

        # Verify booking created with nurse assigned
        booking_id = res.data.get('booking_id')
        booking = Booking.objects.get(id=booking_id)
        self.assertEqual(booking.assigned_staff_id, self.nurse_staff.id)
        self.assertEqual(booking.patient_id, self.patient.id)

    def test_assign_doctor_via_treating_booking(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'/api/staff/members/{self.doctor_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('model'), 'Booking')

        booking_id = res.data.get('booking_id')
        booking = Booking.objects.get(id=booking_id)
        self.assertEqual(booking.assigned_staff_id, self.doctor_staff.id)
        self.assertEqual(booking.service_type, 'Doctor Consultation')

    def test_assign_care_manager_via_patient_field(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.cm_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('model'), 'Patient.assigned_care_manager')

        self.patient.refresh_from_db()
        self.assertEqual(self.patient.assigned_care_manager_id, self.cm_staff.id)

    def test_trainee_blocked_from_patient_assignment(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.trainee_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'trainee_blocked')

    def test_non_clinical_role_blocked(self):
        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.accountant_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'non_clinical_role')

    def test_non_admin_cannot_assign_patients(self):
        self.client.force_authenticate(user=self.nurse_user)
        url = f'/api/staff/members/{self.nurse_staff.id}/assign-patient/'
        res = self.client.post(url, {
            'patient_id': self.patient.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unassign_patient(self):
        self.patient.assigned_care_manager = self.cm_staff
        self.patient.save()

        self.client.force_authenticate(user=self.super_user)
        url = f'/api/staff/members/{self.cm_staff.id}/unassign-patient/'
        res = self.client.post(url, {'patient_id': self.patient.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.patient.refresh_from_db()
        self.assertIsNone(self.patient.assigned_care_manager)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. STAFF LIST COLUMNS AND QUERY COUNT (N+1 AVOIDANCE)
    # ─────────────────────────────────────────────────────────────────────────
    def test_staff_list_returns_columns_and_avoids_n_plus_one(self):
        # Create 30 staff members to test query scaling
        for i in range(1, 31):
            u = User.objects.create_user(username=f'bulk_staff_{i}', password='Password123!')
            role = StaffRole.NURSE if i % 2 == 0 else StaffRole.DOCTOR
            stage = 'active' if i % 3 == 0 else ('probation' if i % 3 == 1 else 'trainee')
            StaffMember.objects.create(
                user=u, first_name=f'Bulk{i}', last_name=f'Nurse{i}',
                role=role, employee_id=f'BLK-{i:03d}', hire_date=datetime.date(2025, 1, 1),
                lifecycle_stage=stage
            )

        self.client.force_authenticate(user=self.super_user)
        
        with CaptureQueriesContext(connection) as queries:
            res = self.client.get('/api/staff/members/?page_size=50')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Confirm query count is strictly bounded (<= 10 queries even with 30+ staff members)
        self.assertLessEqual(len(queries), 10, f"Expected <= 10 queries, got {len(queries)}")

        results = res.data.get('results', res.data)
        self.assertGreaterEqual(len(results), 30)

        first = results[0]
        # Assert required columns are present in the response
        self.assertIn('lifecycle_stage', first)
        self.assertIn('live_status', first)
        self.assertIn('live_status_display', first)
        self.assertIn('today_duty', first)
        self.assertIn('assigned_patients_count', first)
        self.assertIn('employee_id', first)
        self.assertIn('phone', first)
