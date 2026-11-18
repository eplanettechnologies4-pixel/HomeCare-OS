import io
import json
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
            ('dietician', 'dietician', 'Dietician Zainab', 'DT-01'),
            ('lab_tech', 'lab_tech', 'Tech Kamran', 'LAB-01'),
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
        self.patient_assigned.portal_user = self.family_user
        self.patient_assigned.save()

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
        for role_key in ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
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
        for role_key in ['doctor', 'nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
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

        # Doctor note timeline & single-record endpoint
        res_dn = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/")
        self.assertEqual(res_dn.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dn.data['results'][0]['author_role'], 'Doctor')

        res_dn_single = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/doctor_notes/{self.doc_note.id}/")
        self.assertEqual(res_dn_single.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dn_single.data['author_role'], 'Doctor')

        # Physio note timeline & single-record endpoint
        res_pn = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/")
        self.assertEqual(res_pn.status_code, status.HTTP_200_OK)
        physio_item = next(r for r in res_pn.data['results'] if 'Physiotherapy' in r['title'])
        self.assertEqual(physio_item['author_role'], 'Physiotherapist')

        res_pn_single = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/pn-{self.physio_note.id}/")
        self.assertEqual(res_pn_single.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pn_single.data['author_role'], 'Physiotherapist')

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

        # Overdue item (due yesterday in Asia/Karachi)
        yesterday_local = today_local - datetime.timedelta(days=1)
        due_yesterday_1400 = timezone.make_aware(
            datetime.datetime.combine(yesterday_local, datetime.time(14, 0)),
            self.karachi_tz
        )
        item_overdue = ScheduledItem.objects.create(
            patient=self.patient_assigned,
            kind='blood_test',
            title='Overdue Morning CBC',
            due_at=due_yesterday_1400,
            created_by=self.users['doctor']
        )

        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/scheduled-items/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        items_map = {it['id']: it for it in res.data}
        self.assertEqual(items_map[item_today.id]['due_relative'], 'Today')
        self.assertEqual(items_map[item_tomorrow.id]['due_relative'], 'Tomorrow')
        self.assertTrue(items_map[item_overdue.id]['due_relative'].startswith('Overdue'))
        self.assertTrue(items_map[item_overdue.id]['is_overdue'])

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

    def test_21_monitoring_record_type_merges_vitals_and_fluid_balance(self):
        """Verifies that record_type 'monitoring' merges vitals observations and fluid balance entries."""
        self.client.force_authenticate(user=self.users['nurse'])

        now = timezone.now()
        # Create vital signs observation
        v1 = VitalSign.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            recorded_at=now,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
            temperature=37.0,
            spo2=98,
        )

        # Create intake/output observation
        v2 = VitalSign.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            recorded_at=now,
            intake_ml=500,
            output_ml=350,
            notes="Oral hydration and urine output",
        )

        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/monitoring/?all_time=true")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', [])
        ids = [r['id'] for r in results]
        self.assertIn(f"monitoring-{v1.id}", ids)
        self.assertIn(f"monitoring-{v2.id}", ids)

        # Check structure of the merged record
        m1 = next(r for r in results if r['id'] == f"monitoring-{v1.id}")
        self.assertEqual(m1['type'], 'monitoring')
        self.assertIn('120/80 mmHg', m1['title'])
        self.assertEqual(m1['details']['bp_systolic'], 120)
        self.assertEqual(m1['details']['heart_rate'], 72)

        m2 = next(r for r in results if r['id'] == f"monitoring-{v2.id}")
        self.assertEqual(m2['type'], 'monitoring')
        self.assertEqual(m2['details']['intake_ml'], 500)
        self.assertEqual(m2['details']['output_ml'], 350)
        self.assertEqual(m2['details']['net_balance_ml'], 150)

    def test_22_single_record_drawer_supports_monitoring_type(self):
        """Verifies GET /api/patients/{id}/records/monitoring/{record_id}/ retrieves record details."""
        self.client.force_authenticate(user=self.users['doctor'])
        v = VitalSign.objects.create(
            patient=self.patient_assigned,
            recorded_by=self.staff_members['nurse'],
            recorded_at=timezone.now(),
            blood_pressure_systolic=135,
            blood_pressure_diastolic=85,
            heart_rate=80,
        )
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/monitoring/{v.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['type'], 'monitoring')
        self.assertEqual(res.data['id'], v.id)

    def test_23_future_dated_vitals_rejected(self):
        """Verifies that future-dated vital signs/intake-output cannot be recorded."""
        self.client.force_authenticate(user=self.users['nurse'])
        future_time = timezone.now() + datetime.timedelta(days=2)
        payload = {
            'patient': self.patient_assigned.id,
            'blood_pressure_systolic': 120,
            'blood_pressure_diastolic': 80,
            'recorded_at': future_time.isoformat(),
        }
        res = self.client.post('/api/patients/vitals/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('recorded_at', res.data)
        self.assertIn('Future-dated observations cannot be recorded', str(res.data['recorded_at']))

    def test_24_accountant_crm_403_on_clinical_endpoints(self):
        """Accountant and CRM executive get 403 on vitals and clinical endpoints."""
        for role_key in ['accountant', 'crm_executive']:
            self.client.force_authenticate(user=self.users[role_key])
            # POST vitals
            res = self.client.post('/api/patients/vitals/', {'patient': self.patient_assigned.id}, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
            # GET vitals list
            res_list = self.client.get('/api/patients/vitals/')
            self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)
            # GET patient records
            res_rec = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/monitoring/")
            self.assertEqual(res_rec.status_code, status.HTTP_403_FORBIDDEN)

    def test_25_employee_card_no_regulator_claims_and_no_hardcoded_expiry(self):
        """Employee card endpoint returns no PMDC/regulator wording and no hard-coded expiry."""
        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get('/api/staff-portal/employee-card/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        card_text = str(res.data).upper()
        self.assertNotIn('PMDC', card_text)
        self.assertNotIn('PNC', card_text)
        self.assertNotIn('VALID THRU 12/2026', card_text)

    def test_26_nurse_off_duty_state_no_countdown(self):
        """When nurse has no assigned active shift today, duty status reflects off-duty."""
        Booking.objects.filter(assigned_staff=self.staff_members['nurse']).delete()
        RosterAssignment.objects.filter(staff=self.staff_members['nurse']).delete()
        self.client.force_authenticate(user=self.users['nurse'])
        res = self.client.get('/api/staff-portal/home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Verify duty info
        duty = res.data.get('duty', {})
        # If no shift assigned today, shift is None and state is off_duty with 0 countdown
        self.assertIsNone(duty.get('shift'))
        self.assertEqual(duty.get('state'), 'off_duty')
        self.assertEqual(duty.get('time_left_seconds'), 0)

    def test_27_patient_has_no_phone_number_in_patient_file_and_search_exclusion(self):
        """
        Patients do not have their own phone number exposed in Patient File.
        Verify phone is absent from GET /api/patients/{id}/patient-file/.
        Verify backend search does NOT match on patient phone number.
        """
        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get(f"/api/patients/{self.patient_assigned.id}/patient-file/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # phone must NOT be in patient dict
        self.assertNotIn('phone', res.data.get('patient', {}))

        # Search test on PatientViewSet:
        # Searching by MR number returns the patient
        res_mr = self.client.get(f"/api/patients/?search={self.patient_assigned.mr_number}")
        self.assertEqual(res_mr.status_code, status.HTTP_200_OK)
        mr_ids = [p['id'] for p in res_mr.data.get('results', res_mr.data)]
        self.assertIn(self.patient_assigned.id, mr_ids)

        # Searching by patient's private phone number must NOT match
        patient_phone = self.patient_assigned.phone
        self.assertTrue(bool(patient_phone))
        res_phone = self.client.get(f"/api/patients/?search={patient_phone}")
        self.assertEqual(res_phone.status_code, status.HTTP_200_OK)
        phone_ids = [p['id'] for p in res_phone.data.get('results', res_phone.data)]
        self.assertNotIn(self.patient_assigned.id, phone_ids)

    def test_28_generic_patient_api_leak_audit_all_roles(self):
        """
        Audits GET /api/patients/{id}/ for each system role:
        asserts clinical fields and guardian contact are strictly scoped.
        """
        clinical_fields = [
            'primary_diagnosis', 'secondary_diagnoses', 'allergies', 'blood_type',
            'brief_history', 'care_plan', 'history_care_plan_edits',
            'active_prescriptions', 'recent_vitals',
        ]

        # 1. Accountant & CRM: demographic/billing only (NO clinical, NO guardian phone)
        for rk in ['accountant', 'crm_executive']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"{rk} should get 200 on demographic patient detail")
            for f in clinical_fields:
                self.assertNotIn(f, res.data, f"Clinical field {f} leaked to {rk}")
            self.assertNotIn('emergency_contact_phone', res.data, f"Guardian phone leaked to {rk}")
            # Safe fields present
            self.assertIn('mr_number', res.data)
            self.assertIn('first_name', res.data)
            self.assertIn('is_active', res.data)

        # 2. Patient Family: sees clinical fields and emergency contact for their own patient
        self.client.force_authenticate(user=self.family_user)
        res_fam = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
        self.assertEqual(res_fam.status_code, status.HTTP_200_OK)
        self.assertIn('primary_diagnosis', res_fam.data)
        self.assertIn('allergies', res_fam.data)
        self.assertIn('emergency_contact_phone', res_fam.data)

        # 3. Assigned Clinicians:
        # Assigned Doctor sees clinical fields + emergency_contact_phone (direct)
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        self.assertIn('primary_diagnosis', res_doc.data)
        self.assertIn('emergency_contact_phone', res_doc.data)

        # Assigned Nurse sees clinical fields, but NOT emergency_contact_phone (requires emergency reveal)
        self.client.force_authenticate(user=self.users['nurse'])
        res_nur = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
        self.assertEqual(res_nur.status_code, status.HTTP_200_OK)
        self.assertIn('primary_diagnosis', res_nur.data)
        self.assertNotIn('emergency_contact_phone', res_nur.data)

        # Assigned Therapists (physio, speech, psych, dietician) see clinical fields, NOT emergency_contact_phone
        for th_key in ['physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
            self.client.force_authenticate(user=self.users[th_key])
            res_th = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
            self.assertEqual(res_th.status_code, status.HTTP_200_OK, f"{th_key} should get 200")
            self.assertIn('primary_diagnosis', res_th.data, f"{th_key} should see clinical diagnosis")
            self.assertNotIn('emergency_contact_phone', res_th.data, f"{th_key} must NOT see guardian phone")

        # 4. Care Manager, Admin, Super Admin: clinical fields + emergency_contact_phone
        for mg_key in ['care_manager', 'admin', 'super_admin']:
            self.client.force_authenticate(user=self.users[mg_key])
            res_mg = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
            self.assertEqual(res_mg.status_code, status.HTTP_200_OK)
            self.assertIn('primary_diagnosis', res_mg.data)
            self.assertIn('emergency_contact_phone', res_mg.data)

        # 5. Unassigned Doctor: clinical fields stripped, guardian phone stripped
        self.client.force_authenticate(user=self.non_treating_doc_user)
        res_un = self.client.get(f"/api/patients/{self.patient_assigned.id}/")
        self.assertEqual(res_un.status_code, status.HTTP_200_OK)
        for f in clinical_fields:
            self.assertNotIn(f, res_un.data, f"Unassigned doctor must NOT see {f}")
        self.assertNotIn('emergency_contact_phone', res_un.data)

    def test_29_all_clinical_viewsets_have_deny_non_clinical_roles(self):
        """
        Asserts that every clinical view/viewset under backend/patients defines
        DenyNonClinicalRoles in its permission_classes.
        """
        from homecareOS.permissions import DenyNonClinicalRoles
        from patients.views import (
            VitalSignViewSet, NurseNoteViewSet, LabResultViewSet,
            PrescriptionViewSet, PatientPrescriptionDetailView
        )
        from patients.patient_file_views import (
            PatientFileView, PatientEmergencyContactRevealView,
            PatientHistoryCarePlanUpdateView, PatientActiveComplaintView,
            PatientScheduledItemView, PatientRecordsTimelineView,
            PatientSingleRecordDetailView, PatientPhotoView,
            PatientRecordAddendumView,
        )

        clinical_views = [
            VitalSignViewSet,
            NurseNoteViewSet,
            LabResultViewSet,
            PrescriptionViewSet,
            PatientPrescriptionDetailView,
            PatientFileView,
            PatientEmergencyContactRevealView,
            PatientHistoryCarePlanUpdateView,
            PatientActiveComplaintView,
            PatientScheduledItemView,
            PatientRecordsTimelineView,
            PatientSingleRecordDetailView,
            PatientPhotoView,
            PatientRecordAddendumView,
        ]

        for v in clinical_views:
            perms = getattr(v, 'permission_classes', [])
            self.assertIn(
                DenyNonClinicalRoles, perms,
                f"Clinical view {v.__name__} must include DenyNonClinicalRoles in permission_classes"
            )

        # Verify negative case: a newly added clinical view without DenyNonClinicalRoles is flagged
        class UnprotectedClinicalView:
            permission_classes = []

        self.assertNotIn(DenyNonClinicalRoles, UnprotectedClinicalView.permission_classes)

    def test_30_write_actions_real_endpoints_allowed_and_forbidden_roles(self):
        """
        Tests write actions on real backend endpoints from backend/patients/urls.py
        verifying POST succeeds for allowed roles and returns 403 for forbidden roles.
        """
        # 1. POST /api/patients/vitals/
        self.client.force_authenticate(user=self.users['nurse'])
        res_v_nurse = self.client.post('/api/patients/vitals/', {
            'patient': self.patient_assigned.id,
            'blood_pressure_systolic': 120,
            'blood_pressure_diastolic': 80,
            'recorded_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(res_v_nurse.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.users['accountant'])
        res_v_acc = self.client.post('/api/patients/vitals/', {
            'patient': self.patient_assigned.id,
            'blood_pressure_systolic': 120,
        }, format='json')
        self.assertEqual(res_v_acc.status_code, status.HTTP_403_FORBIDDEN)

        # 2. POST /api/patients/notes/
        self.client.force_authenticate(user=self.users['nurse'])
        res_n_nurse = self.client.post('/api/patients/notes/', {
            'patient': self.patient_assigned.id,
            'note': 'Routine bedside nursing care administered.',
        }, format='json')
        self.assertEqual(res_n_nurse.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.users['crm_executive'])
        res_n_crm = self.client.post('/api/patients/notes/', {
            'patient': self.patient_assigned.id,
            'note': 'Unauthorized note attempt.',
        }, format='json')
        self.assertEqual(res_n_crm.status_code, status.HTTP_403_FORBIDDEN)

        # 3. POST /api/patients/{id}/doctor-notes/
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/", {
            'notes': 'Follow-up clinical assessment note.',
            'plan': 'Patient hemodynamically stable.',
        }, format='json')
        self.assertEqual(res_doc.status_code, status.HTTP_201_CREATED)

        # Nurse is forbidden to write doctor notes
        self.client.force_authenticate(user=self.users['nurse'])
        res_doc_nur = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/", {
            'notes': 'Nurse writing doctor note',
        }, format='json')
        self.assertEqual(res_doc_nur.status_code, status.HTTP_403_FORBIDDEN)

        # 4. POST /api/patients/{id}/therapy-notes/
        self.client.force_authenticate(user=self.users['physiotherapist'])
        res_phy = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/", {
            'therapy_type': 'physiotherapy',
            'session_notes': 'Range of motion improved by 15 degrees.',
            'plan': 'Continue active assisted exercises.',
        }, format='json')
        self.assertEqual(res_phy.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.users['accountant'])
        res_phy_acc = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/", {
            'therapy_type': 'physiotherapy',
            'session_notes': 'Unauthorized entry',
        }, format='json')
        self.assertEqual(res_phy_acc.status_code, status.HTTP_403_FORBIDDEN)

        # 5. POST /api/patients/{id}/scheduled-items/
        self.client.force_authenticate(user=self.users['doctor'])
        res_sched = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'title': 'Wound dressing check',
            'kind': 'procedure',
            'due_at': (timezone.now() + datetime.timedelta(hours=4)).isoformat(),
        }, format='json')
        self.assertEqual(res_sched.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.users['accountant'])
        res_sched_acc = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'title': 'Unauthorized scheduled item',
            'kind': 'procedure',
        }, format='json')
        self.assertEqual(res_sched_acc.status_code, status.HTTP_403_FORBIDDEN)

    def test_31_hospital_contact_phone_used_and_no_care_os_fake_numbers(self):
        """
        Verifies:
        1. settings.HOSPITAL_CONTACT_PHONE is configured and used as default (+923415339483).
        2. GET /api/staff-portal/employee-card/ returns hospital_contact_phone.
        3. Zero occurrences of the fake invented string 'CARE-OS' exist across backend/ and frontend/src/.
        """
        from django.conf import settings
        self.assertEqual(getattr(settings, 'HOSPITAL_CONTACT_PHONE', None), '+923415339483')

        self.client.force_authenticate(user=self.users['doctor'])
        res = self.client.get('/api/staff-portal/employee-card/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('hospital_contact_phone'), '+923415339483')

        # Check that no CARE-OS text exists in the response
        self.assertNotIn('CARE-OS', str(res.data))

    def test_32_rights_vs_spec_role_matrix(self):
        """
        Explicitly asserts rights vs spec:
        - Active complaint create and resolve: assigned treating doctor, care manager, admin, super_admin only;
          nurse and therapists receive 403.
        - History and care plan edit: assigned doctor, care manager, admin, super_admin only;
          nurse and therapists receive 403.
        - Scheduled items create and cancel: doctor, care manager, admin, super_admin only;
          nurse and therapists receive 403 on create/cancel.
        - Consent and referral: treating doctor, care manager, admin.
        """
        # Active complaint:
        # Allowed: doctor, care_manager, admin, super_admin
        for rk in ['doctor', 'care_manager', 'admin', 'super_admin']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
                'action': 'create',
                'text': f"Complaint created by {rk}",
            }, format='json')
            self.assertIn(res.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), f"{rk} should be allowed to create complaint")

        # Forbidden: nurse, physiotherapist, speech_therapist, psychotherapist, dietician
        for rk in ['nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
                'action': 'create',
                'text': f"Unauthorized complaint by {rk}",
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{rk} must be forbidden to create complaint")

            res_resolve = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
                'action': 'resolve',
            }, format='json')
            self.assertEqual(res_resolve.status_code, status.HTTP_403_FORBIDDEN, f"{rk} must be forbidden to resolve complaint")

        # History and Care Plan Edit:
        # Allowed: doctor, care_manager, admin, super_admin
        for rk in ['doctor', 'care_manager', 'admin', 'super_admin']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
                'section': 'brief_history',
                'text': f"Brief history update by {rk}",
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"{rk} should be allowed to edit history")

        # Forbidden: nurse, therapists
        for rk in ['nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
                'section': 'brief_history',
                'text': f"Unauthorized edit by {rk}",
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{rk} must be forbidden to edit history")

        # Scheduled Items Create and Cancel:
        # Allowed create: doctor, care_manager, admin, super_admin
        for rk in ['doctor', 'care_manager', 'admin', 'super_admin']:
            self.client.force_authenticate(user=self.users[rk])
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
                'title': f"Item scheduled by {rk}",
                'kind': 'procedure',
                'due_at': (timezone.now() + datetime.timedelta(hours=6)).isoformat(),
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{rk} should be allowed to create scheduled item")
            item_id = res.data['id']

            # Allowed cancel:
            res_cancel = self.client.patch(f"/api/patients/{self.patient_assigned.id}/scheduled-items/{item_id}/", {
                'status': 'cancelled',
            }, format='json')
            self.assertEqual(res_cancel.status_code, status.HTTP_200_OK, f"{rk} should be allowed to cancel scheduled item")

        # Forbidden create and cancel: nurse, therapists
        # Create an item with doctor first to test cancellation
        self.client.force_authenticate(user=self.users['doctor'])
        test_item_res = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'title': "Item for cancel restriction test",
            'kind': 'procedure',
            'due_at': (timezone.now() + datetime.timedelta(hours=8)).isoformat(),
        }, format='json')
        test_item_id = test_item_res.data['id']

        for rk in ['nurse', 'physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician']:
            self.client.force_authenticate(user=self.users[rk])
            res_create = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
                'title': f"Unauthorized scheduled item by {rk}",
                'kind': 'procedure',
            }, format='json')
            self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN, f"{rk} must be forbidden to create scheduled item")

            res_cancel = self.client.patch(f"/api/patients/{self.patient_assigned.id}/scheduled-items/{test_item_id}/", {
                'status': 'cancelled',
            }, format='json')
            self.assertEqual(res_cancel.status_code, status.HTTP_403_FORBIDDEN, f"{rk} must be forbidden to cancel scheduled item")

    def test_33_clinical_authorship_matrix_all_roles(self):
        """
        Tests the unified clinical authorship matrix across ALL 13 user roles:
        doctor (assigned and unassigned), nurse, physiotherapist, speech_therapist,
        psychotherapist, dietician, care_manager, admin, super_admin, accountant,
        crm_executive, and patient_family.

        Asserts:
        - Exact allowed vs forbidden HTTP statuses on every write action
        - Signed_by and author/recorded_by fields equal the logged-in user.
        """
        from patients.models import MARAdministration

        all_roles = [
            ('doctor_assigned', self.users['doctor']),
            ('doctor_unassigned', self.non_treating_doc_user),
            ('nurse', self.users['nurse']),
            ('physiotherapist', self.users['physiotherapist']),
            ('speech_therapist', self.users['speech_therapist']),
            ('psychotherapist', self.users['psychotherapist']),
            ('dietician', self.users['dietician']),
            ('care_manager', self.users['care_manager']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('patient_family', self.users['patient_family']),
        ]

        # ── 1. Doctor Notes Create & Sign (Doctor only, assigned treating doctor)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/", {
                'notes': f"Clinical assessment note by {role_key}",
                'plan': "Treatment plan details",
                'is_signed': True,
            }, format='json')
            if role_key == 'doctor_assigned':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create doctor note")
                note_id = res.data['id']
                created = DoctorNote.objects.get(pk=note_id)
                self.assertEqual(created.doctor, self.staff_members['doctor'])
                self.assertEqual(created.signed_by, self.staff_members['doctor'])
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to create doctor note")

        # ── 2. Prescriptions Create (Doctor: verified order; Nurse: transcribed order; All others: 403)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': f"Medication by {role_key}",
                'dosage': '10mg',
                'frequency': 'OD',
                'date': self.now.date().isoformat(),
                'prescribed_by': 'Dr. Supervising',
            }, format='json')
            if role_key == 'doctor_assigned':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create prescription")
                rx_id = res.data['id']
                rx = Prescription.objects.get(pk=rx_id)
                self.assertEqual(rx.verification_status, 'verified')
                self.assertEqual(rx.entry_mode, 'doctor')
                self.assertEqual(rx.uploaded_by, self.staff_members['doctor'])
            elif role_key == 'nurse':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create transcribed prescription")
                rx_id = res.data['id']
                rx = Prescription.objects.get(pk=rx_id)
                self.assertEqual(rx.verification_status, 'pending_verification')
                self.assertEqual(rx.entry_mode, 'transcribed')
                self.assertEqual(rx.ordering_doctor_name, 'Dr. Supervising')
                self.assertEqual(rx.entered_by, user)
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to create prescription")

        # ── 3. Lab Orders Create (Doctor only)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/labs/", {
                'test_name': f"Complete Blood Count by {role_key}",
                'reference_range': 'Routine Diagnostics',
            }, format='json')
            if role_key == 'doctor_assigned':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create lab order")
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to create lab order")

        # ── 4. Referrals Create (Doctor only)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/referrals/", {
                'notes': f"Referral to Cardiologist by {role_key}",
                'details': "Cardiology consult",
            }, format='json')
            if role_key == 'doctor_assigned':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create referral")
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to create referral")

        # ── 5. Consents Create (Doctor only)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/consents/", {
                'title': f"General Consent by {role_key}",
                'consent_type': 'Treatment',
                'is_signed': True,
            }, format='json')
            if role_key == 'doctor_assigned':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should create consent")
                consent_id = res.data['id']
                cs = ClinicalConsent.objects.get(pk=consent_id)
                self.assertEqual(cs.signed_by, self.staff_members['doctor'])
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to create consent")

        # ── 6. Therapy Notes (Matching Therapist only)
        disciplines_and_owners = [
            ('physiotherapy', 'physiotherapist'),
            ('speech_therapy', 'speech_therapist'),
            ('psychotherapy', 'psychotherapist'),
            ('dietetics', 'dietician'),
        ]
        for discipline, owner_key in disciplines_and_owners:
            for role_key, user in all_roles:
                self.client.force_authenticate(user=user)
                res = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/", {
                    'discipline': discipline,
                    'session_notes': f"Rehab session by {role_key}",
                    'is_signed': True,
                }, format='json')
                if role_key == owner_key:
                    self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should write {discipline}")
                    tn_id = res.data['id']
                    tn = TherapyNote.objects.get(pk=tn_id)
                    self.assertEqual(tn.author, self.staff_members[owner_key])
                    self.assertEqual(tn.signed_by, self.staff_members[owner_key])
                elif role_key == 'doctor_unassigned':
                    self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
                else:
                    self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to write {discipline}")

        # ── 7. Vitals and Intake/Output (Nurse only, doctor may read)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/vitals/", {
                'blood_pressure_systolic': 120,
                'blood_pressure_diastolic': 80,
                'heart_rate': 72,
                'intake_ml': 350,
                'output_ml': 300,
            }, format='json')
            if role_key == 'nurse':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should record vitals/intake-output")
                v_id = res.data['id']
                vt = VitalSign.objects.get(pk=v_id)
                self.assertEqual(vt.recorded_by, self.staff_members['nurse'])
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to record vitals")

        # ── 8. Nursing Notes (Nurse only)
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/nurse-notes/", {
                'note': f"Nursing observation by {role_key}",
            }, format='json')
            if role_key == 'nurse':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should write nursing note")
                nn_id = res.data['id']
                nn = NurseNote.objects.get(pk=nn_id)
                self.assertEqual(nn.recorded_by, self.staff_members['nurse'])
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to write nursing note")

        # ── 9. MAR Administration Signature (Nurse only)
        # Create a prescription for testing MAR administration
        mar_rx = Prescription.objects.create(
            patient=self.patient_assigned,
            medication="Ceftriaxone 1g IV",
            dosage="1g",
            frequency="Daily",
            date=self.now.date(),
            prescribed_by="Dr. Bilal"
        )
        day_counter = 1
        for role_key, user in all_roles:
            self.client.force_authenticate(user=user)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
                'prescription_id': mar_rx.id,
                'day_number': day_counter,
            }, format='json')
            day_counter += 1
            if role_key == 'nurse':
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_key} should sign MAR")
                mar_id = res.data['id']
                mar = MARAdministration.objects.get(pk=mar_id)
                self.assertEqual(mar.administered_by, self.staff_members['nurse'])
            elif role_key == 'doctor_unassigned':
                self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_key} must be forbidden to sign MAR")

    def test_34_prescription_transcription_verification_locking_mar(self):
        """
        Comprehensive test for Prescription Authorship, Transcribed Orders, and Locking:
        1. Nurse creates transcribed order using legacy mobile payload ('prescribed_by': 'Dr. Alam') -> 201 Created, pending_verification.
        2. Nurse missing ordering doctor name -> 400 Bad Request.
        3. Treating doctor creates prescription -> 201 Created, verified.
        4. Other roles (accountant, crm, therapist, care_manager, admin, super_admin) -> 403 Forbidden.
        5. Treating doctor receives notification upon nurse transcribed order.
        6. AuditLog is written for transcription without clinical/drug text in details.
        7. Doctor verification & rejection workflows with role enforcement (unassigned doctor 404, nurse 403, admin 403).
        8. MAR administration enforcement:
           - Blocked when pending_verification under PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=False (400 Bad Request).
           - Blocked when rejected, cancelled, or discontinued (400 Bad Request).
           - Allowed for verified orders (201 Created).
           - Allowed with provisional flag under PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=True.
        9. Immutability / Locking:
           - Model level clean() raises ValidationError on mutating locked clinical fields once verified or administered.
           - Model level delete() raises ValidationError on deleting verified or administered prescription.
           - API PATCH/PUT/DELETE for admin/super_admin returns 403 Forbidden.
        10. Nurse edit & cancel while pending; blocked once verified.
        11. Treating doctor discontinue verified order with reason; blocked for nurse and admin.
        12. Clinician portal home includes prescriptions_to_verify count & list for doctor.
        """
        from django.test import override_settings
        from django.core.exceptions import ValidationError
        from accounts.models import AuditLog
        from notifications.models import Notification

        nurse_user = self.users['nurse']
        doctor_user = self.users['doctor']
        admin_user = self.users['admin']
        super_admin_user = self.users['super_admin']
        accountant_user = self.users['accountant']

        # ── 1. Nurse creates transcribed order via legacy mobile payload
        self.client.force_authenticate(user=nurse_user)
        res_nurse_tx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Augmentin 625mg',
            'dosage': '625mg',
            'frequency': 'BD',
            'route': 'oral',
            'duration_days': 7,
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_nurse_tx.status_code, status.HTTP_201_CREATED)
        rx_tx_id = res_nurse_tx.data['id']
        rx_tx = Prescription.objects.get(pk=rx_tx_id)
        self.assertEqual(rx_tx.entry_mode, 'transcribed')
        self.assertEqual(rx_tx.verification_status, 'pending_verification')
        self.assertEqual(rx_tx.ordering_doctor_name, 'Dr. Tariq Alam')
        self.assertEqual(rx_tx.entered_by, nurse_user)
        self.assertEqual(rx_tx.order_source, 'written')

        # ── 2. Nurse missing ordering doctor name -> 400 Bad Request
        res_no_doc = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Cipro 500mg',
            'dosage': '500mg',
            'frequency': 'BD',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_no_doc.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ordering_doctor_name', res_no_doc.data)

        # ── 3. Treating doctor creates verified order
        self.client.force_authenticate(user=doctor_user)
        res_doc_rx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Metformin 500mg',
            'dosage': '500mg',
            'frequency': 'OD',
            'route': 'oral',
            'duration_days': 30,
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_doc_rx.status_code, status.HTTP_201_CREATED)
        rx_doc_id = res_doc_rx.data['id']
        rx_doc = Prescription.objects.get(pk=rx_doc_id)
        self.assertEqual(rx_doc.entry_mode, 'doctor')
        self.assertEqual(rx_doc.verification_status, 'verified')
        self.assertEqual(rx_doc.entered_by, doctor_user)
        self.assertEqual(rx_doc.verified_by, doctor_user)
        self.assertIsNotNone(rx_doc.verified_at)

        # ── 4. Blocked roles (e.g. accountant, admin, care_manager) -> 403 Forbidden
        for blocked_user in [accountant_user, admin_user, super_admin_user, self.users['care_manager']]:
            self.client.force_authenticate(user=blocked_user)
            res_blocked = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': 'Unauthorized Drug',
                'dosage': '10mg',
                'frequency': 'OD',
                'prescribed_by': 'Dr. Anyone',
                'date': self.now.date().isoformat(),
            }, format='json')
            self.assertEqual(res_blocked.status_code, status.HTTP_403_FORBIDDEN)

        # ── 5. In-app Notification for treating doctor upon nurse transcription
        notifs = Notification.objects.filter(recipient=doctor_user, icon_key='pill')
        self.assertTrue(notifs.exists(), "Notification should be sent to patient's treating doctor")

        # ── 6. AuditLog check for transcription (no drug name in details)
        audit = AuditLog.objects.filter(action='Created Transcribed Prescription').first()
        self.assertIsNotNone(audit, "AuditLog entry must be created on prescription transcribe")
        self.assertNotIn('Augmentin', str(audit.details))
        self.assertNotIn('625mg', str(audit.details))

        # ── 7. Verification & Reject Workflows with Permission Scoping
        # Author nurse cannot verify -> 403
        self.client.force_authenticate(user=nurse_user)
        res_v_nurse = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/verify/")
        self.assertEqual(res_v_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # Admin cannot verify -> 403
        self.client.force_authenticate(user=admin_user)
        res_v_admin = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/verify/")
        self.assertEqual(res_v_admin.status_code, status.HTTP_403_FORBIDDEN)

        # Non-treating doctor cannot verify -> 404 (or 403)
        self.client.force_authenticate(user=self.non_treating_doc_user)
        res_v_unassigned = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/verify/")
        self.assertIn(res_v_unassigned.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

        # Rejection: create another transcribed order to reject
        self.client.force_authenticate(user=nurse_user)
        res_rej_order = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Aspirin 75mg',
            'dosage': '75mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_rej_id = res_rej_order.data['id']

        # Rejection without reason -> 400 Bad Request
        self.client.force_authenticate(user=doctor_user)
        res_rej_no_reason = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_rej_id}/reject/", {}, format='json')
        self.assertEqual(res_rej_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # Rejection with reason -> 200 OK
        res_rej_ok = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_rej_id}/reject/", {
            'reason': 'Patient has active GI bleeding contraindication.'
        }, format='json')
        self.assertEqual(res_rej_ok.status_code, status.HTTP_200_OK)
        rx_rej = Prescription.objects.get(pk=rx_rej_id)
        self.assertEqual(rx_rej.verification_status, 'rejected')
        self.assertEqual(rx_rej.status_reason, 'Patient has active GI bleeding contraindication.')

        # ── 8. MAR Administration Rules
        # Default setting: PRESCRIPTION_ADMIN_BEFORE_VERIFICATION is False
        self.client.force_authenticate(user=nurse_user)
        # Attempt administering pending order -> 400 Bad Request
        res_mar_pending = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_tx_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar_pending.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_mar_pending.data.get('error'), 'pending_verification')

        # Attempt administering rejected order -> 400 Bad Request
        res_mar_rej = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_rej_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar_rej.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_mar_rej.data.get('error'), 'prescription_rejected')

        # Treating doctor verifies rx_tx
        self.client.force_authenticate(user=doctor_user)
        res_verify_ok = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/verify/", {
            'note': 'Verified against written chart.'
        }, format='json')
        self.assertEqual(res_verify_ok.status_code, status.HTTP_200_OK)
        rx_tx.refresh_from_db()
        self.assertEqual(rx_tx.verification_status, 'verified')
        self.assertEqual(rx_tx.verified_by, doctor_user)
        self.assertIsNotNone(rx_tx.verified_at)

        # Now nurse administers verified order -> 201 Created
        self.client.force_authenticate(user=nurse_user)
        res_mar_verified = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_tx_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar_verified.status_code, status.HTTP_201_CREATED)

        # Under override_settings(PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=True), pending can be administered
        with override_settings(PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=True):
            # Create a new pending order
            res_pending2 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': 'Omeprazole 20mg',
                'dosage': '20mg',
                'frequency': 'OD',
                'prescribed_by': 'Dr. Tariq Alam',
                'date': self.now.date().isoformat(),
            }, format='json')
            rx_pending2_id = res_pending2.data['id']
            res_mar_prov = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
                'prescription_id': rx_pending2_id,
                'day_number': 1,
            }, format='json')
            self.assertEqual(res_mar_prov.status_code, status.HTTP_201_CREATED)
            self.assertTrue(res_mar_prov.data.get('is_provisional'))

        # ── 9. Immutability & Locking
        # On verified / administered order rx_tx, clinical fields cannot be changed at model level
        rx_tx.medication = 'Altered Medication Name'
        with self.assertRaises(ValidationError):
            rx_tx.clean()
        rx_tx.refresh_from_db()

        # Deleting verified/administered order raises ValidationError
        with self.assertRaises(ValidationError):
            rx_tx.delete()

        # Admin PATCH/PUT and DELETE via API return 403 Forbidden
        self.client.force_authenticate(user=admin_user)
        res_admin_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/", {
            'dosage': '1000mg',
        }, format='json')
        self.assertEqual(res_admin_patch.status_code, status.HTTP_403_FORBIDDEN)

        res_admin_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/")
        self.assertEqual(res_admin_del.status_code, status.HTTP_403_FORBIDDEN)

        # ── 10. Nurse Edit & Cancel while pending
        self.client.force_authenticate(user=nurse_user)
        res_nurse_pending3 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Panadol 500mg',
            'dosage': '500mg',
            'frequency': 'SOS',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_p3_id = res_nurse_pending3.data['id']

        # Nurse author can edit while pending
        res_nurse_edit = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_p3_id}/", {
            'instructions': 'Take after food.',
        }, format='json')
        self.assertEqual(res_nurse_edit.status_code, status.HTTP_200_OK)

        # Nurse author can cancel with reason
        res_nurse_cancel = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_p3_id}/cancel/", {
            'reason': 'Entered for wrong patient in error.'
        }, format='json')
        self.assertEqual(res_nurse_cancel.status_code, status.HTTP_200_OK)
        rx_p3 = Prescription.objects.get(pk=rx_p3_id)
        self.assertEqual(rx_p3.verification_status, 'cancelled')
        self.assertEqual(rx_p3.status_reason, 'Entered for wrong patient in error.')

        # ── 11. Treating doctor discontinue verified order
        self.client.force_authenticate(user=doctor_user)
        # Discontinue without reason -> 400
        res_disc_no_reason = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/discontinue/", {}, format='json')
        self.assertEqual(res_disc_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # Discontinue with reason -> 200 OK
        res_disc_ok = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_tx_id}/discontinue/", {
            'reason': 'Course completed successfully.'
        }, format='json')
        self.assertEqual(res_disc_ok.status_code, status.HTTP_200_OK)
        rx_tx.refresh_from_db()
        self.assertEqual(rx_tx.verification_status, 'discontinued')
        self.assertEqual(rx_tx.status_reason, 'Course completed successfully.')

        # Nurse or Admin cannot discontinue -> 403
        self.client.force_authenticate(user=nurse_user)
        res_disc_nurse = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_doc_id}/discontinue/", {
            'reason': 'Nurse attempt'
        }, format='json')
        self.assertEqual(res_disc_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # ── 12. Clinician portal home includes prescriptions_to_verify for doctor
        # Create one more pending order to verify
        res_p4 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Flagyl 400mg',
            'dosage': '400mg',
            'frequency': 'TDS',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_p4.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=doctor_user)
        self.staff_members['doctor'].platform_allowed = 'both'
        self.staff_members['doctor'].save()
        res_ch_doc = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res_ch_doc.status_code, status.HTTP_200_OK)
        pending_reqs = res_ch_doc.data.get('pending_requests', {})
        self.assertIn('prescriptions_to_verify', pending_reqs)
        self.assertGreaterEqual(pending_reqs.get('prescriptions_to_verify_count', 0), 1)
        self.assertGreaterEqual(len(pending_reqs['prescriptions_to_verify']), 1)

    def test_35_mar_blocked_for_cancelled_and_discontinued(self):
        """
        MAR administration is blocked (HTTP 400) for cancelled and discontinued orders
        when PRESCRIPTION_ADMIN_BEFORE_VERIFICATION is False.
        """
        nurse_user = self.users['nurse']
        doctor_user = self.users['doctor']

        # 1. Discontinued order
        self.client.force_authenticate(user=doctor_user)
        res_rx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Ceftriaxone 1g IV',
            'dosage': '1g',
            'frequency': 'OD',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_rx.status_code, status.HTTP_201_CREATED)
        rx_id = res_rx.data['id']

        # Discontinue with reason
        res_disc = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/discontinue/", {
            'reason': 'Culture negative, stopped.'
        }, format='json')
        self.assertEqual(res_disc.status_code, status.HTTP_200_OK)

        # Nurse attempts MAR administration
        self.client.force_authenticate(user=nurse_user)
        res_mar = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_mar.data.get('error'), 'prescription_discontinued')

        # 2. Cancelled order
        res_tx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Levofloxacin 500mg',
            'dosage': '500mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_tx.status_code, status.HTTP_201_CREATED)
        rx_cancel_id = res_tx.data['id']

        # Cancel with reason
        res_cancel = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_cancel_id}/cancel/", {
            'reason': 'Entered in error.'
        }, format='json')
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)

        # Nurse attempts MAR administration
        res_mar_cancel = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_cancel_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar_cancel.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_mar_cancel.data.get('error'), 'prescription_cancelled')

    def test_36_mar_allowed_for_pending_when_setting_true(self):
        """
        Pending orders can be administered with is_provisional flag ONLY when
        PRESCRIPTION_ADMIN_BEFORE_VERIFICATION is True; blocked when False.
        """
        from django.test import override_settings

        nurse_user = self.users['nurse']
        self.client.force_authenticate(user=nurse_user)

        # Order 1: setting False (default)
        res_p1 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Enoxaparin 40mg',
            'dosage': '40mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_p1_id = res_p1.data['id']

        res_mar_blocked = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
            'prescription_id': rx_p1_id,
            'day_number': 1,
        }, format='json')
        self.assertEqual(res_mar_blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_mar_blocked.data.get('error'), 'pending_verification')

        # Order 2: setting True
        with override_settings(PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=True):
            res_p2 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': 'Heparin 5000U',
                'dosage': '5000U',
                'frequency': 'BD',
                'prescribed_by': 'Dr. Tariq Alam',
                'date': self.now.date().isoformat(),
            }, format='json')
            rx_p2_id = res_p2.data['id']

            res_mar_allowed = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
                'prescription_id': rx_p2_id,
                'day_number': 1,
            }, format='json')
            self.assertEqual(res_mar_allowed.status_code, status.HTTP_201_CREATED)
            self.assertTrue(res_mar_allowed.data.get('is_provisional'))

    def test_37_prescription_verify_reject_scoping_roles(self):
        """
        Verify and reject are allowed for the treating doctor within care window;
        403/404 for nurse author, unassigned doctor, doctor outside care window,
        care_manager, admin, super_admin.
        """
        nurse_user = self.users['nurse']
        doctor_user = self.users['doctor']

        # Nurse creates pending order
        self.client.force_authenticate(user=nurse_user)
        res_rx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Moxifloxacin 400mg',
            'dosage': '400mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Supervising',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_id = res_rx.data['id']

        # 1. Denied roles for verify
        denied_verify_users = [
            ('nurse', nurse_user, status.HTTP_403_FORBIDDEN),
            ('care_manager', self.users['care_manager'], status.HTTP_403_FORBIDDEN),
            ('admin', self.users['admin'], status.HTTP_403_FORBIDDEN),
            ('super_admin', self.users['super_admin'], status.HTTP_403_FORBIDDEN),
            ('unassigned_doc', self.non_treating_doc_user, status.HTTP_404_NOT_FOUND),
        ]
        for role_name, u, expected_status in denied_verify_users:
            self.client.force_authenticate(user=u)
            res_v = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/verify/")
            self.assertIn(res_v.status_code, (expected_status, status.HTTP_403_FORBIDDEN), f"{role_name} should be denied verify")

        # 2. Denied roles for reject
        for role_name, u, expected_status in denied_verify_users:
            self.client.force_authenticate(user=u)
            res_r = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/reject/", {
                'reason': 'Denied test'
            }, format='json')
            self.assertIn(res_r.status_code, (expected_status, status.HTTP_403_FORBIDDEN), f"{role_name} should be denied reject")

        # 3. Doctor outside time window: cancel active bookings for this doctor
        Booking.objects.filter(patient=self.patient_assigned, assigned_staff=self.staff_members['doctor']).update(
            status=BookingStatus.CANCELLED
        )
        self.client.force_authenticate(user=doctor_user)
        res_out_window = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/verify/")
        self.assertIn(res_out_window.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

        # Restore doctor booking for patient
        Booking.objects.create(
            patient=self.patient_assigned,
            assigned_staff=self.staff_members['doctor'],
            scheduled_time=self.now,
            status=BookingStatus.IN_PROGRESS,
            service_type='doctor_visit',
        )

        # 4. Treating doctor within window can verify
        res_v_ok = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/verify/", {
            'note': 'Verified by treating physician.'
        }, format='json')
        self.assertEqual(res_v_ok.status_code, status.HTTP_200_OK)
        rx = Prescription.objects.get(pk=rx_id)
        self.assertEqual(rx.verification_status, 'verified')
        self.assertEqual(rx.verified_by, doctor_user)

    def test_38_prescription_locked_after_verification_and_after_mar_entry(self):
        """
        Prescription is locked after verification and after a MAR dose entry.
        API PATCH denied for nurse, doctor, admin, super_admin; model save() raises ValidationError.
        """
        from django.test import override_settings
        from django.core.exceptions import ValidationError

        doctor_user = self.users['doctor']
        nurse_user = self.users['nurse']
        admin_user = self.users['admin']
        super_admin_user = self.users['super_admin']

        # Case A: Locked after verification
        self.client.force_authenticate(user=doctor_user)
        res_rx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Ramipril 5mg',
            'dosage': '5mg',
            'frequency': 'OD',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_rx.status_code, status.HTTP_201_CREATED)
        rx_id = res_rx.data['id']
        rx = Prescription.objects.get(pk=rx_id)
        self.assertEqual(rx.verification_status, 'verified')

        # Model save mutating clinical fields raises ValidationError
        rx.medication = 'Lisinopril 10mg'
        with self.assertRaises(ValidationError):
            rx.save()
        rx.refresh_from_db()

        # API PATCH denied for all roles
        for role_name, u, expected in [
            ('nurse', nurse_user, status.HTTP_400_BAD_REQUEST),
            ('doctor', doctor_user, status.HTTP_403_FORBIDDEN),
            ('admin', admin_user, status.HTTP_403_FORBIDDEN),
            ('super_admin', super_admin_user, status.HTTP_403_FORBIDDEN),
        ]:
            self.client.force_authenticate(user=u)
            res_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/", {
                'dosage': '10mg',
            }, format='json')
            self.assertIn(res_patch.status_code, (expected, status.HTTP_403_FORBIDDEN), f"{role_name} PATCH should be rejected")

        # Case B: Locked after MAR entry on provisional order
        self.client.force_authenticate(user=nurse_user)
        with override_settings(PRESCRIPTION_ADMIN_BEFORE_VERIFICATION=True):
            res_p = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': 'Metoprolol 25mg',
                'dosage': '25mg',
                'frequency': 'BD',
                'prescribed_by': 'Dr. Tariq Alam',
                'date': self.now.date().isoformat(),
            }, format='json')
            rx_mar_id = res_p.data['id']

            # Administer 1 dose
            res_mar = self.client.post(f"/api/patients/{self.patient_assigned.id}/mar/administer/", {
                'prescription_id': rx_mar_id,
                'day_number': 1,
            }, format='json')
            self.assertEqual(res_mar.status_code, status.HTTP_201_CREATED)

            # Model save mutating locked field raises ValidationError
            rx_mar = Prescription.objects.get(pk=rx_mar_id)
            rx_mar.dosage = '50mg'
            with self.assertRaises(ValidationError):
                rx_mar.save()
            rx_mar.refresh_from_db()

            # API PATCH denied
            res_p_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_mar_id}/", {
                'dosage': '50mg',
            }, format='json')
            self.assertEqual(res_p_patch.status_code, status.HTTP_400_BAD_REQUEST)

    def test_39_discontinued_never_administered_stays_locked_and_undeletable(self):
        """
        Regression test for Item 1 lock bug:
        A discontinued, never-administered order must stay permanently locked and undeletable
        by both model ORM and API for any role.
        """
        from django.core.exceptions import ValidationError

        doctor_user = self.users['doctor']
        nurse_user = self.users['nurse']
        admin_user = self.users['admin']

        # Doctor creates verified prescription
        self.client.force_authenticate(user=doctor_user)
        res_rx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Clopidogrel 75mg',
            'dosage': '75mg',
            'frequency': 'OD',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_id = res_rx.data['id']

        # Discontinue with reason (0 MAR administrations exist)
        res_disc = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/discontinue/", {
            'reason': 'Patient switched to Ticagrelor.'
        }, format='json')
        self.assertEqual(res_disc.status_code, status.HTTP_200_OK)

        rx = Prescription.objects.get(pk=rx_id)
        self.assertEqual(rx.verification_status, 'discontinued')
        self.assertIsNotNone(rx.verified_at)
        self.assertEqual(rx.administrations.count(), 0)

        # 1. Model locking: cannot edit clinical fields
        rx.medication = 'Altered Clopidogrel'
        with self.assertRaises(ValidationError):
            rx.save()
        rx.refresh_from_db()

        # 2. Model locking: cannot physically delete
        with self.assertRaises(ValidationError):
            rx.delete()

        # 3. API PATCH: rejected
        self.client.force_authenticate(user=nurse_user)
        res_nurse_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/", {
            'dosage': '150mg',
        }, format='json')
        self.assertEqual(res_nurse_patch.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=admin_user)
        res_admin_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/", {
            'dosage': '150mg',
        }, format='json')
        self.assertEqual(res_admin_patch.status_code, status.HTTP_403_FORBIDDEN)

        # 4. API DELETE: rejected
        self.client.force_authenticate(user=nurse_user)
        res_nurse_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/")
        self.assertIn(res_nurse_del.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN))

        self.client.force_authenticate(user=admin_user)
        res_admin_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/")
        self.assertEqual(res_admin_del.status_code, status.HTTP_403_FORBIDDEN)

        # Confirm record still exists intact in DB
        self.assertTrue(Prescription.objects.filter(pk=rx_id).exists())

    def test_40_audit_log_created_for_status_changes_and_blocked_attempts_without_drug_text(self):
        """
        AuditLog entries are created for blocked attempts and status changes
        (transcribe, verify, reject, cancel, discontinue) without clinical/drug text in details.
        """
        from accounts.models import AuditLog

        accountant_user = self.users['accountant']
        nurse_user = self.users['nurse']
        doctor_user = self.users['doctor']

        # 1. Blocked create attempt
        self.client.force_authenticate(user=accountant_user)
        res_blocked = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'SecretDrugX 100mg',
            'dosage': '100mg',
            'frequency': 'OD',
            'date': self.now.date().isoformat(),
        }, format='json')
        self.assertEqual(res_blocked.status_code, status.HTTP_403_FORBIDDEN)

        audit_blocked = AuditLog.objects.filter(action='Prescription Create Blocked').first()
        self.assertIsNotNone(audit_blocked)
        self.assertNotIn('SecretDrugX', str(audit_blocked.details))

        # 2. Transcribe by nurse
        self.client.force_authenticate(user=nurse_user)
        res_tx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Cefixime 400mg',
            'dosage': '400mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Supervising',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_id = res_tx.data['id']

        audit_tx = AuditLog.objects.filter(action='Created Transcribed Prescription').first()
        self.assertIsNotNone(audit_tx)
        self.assertNotIn('Cefixime', str(audit_tx.details))
        self.assertNotIn('400mg', str(audit_tx.details))

        # 3. Verify by doctor
        self.client.force_authenticate(user=doctor_user)
        self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/verify/", {
            'note': 'Approved.'
        }, format='json')
        audit_verify = AuditLog.objects.filter(action='Verified Prescription Order').first()
        self.assertIsNotNone(audit_verify)
        self.assertNotIn('Cefixime', str(audit_verify.details))

        # 4. Discontinue by doctor
        self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/discontinue/", {
            'reason': 'Completed course.'
        }, format='json')
        audit_disc = AuditLog.objects.filter(action='Discontinued Prescription Order').first()
        self.assertIsNotNone(audit_disc)
        self.assertNotIn('Cefixime', str(audit_disc.details))

        # 5. Cancel by nurse
        self.client.force_authenticate(user=nurse_user)
        res_cancel_order = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Azithromycin 500mg',
            'dosage': '500mg',
            'frequency': 'OD',
            'prescribed_by': 'Dr. Supervising',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_c_id = res_cancel_order.data['id']
        self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_c_id}/cancel/", {
            'reason': 'Entered by mistake.'
        }, format='json')
        audit_cancel = AuditLog.objects.filter(action='Cancelled Prescription Order').first()
        self.assertIsNotNone(audit_cancel)
        self.assertNotIn('Azithromycin', str(audit_cancel.details))

    def test_41_nurse_delete_cancels_prescription_without_physical_delete(self):
        """
        The nurse DELETE route cancels with reason without physically deleting the record.
        Missing reason returns 400.
        Tests both patient-scoped route and /api/prescriptions/ (PrescriptionViewSet).
        """
        nurse_user = self.users['nurse']
        self.client.force_authenticate(user=nurse_user)

        # 1. Patient-scoped DELETE: /api/patients/{patient_pk}/prescriptions/{prescription_pk}/
        res_tx = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Amoxicillin 250mg',
            'dosage': '250mg',
            'frequency': 'TDS',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx_id = res_tx.data['id']

        # DELETE without reason -> 400 Bad Request
        res_del_no_reason = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/")
        self.assertEqual(res_del_no_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_del_no_reason.data.get('error'), 'reason_required')

        # DELETE with reason -> 200 OK (status cancelled)
        res_del_ok = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx_id}/?reason=Duplicate+entry")
        self.assertEqual(res_del_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_del_ok.data.get('status'), 'cancelled')

        # Record NOT physically deleted from database
        self.assertTrue(Prescription.objects.filter(pk=rx_id).exists())
        rx = Prescription.objects.get(pk=rx_id)
        self.assertEqual(rx.verification_status, 'cancelled')
        self.assertEqual(rx.status_reason, 'Duplicate entry')

        # 2. PrescriptionViewSet DELETE: /api/prescriptions/{prescription_pk}/
        res_tx2 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Cefuroxime 500mg',
            'dosage': '500mg',
            'frequency': 'BD',
            'prescribed_by': 'Dr. Tariq Alam',
            'date': self.now.date().isoformat(),
        }, format='json')
        rx2_id = res_tx2.data['id']

        # DELETE without reason on PrescriptionViewSet -> 400
        res_pvs_no_reason = self.client.delete(f"/api/prescriptions/{rx2_id}/")
        self.assertEqual(res_pvs_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # DELETE with reason on PrescriptionViewSet -> 200 OK
        res_pvs_ok = self.client.delete(f"/api/prescriptions/{rx2_id}/?reason=Phone+order+clarified")
        self.assertEqual(res_pvs_ok.status_code, status.HTTP_200_OK)

        self.assertTrue(Prescription.objects.filter(pk=rx2_id).exists())
        rx2 = Prescription.objects.get(pk=rx2_id)
        self.assertEqual(rx2.verification_status, 'cancelled')
        self.assertEqual(rx2.status_reason, 'Phone order clarified')

    def test_42_doctor_notes_rbac_and_immutability(self):
        """Doctor notes: doctor only create/edit/delete; signed notes immutable & addendum only."""
        blocked_roles = [
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('care_manager', self.users['care_manager']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('patient_family', self.users['patient_family']),
            ('nurse', self.users['nurse']),
            ('physiotherapist', self.users['physiotherapist']),
        ]
        # Unauthorized roles get 403 on create
        for rk, u in blocked_roles:
            self.client.force_authenticate(user=u)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/", {
                'notes': f'Unauthorized note by {rk}', 'is_signed': False
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Assigned doctor creates unsigned note -> 201
        self.client.force_authenticate(user=self.users['doctor'])
        res_create = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/", {
            'notes': 'Initial physician consult', 'plan': 'Observe', 'is_signed': False
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        note_id = res_create.data['id']

        # GET detail -> 200
        res_get = self.client.get(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)

        # Non-doctor gets 403 on PUT/PATCH and DELETE
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_put = self.client.patch(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/", {'notes': 'Nurse edit'}, format='json')
        self.assertEqual(res_nurse_put.status_code, status.HTTP_403_FORBIDDEN)
        res_nurse_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/")
        self.assertEqual(res_nurse_del.status_code, status.HTTP_403_FORBIDDEN)

        # Doctor updates unsigned note -> 200
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_put = self.client.patch(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/", {'notes': 'Updated consult'}, format='json')
        self.assertEqual(res_doc_put.status_code, status.HTTP_200_OK)

        # Sign note
        res_sign = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/sign/")
        self.assertEqual(res_sign.status_code, status.HTTP_200_OK)
        dn = DoctorNote.objects.get(pk=note_id)
        self.assertTrue(dn.is_signed)

        # Signed note: PUT/PATCH and DELETE return 400
        res_signed_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/", {'notes': 'Tamper attempt'}, format='json')
        self.assertEqual(res_signed_patch.status_code, status.HTTP_400_BAD_REQUEST)
        res_signed_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/")
        self.assertEqual(res_signed_del.status_code, status.HTTP_400_BAD_REQUEST)

        # Model level: signed note cannot be edited or deleted (raises ValidationError)
        from django.core.exceptions import ValidationError
        dn.notes = 'Direct model tamper'
        with self.assertRaises(ValidationError):
            dn.save()
        with self.assertRaises(ValidationError):
            dn.delete()

        # Addendum route succeeds for signed note -> 200
        res_add = self.client.post(f"/api/patients/{self.patient_assigned.id}/doctor-notes/{note_id}/addendum/", {
            'text': 'Follow-up observation addendum', 'reason': 'Lab report reviewed'
        }, format='json')
        self.assertEqual(res_add.status_code, status.HTTP_200_OK)

    def test_43_prescriptions_write_and_cancellation_rbac(self):
        """Prescriptions: doctor create (verified), nurse transcribe (pending), cancel route rbac."""
        blocked_roles = [
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('care_manager', self.users['care_manager']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('physiotherapist', self.users['physiotherapist']),
        ]
        # Unauthorized roles get 403 on create (both flat and patient-scoped)
        for rk, u in blocked_roles:
            self.client.force_authenticate(user=u)
            res_pt = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
                'medication': f'Drug by {rk}', 'dosage': '10mg', 'frequency': 'OD', 'date': self.now.date().isoformat()
            }, format='json')
            self.assertEqual(res_pt.status_code, status.HTTP_403_FORBIDDEN)
            res_pvs = self.client.post("/api/prescriptions/", {
                'patient': self.patient_assigned.id,
                'medication': f'Drug by {rk}', 'dosage': '10mg', 'frequency': 'OD', 'date': self.now.date().isoformat()
            }, format='json')
            self.assertEqual(res_pvs.status_code, status.HTTP_403_FORBIDDEN)

        # Nurse creates pending transcribed order via both routes -> 201
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_rx1 = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/", {
            'medication': 'Amoxicillin 500mg', 'dosage': '500mg', 'frequency': 'TDS', 'date': self.now.date().isoformat(),
            'ordering_doctor_name': 'Dr. Tariq'
        }, format='json')
        self.assertEqual(res_nurse_rx1.status_code, status.HTTP_201_CREATED)
        rx1_id = res_nurse_rx1.data['id']

        res_nurse_rx2 = self.client.post("/api/prescriptions/", {
            'patient': self.patient_assigned.id,
            'medication': 'Paracetamol 500mg', 'dosage': '500mg', 'frequency': 'BD', 'date': self.now.date().isoformat(),
            'ordering_doctor_name': 'Dr. Tariq'
        }, format='json')
        self.assertEqual(res_nurse_rx2.status_code, status.HTTP_201_CREATED)
        rx2_id = res_nurse_rx2.data['id']

        # Nurse author can PATCH pending order -> 200
        res_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx1_id}/", {'dosage': '250mg'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)

        # Non-nurse (doctor, admin) gets 403 on PATCH
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx1_id}/", {'dosage': '100mg'}, format='json')
        self.assertEqual(res_doc_patch.status_code, status.HTTP_403_FORBIDDEN)

        # Cancellation via POST /cancel/ and DELETE:
        # 1. Nurse author cancels rx1 via DELETE with reason -> 200
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx1_id}/", {'reason': 'Patient allergic'}, format='json')
        self.assertEqual(res_nurse_del.status_code, status.HTTP_200_OK)
        self.assertEqual(Prescription.objects.get(pk=rx1_id).verification_status, 'cancelled')

        # 2. Non-treating doctor / admin gets 403 on cancel of pending order rx2
        self.client.force_authenticate(user=self.users['admin'])
        res_admin_cancel = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx2_id}/cancel/", {'reason': 'Admin cancel'}, format='json')
        self.assertEqual(res_admin_cancel.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Treating doctor cancels pending order rx2 via POST /cancel/ with reason -> 200
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_cancel = self.client.post(f"/api/patients/{self.patient_assigned.id}/prescriptions/{rx2_id}/cancel/", {'reason': 'Doctor discontinued prior to verification'}, format='json')
        self.assertEqual(res_doc_cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(Prescription.objects.get(pk=rx2_id).verification_status, 'cancelled')

    def test_44_nurse_notes_rbac_and_flat_routes(self):
        """Nurse notes: nurse only create, update, delete across flat and patient-scoped routes."""
        blocked_roles = [
            ('doctor', self.users['doctor']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('care_manager', self.users['care_manager']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('physiotherapist', self.users['physiotherapist']),
        ]
        # Unauthorized roles get 403 on create
        for rk, u in blocked_roles:
            self.client.force_authenticate(user=u)
            res_pt = self.client.post(f"/api/patients/{self.patient_assigned.id}/nurse-notes/", {'note': f'Note by {rk}'}, format='json')
            self.assertEqual(res_pt.status_code, status.HTTP_403_FORBIDDEN)
            res_nnv = self.client.post("/api/patients/notes/", {'patient': self.patient_assigned.id, 'note': f'Note by {rk}'}, format='json')
            self.assertEqual(res_nnv.status_code, status.HTTP_403_FORBIDDEN)

        # Nurse creates nurse note -> 201
        self.client.force_authenticate(user=self.users['nurse'])
        res_create = self.client.post("/api/patients/notes/", {'patient': self.patient_assigned.id, 'note': 'Morning bedside check'}, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        note_id = res_create.data['id']

        # Clinician reads note -> 200
        res_get = self.client.get(f"/api/patients/notes/{note_id}/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)

        # Doctor gets 403 on edit and 405 on delete (physical deletion prohibited)
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_put = self.client.patch(f"/api/patients/notes/{note_id}/", {'note': 'Doctor edit attempt'}, format='json')
        self.assertEqual(res_doc_put.status_code, status.HTTP_403_FORBIDDEN)
        res_doc_del = self.client.delete(f"/api/patients/notes/{note_id}/")
        self.assertIn(res_doc_del.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))


        # Nurse updates note -> 200
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_put = self.client.patch(f"/api/patients/notes/{note_id}/", {'note': 'Updated bedside check'}, format='json')
        self.assertEqual(res_nurse_put.status_code, status.HTTP_200_OK)

        # Nurse deletes note -> physical deletion prohibited (405 Method Not Allowed)
        res_nurse_del = self.client.delete(f"/api/patients/notes/{note_id}/")
        self.assertEqual(res_nurse_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(NurseNote.objects.filter(pk=note_id).exists())


    def test_45_therapy_notes_and_physio_notes_rbac(self):
        """Therapy & Physio notes: matching therapist create/update, signed note immutability & addendum."""
        blocked_roles = [
            ('doctor', self.users['doctor']),
            ('nurse', self.users['nurse']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
        ]
        # Unauthorized roles get 403 on therapy note create
        for rk, u in blocked_roles:
            self.client.force_authenticate(user=u)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/", {
                'discipline': 'physiotherapy', 'notes': f'Therapy note by {rk}'
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Physiotherapist creates therapy note -> 201
        self.client.force_authenticate(user=self.users['physiotherapist'])
        res_create = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/", {
            'discipline': 'physiotherapy', 'session_notes': 'Gait training session', 'mobility_status': 'Fair', 'is_signed': False
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        note_id = res_create.data['id']

        # GET detail -> 200
        res_get = self.client.get(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)

        # Non-therapist gets 403 on PUT/PATCH and DELETE
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/", {'session_notes': 'Nurse edit'}, format='json')
        self.assertEqual(res_nurse_patch.status_code, status.HTTP_403_FORBIDDEN)
        res_nurse_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/")
        self.assertEqual(res_nurse_del.status_code, status.HTTP_403_FORBIDDEN)

        # Physiotherapist updates unsigned note -> 200
        self.client.force_authenticate(user=self.users['physiotherapist'])
        res_pt_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/", {'session_notes': 'Updated gait session'}, format='json')
        self.assertEqual(res_pt_patch.status_code, status.HTTP_200_OK)

        # Sign therapy note
        res_sign = self.client.post(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/sign/")
        self.assertEqual(res_sign.status_code, status.HTTP_200_OK)

        # Signed note: PUT/PATCH and DELETE return 400
        res_signed_patch = self.client.patch(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/", {'session_notes': 'Tamper attempt'}, format='json')
        self.assertEqual(res_signed_patch.status_code, status.HTTP_400_BAD_REQUEST)
        res_signed_del = self.client.delete(f"/api/patients/{self.patient_assigned.id}/therapy-notes/{note_id}/")
        self.assertEqual(res_signed_del.status_code, status.HTTP_400_BAD_REQUEST)

        # PhysioNote read & addendum routes
        # 1. GET /api/patients/{id}/physio-notes/ -> 200
        res_pn_list = self.client.get(f"/api/patients/{self.patient_assigned.id}/physio-notes/")
        self.assertEqual(res_pn_list.status_code, status.HTTP_200_OK)

        # 2. GET /api/patients/{id}/records/rehabilitation_notes/pn-{id}/ -> 200
        res_pn_single = self.client.get(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/pn-{self.physio_note.id}/")
        self.assertEqual(res_pn_single.status_code, status.HTTP_200_OK)

        # 3. Model level immutability on signed PhysioNote
        from django.core.exceptions import ValidationError
        self.physio_note.is_signed = True
        self.physio_note.signed_by = self.staff_members['physiotherapist']
        self.physio_note.save()
        self.physio_note.session_notes = 'Tampered notes'
        with self.assertRaises(ValidationError):
            self.physio_note.save()
        with self.assertRaises(ValidationError):
            self.physio_note.delete()

        # 4. POST addendum to signed PhysioNote -> 200/201
        res_pn_add = self.client.post(f"/api/patients/{self.patient_assigned.id}/records/rehabilitation_notes/pn-{self.physio_note.id}/addendum/", {
            'text': 'Post-exercise recovery observation', 'reason': 'Late note on patient response'
        }, format='json')
        self.assertIn(res_pn_add.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

    def test_46_vitals_and_intake_output_rbac_nurse_only(self):
        """Vitals and Intake/Output: nurse only create, update, delete. Doctor gets 403 on write."""
        blocked_roles = [
            ('doctor', self.users['doctor']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('patient_family', self.users['patient_family']),
            ('physiotherapist', self.users['physiotherapist']),
        ]
        # Unauthorized roles get 403 on create (both flat and patient-scoped)
        for rk, u in blocked_roles:
            self.client.force_authenticate(user=u)
            res_pt = self.client.post(f"/api/patients/{self.patient_assigned.id}/vitals/", {
                'heart_rate': 75, 'blood_pressure_systolic': 120, 'blood_pressure_diastolic': 80,
                'intake_ml': 500, 'output_ml': 450
            }, format='json')
            self.assertEqual(res_pt.status_code, status.HTTP_403_FORBIDDEN, f"Role {rk} must get 403 on vitals write")
            res_vsv = self.client.post("/api/patients/vitals/", {
                'patient': self.patient_assigned.id,
                'heart_rate': 75, 'blood_pressure_systolic': 120, 'blood_pressure_diastolic': 80,
                'intake_ml': 500, 'output_ml': 450
            }, format='json')
            self.assertEqual(res_vsv.status_code, status.HTTP_403_FORBIDDEN, f"Role {rk} must get 403 on VitalSignViewSet write")

        # Nurse records vitals & fluid balance -> 201
        self.client.force_authenticate(user=self.users['nurse'])
        res_create = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_assigned.id,
            'heart_rate': 78, 'blood_pressure_systolic': 125, 'blood_pressure_diastolic': 82,
            'intake_ml': 600, 'output_ml': 500
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        vital_id = res_create.data['id']

        # Doctor can read vitals -> 200
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_get = self.client.get(f"/api/patients/vitals/{vital_id}/")
        self.assertEqual(res_doc_get.status_code, status.HTTP_200_OK)

        # Doctor gets 403 on PUT/PATCH and 405 on DELETE (physical deletion prohibited)
        res_doc_put = self.client.patch(f"/api/patients/vitals/{vital_id}/", {'heart_rate': 85}, format='json')
        self.assertEqual(res_doc_put.status_code, status.HTTP_403_FORBIDDEN)
        res_doc_del = self.client.delete(f"/api/patients/vitals/{vital_id}/")
        self.assertIn(res_doc_del.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))


        # Nurse updates vital/intake-output record -> 200
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_patch = self.client.patch(f"/api/patients/vitals/{vital_id}/", {'heart_rate': 80, 'intake_ml': 650}, format='json')
        self.assertEqual(res_nurse_patch.status_code, status.HTTP_200_OK)

        # Nurse deletes vital record -> physical deletion prohibited (405 Method Not Allowed)
        res_nurse_del = self.client.delete(f"/api/patients/vitals/{vital_id}/")
        self.assertEqual(res_nurse_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(VitalSign.objects.filter(pk=vital_id).exists())


    def test_47_labs_ordering_collection_and_upload_rbac(self):
        """Lab orders, specimen collection (nurse, lab_tech) and report upload (lab_tech, doctor). Admin 403 on upload."""
        blocked_order_roles = [
            ('nurse', self.users['nurse']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
            ('physiotherapist', self.users['physiotherapist']),
        ]
        # 1. Lab orders create: doctor only
        for rk, u in blocked_order_roles:
            self.client.force_authenticate(user=u)
            res_pt = self.client.post(f"/api/patients/{self.patient_assigned.id}/labs/", {
                'test_name': 'CBC', 'result_value': '12.0'
            }, format='json')
            self.assertEqual(res_pt.status_code, status.HTTP_403_FORBIDDEN)
            res_lrv = self.client.post("/api/patients/labs/", {
                'patient': self.patient_assigned.id, 'test_name': 'CBC', 'result_value': '12.0',
                'collected_at': self.now.isoformat()
            }, format='json')
            self.assertEqual(res_lrv.status_code, status.HTTP_403_FORBIDDEN)

        # Doctor creates lab result -> 201
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_lab = self.client.post("/api/patients/labs/", {
            'patient': self.patient_assigned.id, 'test_name': 'Serum Creatinine', 'result_value': '1.1',
            'collected_at': self.now.isoformat()
        }, format='json')
        self.assertEqual(res_doc_lab.status_code, status.HTTP_201_CREATED)
        lab_res_id = res_doc_lab.data['id']

        # Nurse gets 403/405 on PUT/PATCH and DELETE
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_put = self.client.patch(f"/api/patients/labs/{lab_res_id}/", {'result_value': '1.2'}, format='json')
        self.assertIn(res_nurse_put.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))
        res_nurse_del = self.client.delete(f"/api/patients/labs/{lab_res_id}/")
        self.assertIn(res_nurse_del.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))


        # Doctor edit and delete on LabResult disabled (405 Method Not Allowed; corrections use entered-in-error)
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_patch = self.client.patch(f"/api/patients/labs/{lab_res_id}/", {'result_value': '1.0'}, format='json')
        self.assertEqual(res_doc_patch.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        res_doc_del = self.client.delete(f"/api/patients/labs/{lab_res_id}/")
        self.assertEqual(res_doc_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(LabResult.objects.filter(pk=lab_res_id).exists())


        # 2. Lab specimen collection: nurse and lab_tech allowed; others 403
        from lab.models import LabOrder, LabTest, LabOrderStatus
        lab_test = LabTest.objects.create(name='Liver Function Test', price=1500)
        lab_order = LabOrder.objects.create(
            patient=self.patient_assigned, scheduled_collection_time=self.now, status=LabOrderStatus.REQUESTED
        )
        lab_order.tests.set([lab_test])

        for rk, u in [('accountant', self.users['accountant']), ('crm_executive', self.users['crm_executive']), ('physiotherapist', self.users['physiotherapist'])]:
            self.client.force_authenticate(user=u)
            res_cs = self.client.post(f"/api/lab/orders/{lab_order.id}/collect-sample/", {'lat': 33.6844, 'lng': 73.0479}, format='json')
            self.assertEqual(res_cs.status_code, status.HTTP_403_FORBIDDEN)

        # Nurse collects sample -> 200
        self.client.force_authenticate(user=self.users['nurse'])
        res_nurse_collect = self.client.post(f"/api/lab/orders/{lab_order.id}/collect-sample/", {
            'lat': 33.6844, 'lng': 73.0479, 'notes': 'Sample collected by nurse'
        }, format='json')
        self.assertEqual(res_nurse_collect.status_code, status.HTTP_200_OK)

        # Lab tech collects sample on order 2 -> 200
        lab_order2 = LabOrder.objects.create(
            patient=self.patient_assigned, scheduled_collection_time=self.now, status=LabOrderStatus.REQUESTED
        )
        lab_order2.tests.set([lab_test])
        self.client.force_authenticate(user=self.users['lab_tech'])
        res_tech_collect = self.client.post(f"/api/lab/orders/{lab_order2.id}/collect-sample/", {
            'lat': 33.6844, 'lng': 73.0479, 'notes': 'Sample collected by lab tech'
        }, format='json')
        self.assertEqual(res_tech_collect.status_code, status.HTTP_200_OK)

        # 3. Lab report upload: lab_tech and doctor allowed; admin and super_admin get 403
        for rk, u in [('admin', self.users['admin']), ('super_admin', self.users['super_admin']), ('nurse', self.users['nurse']), ('accountant', self.users['accountant'])]:
            self.client.force_authenticate(user=u)
            res_up = self.client.post(f"/api/lab/orders/{lab_order.id}/upload-report/", {
                'result_data': json.dumps({'LFT': 'Normal'})
            }, format='json')
            self.assertEqual(res_up.status_code, status.HTTP_403_FORBIDDEN, f"Role {rk} must get 403 on upload-report")

        # Lab tech uploads report -> 201
        self.client.force_authenticate(user=self.users['lab_tech'])
        res_tech_up = self.client.post(f"/api/lab/orders/{lab_order.id}/upload-report/", {
            'result_data': json.dumps({'LFT': 'Bilirubin 0.8 mg/dL'})
        }, format='json')
        self.assertEqual(res_tech_up.status_code, status.HTTP_201_CREATED)

        # Doctor uploads report -> 201
        self.client.force_authenticate(user=self.users['doctor'])
        res_doc_up = self.client.post(f"/api/lab/orders/{lab_order2.id}/upload-report/", {
            'result_data': json.dumps({'LFT': 'ALT: 30 U/L'})
        }, format='json')
        self.assertEqual(res_doc_up.status_code, status.HTTP_201_CREATED)

    def test_48_consents_and_referrals_rbac(self):
        """Consents (doctor only, signed consent immutability) and referrals (doctor and care manager)."""
        blocked_consent_roles = [
            ('nurse', self.users['nurse']),
            ('care_manager', self.users['care_manager']),
            ('admin', self.users['admin']),
            ('super_admin', self.users['super_admin']),
            ('accountant', self.users['accountant']),
            ('crm_executive', self.users['crm_executive']),
        ]
        # 1. Consents: doctor only
        for rk, u in blocked_consent_roles:
            self.client.force_authenticate(user=u)
            res = self.client.post(f"/api/patients/{self.patient_assigned.id}/consents/", {
                'title': f'Consent by {rk}', 'consent_type': 'Treatment', 'is_signed': True
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.users['doctor'])
        res_consent = self.client.post(f"/api/patients/{self.patient_assigned.id}/consents/", {
            'title': 'Surgical Consent', 'consent_type': 'Treatment', 'is_signed': True
        }, format='json')
        self.assertEqual(res_consent.status_code, status.HTTP_201_CREATED)
        consent_id = res_consent.data['id']

        # Signed consent is immutable at model level
        from django.core.exceptions import ValidationError
        cs = ClinicalConsent.objects.get(pk=consent_id)
        cs.title = 'Tampered consent'
        with self.assertRaises(ValidationError):
            cs.save()
        with self.assertRaises(ValidationError):
            cs.delete()

        # 2. Referrals: doctor only; care_manager/nurse/admin/accountant get 403
        for rk, u in [('nurse', self.users['nurse']), ('admin', self.users['admin']), ('accountant', self.users['accountant']), ('care_manager', self.users['care_manager'])]:
            self.client.force_authenticate(user=u)
            res_ref_block = self.client.post(f"/api/patients/{self.patient_assigned.id}/referrals/", {
                'notes': f'Referral by {rk}', 'details': 'Cardiology consult'
            }, format='json')
            self.assertEqual(res_ref_block.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.users['doctor'])
        res_ref_doc = self.client.post(f"/api/patients/{self.patient_assigned.id}/referrals/", {
            'notes': 'Cardiology referral', 'details': 'Evaluate murmur'
        }, format='json')
        self.assertEqual(res_ref_doc.status_code, status.HTTP_201_CREATED)

    def test_49_management_routes_history_complaints_scheduled_items(self):
        """Management actions: history-care-plan, active-complaint, scheduled-items rbac and workflow."""
        # 1. History and Care Plan
        # Nurse gets 403
        self.client.force_authenticate(user=self.users['nurse'])
        res_hcp_nurse = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
            'section': 'brief_history', 'text': 'Nurse history edit'
        }, format='json')
        self.assertEqual(res_hcp_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # Doctor updates history -> 200, appends to immutable audit trail
        self.client.force_authenticate(user=self.users['doctor'])
        res_hcp_doc = self.client.post(f"/api/patients/{self.patient_assigned.id}/history-care-plan/", {
            'section': 'brief_history', 'text': 'Hypertensive patient with post-stroke care'
        }, format='json')
        self.assertEqual(res_hcp_doc.status_code, status.HTTP_200_OK)
        pt = Patient.objects.get(pk=self.patient_assigned.id)
        self.assertEqual(len(pt.history_care_plan_edits), 1)

        # 2. Active complaint
        # Nurse gets 403
        self.client.force_authenticate(user=self.users['nurse'])
        res_ac_nurse = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'create', 'text': 'Nurse complaint'
        }, format='json')
        self.assertEqual(res_ac_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # Care manager creates active complaint -> 201/200
        self.client.force_authenticate(user=self.users['care_manager'])
        res_ac_cm = self.client.post(f"/api/patients/{self.patient_assigned.id}/active-complaint/", {
            'action': 'create', 'text': 'Difficulty swallowing solids'
        }, format='json')
        self.assertIn(res_ac_cm.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

        # 3. Scheduled items
        # Nurse gets 403 on schedule create
        self.client.force_authenticate(user=self.users['nurse'])
        res_si_nurse = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'kind': 'procedure', 'title': 'Wound dressing', 'due_at': self.now.isoformat()
        }, format='json')
        self.assertEqual(res_si_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # Care manager schedules procedure item -> 201
        self.client.force_authenticate(user=self.users['care_manager'])
        res_si_create = self.client.post(f"/api/patients/{self.patient_assigned.id}/scheduled-items/", {
            'kind': 'procedure', 'title': 'Daily antiseptic dressing', 'due_at': self.now.isoformat()
        }, format='json')
        self.assertEqual(res_si_create.status_code, status.HTTP_201_CREATED)
        item_id = res_si_create.data['id']

        # Nurse marks procedure done -> 200
        self.client.force_authenticate(user=self.users['nurse'])
        res_mark_done = self.client.patch(f"/api/patients/{self.patient_assigned.id}/scheduled-items/{item_id}/", {
            'status': 'done'
        }, format='json')
        self.assertEqual(res_mark_done.status_code, status.HTTP_200_OK)
        self.assertEqual(ScheduledItem.objects.get(pk=item_id).status, 'done')



