import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from bookings.models import Booking, BookingStatus, ServiceType
from accounts.models import AuditLog
from patients.models import (
    Patient,
    ShiftHandoverNote,
    VitalSign,
    NurseNote,
    Prescription,
    MARAdministration,
)
from staff_portal.models import FamilyConcern
from staff.models import StaffMember

User = get_user_model()


class NurseOverviewRedesignTests(APITestCase):
    def setUp(self):
        # 1. Admin
        self.admin_user = User.objects.create_superuser(
            username='admin_nurse_qa', password='Password123!', email='admin_nqa@example.com'
        )

        # 2. Care Manager
        self.cm_user = User.objects.create_user(
            username='cm_user', password='Password123!', email='cm@example.com'
        )
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Manager', role='care_manager',
            employee_id='CM-001', phone='+923001110001', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 3. Doctor
        self.doc_user = User.objects.create_user(
            username='doc_nurse_qa', password='Password123!', email='doc_nqa@example.com'
        )
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user, first_name='Doctor', last_name='Usman', role='doctor',
            employee_id='DOC-099', phone='+923001110002', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 4. Nurse (Assigned)
        self.nurse_user = User.objects.create_user(
            username='nurse_assigned', password='Password123!', email='nurse_assigned@example.com'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Nurse', last_name='Fatima', role='nurse',
            employee_id='NUR-001', phone='+923001110003', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # 5. Nurse (Unassigned)
        self.nurse_unassigned_user = User.objects.create_user(
            username='nurse_unassigned', password='Password123!', email='nurse_un@example.com'
        )
        self.nurse_unassigned_staff = StaffMember.objects.create(
            user=self.nurse_unassigned_user, first_name='Nurse', last_name='Zainab', role='nurse',
            employee_id='NUR-002', phone='+923001110004', hire_date=datetime.date(2024, 1, 1),
            platform_allowed='both'
        )

        # Patient 1 (Assigned to nurse_staff)
        self.patient = Patient.objects.create(
            mr_number='MR-NUR-001',
            patient_code='PT-NUR-001',
            first_name='Ahmed',
            last_name='Khan',
            date_of_birth=datetime.date(1975, 5, 20),
            gender='M',
            phone='+923009990001',
            address='House 10, F-7/2, Islamabad',
            primary_diagnosis='Type 2 Diabetes Mellitus with Neuropathy',
            assigned_care_manager=self.cm_staff,
        )

        # Patient 2 (Unassigned patient)
        self.unassigned_patient = Patient.objects.create(
            mr_number='MR-NUR-002',
            patient_code='PT-NUR-002',
            first_name='Tariq',
            last_name='Mahmood',
            date_of_birth=datetime.date(1960, 3, 10),
            gender='M',
            phone='+923009990002',
            address='House 42, G-10/4, Islamabad',
            primary_diagnosis='Post-stroke Hemiparesis',
        )

        # Booking assigning Patient 1 to nurse_staff
        now = timezone.now()
        self.booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse_staff,
            service_type=ServiceType.NURSING,
            scheduled_time=now,
            status=BookingStatus.IN_PROGRESS,
            payment_status='paid',
        )

        # Booking assigning Patient 1 to doc_staff (treating doctor)
        self.doc_booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now,
            status=BookingStatus.COMPLETED,
            payment_status='paid',
        )

    # ── Test 1: Allergy Display Rules & Safety ────────────────────────────────────
    def test_allergy_display_rules_never_default_to_nkda(self):
        """
        Patient allergy status defaults to 'not_recorded'.
        API must NEVER return NKDA unless explicitly recorded as 'nkda'.
        """
        self.assertEqual(self.patient.allergy_status, 'not_recorded')
        self.assertEqual(self.patient.allergies, '')

        self.client.force_authenticate(user=self.nurse_user)
        res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        nurse_pts = res.data.get('nurse_patients', [])
        p_entry = next((p for p in nurse_pts if p['id'] == self.patient.id), None)
        self.assertIsNotNone(p_entry)
        self.assertEqual(p_entry['allergy_status'], 'not_recorded')
        self.assertEqual(p_entry['allergy_status_display'], 'Allergies not recorded')
        self.assertNotEqual(p_entry['allergy_status'], 'nkda')
        self.assertNotEqual(p_entry['allergies'], 'NKDA')

        # Check PatientFileView (/api/patients/{id}/patient-file/)
        pf_res = self.client.get(f'/api/patients/{self.patient.id}/patient-file/')
        self.assertEqual(pf_res.status_code, status.HTTP_200_OK)
        pt_data = pf_res.data.get('patient', {})
        self.assertEqual(pt_data.get('allergy_status'), 'not_recorded')
        self.assertEqual(pt_data.get('allergies'), '')
        self.assertNotEqual(pt_data.get('allergies'), 'NKDA')

        # Check PatientViewSet detail (/api/patients/{id}/)
        detail_res = self.client.get(f'/api/patients/{self.patient.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data.get('allergy_status'), 'not_recorded')
        self.assertEqual(detail_res.data.get('allergies'), '')
        self.assertNotEqual(detail_res.data.get('allergies'), 'NKDA')

    # ── Test 2: Allergy Write RBAC & Audit ─────────────────────────────────────────
    def test_allergy_write_rbac_and_audit(self):
        """
        Only history-care-plan write path (doctor, care_manager, admin) may update allergy_status.
        Nurse gets 403 Forbidden.
        Audit log must NOT contain allergen text.
        """
        # Nurse attempt -> 403 Forbidden
        self.client.force_authenticate(user=self.nurse_user)
        nurse_res = self.client.post(
            f'/api/patients/{self.patient.id}/history-care-plan/',
            {'section': 'allergies', 'allergy_status': 'has_allergies', 'allergies': 'Penicillin, NSAIDs'},
            format='json'
        )
        self.assertEqual(nurse_res.status_code, status.HTTP_403_FORBIDDEN)

        # Doctor update -> 200 OK
        self.client.force_authenticate(user=self.doc_user)
        initial_log_count = AuditLog.objects.count()
        doc_res = self.client.post(
            f'/api/patients/{self.patient.id}/history-care-plan/',
            {'section': 'allergies', 'allergy_status': 'has_allergies', 'allergies': 'Penicillin, NSAIDs'},
            format='json'
        )
        self.assertEqual(doc_res.status_code, status.HTTP_200_OK)

        self.patient.refresh_from_db()
        self.assertEqual(self.patient.allergy_status, 'has_allergies')
        self.assertEqual(self.patient.allergies, 'Penicillin, NSAIDs')

        # Verify audit log exists and excludes confidential allergen text
        new_logs = AuditLog.objects.order_by('-id')[:2]
        allergy_log = next((l for l in new_logs if 'Allergy' in l.action or 'allergies' in l.details.lower()), None)
        self.assertIsNotNone(allergy_log)
        self.assertNotIn('Penicillin', allergy_log.details)
        self.assertNotIn('NSAIDs', allergy_log.details)

    # ── Test 3: Shift Handover Write, RBAC, Edit Window & Record Integrity ─────────
    def test_handover_write_rbac_edit_window_and_delete_protection(self):
        """
        ShiftHandoverNote:
        - Nurse authoring only for assigned patients (unassigned gets 403).
        - 15-minute edit window enforced (CLINICAL_RECORD_EDIT_WINDOW_MINUTES).
        - Physical deletion blocked with 405 Method Not Allowed.
        - Model/ORM deletion raises ValidationError.
        - Mark entered in error requires reason; note text excluded from audit log.
        """
        # 1. Unassigned nurse attempts authoring -> 403 Forbidden
        self.client.force_authenticate(user=self.nurse_unassigned_user)
        un_res = self.client.post('/api/staff-portal/handovers/', {
            'patient_id': self.patient.id,
            'text': 'Bedside vitals stable, IV cannula in right forearm.',
            'shift_label': 'Morning Shift',
        }, format='json')
        self.assertEqual(un_res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Assigned nurse authors handover -> 201 Created
        self.client.force_authenticate(user=self.nurse_user)
        create_res = self.client.post('/api/staff-portal/handovers/', {
            'patient_id': self.patient.id,
            'text': 'Bedside vitals stable, IV cannula in right forearm.',
            'shift_label': 'Morning Shift',
            'shift_date': timezone.now().date().isoformat(),
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        handover_id = create_res.data['id']

        # 3. Edit within 15-minute window -> 200 OK
        edit_res = self.client.patch(f'/api/staff-portal/handovers/{handover_id}/', {
            'text': 'Updated: Bedside vitals stable, IV cannula flushed with normal saline.',
            'shift_label': 'Morning Shift',
        }, format='json')
        self.assertEqual(edit_res.status_code, status.HTTP_200_OK)
        self.assertIn('flushed with normal saline', edit_res.data['text'])

        # 4. Attempt edit after 15 minutes window expired -> 400 Bad Request
        note = ShiftHandoverNote.objects.get(id=handover_id)
        note.created_at = timezone.now() - datetime.timedelta(minutes=20)
        note.save(update_fields=['created_at'])

        expired_edit_res = self.client.patch(f'/api/staff-portal/handovers/{handover_id}/', {
            'text': 'Late edit attempt after 20 minutes',
        }, format='json')
        self.assertEqual(expired_edit_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', expired_edit_res.data['detail'].lower())

        # 5. Physical delete via API -> 405 Method Not Allowed
        del_res = self.client.delete(f'/api/staff-portal/handovers/{handover_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # 6. Physical delete on ORM model instance -> raises ValidationError
        with self.assertRaises(ValidationError):
            note.delete()

        # Reset created_at so author nurse is within 15-minute window for marking in error
        note.created_at = timezone.now()
        note.save(update_fields=['created_at'])

        # 7. Mark as entered in error requires reason
        err_no_reason = self.client.post(
            f'/api/staff-portal/handovers/{handover_id}/mark-entered-in-error/',
            {'reason': ''},
            format='json'
        )
        self.assertEqual(err_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        err_res = self.client.post(
            f'/api/staff-portal/handovers/{handover_id}/mark-entered-in-error/',
            {'reason': 'Documented on incorrect shift date.'},
            format='json'
        )
        self.assertEqual(err_res.status_code, status.HTTP_200_OK)
        note.refresh_from_db()
        self.assertTrue(note.is_entered_in_error)
        self.assertEqual(note.entered_in_error_reason, 'Documented on incorrect shift date.')

    # ── Test 4: Vitals Overdue Boundary ────────────────────────────────────────────
    def test_vitals_overdue_boundary(self):
        """
        Boundary test for NURSE_VITALS_DUE_HOURS (default 4 hours).
        Vitals recorded 3h59m ago is NOT overdue.
        Vitals recorded 4h01m ago IS overdue.
        """
        now = timezone.now()
        due_hours = getattr(settings, 'NURSE_VITALS_DUE_HOURS', 4)

        # Case A: Vitals recorded 3h 59m ago -> Not overdue
        vitals_recent = VitalSign.objects.create(
            patient=self.patient,
            recorded_by=self.nurse_staff,
            recorded_at=now - datetime.timedelta(hours=due_hours, minutes=-1),
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
        )

        self.client.force_authenticate(user=self.nurse_user)
        res_recent = self.client.get('/api/staff-portal/nurse-work-list/?type=vitals_overdue')
        self.assertEqual(res_recent.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_recent.data.get('results', [])), 0)

        # Case B: Vitals recorded 4h 01m ago -> Overdue
        vitals_recent.recorded_at = now - datetime.timedelta(hours=due_hours, minutes=1)
        vitals_recent.save(update_fields=['recorded_at'])

        res_overdue = self.client.get('/api/staff-portal/nurse-work-list/?type=vitals_overdue')
        self.assertEqual(res_overdue.status_code, status.HTTP_200_OK)
        results = res_overdue.data.get('results', [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['patient_id'], self.patient.id)

    # ── Test 5: Alerts From Real Sources Only ───────────────────────────────────────
    def test_alerts_real_sources_only_and_exclude_errors(self):
        """
        Alerts must only come from real clinical sources:
        - High vitals excursion
        - Shift notes pending > 2h
        - Erroneous vitals (is_entered_in_error=True) must be excluded from alerts.
        """
        now = timezone.now()

        # Create critical vitals excursion
        vital_critical = VitalSign.objects.create(
            patient=self.patient,
            recorded_by=self.nurse_staff,
            recorded_at=now,
            blood_pressure_systolic=190,  # critical high
            blood_pressure_diastolic=115,
            heart_rate=125,
        )

        self.client.force_authenticate(user=self.nurse_user)
        home_res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(home_res.status_code, status.HTTP_200_OK)
        alerts = home_res.data.get('alerts', [])
        high_bp_alert = next((a for a in alerts if 'critical' in a.get('title', '').lower() or 'bp' in a.get('title', '').lower()), None)
        self.assertIsNotNone(high_bp_alert)

        # Mark this vital as entered in error -> alert must disappear
        vital_critical.is_entered_in_error = True
        vital_critical.entered_in_error_reason = 'Faulty digital BP cuff'
        vital_critical.save(update_fields=['is_entered_in_error', 'entered_in_error_reason'])

        home_res_after = self.client.get('/api/staff-portal/home/')
        alerts_after = home_res_after.data.get('alerts', [])
        high_bp_alert_after = next((a for a in alerts_after if 'critical' in a.get('title', '').lower() or 'bp' in a.get('title', '').lower()), None)
        self.assertIsNone(high_bp_alert_after)

    # ── Test 6: Today's Work Counts Match List Lengths Exactly ─────────────────────
    def test_today_work_counts_match_list_lengths(self):
        """
        Every number in today_work summary must exactly equal the list length returned
        by /api/staff-portal/nurse-work-list/?type=...
        """
        self.client.force_authenticate(user=self.nurse_user)
        home_res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(home_res.status_code, status.HTTP_200_OK)
        tw = home_res.data.get('today_work', {})

        # 1. patients_today
        res1 = self.client.get('/api/staff-portal/nurse-work-list/?type=patients_today')
        self.assertEqual(tw['patients_today'], len(res1.data.get('results', [])))

        # 2. vitals_overdue
        res2 = self.client.get('/api/staff-portal/nurse-work-list/?type=vitals_overdue')
        self.assertEqual(tw['vitals_overdue'], len(res2.data.get('results', [])))

        # 3. active_medications
        res3 = self.client.get('/api/staff-portal/nurse-work-list/?type=active_medications')
        self.assertEqual(tw['active_medications'], len(res3.data.get('results', [])))

        # 4. pending_verification
        res4 = self.client.get('/api/staff-portal/nurse-work-list/?type=pending_verification')
        self.assertEqual(tw['pending_verification'], len(res4.data.get('results', [])))

        # 5. pending_notes
        res5 = self.client.get('/api/staff-portal/nurse-work-list/?type=pending_notes')
        self.assertEqual(tw['pending_notes'], len(res5.data.get('results', [])))

        # 6. alerts_count
        res6 = self.client.get('/api/staff-portal/nurse-work-list/?type=alerts')
        self.assertEqual(tw['alerts_count'], len(res6.data.get('results', [])))

    # ── Test 7: Scoping & Unclassified Tiers ───────────────────────────────────────
    def test_nurse_home_scoping_and_unclassified_tiers(self):
        """
        Nurse only sees assigned patients.
        Patients without recent vitals are 'unclassified', never 'stable' or normal.
        """
        self.client.force_authenticate(user=self.nurse_user)
        home_res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(home_res.status_code, status.HTTP_200_OK)

        nurse_pts = home_res.data.get('nurse_patients', [])
        pids = [p['id'] for p in nurse_pts]
        self.assertIn(self.patient.id, pids)
        self.assertNotIn(self.unassigned_patient.id, pids)

        # Patient 1 has no vitals recorded yet -> must be 'unclassified', NOT 'stable'
        p1_entry = next(p for p in nurse_pts if p['id'] == self.patient.id)
        self.assertEqual(p1_entry['latest_tier'], 'unclassified')
        self.assertNotEqual(p1_entry['latest_tier'], 'stable')
