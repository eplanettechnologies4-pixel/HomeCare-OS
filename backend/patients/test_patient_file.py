import io
import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserProfile, UserRole, AuditLog
from staff.models import StaffMember, RosterAssignment, RosterWeek
from bookings.models import Booking, BookingStatus
from lab.models import LabOrder, LabOrderStatus, LabTest
from patients.models import (
    Patient, VitalSign, Prescription, NurseNote, LabResult,
    DoctorNote, PhysioNote, TherapyNote, ClinicalConsent,
    PatientActiveComplaint, ScheduledItem, MARAdministration
)
from homecareOS.clinician_permissions import GUARDIAN_CONTACT_VISIBILITY_CONFIG


class PatientFileTests(APITestCase):
    """
    Comprehensive test suite for the unified Patient File:
    - Access control and object-level scoping for all 11 roles
    - Guardian contact visibility per role (A4 Rule)
    - Emergency reveal with security audit logging
    - Brief history and care plan edit permissions & immutable audit trail
    - Active complaint banner creation, supersession, history and resolve
    - Scheduled items: create, relative due near midnight in Asia/Karachi, role-specific mark done, cancel
    - Psychotherapy notes confidentiality & exclusion from rehab timeline for unauthorized roles
    - Display window filter (6-month default vs All time vs Custom range) & search
    - Query count optimization (no N+1 queries)
    """

    def setUp(self):
        self.karachi_tz = ZoneInfo("Asia/Karachi")
        self.now = timezone.now()

        # ── 1. Create Patient 1 (Assigned) ───────────────────────────────────
        self.patient_assigned = Patient.objects.create(
            mr_number="MR-00101",
            first_name="Ahmed",
            last_name="Khan",
            date_of_birth=datetime.date(1965, 3, 15),
            gender="M",
            phone="0300-9876543",
            address="House 12, Street 4, Sector F-7/2, Islamabad",
            emergency_contact_name="Farida Khan",
            emergency_contact_relation="Spouse",
            emergency_contact_phone="0300-1234567",
            primary_diagnosis="Type 2 Diabetes Mellitus with Peripheral Neuropathy",
            allergies="Penicillin",
            brief_history="Patient diagnosed with T2DM 10 years ago. Well controlled until recent ulcer.",
            care_plan="Daily wound dressing, blood glucose monitoring BID, mobility exercises.",
        )

        # ── 2. Create Patient 2 (Unassigned) ─────────────────────────────────
        self.patient_unassigned = Patient.objects.create(
            mr_number="MR-00102",
            first_name="Zainab",
            last_name="Bibi",
            date_of_birth=datetime.date(1972, 8, 20),
            gender="F",
            phone="0333-1122334",
            address="House 88, Street 19, Bahria Town, Rawalpindi",
            emergency_contact_name="Tariq Bibi",
            emergency_contact_relation="Son",
            emergency_contact_phone="0333-9988776",
            primary_diagnosis="Post-Stroke Left Hemiparesis",
        )

        # ── 3. Create Users and Staff for Roles ──────────────────────────────
        self.users = {}
        self.staff_members = {}

        roles_to_create = [
            ('doctor', 'doctor', 'Dr. Bilal', 'DOC-01'),
            ('nurse', 'nurse', 'Nurse Sara', 'NUR-01'),
            ('physiotherapist', 'physiotherapist', 'Physio Hamza', 'PHY-01'),
            ('speech_therapist', 'speech_therapist', 'Therapist Ayesha', 'SPE-01'),
            ('psychotherapist', 'psychotherapist', 'Dr. Hina (Psych)', 'PSY-01'),
            ('care_manager', 'care_manager', 'Manager Usman', 'MGR-01'),
            ('admin', 'admin', 'Admin Farhan', 'ADM-01'),
            ('super_admin', 'super_admin', 'SuperAdmin Boss', 'SUP-01'),
            ('accountant', 'accountant', 'Accountant Asad', 'ACC-01'),
            ('crm_executive', 'crm_executive', 'CRM Nida', 'CRM-01'),
        ]

        for key, role_name, full_name, emp_id in roles_to_create:
            is_super = (key == 'super_admin')
            is_staff = (key in ('admin', 'super_admin'))
            u = User.objects.create_user(
                username=f"user_{key}",
                password="password123",
                first_name=full_name.split()[0],
                last_name=full_name.split()[-1],
                is_superuser=is_super,
                is_staff=is_staff
            )
            # Create StaffMember
            sm = StaffMember.objects.create(
                user=u,
                first_name=u.first_name,
                last_name=u.last_name,
                employee_id=emp_id,
                role=role_name,
                status='available',
                hire_date=datetime.date(2021, 1, 1),
                phone="0300-5555555"
            )
            self.users[key] = u
            self.staff_members[key] = sm

        # Patient Family user
        self.family_user = User.objects.create_user(
            username="user_patient_family",
            password="password123",
            first_name="Family",
            last_name="Member"
        )
        UserProfile.objects.create(user=self.family_user, role=UserRole.PATIENT_FAMILY)
        self.users['patient_family'] = self.family_user

        # Non-treating Doctor (assigned to another patient, NOT patient_assigned)
        self.non_treating_doc_user = User.objects.create_user(
            username="user_other_doctor", password="password123"
        )
        self.non_treating_doc_staff = StaffMember.objects.create(
            user=self.non_treating_doc_user,
            first_name="Other",
            last_name="Doctor",
            employee_id="DOC-99",
            role='doctor',
            status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # ── 4. Set Care Manager for Patient Assigned ─────────────────────────
        self.patient_assigned.assigned_care_manager = self.staff_members['care_manager']
        self.patient_assigned.save()

        # ── 5. Create Active Bookings assigning staff to Patient Assigned ─────
        # Assign doctor, nurse, physio, speech_therapist, psychotherapist to patient_assigned
        for role_key in ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist']:
            Booking.objects.create(
                patient=self.patient_assigned,
                assigned_staff=self.staff_members[role_key],
                scheduled_time=self.now,
                shift_end_time=self.now + datetime.timedelta(hours=2),
                status=BookingStatus.ASSIGNED,
                service_type="Home Visit"
            )

        # Non-treating doctor gets booking ONLY on patient_unassigned
        Booking.objects.create(
            patient=self.patient_unassigned,
            assigned_staff=self.non_treating_doc_staff,
            scheduled_time=self.now,
            shift_end_time=self.now + datetime.timedelta(hours=2),
            status=BookingStatus.ASSIGNED,
            service_type="Doctor Consultation"
        )

        # ── 6. Create Clinical Records for Testing Timeline & Filters ────────
        # A. Doctor Note (recent)
        self.doc_note = DoctorNote.objects.create(
            patient=self.patient_assigned,
            doctor=self.staff_members['doctor'],
            notes="Patient is making good progress with wound management. BS controlled.",
            plan="Continue BID dressing and oral Metformin 500mg.",
            is_signed=True,
            signed_at=self.now,
            signed_by=self.staff_members['doctor']
        )

        # B. Physiotherapy Note (recent)
        self.physio_note = PhysioNote.objects.create(
            patient=self.patient_assigned,
            physio=self.staff_members['physiotherapist'],
            session_notes="Gait training 20 mins with walker. Good balance.",
            mobility_status="Assisted Ambulatory",
            goals="Independent ambulation within 4 weeks.",
            exercises="Quadriceps sets, ankle pumps, heel slides.",
            is_signed=True,
            signed_at=self.now,
            signed_by=self.staff_members['physiotherapist']
        )

        # C. Speech Therapy Note (recent)
        self.speech_note = TherapyNote.objects.create(
            patient=self.patient_assigned,
            discipline=TherapyNote.Discipline.SPEECH_THERAPY,
            author=self.staff_members['speech_therapist'],
            session_notes="Swallowing assessment and speech clarity exercises.",
            goals="Clear speech articulation; safe swallow without choking.",
            plan="Twice weekly speech therapy.",
            is_signed=True,
            signed_at=self.now,
            signed_by=self.staff_members['speech_therapist']
        )

        # D. Psychotherapy Note (recent, STRICT CONFIDENTIALITY)
        self.psych_note = TherapyNote.objects.create(
            patient=self.patient_assigned,
            discipline=TherapyNote.Discipline.PSYCHOTHERAPY,
            author=self.staff_members['psychotherapist'],
            session_notes="Cognitive behavioural therapy session regarding illness anxiety.",
            goals="Anxiety reduction and cognitive reframing.",
            plan="Weekly CBT sessions.",
            is_signed=True,
            signed_at=self.now,
            signed_by=self.staff_members['psychotherapist']
        )

        # E. Old Doctor Note (older than 183 days / 6 months default display window)
        old_time = self.now - datetime.timedelta(days=200)
        self.old_doc_note = DoctorNote.objects.create(
            patient=self.patient_assigned,
            doctor=self.staff_members['doctor'],
            notes="Initial intake consultation 7 months ago.",
            plan="Establish baseline.",
            is_signed=True,
            signed_at=old_time,
            signed_by=self.staff_members['doctor']
        )
        DoctorNote.objects.filter(id=self.old_doc_note.id).update(created_at=old_time)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. ACCESS CONTROL & ROLE SCOPING TESTS
    # ─────────────────────────────────────────────────────────────────────────

    def test_patient_file_access_unauthenticated_returns_401(self):
        """Unauthenticated request must be rejected with 401 Unauthorized."""
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patient_file_access_patient_family_returns_403(self):
        """patient_family role must receive 403 Forbidden on internal Patient File."""
        self.client.force_authenticate(user=self.users['patient_family'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patient_file_access_assigned_roles_return_200(self):
        """All authorized clinical and administrative roles can access an assigned patient."""
        allowed_roles = [
            'doctor', 'nurse', 'physiotherapist', 'speech_therapist',
            'psychotherapist', 'care_manager', 'admin', 'super_admin'
        ]
        for role_key in allowed_roles:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
            self.assertEqual(
                res.status_code, status.HTTP_200_OK,
                f"Role {role_key} failed to access assigned patient file (got {res.status_code})"
            )
            self.assertIn('patient', res.data)
            self.assertIn('guardian', res.data)
            self.assertIn('staff_on_duty', res.data)
            self.assertIn('active_complaint', res.data)

    def test_patient_file_access_unassigned_clinicians_return_404(self):
        """Clinician roles (doctor, nurse, physio, speech, psychotherapist) receive 404 for unassigned patient."""
        clinician_roles = ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist']
        for role_key in clinician_roles:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_unassigned.id}/patient-file/")
            self.assertEqual(
                res.status_code, status.HTTP_404_NOT_FOUND,
                f"Role {role_key} should receive 404 for unassigned patient (got {res.status_code})"
            )

    def test_patient_file_access_support_roles(self):
        """Accountant and CRM executive must NOT access clinical Patient File hub or records (403 Forbidden)."""
        for role_key in ['accountant', 'crm_executive']:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
            # Records timeline must also return 403 Forbidden
            res_rec = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/medications/")
            self.assertEqual(res_rec.status_code, status.HTTP_403_FORBIDDEN)

    def test_records_timeline_scoping_all_roles(self):
        """Test records timeline endpoint object scoping across clinical and non-clinical roles."""
        # Unassigned clinician gets 404 on records endpoint
        for role_key in ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist']:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_unassigned.id}/records/doctor_notes/")
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Assigned clinician gets 200 on records endpoint
        for role_key in ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'care_manager', 'admin']:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Patient family gets 403 on records endpoint
        self.client.force_authenticate(user=self.users['patient_family'])
        res_fam = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/")
        self.assertEqual(res_fam.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. LEGAL GUARDIAN CONTACT VISIBILITY (A4 RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_guardian_contact_visibility_per_role(self):
        """
        A4 Rule:
        - Doctor, Care Manager, Admin, Super Admin -> see phone directly ('direct')
        - Nurse -> phone is withheld, can_reveal_emergency is True ('emergency_reveal')
        - Physiotherapist, Speech Therapist, Psychotherapist -> phone withheld, can_reveal_emergency is False ('name_only')
        """
        # A. Direct visibility roles
        direct_roles = ['doctor', 'care_manager', 'admin', 'super_admin']
        for role_key in direct_roles:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            g = res.data['guardian']
            self.assertEqual(g['name'], "Farida Khan")
            self.assertEqual(g['phone'], "0300-1234567", f"Role {role_key} did not get phone number directly")
            self.assertFalse(g['phone_hidden'])
            self.assertEqual(g['visibility_mode'], 'direct')

        # B. Nurse (emergency reveal capability)
        self.client.force_authenticate(user=self.users['nurse'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        g = res.data['guardian']
        self.assertEqual(g['name'], "Farida Khan")
        self.assertIsNone(g['phone'], "Nurse must not receive phone number in default patient-file response")
        self.assertTrue(g['phone_hidden'])
        self.assertTrue(g['can_reveal_emergency'])
        self.assertEqual(g['visibility_mode'], 'emergency_reveal')

        # C. Therapists (name only)
        name_only_roles = ['physiotherapist', 'speech_therapist', 'psychotherapist']
        for role_key in name_only_roles:
            self.client.force_authenticate(user=self.users[role_key])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            g = res.data['guardian']
            self.assertEqual(g['name'], "Farida Khan")
            self.assertIsNone(g['phone'], f"Role {role_key} must never receive guardian phone")
            self.assertTrue(g['phone_hidden'])
            self.assertFalse(g['can_reveal_emergency'], f"Role {role_key} must not have emergency reveal button")
            self.assertEqual(g['visibility_mode'], 'name_only')

    # ─────────────────────────────────────────────────────────────────────────
    # 3. EMERGENCY REVEAL WITH SECURITY AUDIT LOGGING
    # ─────────────────────────────────────────────────────────────────────────

    def test_emergency_reveal_audit_logging(self):
        """
        Nurse triggers emergency reveal:
        - Receives guardian phone number
        - An AuditLog entry is written
        - The phone number itself is strictly EXCLUDED from the log text (no PHI)
        - Unauthorized roles (e.g. physiotherapist) receive 403 Forbidden
        """
        initial_log_count = AuditLog.objects.filter(action='Emergency Contact Revealed').count()

        # Nurse reveals
        self.client.force_authenticate(user=self.users['nurse'])
        reveal_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/reveal-emergency-contact/")
        self.assertEqual(reveal_res.status_code, status.HTTP_200_OK)
        self.assertEqual(reveal_res.data['phone'], "0300-1234567")

        # Verify AuditLog created
        logs = AuditLog.objects.filter(action='Emergency Contact Revealed')
        self.assertEqual(logs.count(), initial_log_count + 1)
        latest_log = logs.latest('timestamp')
        self.assertEqual(latest_log.actor, self.users['nurse'])
        # Assert NO phone number in log text
        self.assertNotIn("0300-1234567", latest_log.details)
        self.assertNotIn("1234567", latest_log.details)
        self.assertNotIn("0300-1234567", latest_log.target_user)

        # Therapist cannot call reveal endpoint
        self.client.force_authenticate(user=self.users['physiotherapist'])
        denied_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/reveal-emergency-contact/")
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. ACTIVE COMPLAINT BANNER (B2 RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_active_complaint_create_resolve_and_history(self):
        """
        Active complaint:
        - doctor/cm/admin can create and resolve
        - new entry supersedes previous unresolved
        - nurse/therapists receive 403 Forbidden on create/resolve
        """
        # Doctor creates active complaint
        self.client.force_authenticate(user=self.users['doctor'])
        c1_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'create',
            'text': 'Patient reporting acute sharp lower abdominal pain since morning.'
        }, format='json')
        self.assertEqual(c1_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(c1_res.data['active_complaint']['text'], 'Patient reporting acute sharp lower abdominal pain since morning.')

        # Verify active complaint appears in patient-file
        pf_res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertIsNotNone(pf_res.data['active_complaint'])
        self.assertEqual(pf_res.data['active_complaint']['text'], 'Patient reporting acute sharp lower abdominal pain since morning.')

        # Doctor creates a second complaint (supersedes first)
        c2_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'create',
            'text': 'Abdominal pain subsided; now complaining of dizziness on standing.'
        }, format='json')
        self.assertEqual(c2_res.status_code, status.HTTP_201_CREATED)

        # Verify history holds previous complaint, now marked resolved
        history = c2_res.data['history']
        self.assertGreaterEqual(len(history), 2)
        self.assertTrue(history[1]['is_resolved'])

        # Doctor resolves active complaint
        resolve_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'resolve'
        }, format='json')
        self.assertEqual(resolve_res.status_code, status.HTTP_200_OK)
        self.assertIsNone(resolve_res.data['active_complaint'])

        # Verify patient-file has None active complaint
        pf_resolved = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertIsNone(pf_resolved.data['active_complaint'])

        # Nurse cannot create active complaint
        self.client.force_authenticate(user=self.users['nurse'])
        denied_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'create',
            'text': 'Nurse trying to create active complaint.'
        }, format='json')
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. BRIEF HISTORY & CARE PLAN EDIT RIGHTS & AUDIT TRAIL (B1 RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_history_and_care_plan_edit_rights_and_trail(self):
        """
        Brief history and care plan:
        - Editable by assigned doctor, care manager, admin, super_admin
        - Appends to immutable edit trail history_care_plan_edits
        - Nurse and therapists receive 403 Forbidden
        """
        # Doctor edits brief history
        self.client.force_authenticate(user=self.users['doctor'])
        edit_h_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
            'section': 'brief_history',
            'text': 'Updated: Patient has 10-year history of T2DM with recent foot ulcer now healing.'
        }, format='json')
        self.assertEqual(edit_h_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(edit_h_res.data['edits']), 1)
        self.assertEqual(edit_h_res.data['edits'][0]['edited_by_role'], 'doctor')

        # Care manager edits care plan
        self.client.force_authenticate(user=self.users['care_manager'])
        edit_cp_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
            'section': 'care_plan',
            'text': 'Updated: Daily antiseptic dressing, physiotherapy mobility training.'
        }, format='json')
        self.assertEqual(edit_cp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(edit_cp_res.data['edits']), 1)
        self.assertEqual(edit_cp_res.data['edits'][0]['edited_by_role'], 'care_manager')

        # Verify patient-file displays updated text and preserved edit histories
        pf_res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertIn("foot ulcer now healing", pf_res.data['brief_history'])
        self.assertIn("antiseptic dressing", pf_res.data['care_plan'])
        self.assertEqual(len(pf_res.data['brief_history_edits']), 1)
        self.assertEqual(len(pf_res.data['care_plan_edits']), 1)

        # Nurse cannot edit
        self.client.force_authenticate(user=self.users['nurse'])
        denied_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
            'section': 'brief_history',
            'text': 'Unauthorized nurse edit.'
        }, format='json')
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. SCHEDULED ITEMS & RELATIVE DUE NEAR MIDNIGHT (B3 RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_scheduled_items_create_cancel_mark_done_and_relative_due(self):
        """
        Scheduled items:
        - Doctor creates procedure and blood test
        - Relative due date computed in Asia/Karachi (test near midnight)
        - Nurse can mark procedure done
        - Nurse cannot cancel (403)
        - Admin can cancel (200)
        - Physio can mark appointment done, but not blood test (403)
        """
        self.client.force_authenticate(user=self.users['doctor'])

        # Create procedure due near midnight tonight in Asia/Karachi
        today_karachi = timezone.now().astimezone(self.karachi_tz).date()
        due_midnight = timezone.make_aware(
            datetime.datetime.combine(today_karachi, datetime.time(23, 55)), self.karachi_tz
        )

        p_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'kind': 'procedure',
            'title': 'Foley Catheter Replacement',
            'due_at': due_midnight.isoformat(),
            'notes': 'Use 16Fr silicon catheter with aseptic technique'
        }, format='json')
        self.assertEqual(p_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(p_res.data['due_relative'], 'Today')

        proc_id = p_res.data['id']

        # Create appointment due tomorrow morning
        tomorrow_karachi = today_karachi + datetime.timedelta(days=1)
        due_tomorrow = timezone.make_aware(
            datetime.datetime.combine(tomorrow_karachi, datetime.time(9, 0)), self.karachi_tz
        )
        app_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'kind': 'appointment',
            'title': 'Physiotherapy Gait Evaluation',
            'due_at': due_tomorrow.isoformat(),
            'notes': 'Evaluate walker progression'
        }, format='json')
        self.assertEqual(app_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(app_res.data['due_relative'], 'Tomorrow')
        app_id = app_res.data['id']

        # Nurse marks procedure done
        self.client.force_authenticate(user=self.users['nurse'])
        done_res = self.client.patch(
            f"/api/patients/{self.patient_assigned.id}/scheduled-items/{proc_id}/",
            {'status': 'done'}, format='json'
        )
        self.assertEqual(done_res.status_code, status.HTTP_200_OK)
        self.assertEqual(done_res.data['status'], 'done')
        self.assertEqual(done_res.data['done_by_name'], self.staff_members['nurse'].full_name)

        # Nurse cannot cancel appointment
        cancel_denied = self.client.patch(
            f"/api/patients/{self.patient_assigned.id}/scheduled-items/{app_id}/",
            {'status': 'cancelled'}, format='json'
        )
        self.assertEqual(cancel_denied.status_code, status.HTTP_403_FORBIDDEN)

        # Physio can mark appointment done
        self.client.force_authenticate(user=self.users['physiotherapist'])
        physio_done = self.client.patch(
            f"/api/patients/{self.patient_assigned.id}/scheduled-items/{app_id}/",
            {'status': 'done'}, format='json'
        )
        self.assertEqual(physio_done.status_code, status.HTTP_200_OK)
        self.assertEqual(physio_done.data['status'], 'done')

        # Admin cancels an item
        self.client.force_authenticate(user=self.users['admin'])
        cancel_item = ScheduledItem.objects.create(
            patient=self.patient_assigned,
            kind='blood_test',
            title='HbA1c Blood Draw',
            due_at=timezone.now() + datetime.timedelta(days=2),
            created_by=self.users['admin']
        )
        cancel_res = self.client.patch(
            f"/api/patients/{self.patient_assigned.id}/scheduled-items/{cancel_item.id}/",
            {'status': 'cancelled'}, format='json'
        )
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_res.data['status'], 'cancelled')

    # ─────────────────────────────────────────────────────────────────────────
    # 7. PSYCHOTHERAPY CONFIDENTIALITY IN REHABILITATION TIMELINE (C1 RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_psychotherapy_notes_confidentiality_in_rehab_timeline(self):
        """
        Psychotherapy notes must NEVER appear in the rehabilitation_notes timeline
        for: nurse, physiotherapist, speech_therapist, or non-treating doctor.
        They are visible ONLY to:
        - author psychotherapist
        - assigned treating doctor (with audit log on read)
        - assigned care manager (with audit log on read)
        - admin / super_admin (with audit log on read)
        """
        # A. Nurse views rehabilitation_notes timeline
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_nurse.status_code, status.HTTP_200_OK)
        results = res_nurse.data['results']
        titles = [r['title'] for r in results]
        # Should contain Physio and Speech notes
        self.assertTrue(any('Physiotherapy' in t for t in titles))
        self.assertTrue(any('Speech' in t for t in titles))
        # MUST NOT contain Psychotherapy note
        self.assertFalse(any('Psychotherapy' in t for t in titles), "Nurse must NOT see psychotherapy note in timeline")

        # B. Physiotherapist views rehabilitation_notes timeline
        self.client.force_authenticate(user=self.users['physiotherapist'])
        res_physio = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_physio.status_code, status.HTTP_200_OK)
        titles = [r['title'] for r in res_physio.data['results']]
        self.assertFalse(any('Psychotherapy' in t for t in titles), "Physiotherapist must NOT see psychotherapy note")

        # C. Speech Therapist views rehabilitation_notes timeline
        self.client.force_authenticate(user=self.users['speech_therapist'])
        res_speech = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_speech.status_code, status.HTTP_200_OK)
        titles = [r['title'] for r in res_speech.data['results']]
        self.assertFalse(any('Psychotherapy' in t for t in titles), "Speech therapist must NOT see psychotherapy note")

        # D. Author Psychotherapist views timeline -> sees psychotherapy note
        self.client.force_authenticate(user=self.users['psychotherapist'])
        res_psych = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_psych.status_code, status.HTTP_200_OK)
        titles = [r['title'] for r in res_psych.data['results']]
        self.assertTrue(any('Psychotherapy' in t for t in titles), "Author psychotherapist must see their note")

        # E. Assigned Treating Doctor views timeline -> sees psychotherapy note and audit log is created
        initial_audit_count = AuditLog.objects.filter(action='Read Psychotherapy Notes').count()
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        titles = [r['title'] for r in res_doc.data['results']]
        self.assertTrue(any('Psychotherapy' in t for t in titles), "Treating doctor must see psychotherapy note")
        new_audit_count = AuditLog.objects.filter(action='Read Psychotherapy Notes').count()
        self.assertEqual(new_audit_count, initial_audit_count + 1, "Treating doctor reading psych note must trigger AuditLog")

    # ─────────────────────────────────────────────────────────────────────────
    # 8. DISPLAY WINDOW FILTER & SEARCH (C2, C4 RULES)
    # ─────────────────────────────────────────────────────────────────────────

    def test_records_timeline_window_filtering_and_search(self):
        """
        - Default 6-month display window (183 days) excludes old doctor note
        - ?all_time=true returns old doctor note
        - ?q= search queries title, summary and content
        """
        self.client.force_authenticate(user=self.users['doctor'])

        # Default 6-month window: old note is filtered out
        res_default = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/")
        self.assertEqual(res_default.status_code, status.HTTP_200_OK)
        results_default = res_default.data['results']
        self.assertEqual(len(results_default), 1)
        self.assertEqual(results_default[0]['id'], f"dn-{self.doc_note.id}")

        # All time window: old note is included
        res_all = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/?all_time=true")
        self.assertEqual(res_all.status_code, status.HTTP_200_OK)
        results_all = res_all.data['results']
        self.assertEqual(len(results_all), 2)

        # Search filter
        res_search = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/?all_time=true&q=Intake")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        results_search = res_search.data['results']
        self.assertEqual(len(results_search), 1)
        self.assertEqual(results_search[0]['id'], f"dn-{self.old_doc_note.id}")

    # ─────────────────────────────────────────────────────────────────────────
    # 9. PERFORMANCE & QUERY COUNT BOUND (CROSS-CUTTING RULE)
    # ─────────────────────────────────────────────────────────────────────────

    def test_query_count_limit_for_patient_file(self):
        """
        Ensures GET /api/patients/{id}/patient-file/ does not trigger N+1 query storms.
        Binds total database queries to a small ceiling (<= 15 queries).
        """
        self.client.force_authenticate(user=self.users['doctor'])
        with CaptureQueriesContext(connection) as queries:
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertLessEqual(
            len(queries), 15,
            f"Expected <= 15 queries for patient-file, but got {len(queries)}"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 10. FIX-UP TESTS (Items 2-8 & 10)
    # ─────────────────────────────────────────────────────────────────────────

    def test_generic_patient_write_protection(self):
        """
        Item 3: brief_history, care_plan, history_care_plan_edits, photo cannot be modified
        via generic PatientViewSet PATCH / PUT / POST. Only dedicated endpoints can update them.
        """
        self.client.force_authenticate(user=self.users['admin'])
        orig_history = self.patient_assigned.brief_history
        orig_care = self.patient_assigned.care_plan
        orig_edits = list(self.patient_assigned.history_care_plan_edits)

        # Attempt to overwrite protected fields via generic PATCH
        res = self.client.patch(
            f"/api/patients/{self.patient_assigned.id}/",
            {
                'brief_history': 'Overwritten history bypass',
                'care_plan': 'Overwritten care plan bypass',
                'history_care_plan_edits': [{'fake': 'edit'}],
            },
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.patient_assigned.refresh_from_db()
        self.assertEqual(self.patient_assigned.brief_history, orig_history)
        self.assertEqual(self.patient_assigned.care_plan, orig_care)
        self.assertEqual(self.patient_assigned.history_care_plan_edits, orig_edits)

        # Legitimate edit via dedicated endpoint succeeds and updates audit trail
        res_legit = self.client.post(
            f"/api/patients/{self.patient_assigned.id}/history-care-plan/",
            {
                'section': 'brief_history',
                'text': 'Updated legitimate history through dedicated endpoint',
                'reason': 'Annual medical review update'
            },
            format='json'
        )
        self.assertEqual(res_legit.status_code, status.HTTP_200_OK)
        self.patient_assigned.refresh_from_db()
        self.assertEqual(self.patient_assigned.brief_history, 'Updated legitimate history through dedicated endpoint')
        self.assertEqual(len(self.patient_assigned.history_care_plan_edits), len(orig_edits) + 1)

    def test_author_role_displays_real_staff_role(self):
        """
        Item 4: author_role must be author's real StaffMember role display (e.g. Doctor, Physiotherapist, Nurse),
        not a record-type label. Records with no author return '-'.
        """
        self.client.force_authenticate(user=self.users['doctor'])

        # Doctor note timeline
        res_dn = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/")
        self.assertEqual(res_dn.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dn.data['results'][0]['author_role'], 'Doctor')

        # Physio note timeline
        res_pn = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_pn.status_code, status.HTTP_200_OK)
        physio_item = next(r for r in res_pn.data['results'] if 'Physiotherapy' in r['title'])
        self.assertEqual(physio_item['author_role'], 'Physiotherapist')

        # Nurse note timeline
        NurseNote.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            note="Nurse progress observation"
        )
        res_nn = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/nursing_notes/")
        self.assertEqual(res_nn.status_code, status.HTTP_200_OK)
        self.assertEqual(res_nn.data['results'][0]['author_role'], 'Nurse')

        # Lab result (no staff member)
        LabResult.objects.create(
            patient=self.patient_assigned,
            test_name="Fasting Blood Sugar",
            result_value="110",
            unit="mg/dL",
            collected_at=timezone.now()
        )
        res_lab = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/lab_reports/")
        self.assertEqual(res_lab.status_code, status.HTTP_200_OK)
        self.assertEqual(res_lab.data['results'][0]['author_role'], '-')

    def test_treating_consultant_old_booking_excluded(self):
        """
        Item 5: A doctor with only an old booking (beyond CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT)
        is NOT shown as treating consultant (None) and gets no extra access.
        """
        old_doc_user = User.objects.create_user(
            username="old_doctor", password="password123", first_name="Old", last_name="Doc"
        )
        UserProfile.objects.create(user=old_doc_user, role=UserRole.NURSE)
        old_doc_staff = StaffMember.objects.create(
            user=old_doc_user,
            first_name="Old",
            last_name="Doc",
            role="doctor",
            employee_id="DOC-OLD",
            hire_date=datetime.date(2020, 1, 1),
            is_active=True
        )

        patient_old_only = Patient.objects.create(
            mr_number="MR-OLD-01",
            first_name="OldBooking",
            last_name="Patient",
            date_of_birth=datetime.date(1960, 1, 1),
            gender="M"
        )

        # Booking from 40 days ago (well outside 7-day window)
        Booking.objects.create(
            patient=patient_old_only,
            assigned_staff=old_doc_staff,
            service_type="Doctor Consultation",
            status=BookingStatus.COMPLETED,
            scheduled_time=timezone.now() - datetime.timedelta(days=40)
        )

        # Admin views patient file: treating_consultant must be None
        self.client.force_authenticate(user=self.users['admin'])
        res = self.client.get(f"/api/patients/{patient_old_only.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['treating_consultant'])

        # Old doctor attempts to view patient file: must get 404
        self.client.force_authenticate(user=old_doc_user)
        res_doc = self.client.get(f"/api/patients/{patient_old_only.id}/patient-file/")
        self.assertEqual(res_doc.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_on_duty_roster_precedence(self):
        """
        Item 6: Published roster shift hours take precedence over booking hours.
        Fallback to booking uses scheduled start & end and NEVER outputs 'End of Shift'.
        """
        today_local = timezone.now().astimezone(self.karachi_tz).date()

        # Doctor has published roster 08:00 - 16:00
        monday = today_local - datetime.timedelta(days=today_local.weekday())
        roster_week, _ = RosterWeek.objects.get_or_create(
            week_start_date=monday,
            defaults={'status': RosterWeek.Status.PUBLISHED}
        )
        RosterAssignment.objects.create(
            roster_week=roster_week,
            staff=self.staff_members['doctor'],
            date=today_local,
            shift_name='Day Shift',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(16, 0),
            is_published=True
        )

        # Booking for today is at 10:00 - 12:00
        Booking.objects.filter(patient=self.patient_assigned, assigned_staff=self.staff_members['doctor']).delete()
        Booking.objects.create(
            patient=self.patient_assigned,
            assigned_staff=self.staff_members['doctor'],
            service_type="Doctor Consultation",
            status=BookingStatus.ASSIGNED,
            scheduled_time=timezone.now()
        )

        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        doc_duty = next((s for s in res.data['staff_on_duty'] if s['id'] == self.staff_members['doctor'].id), None)
        self.assertIsNotNone(doc_duty)
        # Published roster shift hours prevail
        self.assertEqual(doc_duty['shift_hours'], '08:00 - 16:00 (PKT)')
        self.assertNotIn('End of Shift', doc_duty['shift_hours'])

    def test_patient_photo_privacy_and_upload(self):
        """
        Item 7: Photo is served via authenticated endpoint with scoping.
        Raw media paths are never exposed. Minimal upload endpoint allows admin/CM only.
        """
        tiny_png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4'
            b'\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        photo_file = SimpleUploadedFile("test_photo.png", tiny_png, content_type="image/png")

        # Admin uploads photo
        self.client.force_authenticate(user=self.users['admin'])
        upload_res = self.client.post(
            f"/api/patients/{self.patient_assigned.id}/photo/",
            {'photo': photo_file},
            format='multipart'
        )
        self.assertEqual(upload_res.status_code, status.HTTP_200_OK)
        self.assertEqual(upload_res.data['photo'], f"/api/patients/{self.patient_assigned.id}/photo/")

        # Assigned clinician can fetch photo (200)
        self.client.force_authenticate(user=self.users['doctor'])
        photo_res = self.client.get(f"/api/patients/{self.patient_assigned.id}/photo/")
        self.assertEqual(photo_res.status_code, status.HTTP_200_OK)
        self.assertEqual(photo_res['Content-Type'], 'image/png')

        # Unassigned clinician gets 404
        self.client.force_authenticate(user=self.users['doctor'])
        unassigned_res = self.client.get(f"/api/patients/{self.patient_unassigned.id}/photo/")
        self.assertEqual(unassigned_res.status_code, status.HTTP_404_NOT_FOUND)

        # Unauthenticated gets 401
        self.client.logout()
        unauth_res = self.client.get(f"/api/patients/{self.patient_assigned.id}/photo/")
        self.assertEqual(unauth_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Accountant gets 403
        self.client.force_authenticate(user=self.users['accountant'])
        acc_res = self.client.get(f"/api/patients/{self.patient_assigned.id}/photo/")
        self.assertEqual(acc_res.status_code, status.HTTP_403_FORBIDDEN)

        # Nurse cannot upload photo (403)
        self.client.force_authenticate(user=self.users['nurse'])
        forbidden_upload = self.client.post(
            f"/api/patients/{self.patient_assigned.id}/photo/",
            {'photo': photo_file},
            format='multipart'
        )
        self.assertEqual(forbidden_upload.status_code, status.HTTP_403_FORBIDDEN)

    def test_timezone_scheduled_items_and_midnight_filter(self):
        """
        Item 8: ScheduledItem due_relative at 23:30 (Today) and 00:30 (Tomorrow) in Asia/Karachi.
        Timeline date filter around midnight correctly isolates records by local date.
        """
        today_local = timezone.now().astimezone(self.karachi_tz).date()

        # Item at 23:30 Asia/Karachi today
        due_today_2330 = timezone.make_aware(
            datetime.datetime.combine(today_local, datetime.time(23, 30)),
            self.karachi_tz
        )
        item_today = ScheduledItem.objects.create(
            patient=self.patient_assigned,
            kind='procedure',
            title='Late Night Dressing Change',
            due_at=due_today_2330,
            created_by=self.users['doctor']
        )

        # Item at 00:30 Asia/Karachi tomorrow
        tomorrow_local = today_local + datetime.timedelta(days=1)
        due_tomorrow_0030 = timezone.make_aware(
            datetime.datetime.combine(tomorrow_local, datetime.time(0, 30)),
            self.karachi_tz
        )
        item_tomorrow = ScheduledItem.objects.create(
            patient=self.patient_assigned,
            kind='procedure',
            title='Early Morning Nebulisation',
            due_at=due_tomorrow_0030,
            created_by=self.users['doctor']
        )

        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/scheduled-items/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        items_map = {it['id']: it for it in res.data}
        self.assertEqual(items_map[item_today.id]['due_relative'], 'Today')
        self.assertEqual(items_map[item_tomorrow.id]['due_relative'], 'Tomorrow')

        # Midnight filter test on timeline:
        # Create 2 nurse notes: one at 23:50 PKT today, one at 00:10 PKT tomorrow
        nn_today = NurseNote.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            note="Bedside care at 23:50 PKT"
        )
        NurseNote.objects.filter(pk=nn_today.pk).update(
            recorded_at=timezone.make_aware(datetime.datetime.combine(today_local, datetime.time(23, 50)), self.karachi_tz)
        )
        nn_tomorrow = NurseNote.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            note="Bedside care at 00:10 PKT"
        )
        NurseNote.objects.filter(pk=nn_tomorrow.pk).update(
            recorded_at=timezone.make_aware(datetime.datetime.combine(tomorrow_local, datetime.time(0, 10)), self.karachi_tz)
        )

        # Filter strictly for today_local
        res_today = self.client.get(
            f"/api/patients/{self.patient_assigned.id}/records/nursing_notes/?from={today_local.isoformat()}&to={today_local.isoformat()}"
        )
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        today_ids = [r['id'] for r in res_today.data['results']]
        self.assertIn(f"nn-{nn_today.id}", today_ids)
        self.assertNotIn(f"nn-{nn_tomorrow.id}", today_ids)

        # Filter strictly for tomorrow_local
        res_tomorrow = self.client.get(
            f"/api/patients/{self.patient_assigned.id}/records/nursing_notes/?from={tomorrow_local.isoformat()}&to={tomorrow_local.isoformat()}"
        )
        self.assertEqual(res_tomorrow.status_code, status.HTTP_200_OK)
        tomorrow_ids = [r['id'] for r in res_tomorrow.data['results']]
        self.assertIn(f"nn-{nn_tomorrow.id}", tomorrow_ids)
        self.assertNotIn(f"nn-{nn_today.id}", tomorrow_ids)
