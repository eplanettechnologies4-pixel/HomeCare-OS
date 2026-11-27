import datetime
from io import StringIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from bookings.models import Booking, BookingStatus
from notifications.models import Notification
from patients.models import Patient
from patients.scoping import get_assigned_patient_ids_for_user
from staff.duty_service import schedule_staff_duty
from staff.models import RosterAssignment, StaffMember, StaffRole

User = get_user_model()


class OneDutyFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tz = ZoneInfo('Asia/Karachi')
        self.now = timezone.now()
        self.local_now = self.now.astimezone(self.tz)
        self.today = self.local_now.date()

        self.admin_user = User.objects.create_user(
            username='odf_admin', password='Password123!', first_name='Admin', last_name='User', is_staff=True
        )
        self.admin = StaffMember.objects.create(
            user=self.admin_user, first_name='Admin', last_name='User',
            role=StaffRole.ADMIN, employee_id='ADM-ODF-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active',
        )

        self.cm_user = User.objects.create_user(
            username='odf_cm', password='Password123!', first_name='Care', last_name='Mgr'
        )
        self.cm = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Mgr',
            role=StaffRole.CARE_MANAGER, employee_id='CM-ODF-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active',
        )

        self.nurse_user = User.objects.create_user(
            username='odf_nurse', password='Password123!', first_name='Sana', last_name='Nurse'
        )
        self.nurse = StaffMember.objects.create(
            user=self.nurse_user, first_name='Sana', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-ODF-1', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923001112233',
        )

        self.other_nurse_user = User.objects.create_user(
            username='odf_other_nurse', password='Password123!', first_name='Hina', last_name='Other'
        )
        self.other_nurse = StaffMember.objects.create(
            user=self.other_nurse_user, first_name='Hina', last_name='Other',
            role=StaffRole.NURSE, employee_id='RN-ODF-2', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923004445566',
        )

        self.trainee_user = User.objects.create_user(
            username='odf_trainee', password='Password123!'
        )
        self.trainee = StaffMember.objects.create(
            user=self.trainee_user, first_name='Trainee', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='TR-ODF-1', hire_date=datetime.date(2024, 1, 1),
            lifecycle_stage='trainee',
        )

        self.inactive_nurse = StaffMember.objects.create(
            first_name='Inactive', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='IN-ODF-1', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active', is_active=False,
        )

        self.sup_user = User.objects.create_user(username='odf_sup', password='Password123!')
        self.supervisor = StaffMember.objects.create(
            user=self.sup_user, first_name='Dr. Tariq', last_name='Sup',
            role=StaffRole.DOCTOR, employee_id='SUP-ODF-1', hire_date=datetime.date(2020, 1, 1),
            lifecycle_stage='active', phone='+923007778899',
        )

        self.buddy_user = User.objects.create_user(username='odf_buddy', password='Password123!')
        self.buddy = StaffMember.objects.create(
            user=self.buddy_user, first_name='Nadia', last_name='Buddy',
            role=StaffRole.NURSE, employee_id='BUD-ODF-1', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923006665544',
        )

        self.driver_user = User.objects.create_user(username='odf_driver', password='Password123!')
        self.driver = StaffMember.objects.create(
            user=self.driver_user, first_name='Rashid', last_name='Driver',
            role=StaffRole.DELIVERY_RIDER, employee_id='DRV-ODF-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active', phone='+923009990001',
        )

        self.patient1 = Patient.objects.create(
            first_name='Tariq', last_name='Ali', mr_number='MR-ODF-001',
            date_of_birth=datetime.date(1960, 1, 1), gender='M',
            address='House 1, F-8, Islamabad', primary_diagnosis='Hypertension',
            latitude=33.712345, longitude=73.045678,
        )
        self.patient2 = Patient.objects.create(
            first_name='Amina', last_name='Bibi', mr_number='MR-ODF-002',
            date_of_birth=datetime.date(1965, 5, 10), gender='F',
            address='House 2, G-9, Islamabad', primary_diagnosis='Diabetes',
            latitude=33.700000, longitude=73.040000,
        )

    def test_01_shared_service_creates_duty_booking_link_and_rolls_back_on_failure(self):
        res = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
            supervisor=self.supervisor,
            buddy_staff=self.buddy,
            driver=self.driver,
            driver_pickup_time='07:30',
        )
        ra = res['assignment']
        b = res['bookings'][0]
        self.assertEqual(b.roster_assignment_id, ra.id)
        self.assertEqual(b.assigned_staff_id, self.nurse.id)
        self.assertEqual(b.status, BookingStatus.ASSIGNED)
        self.assertEqual(b.supervisor_id, self.supervisor.id)
        self.assertEqual(b.buddy_staff_id, self.buddy.id)
        self.assertEqual(b.buddy_id, self.buddy.id)
        self.assertEqual(b.driver_id, self.driver.id)
        self.assertIn(self.patient1, ra.patients.all())

        # Rollback on failure mid-transaction
        before_ra = RosterAssignment.objects.count()
        before_b = Booking.objects.count()
        with patch('staff.duty_service.Booking.save', side_effect=RuntimeError('Simulated DB failure')):
            with self.assertRaises(RuntimeError):
                schedule_staff_duty(
                    actor=self.admin_user,
                    staff=self.other_nurse,
                    patients=[self.patient2],
                    date=self.today,
                    start_time='08:00',
                    end_time='16:00',
                )
        self.assertEqual(RosterAssignment.objects.count(), before_ra)
        self.assertEqual(Booking.objects.count(), before_b)

    def test_02_consumes_existing_pending_booking_without_duplicate(self):
        pending = Booking.objects.create(
            patient=self.patient1,
            service_type='nursing',
            status=BookingStatus.PENDING,
            scheduled_time=self.now,
            address='Home',
        )
        res = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
        )
        self.assertEqual(Booking.objects.filter(patient=self.patient1).count(), 1)
        b = res['bookings'][0]
        self.assertEqual(b.id, pending.id)
        self.assertEqual(b.status, BookingStatus.ASSIGNED)
        self.assertEqual(b.assigned_staff_id, self.nurse.id)

    def test_03_adds_patients_to_existing_duty_without_dropping_others(self):
        schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
        )
        res2 = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient2],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
        )
        ra = res2['assignment']
        self.assertEqual(ra.patients.count(), 2)
        self.assertIn(self.patient1, ra.patients.all())
        self.assertIn(self.patient2, ra.patients.all())

    def test_04_overnight_shift_and_repeat_on_weekdays(self):
        next_week_end = self.today + datetime.timedelta(days=10)
        res = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='20:00',
            end_time='08:00',
            repeat_days=[self.today.strftime('%a'), (self.today + datetime.timedelta(days=2)).strftime('%a')],
            repeat_until=next_week_end,
        )
        self.assertTrue(res['is_overnight'])
        self.assertEqual(res['shift_hours'], 12.0)
        self.assertGreaterEqual(len(res['assignments']), 2)
        for b in res['bookings']:
            self.assertGreater(b.shift_end_time, b.scheduled_time)

    def test_05_validation_rejects_trainee_inactive_and_overlapping_nurse(self):
        with self.assertRaises(ValidationError):
            schedule_staff_duty(
                actor=self.admin_user, staff=self.trainee, patients=[self.patient1],
                date=self.today, start_time='08:00', end_time='16:00',
            )
        with self.assertRaises(ValidationError):
            schedule_staff_duty(
                actor=self.admin_user, staff=self.inactive_nurse, patients=[self.patient1],
                date=self.today, start_time='08:00', end_time='16:00',
            )
        # Create a 08:00-16:00 booking on tomorrow, then try overlapping draft shift
        tomorrow = self.today + datetime.timedelta(days=1)
        schedule_staff_duty(
            actor=self.admin_user, staff=self.nurse, patients=[self.patient1],
            date=tomorrow, start_time='08:00', end_time='16:00', is_published=True,
        )
        with self.assertRaises(ValidationError):
            schedule_staff_duty(
                actor=self.admin_user, staff=self.nurse, patients=[self.patient2],
                date=tomorrow, start_time='10:00', end_time='18:00', is_published=False,
            )

    def test_06_permissions_for_roles_on_entry_paths(self):
        self.client.force_authenticate(user=self.nurse_user)
        r1 = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse.id, 'date': self.today.isoformat(),
            'start_time': '08:00', 'end_time': '16:00', 'patient_ids': [self.patient1.id],
        }, format='json')
        self.assertEqual(r1.status_code, status.HTTP_403_FORBIDDEN)

        r2 = self.client.post(f'/api/staff/members/{self.nurse.id}/assign-patient/', {
            'patient_id': self.patient1.id, 'date': self.today.isoformat(),
            'start_time': '08:00', 'end_time': '16:00',
        }, format='json')
        self.assertEqual(r2.status_code, status.HTTP_403_FORBIDDEN)

        # Care manager is allowed on ScheduleDutyView
        self.client.force_authenticate(user=self.cm_user)
        r3 = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse.id, 'date': self.today.isoformat(),
            'start_time': '08:00', 'end_time': '16:00', 'patient_ids': [self.patient1.id],
        }, format='json')
        self.assertEqual(r3.status_code, status.HTTP_201_CREATED)

    def test_07_all_entry_paths_produce_identical_portal_and_visit_result(self):
        """
        Parametrized across the three nurse duty-scheduling entry paths:
        ScheduleDutyView, BookingViewSet.assign_staff, StaffViewSet.assign_patient.
        Each must leave patient visible in My Roster, My Patients, Patient File access, and Start Visit.
        """
        paths = ('schedule_duty', 'booking_assign_staff', 'staff_assign_patient')
        for idx, path_name in enumerate(paths):
            with self.subTest(path=path_name):
                p = Patient.objects.create(
                    first_name=f'Pat{idx}', last_name='Flow', mr_number=f'MR-PATH-{idx}',
                    date_of_birth=datetime.date(1970, 1, 1), gender='M',
                    address='F-8, Islamabad', primary_diagnosis='Care',
                    latitude=33.712345, longitude=73.045678,
                )
                d = self.today
                # Reset any prior duty/visits for nurse on today cleanly inside subtest
                NurseVisit_qs = p.nurse_visits.all()
                self.assertEqual(NurseVisit_qs.count(), 0)

                self.client.force_authenticate(user=self.admin_user)
                if path_name == 'schedule_duty':
                    res = self.client.post('/api/staff/roster/schedule-duty/', {
                        'nurse_id': self.nurse.id, 'date': d.isoformat(),
                        'start_time': '08:00', 'end_time': '20:00', 'patient_ids': [p.id],
                    }, format='json')
                    self.assertEqual(res.status_code, status.HTTP_201_CREATED)
                elif path_name == 'booking_assign_staff':
                    b = Booking.objects.create(
                        patient=p, service_type='nursing', status=BookingStatus.PENDING,
                        scheduled_time=timezone.make_aware(datetime.datetime.combine(d, datetime.time(8, 0)), self.tz),
                        shift_end_time=timezone.make_aware(datetime.datetime.combine(d, datetime.time(20, 0)), self.tz),
                        address='F-8, Islamabad',
                    )
                    res = self.client.post(f'/api/bookings/{b.id}/assign_staff/', {
                        'staff_id': self.nurse.id, 'date': d.isoformat(),
                        'start_time': '08:00', 'end_time': '20:00',
                    }, format='json')
                    self.assertEqual(res.status_code, status.HTTP_200_OK)
                elif path_name == 'staff_assign_patient':
                    res = self.client.post(f'/api/staff/members/{self.nurse.id}/assign-patient/', {
                        'patient_id': p.id, 'date': d.isoformat(),
                        'start_time': '08:00', 'end_time': '20:00',
                    }, format='json')
                    self.assertEqual(res.status_code, status.HTTP_200_OK)

                # Verify My Roster, My Patients, Patient File access, Start Visit
                self.client.force_authenticate(user=self.nurse_user)
                home = self.client.get('/api/staff-portal/home/')
                self.assertEqual(home.status_code, status.HTTP_200_OK)
                roster_pids = [pt['id'] for pt in home.data['roster_summary']['today_duty']['patients']]
                my_pat_pids = [pt['id'] for pt in home.data['nurse_patients']]
                self.assertIn(p.id, roster_pids)
                self.assertIn(p.id, my_pat_pids)
                self.assertIn(p.id, get_assigned_patient_ids_for_user(self.nurse_user))

                visit_res = self.client.post('/api/staff-portal/visit/start/', {
                    'patient_id': p.id, 'lat': 33.712350, 'lng': 73.045680,
                }, format='json')
                self.assertEqual(visit_res.status_code, status.HTTP_201_CREATED)
                # End visit so next subtest can start cleanly
                self.client.post('/api/staff-portal/visit/end/', {
                    'visit_id': visit_res.data['visit']['id'],
                }, format='json')

    def test_08_buddy_staff_only_appears_in_my_patients_and_directory_counts(self):
        schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
            buddy_staff=self.buddy,
        )
        # Remove legacy buddy field to prove buddy_staff alone works everywhere
        Booking.objects.filter(patient=self.patient1).update(buddy=None)

        self.client.force_authenticate(user=self.buddy_user)
        home = self.client.get('/api/staff-portal/home/')
        self.assertEqual(home.status_code, status.HTTP_200_OK)
        self.assertIn(self.patient1.id, [p['id'] for p in home.data['nurse_patients']])

        self.client.force_authenticate(user=self.admin_user)
        staff_list = self.client.get('/api/staff/members/')
        self.assertEqual(staff_list.status_code, status.HTTP_200_OK)
        rows = staff_list.data.get('results', staff_list.data)
        buddy_row = next(r for r in rows if r['id'] == self.buddy.id)
        self.assertGreaterEqual(buddy_row['assigned_patients_count'], 1)

    def test_09_unassign_and_cancel_remove_patient_from_duty_leaving_shift_only(self):
        res = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
        )
        ra = res['assignment']
        b = res['bookings'][0]

        self.client.force_authenticate(user=self.admin_user)
        unres = self.client.post(f'/api/staff/members/{self.nurse.id}/unassign-patient/', {
            'patient_id': self.patient1.id,
        }, format='json')
        self.assertEqual(unres.status_code, status.HTTP_200_OK)
        ra.refresh_from_db()
        self.assertEqual(ra.patients.count(), 0)
        self.assertTrue(RosterAssignment.objects.filter(pk=ra.pk).exists())

        # Re-schedule then cancel booking
        res2 = schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient2],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
        )
        b2 = res2['bookings'][0]
        cres = self.client.post(f'/api/bookings/{b2.id}/cancel/')
        self.assertEqual(cres.status_code, status.HTTP_200_OK)
        ra.refresh_from_db()
        self.assertEqual(ra.patients.count(), 0)

    def test_10_notifications_sent_only_to_duty_members(self):
        Notification.objects.all().delete()
        schedule_staff_duty(
            actor=self.admin_user,
            staff=self.nurse,
            patients=[self.patient1],
            date=self.today,
            start_time='08:00',
            end_time='16:00',
            supervisor=self.supervisor,
            buddy_staff=self.buddy,
            driver=self.driver,
        )
        recipient_ids = set(Notification.objects.values_list('recipient_id', flat=True))
        self.assertEqual(
            recipient_ids,
            {self.nurse_user.id, self.sup_user.id, self.buddy_user.id, self.driver_user.id},
        )
        self.assertNotIn(self.other_nurse_user.id, recipient_ids)

    def test_11_reconcile_command_prints_and_refuses_write_flags(self):
        out = StringIO()
        call_command('reconcile_duty_bookings', stdout=out)
        self.assertIn('DUTY / BOOKING RECONCILIATION REPORT (READ-ONLY)', out.getvalue())

        with self.assertRaises(CommandError):
            call_command('reconcile_duty_bookings', '--fix')
        with self.assertRaises(CommandError):
            call_command('reconcile_duty_bookings', '--write')
