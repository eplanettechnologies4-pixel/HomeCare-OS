import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import (
    StaffMember, StaffRole, RosterWeek, RosterAssignment
)
from patients.models import (
    Patient, Prescription, MARAdministration, NurseNote
)
from bookings.models import Booking, BookingStatus
from patients.mar_helpers import get_frequency_slots
from staff_portal.duty_countdown import calculate_duty_countdown

User = get_user_model()


class NurseDutyAndPaperSheetsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.karachi_tz = ZoneInfo('Asia/Karachi')
        local_now = timezone.now().astimezone(self.karachi_tz)
        self.today = local_now.date()
        self.monday = self.today - datetime.timedelta(days=self.today.weekday())

        # 1. Super Admin
        self.super_user = User.objects.create_superuser(
            username='duty_super', password='Password123!', first_name='Super', last_name='Admin'
        )
        self.super_staff = StaffMember.objects.create(
            user=self.super_user, first_name='Super', last_name='Admin',
            role=StaffRole.ADMIN, employee_id='SA-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 2. Admin
        self.admin_user = User.objects.create_user(
            username='duty_admin', password='Password123!', first_name='Hospital', last_name='Admin', is_staff=True
        )
        self.admin_staff = StaffMember.objects.create(
            user=self.admin_user, first_name='Hospital', last_name='Admin',
            role=StaffRole.ADMIN, employee_id='ADM-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 3. Care Manager
        self.cm_user = User.objects.create_user(
            username='duty_cm', password='Password123!', first_name='Care', last_name='Manager'
        )
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Manager',
            role=StaffRole.CARE_MANAGER, employee_id='CM-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 4. Nurse Active
        self.nurse_user = User.objects.create_user(
            username='duty_nurse', password='Password123!', first_name='Active', last_name='Nurse'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Active', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='NUR-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923001112233'
        )

        # 5. Nurse 2 (Other Nurse)
        self.nurse2_user = User.objects.create_user(
            username='duty_nurse2', password='Password123!', first_name='Other', last_name='Nurse'
        )
        self.nurse2_staff = StaffMember.objects.create(
            user=self.nurse2_user, first_name='Other', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='NUR-DUTY2', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active'
        )

        # 6. Trainee Nurse
        self.trainee_user = User.objects.create_user(
            username='duty_trainee', password='Password123!', first_name='Trainee', last_name='Nurse'
        )
        self.trainee_staff = StaffMember.objects.create(
            user=self.trainee_user, first_name='Trainee', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='TRN-DUTY', hire_date=datetime.date(2026, 1, 1),
            lifecycle_stage='trainee'
        )

        # 7. Doctor
        self.doctor_user = User.objects.create_user(
            username='duty_doc', password='Password123!', first_name='Treating', last_name='Doctor'
        )
        self.doctor_staff = StaffMember.objects.create(
            user=self.doctor_user, first_name='Treating', last_name='Doctor',
            role=StaffRole.DOCTOR, employee_id='DOC-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923004445566'
        )

        # 8. Driver (delivery_rider)
        self.driver_user = User.objects.create_user(
            username='duty_driver', password='Password123!', first_name='Transport', last_name='Rider'
        )
        self.driver_staff = StaffMember.objects.create(
            user=self.driver_user, first_name='Transport', last_name='Rider',
            role=StaffRole.DELIVERY_RIDER, employee_id='DRV-DUTY', hire_date=datetime.date(2023, 1, 1),
            lifecycle_stage='active', phone='+923007778899'
        )

        # 9. Patient
        self.patient = Patient.objects.create(
            first_name='Tariq', last_name='Mehmood', mr_number='MR-DUTY-01',
            date_of_birth=datetime.date(1965, 5, 10), gender='male',
            address='Street 10, F-8/3, Islamabad',
            primary_diagnosis='Type 2 Diabetes Mellitus with Neuropathy',
            allergy_status='has_allergies', allergies='Penicillin, Sulfa'
        )

    # ── Test 1: Slot generator row counts & fallbacks ────────────────────────
    def test_01_slot_generator(self):
        expected_counts = {
            'OD': 1,
            'BD': 2,
            'TDS': 3,
            'QID': 4,
            'PRN': 4,
            'SOS': 4,
            'STAT': 1,
            '4 Hourly': 6,
            'HS': 1,
        }
        for freq, expected in expected_counts.items():
            res = get_frequency_slots(freq)
            self.assertEqual(res['row_count'], expected, f"Row count mismatch for {freq}")
            self.assertEqual(len(res['slot_times']), expected, f"Slot times count mismatch for {freq}")
            self.assertFalse(res['is_unmapped'])

        # Explicit times override defaults
        custom = get_frequency_slots('BD', explicit_times=['07:00', '15:00', '23:00'])
        self.assertEqual(custom['row_count'], 3)
        self.assertEqual(custom['slot_times'], ['07:00', '15:00', '23:00'])

        # Unmapped frequency fallback
        unmapped = get_frequency_slots('Twice every alternate full moon')
        self.assertEqual(unmapped['row_count'], 1)
        self.assertTrue(unmapped['is_unmapped'])
        self.assertEqual(unmapped['slot_times'], ['Slot 1'])

    # ── Test 2: Duty Countdown Helper ────────────────────────────────────────
    def test_02_countdown_helper(self):
        tz = self.karachi_tz
        # Standard day shift: 08:00 - 16:00
        start_day = timezone.make_aware(datetime.datetime(2026, 11, 26, 8, 0), timezone=tz)
        end_day = timezone.make_aware(datetime.datetime(2026, 11, 26, 16, 0), timezone=tz)

        # Before shift (06:30)
        curr_before = timezone.make_aware(datetime.datetime(2026, 11, 26, 6, 30), timezone=tz)
        res_before = calculate_duty_countdown(start_day, end_day, curr_before)
        self.assertEqual(res_before['status'], 'before_shift')
        self.assertEqual(res_before['hours_remaining'], 1)
        self.assertEqual(res_before['minutes_remaining'], 30)
        self.assertIn("Starts in 1 hrs 30 mins", res_before['text'])

        # During shift (12:00)
        curr_during = timezone.make_aware(datetime.datetime(2026, 11, 26, 12, 0), timezone=tz)
        res_during = calculate_duty_countdown(start_day, end_day, curr_during)
        self.assertEqual(res_during['status'], 'on_duty')
        self.assertEqual(res_during['hours_remaining'], 4)
        self.assertEqual(res_during['minutes_remaining'], 0)
        self.assertIn("On duty, ends in 4 hrs 0 mins", res_during['text'])

        # After shift (17:00)
        curr_after = timezone.make_aware(datetime.datetime(2026, 11, 26, 17, 0), timezone=tz)
        res_after = calculate_duty_countdown(start_day, end_day, curr_after)
        self.assertEqual(res_after['status'], 'off_duty')
        self.assertEqual(res_after['text'], "Off duty")

        # Overnight shift: 20:00 to 08:00 next day
        start_on = timezone.make_aware(datetime.datetime(2026, 11, 26, 20, 0), timezone=tz)
        end_on = timezone.make_aware(datetime.datetime(2026, 11, 27, 8, 0), timezone=tz)

        # Checked at 23:00 (on duty, 9 hrs remaining until 08:00)
        at_23 = timezone.make_aware(datetime.datetime(2026, 11, 26, 23, 0), timezone=tz)
        res_23 = calculate_duty_countdown(start_on, end_on, at_23)
        self.assertEqual(res_23['status'], 'on_duty')
        self.assertEqual(res_23['hours_remaining'], 9)
        self.assertEqual(res_23['minutes_remaining'], 0)
        self.assertIn("On duty, ends in 9 hrs 0 mins", res_23['text'])

        # Checked at 03:00 next day (on duty, 5 hrs remaining until 08:00)
        at_03 = timezone.make_aware(datetime.datetime(2026, 11, 27, 3, 0), timezone=tz)
        res_03 = calculate_duty_countdown(start_on, end_on, at_03)
        self.assertEqual(res_03['status'], 'on_duty')
        self.assertEqual(res_03['hours_remaining'], 5)
        self.assertEqual(res_03['minutes_remaining'], 0)
        self.assertIn("On duty, ends in 5 hrs 0 mins", res_03['text'])

        # Checked at 09:00 next day (off duty)
        at_09 = timezone.make_aware(datetime.datetime(2026, 11, 27, 9, 0), timezone=tz)
        res_09 = calculate_duty_countdown(start_on, end_on, at_09)
        self.assertEqual(res_09['status'], 'off_duty')
        self.assertEqual(res_09['text'], "Off duty")

    # ── Test 3: Schedule Duty Action ─────────────────────────────────────────
    def test_03_schedule_duty_permissions_and_validations(self):
        # 1. Forbidden roles get 403
        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse_staff.id,
            'date': self.today.isoformat(),
            'start_time': '08:00',
            'end_time': '16:00',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Allowed roles: admin can schedule
        self.client.force_authenticate(user=self.admin_user)

        # Trainee nurse rejected
        res = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.trainee_staff.id,
            'date': self.today.isoformat(),
            'start_time': '08:00',
            'end_time': '16:00',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Trainee", res.data['error'])

        # Trainee buddy rejected
        res = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse_staff.id,
            'buddy_staff_id': self.trainee_staff.id,
            'date': self.today.isoformat(),
            'start_time': '08:00',
            'end_time': '16:00',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("buddy", res.data['error'])

        # Overnight shift accepted (20:00 to 08:00) with optional fields
        res = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse_staff.id,
            'patient_ids': [self.patient.id],
            'date': self.today.isoformat(),
            'start_time': '20:00',
            'end_time': '08:00',
            'supervisor_id': self.doctor_staff.id,
            'driver_id': self.driver_staff.id,
            'driver_pickup_time': '19:15',
            'is_published': True,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['is_overnight'])
        self.assertFalse(res.data['is_independent'])
        self.assertEqual(res.data['supervisor']['name'], self.doctor_staff.full_name)
        self.assertEqual(res.data['driver']['name'], self.driver_staff.full_name)
        self.assertEqual(len(res.data['patients']), 1)
        self.assertEqual(res.data['patients'][0]['id'], self.patient.id)

        # Overlap rejected: attempt to schedule same nurse at overlapping time
        res = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse_staff.id,
            'date': self.today.isoformat(),
            'start_time': '22:00',
            'end_time': '06:00',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Overlapping", res.data['error'])

        # Independent duty: schedule on next week date with no supervisor/buddy/driver
        next_week_date = self.today + datetime.timedelta(days=7)
        res_ind = self.client.post('/api/staff/roster/schedule-duty/', {
            'nurse_id': self.nurse_staff.id,
            'date': next_week_date.isoformat(),
            'start_time': '09:00',
            'end_time': '17:00',
            'is_published': True,
        })
        self.assertEqual(res_ind.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_ind.data['is_independent'])
        self.assertEqual(res_ind.data['duty_type'], 'Independent duty')
        self.assertIsNone(res_ind.data['supervisor'])
        self.assertIsNone(res_ind.data['buddy'])
        self.assertIsNone(res_ind.data['driver'])

    # ── Test 4: My Roster API Privacy & Scoping ──────────────────────────────
    def test_04_my_roster_api_privacy(self):
        # 1. Create a published duty for nurse_staff and an unpublished draft duty
        future_date1 = self.today + datetime.timedelta(days=2)
        future_date2 = self.today + datetime.timedelta(days=3)

        # Published assignment
        r_week, _ = RosterWeek.objects.get_or_create(
            week_start_date=self.monday, defaults={'status': RosterWeek.Status.PUBLISHED}
        )
        assign_pub = RosterAssignment.objects.create(
            roster_week=r_week, staff=self.nurse_staff, date=future_date1,
            shift_name='Morning Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            supervisor=self.doctor_staff, is_published=True
        )
        assign_pub.patients.set([self.patient])

        # Unpublished draft assignment (is_published=False)
        assign_draft = RosterAssignment.objects.create(
            roster_week=r_week, staff=self.nurse_staff, date=future_date2,
            shift_name='Secret Draft Shift', start_time=datetime.time(8, 0), end_time=datetime.time(16, 0),
            is_published=False
        )

        # 2. Nurse views their roster
        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.get(f'/api/staff-portal/roster/?date={future_date1.isoformat()}&view=weekly')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Published shift must be present
        duties = res.data.get('duties', [])
        pub_duty = next((d for d in duties if d['assignment_id'] == assign_pub.id), None)
        self.assertIsNotNone(pub_duty)
        self.assertEqual(pub_duty['supervisor']['name'], self.doctor_staff.full_name)
        self.assertEqual(len(pub_duty['patients']), 1)
        self.assertEqual(pub_duty['patients'][0]['name'], self.patient.full_name)

        # Unpublished draft shift must NEVER be returned
        draft_duty = next((d for d in duties if d['assignment_id'] == assign_draft.id), None)
        self.assertIsNone(draft_duty, "Unpublished draft roster assignment was returned to nurse!")

        # 3. Other nurse views roster -> sees 0 of nurse_staff's duties
        self.client.force_authenticate(user=self.nurse2_user)
        res2 = self.client.get(f'/api/staff-portal/roster/?date={future_date1.isoformat()}&view=weekly')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        other_duties = res2.data.get('duties', [])
        self.assertFalse(any(d['assignment_id'] == assign_pub.id for d in other_duties))

        # 4. Trainee nurse gets 0 duties
        self.client.force_authenticate(user=self.trainee_user)
        res_tr = self.client.get(f'/api/staff-portal/roster/?date={future_date1.isoformat()}&view=weekly')
        self.assertEqual(res_tr.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_tr.data.get('duties', [])), 0)

    # ── Test 5: MAR Administration Rules & Permissions ───────────────────────
    def test_05_mar_administration_flow(self):
        # Create a verified prescription and an unverified prescription
        rx_verified = Prescription.objects.create(
            patient=self.patient, medication='Paracetamol', dosage='500mg',
            frequency='TDS', route='PO', date=self.today,
            prescribed_by='Dr. Treating', verification_status=Prescription.VerificationStatus.VERIFIED,
            verified_by=self.doctor_user, verified_at=timezone.now()
        )
        rx_unverified = Prescription.objects.create(
            patient=self.patient, medication='Amoxicillin', dosage='250mg',
            frequency='BD', route='PO', date=self.today,
            prescribed_by='Dr. Treating', verification_status=Prescription.VerificationStatus.PENDING_VERIFICATION
        )
        rx_allergic = Prescription.objects.create(
            patient=self.patient, medication='Penicillin V', dosage='500mg',
            frequency='QID', route='PO', date=self.today,
            prescribed_by='Dr. Treating', verification_status=Prescription.VerificationStatus.VERIFIED,
            verified_by=self.doctor_user, verified_at=timezone.now()
        )

        # 1. Doctor cannot administer (read-only)
        self.client.force_authenticate(user=self.doctor_user)
        res_doc = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
        })
        self.assertEqual(res_doc.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin cannot administer (read-only)
        self.client.force_authenticate(user=self.admin_user)
        res_adm = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
        })
        self.assertEqual(res_adm.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Trainee nurse blocked (403)
        self.client.force_authenticate(user=self.trainee_user)
        res_trn = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
        })
        self.assertEqual(res_trn.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Active nurse:
        # Assign nurse to patient via booking so scoping passes
        Booking.objects.create(
            patient=self.patient, assigned_staff=self.nurse_staff,
            scheduled_time=timezone.now(), status=BookingStatus.ASSIGNED
        )
        self.client.force_authenticate(user=self.nurse_user)

        # Unverified prescription blocked
        res_unver = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_unverified.id,
            'day_number': self.today.weekday(),
            'slot_time': '08:00',
        })
        self.assertEqual(res_unver.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_unver.data['error'], 'pending_verification')

        # Allergy conflict blocked without override
        res_allg = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_allergic.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
        })
        self.assertEqual(res_allg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_allg.data['error'], 'allergy_conflict')

        # Verified prescription administered successfully
        res_ok = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
            'status': 'given',
            'dose_given': '500mg',
            'route': 'PO',
        })
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['slot_time'], '06:00')
        self.assertEqual(res_ok.data['administered_by_initials'], 'AN')  # Active Nurse

        # Duplicate same slot blocked
        res_dup = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '06:00',
        })
        self.assertEqual(res_dup.status_code, status.HTTP_409_CONFLICT)

        # Different slot on same day allowed (e.g. 14:00 dose of TDS)
        res_slot2 = self.client.post(f'/api/patients/{self.patient.id}/mar/administer/', {
            'prescription_id': rx_verified.id,
            'day_number': self.today.weekday(),
            'slot_time': '14:00',
            'status': 'given',
        })
        self.assertEqual(res_slot2.status_code, status.HTTP_201_CREATED)

        # GET mar-sheet returns both recorded slots and cells
        res_sheet = self.client.get(f'/api/patients/{self.patient.id}/mar-sheet/')
        self.assertEqual(res_sheet.status_code, status.HTTP_200_OK)
        rx_list = res_sheet.data['prescriptions']
        p_item = next((r for r in rx_list if r['id'] == rx_verified.id), None)
        self.assertIsNotNone(p_item)
        self.assertEqual(p_item['row_count'], 3)

    # ── Test 6: Nurses Notes Sheet (Shift, Event, Entered-in-Error) ───────────
    def test_06_nurses_notes_sheet(self):
        # Booking for scoping
        Booking.objects.create(
            patient=self.patient, assigned_staff=self.nurse_staff,
            scheduled_time=timezone.now(), status=BookingStatus.ASSIGNED
        )

        # 1. Trainee cannot author (403)
        self.client.force_authenticate(user=self.trainee_user)
        res_trn = self.client.post(f'/api/patients/{self.patient.id}/nurse_notes/', {
            'note': 'Attempt by trainee',
            'shift': 'morning',
            'is_event': False,
        })
        self.assertEqual(res_trn.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin cannot author (403)
        self.client.force_authenticate(user=self.admin_user)
        res_adm = self.client.post(f'/api/patients/{self.patient.id}/nurse_notes/', {
            'note': 'Attempt by admin',
            'shift': 'morning',
            'is_event': False,
        })
        self.assertEqual(res_adm.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Active Nurse authors routine shift note
        self.client.force_authenticate(user=self.nurse_user)
        res_ok = self.client.post(f'/api/patients/{self.patient.id}/nurse_notes/', {
            'note': 'Patient resting comfortably. Normal vesicular breathing bilateral.',
            'shift': 'morning',
            'is_event': False,
        })
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        note_id = res_ok.data['id']
        note_obj = NurseNote.objects.get(id=note_id)
        self.assertEqual(note_obj.shift, 'morning')
        self.assertFalse(note_obj.is_event)

        # 4. Active Nurse authors event note
        res_evt = self.client.post(f'/api/patients/{self.patient.id}/nurse_notes/', {
            'note': 'Fall incident: patient stumbled while walking to bathroom. No visible head trauma.',
            'shift': 'night',
            'is_event': True,
        })
        self.assertEqual(res_evt.status_code, status.HTTP_201_CREATED)
        evt_obj = NurseNote.objects.get(id=res_evt.data['id'])
        self.assertEqual(evt_obj.shift, 'night')
        self.assertTrue(evt_obj.is_event)

        # 5. Entered in error works (append-only record integrity)
        res_err = self.client.post(f'/api/patients/{self.patient.id}/nurse-notes/{note_id}/mark-entered-in-error/', {
            'reason': 'Entered on wrong patient chart during shift turnover',
        })
        self.assertEqual(res_err.status_code, status.HTTP_200_OK)
        note_obj.refresh_from_db()
        self.assertTrue(note_obj.is_entered_in_error)
        self.assertEqual(note_obj.entered_in_error_reason, 'Entered on wrong patient chart during shift turnover')
