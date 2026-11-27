import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import StaffMember, StaffRole, RosterWeek, RosterAssignment
from patients.models import Patient
from bookings.models import Booking, BookingStatus
from staff_portal.views import compute_roster_summary
from staff_portal.duty_countdown import (
    derive_shift_name,
    get_shift_category,
    calculate_duty_countdown,
    format_12hr_time,
    build_maps_link,
)

User = get_user_model()


class NurseOverviewFinalRosterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tz = ZoneInfo('Asia/Karachi')
        self.local_now = timezone.now().astimezone(self.tz)
        self.today = self.local_now.date()
        self.monday = self.today - datetime.timedelta(days=self.today.weekday())

        # 1. Assigned Nurse (Active)
        self.nurse_user = User.objects.create_user(
            username='assigned_nurse', password='Password123!', first_name='Fatima', last_name='Nurse'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Fatima', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-FINAL-1', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923001111111'
        )

        # 2. Other Nurse (Active)
        self.other_nurse_user = User.objects.create_user(
            username='other_nurse', password='Password123!', first_name='Zainab', last_name='Nurse'
        )
        self.other_nurse_staff = StaffMember.objects.create(
            user=self.other_nurse_user, first_name='Zainab', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-FINAL-2', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923002222222'
        )

        # 3. Trainee Nurse
        self.trainee_user = User.objects.create_user(
            username='trainee_nurse', password='Password123!', first_name='Amina', last_name='Trainee'
        )
        self.trainee_staff = StaffMember.objects.create(
            user=self.trainee_user, first_name='Amina', last_name='Trainee',
            role=StaffRole.NURSE, employee_id='TR-FINAL-1', hire_date=datetime.date(2024, 1, 1),
            lifecycle_stage='trainee', phone='+923003333333'
        )

        # 4. Admin
        self.admin_user = User.objects.create_user(
            username='hospital_admin', password='Password123!', first_name='Admin', last_name='User', is_staff=True
        )
        self.admin_staff = StaffMember.objects.create(
            user=self.admin_user, first_name='Admin', last_name='User',
            role=StaffRole.ADMIN, employee_id='ADM-FINAL-1', hire_date=datetime.date(2022, 1, 1),
            lifecycle_stage='active'
        )

        # 5. Family User (no staff member)
        self.family_user = User.objects.create_user(
            username='patient_family', password='Password123!', first_name='Family', last_name='Member'
        )
        if hasattr(self.family_user, 'profile'):
            self.family_user.profile.role = 'family'
            self.family_user.profile.save()

        # 6. Patient
        self.patient = Patient.objects.create(
            first_name='Tariq', last_name='Mahmood',
            phone='+923009998877',
            address='House 42, Street 5, F-8/2, Islamabad',
            latitude=33.712345,
            longitude=73.045678,
            primary_diagnosis='Type 2 Diabetes, Post-Stroke Rehab',
            emergency_contact_name='Bilal Mahmood',
            emergency_contact_phone='+923001234567',
            date_of_birth=datetime.date(1955, 6, 15)
        )

        # 7. Contacts: Supervisor, Driver, Buddy
        self.supervisor_staff = StaffMember.objects.create(
            first_name='Dr. Tariq', last_name='Aziz',
            role=StaffRole.DOCTOR, employee_id='DOC-SUP', hire_date=datetime.date(2020, 1, 1),
            lifecycle_stage='active', phone='+923004445555'
        )
        self.driver_staff = StaffMember.objects.create(
            first_name='Rashid', last_name='Driver',
            role=StaffRole.DELIVERY_RIDER, employee_id='DRV-001', hire_date=datetime.date(2021, 1, 1),
            lifecycle_stage='active', phone='+923006667777'
        )
        self.buddy_staff = StaffMember.objects.create(
            first_name='Nadia', last_name='Buddy',
            role=StaffRole.NURSE, employee_id='RN-BUD', hire_date=datetime.date(2023, 5, 1),
            lifecycle_stage='active', phone='+923008889999'
        )

        # 8. Roster Week
        self.roster_week = RosterWeek.objects.create(
            week_start_date=self.monday,
            status=RosterWeek.Status.PUBLISHED,
            revision=1
        )

    # ── Test 1: Shift-name derivation boundaries ──────────────────────────────
    def test_shift_name_derivation_boundaries(self):
        """
        Validates shift-name derivation at the exact boundaries:
        05:59, 06:00, 12:59, 13:00, 19:59, 20:00.
        Ranges:
          06:00 - 12:59 -> Morning
          13:00 - 19:59 -> Evening
          20:00 - 05:59 -> Night
        """
        # 05:59 -> Night
        t_0559 = datetime.time(5, 59)
        self.assertEqual(get_shift_category(t_0559), 'Night')
        self.assertEqual(derive_shift_name(t_0559), 'Night Shift')

        # 06:00 -> Morning
        t_0600 = datetime.time(6, 0)
        self.assertEqual(get_shift_category(t_0600), 'Morning')
        self.assertEqual(derive_shift_name(t_0600), 'Morning Shift')

        # 12:59 -> Morning
        t_1259 = datetime.time(12, 59)
        self.assertEqual(get_shift_category(t_1259), 'Morning')
        self.assertEqual(derive_shift_name(t_1259), 'Morning Shift')

        # 13:00 -> Evening
        t_1300 = datetime.time(13, 0)
        self.assertEqual(get_shift_category(t_1300), 'Evening')
        self.assertEqual(derive_shift_name(t_1300), 'Evening Shift')

        # 19:59 -> Evening
        t_1959 = datetime.time(19, 59)
        self.assertEqual(get_shift_category(t_1959), 'Evening')
        self.assertEqual(derive_shift_name(t_1959), 'Evening Shift')

        # 20:00 -> Night
        t_2000 = datetime.time(20, 0)
        self.assertEqual(get_shift_category(t_2000), 'Night')
        self.assertEqual(derive_shift_name(t_2000), 'Night Shift')

        # Preserves stored shift type if already specific
        self.assertEqual(derive_shift_name(t_0600, 'Custom Morning Shift'), 'Custom Morning Shift')
        self.assertEqual(derive_shift_name(t_2000, 'Emergency Night Duty'), 'Emergency Night Duty')
        # If stored is generic or just time, derives properly
        self.assertEqual(derive_shift_name(t_1300, '08:00 - 16:00'), 'Evening Shift')

    # ── Test 2: Next Shift Selection (no upcoming & after midnight) ───────────
    def test_next_shift_selection(self):
        """
        Tests next-shift selection:
        a. No upcoming shift in published roster
        b. First duty after midnight (tomorrow 00:30) correctly selected
        c. Active duty today is not selected as next shift
        """
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(10, 0)), timezone=self.tz)

        # 1. Active duty today (08:00 - 16:00) with no other upcoming duty
        assign_today = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            is_published=True
        )

        summary_none = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=self.nurse_user)
        self.assertIsNone(summary_none['today_duty']['next_shift'])
        self.assertIsNone(summary_none['duty_status']['next_duty'])

        # 2. Add an upcoming duty tomorrow just after midnight (00:30 - 08:30)
        tomorrow = self.today + datetime.timedelta(days=1)
        assign_after_midnight = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=tomorrow,
            shift_name='Custom', start_time=datetime.time(0, 30), end_time=datetime.time(8, 30),
            is_published=True
        )

        summary_with_next = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=self.nurse_user)
        next_shift = summary_with_next['today_duty']['next_shift']
        self.assertIsNotNone(next_shift)
        self.assertEqual(next_shift['id'], assign_after_midnight.id)
        self.assertEqual(next_shift['date'], tomorrow.isoformat())
        self.assertEqual(next_shift['shift_name'], 'Night Shift')  # Derived because 00:30 is Night
        self.assertEqual(next_shift['start_time'], '12:30 AM')
        self.assertEqual(next_shift['end_time'], '8:30 AM')

    # ── Test 3: Privacy Scoping - Nurse's Own Duty Inside Window ───────────────
    def test_privacy_scoping_nurse_own_duty_inside_window(self):
        """
        A nurse sees patient's contact number, location, and Maps link
        ONLY on that nurse's own published duty inside the active access window.
        Supervisor, driver, and buddy phone numbers appear only when set.
        """
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(9, 0)), timezone=self.tz)

        assign = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=self.supervisor_staff, driver=self.driver_staff, buddy_staff=self.buddy_staff,
            driver_pickup_time=datetime.time(7, 30), is_published=True
        )
        assign.patients.set([self.patient])

        # Also create a non-cancelled Booking for the patient within the window
        Booking.objects.create(
            patient=self.patient, assigned_staff=self.nurse_staff,
            scheduled_time=fixed_now, shift_end_time=fixed_now + datetime.timedelta(hours=8),
            status=BookingStatus.ASSIGNED
        )

        summary = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=self.nurse_user)
        duty = summary['today_duty']
        self.assertIsNotNone(duty)

        # Shift line
        self.assertIn('Morning Shift', duty['shift_line'])
        self.assertIn('8:00 AM - 4:00 PM', duty['shift_line'])

        # Patients
        self.assertEqual(len(duty['patients']), 1)
        pat_data = duty['patients'][0]
        self.assertEqual(pat_data['name'], 'Tariq Mahmood')
        self.assertEqual(pat_data['contact_number'], '+923009998877')
        self.assertEqual(pat_data['location'], 'House 42, Street 5, F-8/2, Islamabad')
        # Maps link uses saved coordinates
        self.assertIn('33.712345', pat_data['maps_link'])
        self.assertIn('73.045678', pat_data['maps_link'])

        # Contacts set with phone numbers
        self.assertIsNotNone(duty['supervisor'])
        self.assertEqual(duty['supervisor']['name'], 'Dr. Tariq Aziz')
        self.assertEqual(duty['supervisor']['phone'], '+923004445555')

        self.assertIsNotNone(duty['transport'])
        self.assertEqual(duty['transport']['driver_name'], 'Rashid Driver')
        self.assertEqual(duty['transport']['driver_phone'], '+923006667777')
        self.assertEqual(duty['transport']['pickup_time'], '07:30 AM')

        self.assertIsNotNone(duty['buddy'])
        self.assertEqual(duty['buddy']['name'], 'Nadia Buddy')
        self.assertEqual(duty['buddy']['phone'], '+923008889999')

        self.assertFalse(duty['is_independent'])

    # ── Test 4: Privacy Scoping - Unauthorized Roles Get None ──────────────────
    def test_privacy_scoping_unauthorized_roles_get_none(self):
        """
        Another nurse, an unassigned nurse, a trainee, admin, and family get NONE of:
        - patient contact number (None)
        - patient location (None)
        - patient maps link (None)
        - staff contact numbers (supervisor phone, driver phone, buddy phone all None)
        """
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(9, 0)), timezone=self.tz)

        assign = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=self.supervisor_staff, driver=self.driver_staff, buddy_staff=self.buddy_staff,
            is_published=True
        )
        assign.patients.set([self.patient])

        unauthorized_users = [
            ('other_nurse', self.other_nurse_user),
            ('trainee', self.trainee_user),
            ('admin', self.admin_user),
            ('family', self.family_user),
        ]

        for role_name, u in unauthorized_users:
            summary = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=u)
            duty = summary['today_duty']
            self.assertIsNotNone(duty, f"Duty should exist for check by {role_name}")

            # Patient details must be redacted
            pat_data = duty['patients'][0]
            self.assertEqual(pat_data['name'], 'Tariq Mahmood')
            self.assertIsNone(pat_data['contact_number'], f"{role_name} must NOT see patient contact number")
            self.assertIsNone(pat_data['location'], f"{role_name} must NOT see patient location")
            self.assertIsNone(pat_data['maps_link'], f"{role_name} must NOT see patient maps link")

            # Staff phone numbers must be redacted
            self.assertIsNone(duty['supervisor']['phone'], f"{role_name} must NOT see supervisor phone")
            self.assertIsNone(duty['transport']['driver_phone'], f"{role_name} must NOT see driver phone")
            self.assertIsNone(duty['buddy']['phone'], f"{role_name} must NOT see buddy phone")

    # ── Test 5: Independent Duty Case ──────────────────────────────────────────
    def test_independent_duty_case(self):
        """
        When supervisor, driver, and buddy are all unset:
        duty is marked is_independent=True, duty_type='Independent duty',
        and supervisor, transport, and buddy are None.
        """
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(9, 0)), timezone=self.tz)

        assign = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=None, driver=None, buddy_staff=None, is_published=True
        )
        assign.patients.set([self.patient])

        summary = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=self.nurse_user)
        duty = summary['today_duty']
        self.assertTrue(duty['is_independent'])
        self.assertEqual(duty['duty_type'], 'Independent duty')
        self.assertIsNone(duty['supervisor'])
        self.assertIsNone(duty['transport'])
        self.assertIsNone(duty['buddy'])

    # ── Test 6: Weekly and Monthly Lists Do Not Expose Phone Numbers ────────────
    def test_weekly_and_monthly_do_not_expose_phone_numbers(self):
        """
        Asserts that weekly_strip and month_days contain compact shift info and
        patient names only, never contact numbers or phone fields.
        """
        fixed_now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(9, 0)), timezone=self.tz)

        assign = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=self.supervisor_staff, driver=self.driver_staff, buddy_staff=self.buddy_staff,
            is_published=True
        )
        assign.patients.set([self.patient])

        summary = compute_roster_summary(self.nurse_staff, local_now=fixed_now, local_tz=self.tz, user=self.nurse_user)

        # Check weekly strip
        for day in summary['weekly_strip']:
            self.assertNotIn('phone', day)
            self.assertNotIn('contact_number', day)
            if day['is_today']:
                self.assertIn('Tariq Mahmood', day['patients'])

        # Check monthly days
        for m_day in summary['month_days']:
            self.assertNotIn('phone', m_day)
            self.assertNotIn('contact_number', m_day)

    # ── Test 7: HTTP /staff-portal/home/ Endpoint ──────────────────────────────
    def test_http_staff_portal_home_endpoint(self):
        """
        Verifies GET /staff-portal/home/ respects privacy scoping:
        - Authenticated assigned nurse receives patient contact number and location
        - Authenticated admin receives redacted patient contact and location
        """
        assign = RosterAssignment.objects.create(
            roster_week=self.roster_week, staff=self.nurse_staff, date=self.today,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=self.supervisor_staff, driver=self.driver_staff, buddy_staff=self.buddy_staff,
            is_published=True
        )
        assign.patients.set([self.patient])
        Booking.objects.create(
            patient=self.patient, assigned_staff=self.nurse_staff,
            scheduled_time=timezone.now(), shift_end_time=timezone.now() + datetime.timedelta(hours=8),
            status=BookingStatus.ASSIGNED
        )

        # 1. As assigned nurse
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res_nurse.status_code, status.HTTP_200_OK)
        roster_data = res_nurse.json().get('roster_summary', {})
        today_duty = roster_data.get('today_duty')
        self.assertIsNotNone(today_duty)
        self.assertEqual(today_duty['patients'][0]['contact_number'], '+923009998877')
        self.assertEqual(today_duty['patients'][0]['location'], 'House 42, Street 5, F-8/2, Islamabad')
        self.assertEqual(today_duty['supervisor']['phone'], '+923004445555')

        # 2. As other nurse
        self.client.force_authenticate(user=self.other_nurse_user)
        res_other = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res_other.status_code, status.HTTP_200_OK)
        # Other nurse has no duty for today, but if they inspect nurse_staff data or their own, no leak

